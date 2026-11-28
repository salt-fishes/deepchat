import { create } from 'zustand'
import { parseSyncCode, type SyncTarget } from './code.js'

export type SyncPhase = 'off' | 'idle' | 'syncing' | 'error'

type SyncSettings = {
  code: string | null
  target: SyncTarget | null
  phase: SyncPhase
  /** 最近一次完整同步成功的时间 */
  lastSyncAt: number | null
  lastError: string | null
  /** 还有多少个本地会话等待推送 */
  pending: number
}

const CODE_KEY = 'deepchat:sync-code'
const CURSOR_KEY = 'deepchat:sync-cursor'
const PUSH_KEY = 'deepchat:sync-push'
const DELETED_KEY = 'deepchat:sync-deletions'
const LAST_TARGET_KEY = 'deepchat:sync-last-target'
const BASELINE_KEY = 'deepchat:sync-baseline'

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // 隐私模式等场景下只在内存中生效
  }
}

const initialCode = read(CODE_KEY)

export const useSyncStore = create<SyncSettings>(() => {
  const target = initialCode ? parseSyncCode(initialCode) : null
  return {
    code: target ? initialCode : null,
    target,
    phase: target ? 'idle' : 'off',
    lastSyncAt: null,
    lastError: null,
    pending: 0,
  }
})

export const storeSyncCode = (code: string | null) => {
  write(CODE_KEY, code)
}

/** 记住上一次成功连接的服务器，断开后重新连接时可以续上进度而不是全量重来。 */
export const readLastTarget = (): SyncTarget | null => {
  const code = read(LAST_TARGET_KEY)
  return code ? parseSyncCode(code) : null
}

export const writeLastTarget = (code: string | null) => {
  write(LAST_TARGET_KEY, code)
}

export type PushedSession = { u: number; t: string }
export type Tombstone = { id: string; deletedAt: number }

export const readCursor = (): number => {
  const value = Number(read(CURSOR_KEY))
  return Number.isInteger(value) && value > 0 ? value : 0
}

export const writeCursor = (cursor: number) => {
  write(CURSOR_KEY, String(Math.max(0, Math.floor(cursor))))
}

export const readPushedSessions = (): Map<string, PushedSession> => {
  try {
    const parsed = JSON.parse(read(PUSH_KEY) ?? '{}') as Record<string, PushedSession>
    return new Map(parsed && typeof parsed === 'object' ? Object.entries(parsed) : [])
  } catch {
    return new Map()
  }
}

export const writePushedSessions = (value: Map<string, PushedSession>) => {
  write(PUSH_KEY, JSON.stringify(Object.fromEntries(value)))
}

export const readTombstones = (): Tombstone[] => {
  try {
    const parsed = JSON.parse(read(DELETED_KEY) ?? '[]') as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter(
      (item): item is Tombstone =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Tombstone).id === 'string' &&
        typeof (item as Tombstone).deletedAt === 'number'
    )
  } catch {
    return []
  }
}

export const writeTombstones = (value: Tombstone[]) => {
  write(DELETED_KEY, value.length > 0 ? JSON.stringify(value) : null)
}

/** 启用同步时本地已有、但从未上传过的会话。改了才推送，删了不发墓碑。 */
export const readBaselineSessions = (): Map<string, PushedSession> => {
  try {
    const parsed = JSON.parse(read(BASELINE_KEY) ?? '{}') as Record<string, PushedSession>
    return new Map(parsed && typeof parsed === 'object' ? Object.entries(parsed) : [])
  } catch {
    return new Map()
  }
}

export const writeBaselineSessions = (value: Map<string, PushedSession>) => {
  write(BASELINE_KEY, value.size > 0 ? JSON.stringify(Object.fromEntries(value)) : null)
}

/** 切换同步码等于切换服务器：游标、已推送状态、基线和待删除队列都从头开始。 */
export const resetSyncState = () => {
  write(CURSOR_KEY, null)
  write(PUSH_KEY, null)
  write(DELETED_KEY, null)
  write(BASELINE_KEY, null)
}
