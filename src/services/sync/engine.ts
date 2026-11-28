import * as db from '../chat/db.js'
import { applyRemoteSession, removeSession, useChatStore } from '../chat/store.js'
import type { Session } from '../chat/types.js'
import {
  fetchChanges,
  hasRemoteFile,
  pingServer,
  pushSessions,
  SyncRequestError,
  type PushSession,
  uploadRemoteFile,
} from './client.js'
import { encodeSyncCode, parseSyncInput, resolveServerUrl, type SyncTarget } from './code.js'
import { fetchImage, imageRefs, prepareSessionFiles, type ImageRef } from './files.js'
import { collectDeletedSessions, groupChanges, mergeRemoteSession, toSyncSession } from './model.js'
import {
  readBaselineSessions,
  readCursor,
  readLastTarget,
  readPushedSessions,
  readTombstones,
  resetSyncState,
  storeSyncCode,
  useSyncStore,
  writeBaselineSessions,
  writeCursor,
  writeLastTarget,
  writePushedSessions,
  writeTombstones,
} from './state.js'

/** 一次推送的会话数上限；单条超大时会话独占一批。 */
const PUSH_BATCH_SESSIONS = 8
const PUSH_BATCH_BYTES = 6 * 1024 * 1024
const PULL_LIMIT = 500
const PULL_MAX_BATCHES = 40
const CHANGE_DEBOUNCE_MS = 2500
const START_DELAY_MS = 1200
const POLL_INTERVAL_MS = 60_000
const RETRY_BASE_MS = 3_000
const RETRY_MAX_MS = 120_000

let started = false
let inFlight: Promise<void> | null = null
let queued = false
let debounceTimer: ReturnType<typeof setTimeout> | undefined
let retryTimer: ReturnType<typeof setTimeout> | undefined
let pollTimer: ReturnType<typeof setInterval> | undefined
let failures = 0
/** 拉取后写入本地时置位，避免把刚拉下来的删除又当成新删除推回去。 */
let applyingRemote = false

const setState = useSyncStore.setState

const errorKind = (error: unknown): string =>
  error instanceof SyncRequestError ? error.kind : 'unknown'

const schedule = (reason: string, delay = 0) => {
  if (!useSyncStore.getState().target) {
    return
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer)
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = undefined
    void syncNow(reason)
  }, delay)
}

const scheduleRetry = () => {
  failures += 1
  const delay = Math.min(RETRY_BASE_MS * 2 ** (failures - 1), RETRY_MAX_MS)
  if (retryTimer) {
    clearTimeout(retryTimer)
  }
  retryTimer = setTimeout(() => {
    retryTimer = undefined
    schedule('retry', 0)
  }, delay)
}

type FileUpload = { sha256: string; blob: Blob }

let uploadQueue: FileUpload[] = []
let uploadRunning = false
const uploadedFiles = new Set<string>()

const drainUploads = async (target: SyncTarget) => {
  if (uploadRunning) {
    return
  }
  uploadRunning = true
  try {
    while (uploadQueue.length > 0) {
      const current = useSyncStore.getState().target
      if (!current || current.url !== target.url || current.key !== target.key) {
        uploadQueue = []
        break
      }
      const task = uploadQueue.shift()
      if (!task || uploadedFiles.has(task.sha256)) {
        continue
      }
      try {
        if (await hasRemoteFile(target, task.sha256)) {
          uploadedFiles.add(task.sha256)
          continue
        }
        await uploadRemoteFile(target, task.sha256, task.blob)
        uploadedFiles.add(task.sha256)
      } catch {
        // 上传失败留到下一次同步；prepareSessionFiles 会重新收集
      }
    }
  } finally {
    uploadRunning = false
  }
}

const queueUploads = (target: SyncTarget, uploads: FileUpload[]) => {
  for (const upload of uploads) {
    if (
      !uploadedFiles.has(upload.sha256) &&
      !uploadQueue.some((item) => item.sha256 === upload.sha256)
    ) {
      uploadQueue.push(upload)
    }
  }
  void drainUploads(target)
}

