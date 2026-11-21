import { registerPlugin } from '@capacitor/core'
import type { StoredFile } from './db.js'

export type WcdbItem = { kind: string; id: string; json?: string; blob?: string }
export type WcdbRef = { kind: string; id: string }

type WcdbStoragePlugin = {
  initialize(): Promise<void>
  getAll(options: { kind: string }): Promise<{ items: WcdbItem[] }>
  get(options: { kind: string; id: string }): Promise<{ found: boolean; item?: WcdbItem }>
  put(options: { items: WcdbItem[] }): Promise<void>
  remove(options: { keys: WcdbRef[] }): Promise<void>
  commit(options: {
    clearKinds: string[]
    items: WcdbItem[]
    stagingKeys: WcdbRef[]
  }): Promise<void>
  clear(options: { kinds: string[] }): Promise<void>
}

const WcdbStorage = registerPlugin<WcdbStoragePlugin>('WcdbStorage')

let pending: Promise<void> | null = null

/** 首次使用时打开数据库；失败后允许下次重试。 */
export const ready = (): Promise<void> =>
  (pending ??= WcdbStorage.initialize().catch((error: unknown) => {
    pending = null
    throw error
  }))

export const getAll = async (kind: string): Promise<WcdbItem[]> => {
  await ready()
  return (await WcdbStorage.getAll({ kind })).items
}

export const get = async (kind: string, id: string): Promise<WcdbItem | null> => {
  await ready()
  const result = await WcdbStorage.get({ kind, id })
  return result.found ? result.item ?? null : null
}

export const put = async (items: WcdbItem[]): Promise<void> => {
  if (items.length === 0) {
    return
  }
  await ready()
  await WcdbStorage.put({ items })
}

export const remove = async (keys: WcdbRef[]): Promise<void> => {
  if (keys.length === 0) {
    return
  }
  await ready()
  await WcdbStorage.remove({ keys })
}

export const commit = async (
  clearKinds: string[],
  items: WcdbItem[],
  stagingKeys: WcdbRef[]
): Promise<void> => {
  await ready()
  await WcdbStorage.commit({ clearKinds, items, stagingKeys })
}

export const clear = async (kinds: string[]): Promise<void> => {
  await ready()
  await WcdbStorage.clear({ kinds })
}

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  const size = 0x8000
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size))
  }
  return btoa(binary)
}

const base64ToBlob = (value: string): Blob =>
  new Blob([Uint8Array.from(atob(value), (char) => char.charCodeAt(0))])

export const fileToItem = async (kind: string, file: StoredFile): Promise<WcdbItem> => ({
  kind,
  id: file.id,
  blob: bytesToBase64(new Uint8Array(await file.blob.arrayBuffer())),
})

export const itemToFile = (item: WcdbItem): StoredFile => ({
  id: item.id,
  blob: base64ToBlob(item.blob ?? ''),
})
