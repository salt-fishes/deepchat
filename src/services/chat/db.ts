import { Capacitor } from '@capacitor/core'
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { toSessionSummary, type Session, type SessionSummary } from './types.js'
import type { WcdbItem, WcdbRef } from './wcdb.js'
import * as wcdb from './wcdb.js'
import { serviceBridge } from './history/serviceBridge.js'

/** IndexedDB 存储结构版本；仅 Web 端使用。 */
const DB_VERSION = 11

/** 文件原件按附件的本地 id 存储，所有引用同一 id 的消息共用一份；用于缩略图、打开查看，以及没有 serverId 时补传。 */
export type StoredFile = {
  id: string
  blob: Blob
}

/** 文件引用留在摘要中，删除会话时通过索引判断原件是否仍被引用。 */
type StoredSessionSummary = SessionSummary & { fileIds: string[] }

interface ChatDB extends DBSchema {
  /** 当前使用的会话，界面读写都在这里 */
  sessions: { key: string; value: Session }
  sessionSummaries: {
    key: string
    value: StoredSessionSummary
    indexes: { fileIds: string }
  }
  /** 当前使用的文件原件 */
  files: { key: string; value: StoredFile }
  /** 历史导入的暂存：校验通过后原子替换正式数据 */
  sessionsStaging: { key: string; value: Session }
  filesStaging: { key: string; value: StoredFile }
}

let dbPromise: Promise<IDBPDatabase<ChatDB>> | null = null

const storedSummary = (session: Session): StoredSessionSummary => ({
  ...toSessionSummary(session),
  fileIds: [
    ...new Set(
      session.messages.flatMap((message) =>
        message.role === 'user' ? message.files.map((file) => file.id) : []
      )
    ),
  ],
})

const abortTransaction = (tx: { abort(): void }) => {
  try {
    tx.abort()
  } catch {
    // 事务已因请求失败中止。
  }
}

const getDB = () =>
  (dbPromise ??= openDB<ChatDB>('chat-demo', DB_VERSION, {
    upgrade(db, _oldVersion, _newVersion, tx) {
      for (const name of ['sessions', 'files', 'sessionsStaging', 'filesStaging'] as const) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' })
        }
      }
      const summaries = db.objectStoreNames.contains('sessionSummaries')
        ? tx.objectStore('sessionSummaries')
        : db.createObjectStore('sessionSummaries', { keyPath: 'id' })
      if (!summaries.indexNames.contains('fileIds')) {
        summaries.createIndex('fileIds', 'fileIds', { multiEntry: true })
      }
    },
  }).catch((error: unknown) => {
    dbPromise = null
    throw error
  }))

/* ------------------------------ IndexedDB 实现（Web） ------------------------------ */

const idbLoadSessionSummaries = async (): Promise<SessionSummary[]> =>
  (await (await getDB()).getAll('sessionSummaries')).map(toSessionSummary)

const idbLoadSession = async (id: string): Promise<Session | undefined> =>
  (await getDB()).get('sessions', id)

const idbSaveSession = async (session: Session, files: StoredFile[] = []): Promise<void> => {
  const summary = storedSummary(session)
  const tx = (await getDB()).transaction(['sessions', 'sessionSummaries', 'files'], 'readwrite')
  await Promise.all([
    (async () => {
      try {
        for (const file of files) {
          await tx.objectStore('files').put(file)
        }
        await tx.objectStore('sessions').put(session)
        await tx.objectStore('sessionSummaries').put(summary)
      } catch (error) {
        abortTransaction(tx)
        throw error
      }
    })(),
    tx.done,
  ])
}

const idbRenameSession = async (id: string, title: string): Promise<void> => {
  const tx = (await getDB()).transaction(['sessions', 'sessionSummaries'], 'readwrite')
  await Promise.all([
    (async () => {
      try {
        const sessions = tx.objectStore('sessions')
        const session = await sessions.get(id)
        if (session) {
          session.title = title
          await sessions.put(session)
          await tx.objectStore('sessionSummaries').put(storedSummary(session))
        }
      } catch (error) {
        abortTransaction(tx)
        throw error
      }
    })(),
    tx.done,
  ])
}

const idbDeleteSession = async (sessionId: string): Promise<void> => {
  const tx = (await getDB()).transaction(['sessions', 'sessionSummaries', 'files'], 'readwrite')
  await Promise.all([
    (async () => {
      try {
        const summaries = tx.objectStore('sessionSummaries')
        const summary = await summaries.get(sessionId)
        await tx.objectStore('sessions').delete(sessionId)
        await summaries.delete(sessionId)
        for (const id of summary?.fileIds ?? []) {
          if ((await summaries.index('fileIds').count(id)) === 0) {
            await tx.objectStore('files').delete(id)
          }
        }
      } catch (error) {
        abortTransaction(tx)
        throw error
      }
    })(),
    tx.done,
  ])
}

const idbPutFiles = async (store: 'files' | 'filesStaging', files: StoredFile[]) => {
  const tx = (await getDB()).transaction(store, 'readwrite')
  await Promise.all([...files.map((file) => tx.store.put(file)), tx.done])
}

