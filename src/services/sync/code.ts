/** 同步码：`dsc1.` + base64url(JSON)，只包含服务器地址和长期密钥。 */

export type SyncTarget = { url: string; key: string }

const PREFIX = 'dsc1.'
const KEY_PATTERN = /^[A-Za-z0-9_-]{32,128}$/

const toBase64Url = (text: string): string => {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromBase64Url = (value: string): string => {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** 只接受 http(s)，去掉末尾斜杠；路径前缀（如 /sync）保留。 */
export const normalizeServerUrl = (raw: string): string | null => {
  const value = raw.trim()
  if (!value) {
    return null
  }
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null
    }
    if (!url.hostname) {
      return null
    }
    url.hash = ''
    url.search = ''
    return url.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}

export const isValidSyncKey = (value: string): boolean => KEY_PATTERN.test(value)

/** 支持粘贴同步码，也兼容直接粘贴 `{"url": "...", "key": "..."}`。 */
export const parseSyncCode = (raw: string): SyncTarget | null => {
  const input = parseSyncInput(raw)
  return input?.url ? { url: input.url, key: input.key } : null
}

export type SyncInput = { url: string | null; key: string }

/**
 * 解析粘贴内容：完整同步码 / JSON 带地址；也允许只粘贴密钥，
 * 地址由表单里的「服务器地址」单独提供。
 */
export const parseSyncInput = (raw: string): SyncInput | null => {
  const value = raw.trim().replace(/\s+/g, '')
  if (!value) {
    return null
  }
  if (!value.startsWith(PREFIX) && !value.startsWith('{')) {
    return isValidSyncKey(value) ? { url: null, key: value } : null
  }
  let payload: unknown
  if (value.startsWith(PREFIX)) {
    try {
      payload = JSON.parse(fromBase64Url(value.slice(PREFIX.length)))
    } catch {
      return null
    }
  } else {
    try {
      payload = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (typeof payload !== 'object' || payload === null) {
    return null
  }
  const record = payload as Record<string, unknown>
  const url = normalizeServerUrl(
    typeof record.u === 'string' ? record.u : typeof record.url === 'string' ? record.url : ''
  )
  const key =
    typeof record.k === 'string' ? record.k : typeof record.key === 'string' ? record.key : ''
  if (!url || !isValidSyncKey(key)) {
    return null
  }
  return { url, key }
}

/** 表单里的地址：允许省略协议，默认补 https。 */
export const resolveServerUrl = (raw: string): string | null => {
  const value = raw.trim()
  if (!value) {
    return null
  }
  return normalizeServerUrl(
    /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`
  )
}

export const encodeSyncCode = (target: SyncTarget): string =>
  `${PREFIX}${toBase64Url(JSON.stringify({ v: 1, u: target.url, k: target.key }))}`