let downloadQueue: ImageRef[] = []
let downloadRunning = false
const queuedDownloads = new Set<string>()

const drainDownloads = async (target: SyncTarget) => {
  if (downloadRunning) {
    return
  }
  downloadRunning = true
  const cache = new Map<string, Blob | null>()
  try {
    while (downloadQueue.length > 0) {
      const current = useSyncStore.getState().target
      if (!current || current.url !== target.url || current.key !== target.key) {
        downloadQueue = []
        break
      }
      const ref = downloadQueue.shift()
      if (!ref) {
        continue
      }
      try {
        await fetchImage(target, ref, cache)
      } catch {
        // 图片可能在另一台设备还没上传完；下一次同步再试
      }
      queuedDownloads.delete(`${ref.id}:${ref.sha256}`)
    }
  } finally {
    downloadRunning = false
  }
}

const queueDownloads = (target: SyncTarget, refs: ImageRef[]) => {
  for (const ref of refs) {
    const key = `${ref.id}:${ref.sha256}`
    if (queuedDownloads.has(key)) {
      continue
    }
    queuedDownloads.add(key)
    downloadQueue.push(ref)
  }
  if (downloadQueue.length > 0) {
    void drainDownloads(target)
  }
}

const pushTombstones = async (
  target: SyncTarget,
  tombstones: ReturnType<typeof readTombstones>
) => {
  for (let index = 0; index < tombstones.length; index += 100) {
    const chunk = tombstones.slice(index, index + 100)
    await pushSessions(target, {
      sessions: chunk.map((item) => ({ id: item.id, deleted: true, deletedAt: item.deletedAt })),
    })
  }
  writeTombstones([])
}

const pushPending = async (target: SyncTarget) => {
  await pushTombstones(target, readTombstones())

  const summaries = await db.loadSessionSummaries()
  const pushed = readPushedSessions()
  const baseline = readBaselineSessions()
  const alive = new Set(summaries.map((summary) => summary.id))
  const tombstones = readTombstones()
  const tombstoned = new Set(tombstones.map((item) => item.id))

  // 曾经推上去、现在本地已经没有的会话，补一条删除记录。
  for (const id of [...pushed.keys()]) {
    if (alive.has(id) || tombstoned.has(id)) {
      continue
    }
    tombstones.push({ id, deletedAt: Date.now() })
    tombstoned.add(id)
    pushed.delete(id)
  }
  // 启用同步时遗留下来、后来被删掉的本地会话：直接丢基线，不发墓碑。
  for (const id of [...baseline.keys()]) {
    if (!alive.has(id)) {
      baseline.delete(id)
    }
  }
  if (tombstones.length > 0) {
    writeTombstones(tombstones)
    await pushTombstones(target, tombstones)
  }
  writePushedSessions(pushed)
  writeBaselineSessions(baseline)

  const dirty = summaries.filter((summary) => {
    const known = pushed.get(summary.id) ?? baseline.get(summary.id)
    return !known || known.u !== summary.updatedAt || known.t !== summary.title
  })
  setState({ pending: dirty.length })
  if (dirty.length === 0) {
    return
  }

  let batch: PushSession[] = []
  let bytes = 0
  const uploads: FileUpload[] = []

  const flush = async () => {
    if (batch.length === 0) {
      return
    }
    const current = batch
    batch = []
    bytes = 0
    await pushSessions(target, { sessions: current })
    for (const session of current) {
      pushed.set(session.id, { u: session.updatedAt, t: session.title })
      baseline.delete(session.id)
    }
    writePushedSessions(pushed)
    writeBaselineSessions(baseline)
  }

  for (const summary of dirty) {
    const stored = await db.loadSession(summary.id)
    if (!stored) {
      continue
    }
    const session: Session = {
      ...stored,
      title: summary.title,
      createdAt: summary.createdAt,
      updatedAt: summary.updatedAt,
    }
    const prepared = await prepareSessionFiles(session)
    if (prepared.changed) {
      // 补上的 sha256 要落库，下一次推送不用重新计算
      await db.saveSession(prepared.session)
    }
    for (const [sha256, blob] of prepared.uploads) {
      uploads.push({ sha256, blob })
    }
    const payload = toSyncSession(prepared.session) as PushSession
    const size = JSON.stringify(payload).length
    if (
      batch.length > 0 &&
      (batch.length >= PUSH_BATCH_SESSIONS || bytes + size > PUSH_BATCH_BYTES)
    ) {
      await flush()
    }
    batch.push(payload)
    bytes += size
  }

  await flush()
  queueUploads(target, uploads)
  setState({ pending: 0 })
}