const idbSaveFiles = (files: StoredFile[]): Promise<void> => idbPutFiles('files', files)

const idbLoadFile = async (id: string): Promise<Blob | undefined> =>
  (await (await getDB()).get('files', id))?.blob

const idbClearStaging = async (): Promise<void> => {
  const tx = (await getDB()).transaction(['sessionsStaging', 'filesStaging'], 'readwrite')
  await Promise.all([
    tx.objectStore('sessionsStaging').clear(),
    tx.objectStore('filesStaging').clear(),
    tx.done,
  ])
}

const idbAddStagingSessions = async (sessions: Session[]): Promise<void> => {
  const tx = (await getDB()).transaction('sessionsStaging', 'readwrite')
  await Promise.all([
    (async () => {
      try {
        for (const session of sessions) {
          await tx.store.add(session)
        }
      } catch (error) {
        abortTransaction(tx)
        throw error
      }
    })(),
    tx.done,
  ])
}

const idbSaveStagingFiles = (files: StoredFile[]): Promise<void> => idbPutFiles('filesStaging', files)

const idbUpdateStagingFileTypes = async (types: ReadonlyMap<string, string>): Promise<void> => {
  if (!Array.from(types.values()).some(Boolean)) {
    return
  }
  const tx = (await getDB()).transaction('sessionsStaging', 'readwrite')
  await Promise.all([
    (async () => {
      for (let cursor = await tx.store.openCursor(); cursor; cursor = await cursor.continue()) {
        const session = cursor.value
        let changed = false
        for (const message of session.messages) {
          if (message.role !== 'user') {
            continue
          }
          for (const file of message.files) {
            const type = types.get(file.id) ?? ''
            if (file.mimeType !== type) {
              file.mimeType = type
              changed = true
            }
          }
        }
        if (changed) {
          await cursor.update(session)
        }
      }
    })(),
    tx.done,
  ])
}

const idbCommitStaging = async (): Promise<SessionSummary[]> => {
  const summaries: SessionSummary[] = []
  const tx = (await getDB()).transaction(
    ['sessions', 'sessionSummaries', 'files', 'sessionsStaging', 'filesStaging'],
    'readwrite'
  )
  const move = async (from: 'sessionsStaging' | 'filesStaging', to: 'sessions' | 'files') => {
    try {
      const target = tx.objectStore(to)
      await target.clear()
      if (to === 'sessions') {
        await tx.objectStore('sessionSummaries').clear()
      }
      for (
        let cursor = await tx.objectStore(from).openCursor();
        cursor;
        cursor = await cursor.continue()
      ) {
        await target.put(cursor.value)
        if (to === 'sessions') {
          const summary = storedSummary(cursor.value as Session)
          await tx.objectStore('sessionSummaries').put(summary)
          summaries.push(toSessionSummary(summary))
        }
      }
      await tx.objectStore(from).clear()
    } catch (error) {
      // 同步抛出的错误不会让事务自动回滚，需显式中止，避免只提交清空和部分移入。
      abortTransaction(tx)
      throw error
    }
  }
  await Promise.all([move('sessionsStaging', 'sessions'), move('filesStaging', 'files'), tx.done])
  // 直接返回本次提交的列表，调用方无需在替换成功后再发起可能失败的读取。
  return summaries
}

/* ------------------------------ WCDB 实现（Android） ------------------------------ */

const KIND = {
  session: 's',
  summary: 'm',
  file: 'f',
  stagingSession: 'ss',
  stagingSummary: 'ms',
  stagingFile: 'fs',
} as const

/** WCDB 是 Android 端的唯一存储，不做任何历史数据迁移。 */
const ensureReady = async (): Promise<void> => wcdb.ready()

const parseSession = (item: WcdbItem): Session | null => {
  if (!item.json) {
    return null
  }
  try {
    return JSON.parse(item.json) as Session
  } catch {
    return null
  }
}

const wcdbReadSummaries = async (kind: string): Promise<SessionSummary[]> => {
  await ensureReady()
  const items = await wcdb.getAll(kind)
  return items
    .map((item) => (item.json ? (JSON.parse(item.json) as StoredSessionSummary) : null))
    .filter((summary): summary is StoredSessionSummary => Boolean(summary))
    .map(toSessionSummary)
}

const wcdbLoadSessionSummaries = () => wcdbReadSummaries(KIND.summary)

const wcdbLoadSession = async (id: string): Promise<Session | undefined> => {
  await ensureReady()
  const item = await wcdb.get(KIND.session, id)
  return parseSession(item ?? { kind: KIND.session, id }) ?? undefined
}

const wcdbSaveSession = async (session: Session, files: StoredFile[] = []): Promise<void> => {
  await ensureReady()
  const items: WcdbItem[] = [
    { kind: KIND.session, id: session.id, json: JSON.stringify(session) },
    { kind: KIND.summary, id: session.id, json: JSON.stringify(storedSummary(session)) },
  ]
  for (const file of files) {
    items.push(await wcdb.fileToItem(KIND.file, file))
  }
  await wcdb.put(items)
}

