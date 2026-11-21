import { checkArchiveFormat, importArchive } from './importArchive.js'
import { BackupError } from './errors.js'
import { serviceCall } from './serviceBridge.js'
import { clearStaging, commitStaging } from '../db.js'

const CHUNK = 192 * 1024

const run = async () => {
  let staging = false
  try {
    const info = serviceCall<{ size: number }>('source')
    let cachedOffset = -1
    let cached = new Uint8Array()
    const archive = await checkArchiveFormat({
      name: '',
      size: info.size,
      async read(start, length) {
        const result = new Uint8Array(length)
        for (let written = 0; written < length;) {
          const offset = Math.floor((start + written) / CHUNK) * CHUNK
          if (cachedOffset !== offset) {
            const { data } = serviceCall<{ data: string }>('read', {
              offset,
              length: Math.min(CHUNK, info.size - offset),
            })
            cached = Uint8Array.from(atob(data), (char) => char.charCodeAt(0))
            if (cached.length === 0) {
              throw new Error('Incomplete backup read')
            }
            cachedOffset = offset
          }
          const index = start + written - offset
          const part = cached.subarray(index, index + length - written)
          result.set(part, written)
          written += part.length
        }
        return result
      },
    })
    staging = true
    await clearStaging()
    let previous = -1
    await importArchive(archive, (done, total) => {
      const percent = Math.floor((done / total) * 100)
      if (percent !== previous) {
        previous = percent
        serviceCall('progress', { phase: 'reading', percent })
      }
    }, () => serviceCall('progress', { phase: 'replacing' }))
    const summaries = await commitStaging()
    serviceCall('success', { count: summaries.length })
  } catch (error) {
    if (staging) {
      await clearStaging().catch(() => {})
    }
    serviceCall('failure', { key: error instanceof BackupError ? error.key : 'historyImportFailed' })
  }
}

void run()
