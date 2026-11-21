import { Capacitor, registerPlugin } from '@capacitor/core'
import type { ArchiveSource } from './zipReader.js'

interface HistoryFilePlugin {
  chooseSource(): Promise<{ selected: false } | { selected: true; name: string; size: number }>
  read(options: { offset: number; length: number }): Promise<{ data: string }>
  releaseSource(): Promise<void>
  chooseDestination(options: { name: string }): Promise<{ selected: boolean }>
  append(options: { data: string }): Promise<void>
  finish(): Promise<void>
  abort(): Promise<void>
}

const HistoryFile = registerPlugin<HistoryFilePlugin>('HistoryFile')
const CHUNK_BYTES = 192 * 1024

const encode = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.readAsDataURL(blob)
  })

export const savesHistoryNatively = () => Capacitor.getPlatform() === 'android'

/** 单块缓存，避免为 ZIP 头部等短读取频繁跨 Capacitor 桥。 */
export const pickBackup = async (): Promise<ArchiveSource | null> => {
  const source = await HistoryFile.chooseSource()
  if (!source.selected) {
    return null
  }
  let cachedOffset = -1
  let cached = new Uint8Array()
  return {
    name: source.name,
    size: source.size,
    close: () => HistoryFile.releaseSource(),
    async read(start, length) {
      const bytes = new Uint8Array(length)
      for (let written = 0; written < length;) {
        const position = start + written
        const offset = Math.floor(position / CHUNK_BYTES) * CHUNK_BYTES
        if (offset !== cachedOffset) {
          const size = Math.min(CHUNK_BYTES, source.size - offset)
          const { data } = await HistoryFile.read({ offset, length: size })
          cached = Uint8Array.from(atob(data), (byte) => byte.charCodeAt(0))
          if (cached.length !== size) {
            throw new Error('Incomplete backup read')
          }
          cachedOffset = offset
        }
        const index = position - offset
        const part = cached.subarray(index, index + length - written)
        bytes.set(part, written)
        written += part.length
      }
      return bytes
    },
  }
}

/** 用 Android 文件选择器保存，逐块送入原生输出流。 */
export const saveBackup = async (
  name: string,
  blob: Blob,
  onWrite: (percent: number) => void
): Promise<boolean> => {
  const { selected } = await HistoryFile.chooseDestination({ name })
  if (!selected) {
    return false
  }
  try {
    let percent = 0
    onWrite(percent)
    for (let offset = 0; offset < blob.size; offset += CHUNK_BYTES) {
      const end = Math.min(offset + CHUNK_BYTES, blob.size)
      await HistoryFile.append({ data: await encode(blob.slice(offset, end)) })
      const next = Math.floor((end / blob.size) * 100)
      if (next !== percent) {
        percent = next
        onWrite(percent)
      }
    }
    await HistoryFile.finish()
    return true
  } catch (error) {
    await HistoryFile.abort().catch(() => {})
    throw error
  }
}
