import type { Message, Session } from '../chat/types.js'

/** 服务端 records 表的一行。 */
export type SyncRecord = {
  kind: 'session' | 'message'
  id: string
  sessionId: string | null
  updatedAt: number
  deleted: boolean
  payload: unknown
  rev: number
}

export type SyncSessionMeta = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  rootMessageId: string | null
}

export type RemoteSession = {
  meta: SyncSessionMeta
  messages: Message[]
}

export type ChangeSet = {
  deleted: string[]
  sessions: Map<string, RemoteSession>
}

const isMessage = (value: unknown): value is Message => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    (record.role === 'user' || record.role === 'assistant') &&
    typeof record.createdAt === 'number'
  )
}

const byCreatedAt = (left: Message, right: Message) =>
  left.createdAt - right.createdAt || left.id.localeCompare(right.id)

/** 生成中/待发送的回复等稳定后再同步，避免两端看到半截内容。 */
export const isSettledMessage = (message: Message): boolean =>
  message.role === 'user' || (message.status !== 'pending' && message.status !== 'streaming')

export const toSyncSession = (session: Session) => ({
  id: session.id,
  title: session.title,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
  rootMessageId: session.rootMessageId ?? null,
  messages: session.messages.filter(isSettledMessage),
})

/** 把一页 records 合并成按会话分组的结果；删除优先。 */
export const groupChanges = (records: SyncRecord[]): ChangeSet => {
  const deleted = new Set<string>()
  const sessions = new Map<string, RemoteSession>()

  for (const record of [...records].sort((left, right) => left.rev - right.rev)) {
    if (record.kind === 'session') {
      if (record.deleted) {
        deleted.add(record.id)
        sessions.delete(record.id)
        continue
      }
      const payload = record.payload as Partial<SyncSessionMeta> | null
      if (!payload || payload.id !== record.id || typeof payload.title !== 'string') {
        continue
      }
      deleted.delete(record.id)
      sessions.set(record.id, {
        meta: {
          id: record.id,
          title: payload.title,
          createdAt: payload.createdAt ?? record.updatedAt,
          updatedAt: payload.updatedAt ?? record.updatedAt,
          rootMessageId: payload.rootMessageId ?? null,
        },
        messages: sessions.get(record.id)?.messages ?? [],
      })
      continue
    }

    const sessionId = record.sessionId
    if (!sessionId || record.deleted || deleted.has(sessionId)) {
      continue
    }
    if (!isMessage(record.payload)) {
      continue
    }
    const current = sessions.get(sessionId)
    if (!current) {
      // 消息先于会话记录到达（跨页）时先占位，随后会话记录会补全标题。
      sessions.set(sessionId, {
        meta: {
          id: sessionId,
          title: '',
          createdAt: record.payload.createdAt,
          updatedAt: record.updatedAt,
          rootMessageId: null,
        },
        messages: [record.payload],
      })
    } else {
      current.messages.push(record.payload)
    }
  }

  return { deleted: [...deleted], sessions }
}

/** 本地删除的会话：只有已经推送过的才需要补墓碑，没上传过的无需通知服务器。 */
export const collectDeletedSessions = (
  previous: string[],
  alive: ReadonlySet<string>,
  pushed: ReadonlySet<string>
): string[] => previous.filter((id) => !alive.has(id) && pushed.has(id))

const sameMessage = (left: Message, right: Message) =>
  left === right || JSON.stringify(left) === JSON.stringify(right)

/**
 * 合并远端会话：消息按 ID 追加；远端 updatedAt 更新时覆盖同 ID 内容；
 * 标题、分支选择等可变字段后写胜出。
 */
export const mergeRemoteSession = (local: Session | undefined, remote: RemoteSession): Session => {
  const incoming = remote.messages.filter(isSettledMessage)
  const remoteWins = !local || remote.meta.updatedAt > local.updatedAt

  if (!local) {
    const messages = [...incoming].sort(byCreatedAt)
    return {
      id: remote.meta.id,
      title: remote.meta.title,
      createdAt: remote.meta.createdAt,
      updatedAt: remote.meta.updatedAt,
      rootMessageId: remote.meta.rootMessageId ?? messages[0]?.id ?? null,
      messages,
    }
  }

  const positions = new Map(local.messages.map((message, index) => [message.id, index]))
  const messages = [...local.messages]
  let changed = false

  for (const message of incoming) {
    const index = positions.get(message.id)
    if (index === undefined) {
      positions.set(message.id, messages.length)
      messages.push(message)
      changed = true
      continue
    }
    if (remoteWins && !sameMessage(messages[index], message)) {
      messages[index] = message
      changed = true
    }
  }

  const title = remoteWins && remote.meta.title ? remote.meta.title : local.title
  const rootMessageId =
    remoteWins && remote.meta.rootMessageId
      ? remote.meta.rootMessageId
      : (local.rootMessageId ?? remote.meta.rootMessageId)
  const createdAt = Math.min(local.createdAt, remote.meta.createdAt || local.createdAt)
  const updatedAt = Math.max(local.updatedAt, remote.meta.updatedAt)

  if (!changed && title === local.title && rootMessageId === local.rootMessageId) {
    return local
  }

  return {
    ...local,
    title,
    createdAt,
    updatedAt,
    rootMessageId,
    messages: changed ? messages.sort(byCreatedAt) : messages,
  }
}