const applyRecords = async (target: SyncTarget, records: Parameters<typeof groupChanges>[0]) => {
  const { deleted, sessions } = groupChanges(records)
  const pushed = readPushedSessions()
  const baseline = readBaselineSessions()
  const refs: ImageRef[] = []
  applyingRemote = true
  try {
    for (const id of deleted) {
      pushed.delete(id)
      baseline.delete(id)
      await removeSession(id)
    }
    for (const remote of sessions.values()) {
      const cached = useChatStore.getState().sessionCache[remote.meta.id]
      const local = cached ?? (await db.loadSession(remote.meta.id))
      const merged = mergeRemoteSession(local, remote)
      if (merged !== local && !useChatStore.getState().importingHistory) {
        await db.saveSession(merged)
        applyRemoteSession(merged)
        refs.push(...imageRefs(merged))
      }
      baseline.delete(merged.id)
      // 只有本地不落后于服务器时才标记为已同步；本地更新的内容仍要推上去。
      if (merged.updatedAt <= remote.meta.updatedAt) {
        pushed.set(merged.id, { u: merged.updatedAt, t: merged.title })
      }
    }
  } finally {
    applyingRemote = false
    writePushedSessions(pushed)
    writeBaselineSessions(baseline)
    queueDownloads(target, refs)
  }
}

const pullRemote = async (target: SyncTarget) => {
  let cursor = readCursor()
  const remoteCursor = await pingServer(target)
  // 服务器数据被重建后游标会倒退，重新拉一轮即可。
  if (remoteCursor < cursor) {
    cursor = 0
    writeCursor(0)
  }
  for (let round = 0; round < PULL_MAX_BATCHES; round += 1) {
    const page = await fetchChanges(target, cursor, PULL_LIMIT)
    if (page.records.length === 0) {
      if (page.cursor !== cursor) {
        writeCursor(page.cursor)
      }
      return
    }
    await applyRecords(target, page.records)
    cursor = page.cursor
    writeCursor(cursor)
    if (!page.more) {
      return
    }
  }
}

const run = async (target: SyncTarget) => {
  if (useChatStore.getState().importingHistory) {
    return
  }
  setState({ phase: 'syncing', lastError: null })
  try {
    await pushPending(target)
    await pullRemote(target)
    failures = 0
    setState({ phase: 'idle', lastSyncAt: Date.now(), lastError: null })
  } catch (error) {
    setState({ phase: 'error', lastError: errorKind(error) })
    scheduleRetry()
  }
}

export const syncNow = (reason = 'manual'): Promise<void> => {
  const target = useSyncStore.getState().target
  if (!target) {
    return Promise.resolve()
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return Promise.resolve()
  }
  if (inFlight) {
    queued = true
    return inFlight
  }
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = undefined
  }
  const task = run(target).finally(() => {
    inFlight = null
    if (queued) {
      queued = false
      schedule(reason === 'manual' ? 'queued' : reason, 0)
    }
  })
  inFlight = task
  return task
}

/**
 * 首次启用（或换服务器）时把现有会话登记为基线，不主动上传历史。
 * 之后新增或继续修改的会话才会进入推送队列。
 */
