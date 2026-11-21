import { Capacitor, registerPlugin } from '@capacitor/core'
import type { ArchiveSource } from './zipReader.js'
import type { TranslationKey } from '../../../i18n/index.js'

type ImportStatus =
  | { state: 'idle' }
  | { state: 'running'; id: string; phase: 'opening' | 'checking' | 'reading' | 'replacing'; percent: number }
  | { state: 'success'; id: string }
  | { state: 'failure'; id: string; key: TranslationKey }

interface HistoryFilePlugin {
  chooseSource(): Promise<{ selected: false } | { selected: true; name: string }>
  startImport(): Promise<{ id: string }>
  getImportStatus(): Promise<ImportStatus>
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

export const getNativeImportStatus = () => HistoryFile.getImportStatus()

/** 文件选择仅获取文档引用；复制和解析都由导入服务负责。 */
export const pickBackup = async (): Promise<ArchiveSource | null> => {
  const source = await HistoryFile.chooseSource()
  if (!source.selected) {
    return null
  }
  return {
    name: source.name,
    size: 0,
    close: () => HistoryFile.releaseSource(),
    startNativeImport: () => HistoryFile.startImport(),
    async read() {
      throw new Error('Android imports are read by the background service')
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
