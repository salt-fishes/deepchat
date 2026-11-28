import type { Session } from '../chat/types.js'

/** 单张图片的同步上限；超过的仍同步元数据，但不传原件。 */
export const MAX_SYNC_FILE_BYTES = 20 * 1024 * 1024

export const sha256Hex = async (blob: Blob): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export type ImageRef = { id: string; sha256: string; mimeType: string }

/** 消息里带哈希的图片，用于在其他设备按需下载。 */
export const imageRefs = (session: Session): ImageRef[] => {
  const refs: ImageRef[] = []
  for (const message of session.messages) {
    if (message.role !== 'user') {
      continue
    }
    for (const file of message.files) {
      if (file.isImage && file.sha256) {
        refs.push({ id: file.id, sha256: file.sha256, mimeType: file.mimeType })
      }
    }
  }
  return refs
}
