import * as db from '../chat/db.js'
import type { FileAttachment, Message, Session } from '../chat/types.js'
import { downloadRemoteFile } from './client.js'
import type { SyncTarget } from './code.js'
import { MAX_SYNC_FILE_BYTES, sha256Hex, type ImageRef } from './fileModel.js'

export { MAX_SYNC_FILE_BYTES, imageRefs, sha256Hex } from './fileModel.js'
export type { ImageRef } from './fileModel.js'

export type PreparedSession = {
  session: Session
  /** sha256 -> blob，等会话推送成功后再上传，避免远端拿到不存在的哈希 */
  uploads: Map<string, Blob>
  changed: boolean
}

/**
 * 推送前补齐图片的内容哈希，并收集待上传的原件。
 * 没有本地原件的（别的设备同步过来的消息）只保留哈希，不参与上传。
 */
export const prepareSessionFiles = async (session: Session): Promise<PreparedSession> => {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    return { session, uploads: new Map(), changed: false }
  }
  const uploads = new Map<string, Blob>()
  let changed = false
  const messages: Message[] = []

  for (const message of session.messages) {
    if (message.role !== 'user' || message.files.length === 0) {
      messages.push(message)
      continue
    }
    let nextFiles: FileAttachment[] | null = null
    for (let index = 0; index < message.files.length; index += 1) {
      const file = message.files[index]
      if (!file.isImage || file.size > MAX_SYNC_FILE_BYTES) {
        continue
      }
      const blob = await db.loadFile(file.id)
      if (!blob || blob.size > MAX_SYNC_FILE_BYTES) {
        continue
      }
      let sha256 = file.sha256
      if (!sha256) {
        sha256 = await sha256Hex(blob)
        nextFiles ??= [...message.files]
        nextFiles[index] = { ...file, sha256 }
        changed = true
      }
      uploads.set(sha256, blob)
    }
    messages.push(nextFiles ? { ...message, files: nextFiles } : message)
  }

  return {
    session: changed ? { ...session, messages } : session,
    uploads,
    changed,
  }
}

/** 本地已有就跳过；否则按哈希下载并写入附件原件。 */
export const fetchImage = async (
  target: SyncTarget,
  ref: ImageRef,
  cache: Map<string, Blob | null>
): Promise<boolean> => {
  const existing = await db.loadFile(ref.id)
  if (existing) {
    return false
  }
  let blob = cache.get(ref.sha256)
  if (blob === undefined) {
    blob = await downloadRemoteFile(target, ref.sha256)
    cache.set(ref.sha256, blob)
  }
  if (!blob) {
    return false
  }
  await db.saveFiles([{ id: ref.id, blob }])
  return true
}