const wcdbRenameSession = async (id: string, title: string): Promise<void> => {
  await ensureReady()
  const session = parseSession(await wcdb.get(KIND.session, id) ?? { kind: KIND.session, id })
  if (!session) {
    return
  }
  session.title = title
  await wcdb.put([
    { kind: KIND.session, id, json: JSON.stringify(session) },
    { kind: KIND.summary, id, json: JSON.stringify(storedSummary(session)) },
  ])
}

const wcdbDeleteSession = async (sessionId: string): Promise<void> => {
  await ensureReady()
  const summary = await wcdb.get(KIND.summary, sessionId)
  const fileIds = summary?.json
    ? (JSON.parse(summary.json) as StoredSessionSummary).fileIds
    : []
  const others = await wcdb.getAll(KIND.summary)
  const referenced = new Set(
    others
      .filter((item) => item.id !== sessionId && item.json)
      .flatMap((item) => (JSON.parse(item.json as string) as StoredSessionSummary).fileIds)
  )
  const keys: WcdbRef[] = [
    { kind: KIND.session, id: sessionId },
    { kind: KIND.summary, id: sessionId },
    ...fileIds
      .filter((id) => !referenced.has(id))
      .map((id) => ({ kind: KIND.file, id })),
  ]
  await wcdb.remove(keys)
}

const wcdbSaveFiles = async (files: StoredFile[]): Promise<void> => {
  await ensureReady()
  await wcdb.put(await Promise.all(files.map((file) => wcdb.fileToItem(KIND.file, file))))
}

const wcdbLoadFile = async (id: string): Promise<Blob | undefined> => {
  await ensureReady()
  const item = await wcdb.get(KIND.file, id)
  return item?.blob ? wcdb.itemToFile(item).blob : undefined
}

const wcdbClearStaging = async (): Promise<void> => {
  await ensureReady()
  await wcdb.clear([KIND.stagingSession, KIND.stagingSummary, KIND.stagingFile])
}

const wcdbAddStagingSessions = async (sessions: Session[]): Promise<void> => {
  await ensureReady()
  await wcdb.put(
    sessions.flatMap((session) => [
      { kind: KIND.stagingSession, id: session.id, json: JSON.stringify(session) },
      { kind: KIND.stagingSummary, id: session.id, json: JSON.stringify(storedSummary(session)) },
    ])
  )
}

const wcdbSaveStagingFiles = async (files: StoredFile[]): Promise<void> => {
  await ensureReady()
  await wcdb.put(await Promise.all(files.map((file) => wcdb.fileToItem(KIND.stagingFile, file))))
}

const wcdbUpdateStagingFileTypes = async (types: ReadonlyMap<string, string>): Promise<void> => {
  await ensureReady()
  if (!Array.from(types.values()).some(Boolean)) {
    return
  }
  let after = ''
  for (;;) {
    const page = await wcdb.getStagingSessionPage(after)
    if (page.length === 0) {
      return
    }
    const updated: WcdbItem[] = []
    for (const item of page) {
      const session = parseSession(item)
      if (!session) {
        continue
      }
      let changed = false
      for (const message of session.messages) {
        if (message.role !== 'user') {
          continue
        }
        for (const file of message.files) {
          const type = types.get(file.id) ?? ''
          if (file.mimeType !== type) {
            file.mimeType = type
            changed = true
          }
        }
      }
      if (changed) {
        updated.push({ kind: KIND.stagingSession, id: item.id, json: JSON.stringify(session) })
      }
    }
    await wcdb.put(updated)
    after = page[page.length - 1].id
  }
}

const wcdbCommitStaging = async (): Promise<SessionSummary[]> => {
  const summaries = await wcdbReadSummaries(KIND.stagingSummary)
  await wcdb.commitHistory()
  return summaries
}

/* ------------------------------ 平台分派 ------------------------------ */

const native = Boolean(serviceBridge) || Capacitor.getPlatform() === 'android'

export const loadSessionSummaries = native ? wcdbLoadSessionSummaries : idbLoadSessionSummaries
export const loadSession = native ? wcdbLoadSession : idbLoadSession
export const saveSession = native ? wcdbSaveSession : idbSaveSession
export const renameSession = native ? wcdbRenameSession : idbRenameSession
export const deleteSession = native ? wcdbDeleteSession : idbDeleteSession
export const saveFiles = native ? wcdbSaveFiles : idbSaveFiles
export const loadFile = native ? wcdbLoadFile : idbLoadFile
export const clearStaging = native ? wcdbClearStaging : idbClearStaging
export const addStagingSessions = native ? wcdbAddStagingSessions : idbAddStagingSessions
export const saveStagingFiles = native ? wcdbSaveStagingFiles : idbSaveStagingFiles
export const updateStagingFileTypes = native ? wcdbUpdateStagingFileTypes : idbUpdateStagingFileTypes
export const commitStaging = native ? wcdbCommitStaging : idbCommitStaging

/** 本地存储失败不打断对话，只在控制台留痕 */
export const reportStorageError = (action: string) => (error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(`[storage] ${action} failed`, error)
}