const baselineLocalSessions = async () => {
  if (readPushedSessions().size > 0 || readBaselineSessions().size > 0) {
    return
  }
  const summaries = await db.loadSessionSummaries()
  if (summaries.length === 0) {
    return
  }
  const baseline = new Map<string, { u: number; t: string }>()
  for (const summary of summaries) {
    baseline.set(summary.id, { u: summary.updatedAt, t: summary.title })
  }
  writeBaselineSessions(baseline)
}

/**
 * 校验并保存同步配置；成功后立即做一次完整同步。
 * `serverUrl` 可单独填写，留空时使用同步码里的地址。
 */
export const configureSync = async (raw: string, serverUrl = ''): Promise<void> => {
  const input = parseSyncInput(raw)
  if (!input) {
    throw new Error('invalid-sync-code')
  }
  const url = resolveServerUrl(serverUrl) ?? input.url
  if (!url) {
    throw new Error('invalid-sync-url')
  }
  const target = { url, key: input.key }
  await pingServer(target)

  const previous = readLastTarget()
  const sameTarget = previous?.url === target.url && previous.key === target.key
  // 同一服务器重新启用时保留游标和推送记录；换服务器才从头开始。
  if (!sameTarget) {
    resetSyncState()
  }
  const code = encodeSyncCode(target)
  await baselineLocalSessions()
  writeLastTarget(code)
  storeSyncCode(code)
  setState({
    code,
    target,
    phase: 'idle',
    lastSyncAt: null,
    lastError: null,
    pending: 0,
  })
  await syncNow('configure')
}

export const disconnectSync = () => {
  storeSyncCode(null)
  // 保留游标、推送记录和墓碑，重新启用同一服务器时继续增量。
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = undefined
  }
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = undefined
  }
  failures = 0
  setState({
    code: null,
    target: null,
    phase: 'off',
    lastSyncAt: null,
    lastError: null,
    pending: 0,
  })
}

/** 监听本地改动：新增/更新走防抖推送，删除补墓碑。 */
const onChatChange = (
  state: ReturnType<typeof useChatStore.getState>,
  previous: ReturnType<typeof useChatStore.getState>
) => {
  if (!useSyncStore.getState().target || applyingRemote) {
    return
  }
  if (state.sessions === previous.sessions) {
    return
  }
  // 导入/替换历史同样会移除会话：已经推送到服务器的要补墓碑，
  // 否则另一台设备下次同步会把它们重新推回来。
  const alive = new Set(state.sessions.map((session) => session.id))
  const pushed = readPushedSessions()
  const tombstones = readTombstones()
  const queued = new Set(tombstones.map((item) => item.id))
  const removed = collectDeletedSessions(
    previous.sessions.map((session) => session.id),
    alive,
    new Set(pushed.keys())
  ).filter((id) => !queued.has(id))
  for (const id of removed) {
    tombstones.push({ id, deletedAt: Date.now() })
    pushed.delete(id)
  }
  if (removed.length > 0) {
    writeTombstones(tombstones)
    writePushedSessions(pushed)
  }
  schedule('change', CHANGE_DEBOUNCE_MS)
}

export const startSyncEngine = () => {
  if (started || typeof window === 'undefined') {
    return
  }
  started = true
  useChatStore.subscribe(onChatChange)
  window.addEventListener('online', () => schedule('online', 0))
  window.addEventListener('deepchat:resume', () => schedule('resume', 0))
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      schedule('visible', 0)
    }
  })
  pollTimer = setInterval(() => {
    if (!document.hidden) {
      schedule('poll', 0)
    }
  }, POLL_INTERVAL_MS)

  if (useChatStore.getState().ready) {
    schedule('start', START_DELAY_MS)
    return
  }
  const unsubscribe = useChatStore.subscribe((state) => {
    if (state.ready) {
      unsubscribe()
      schedule('start', START_DELAY_MS)
    }
  })
}

export const stopSyncEngine = () => {
  if (!started) {
    return
  }
  started = false
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = undefined
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = undefined
  }
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = undefined
  }
}
