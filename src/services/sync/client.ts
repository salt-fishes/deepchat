import type { SyncTarget } from './code.js'
import type { SyncRecord } from './model.js'

export type SyncErrorKind = 'unauthorized' | 'network' | 'timeout' | 'server' | 'bad-response'

export class SyncRequestError extends Error {
  kind: SyncErrorKind
  status?: number

  constructor(kind: SyncErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'SyncRequestError'
    this.kind = kind
    this.status = status
  }
}

const REQUEST_TIMEOUT = 20_000

const failure = (status: number): SyncErrorKind =>
  status === 401 || status === 403 ? 'unauthorized' : 'server'

const request = async (
  target: SyncTarget,
  path: string,
  init: RequestInit = {}
): Promise<unknown> => {
  const response = await fetchRaw(target, path, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  const text = await response.text()
  if (!response.ok) {
    throw new SyncRequestError(failure(response.status), text || response.statusText, response.status)
  }
  if (!text) {
    return null
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new SyncRequestError('bad-response', 'response is not valid JSON')
  }
}

/** 带鉴权和超时的原始请求；文件和 JSON 接口共用。 */
const fetchRaw = async (
  target: SyncTarget,
  path: string,
  init: RequestInit = {},
  timeout = REQUEST_TIMEOUT
): Promise<Response> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(`${target.url}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${target.key}`,
        ...init.headers,
      },
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new SyncRequestError('timeout', 'request timed out')
    }
    throw new SyncRequestError('network', error instanceof Error ? error.message : 'network error')
  } finally {
    clearTimeout(timer)
  }
}

const isRecordList = (value: unknown): value is SyncRecord[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as SyncRecord).rev === 'number' &&
      ((item as SyncRecord).kind === 'session' || (item as SyncRecord).kind === 'message')
  )

export const pingServer = async (target: SyncTarget): Promise<number> => {
  const body = (await request(target, '/v1/ping')) as { cursor?: unknown } | null
  return typeof body?.cursor === 'number' ? body.cursor : 0
}

export const fetchChanges = async (
  target: SyncTarget,
  since: number,
  limit = 500
): Promise<{ cursor: number; more: boolean; records: SyncRecord[] }> => {
  const body = (await request(
    target,
    `/v1/changes?since=${Math.max(0, Math.floor(since))}&limit=${limit}`
  )) as { cursor?: unknown; more?: unknown; records?: unknown } | null
  if (!body || typeof body.cursor !== 'number' || !isRecordList(body.records)) {
    throw new SyncRequestError('bad-response', 'unexpected changes payload')
  }
  return { cursor: body.cursor, more: body.more === true, records: body.records }
}

export type PushSession = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  rootMessageId: string | null
  messages: unknown[]
}

export type PushBody = {
  sessions: Array<PushSession | { id: string; deleted: true; deletedAt: number }>
}

export const pushSessions = async (
  target: SyncTarget,
  body: PushBody
): Promise<{ applied: number; skipped: number; cursor: number }> => {
  const response = (await request(target, '/v1/push', {
    method: 'POST',
    body: JSON.stringify(body),
  })) as { applied?: unknown; skipped?: unknown; cursor?: unknown } | null
  if (!response || typeof response.cursor !== 'number') {
    throw new SyncRequestError('bad-response', 'unexpected push payload')
  }
  return {
    applied: typeof response.applied === 'number' ? response.applied : 0,
    skipped: typeof response.skipped === 'number' ? response.skipped : 0,
    cursor: response.cursor,
  }
}

const FILE_TIMEOUT = 120_000

export const hasRemoteFile = async (target: SyncTarget, sha256: string): Promise<boolean> => {
  const response = await fetchRaw(target, `/v1/files/${sha256}`, { method: 'HEAD' })
  return response.ok
}

export const uploadRemoteFile = async (
  target: SyncTarget,
  sha256: string,
  blob: Blob
): Promise<void> => {
  const response = await fetchRaw(
    target,
    `/v1/files/${sha256}`,
    {
      method: 'PUT',
      body: blob,
      headers: { 'content-type': blob.type || 'application/octet-stream' },
    },
    FILE_TIMEOUT
  )
  if (!response.ok) {
    throw new SyncRequestError(
      failure(response.status),
      (await response.text()) || response.statusText,
      response.status
    )
  }
}

export const downloadRemoteFile = async (
  target: SyncTarget,
  sha256: string
): Promise<Blob | null> => {
  const response = await fetchRaw(target, `/v1/files/${sha256}`, {}, FILE_TIMEOUT)
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new SyncRequestError(
      failure(response.status),
      (await response.text()) || response.statusText,
      response.status
    )
  }
  return response.blob()
}
