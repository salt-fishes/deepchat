import clsx from 'clsx'
import { memo, useEffect, useLayoutEffect, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { useUploads, type UploadTask } from '../../services/attachments.js'
import type { DraftAttachment } from '../../services/chat/drafts.js'
import { IconCloseFill14, IconRefreshOutline16 } from '../base/icons.js'
import { Tooltip } from '../base/Tooltip.js'
import { FileCard } from '../files/FileCard.js'
import styles from './ChatInput.module.css'

const UPLOADING: UploadTask = { status: 'uploading' }

/** 列表只随草稿附件变化更新；每张卡片独立订阅自己的上传状态。 */
export const DraftAttachments = memo(function DraftAttachments({
  items,
  onRetry,
  onRemove,
  onView,
}: {
  items: DraftAttachment[]
  onRetry: (id: string) => void
  onRemove: (id: string) => void
  onView: (id: string) => void
}) {
  const [retained, setRetained] = useState<DraftAttachment[]>([])
  useLayoutEffect(() => {
    setRetained((previous) => [
      ...previous.map((item) => items.find(({ id }) => id === item.id) ?? item),
      ...items.filter(({ id }) => !previous.some((item) => item.id === id)),
    ])
  }, [items])
  const byId = new Map(items.map((item) => [item.id, item]))
  const exiting = retained.filter(({ id }) => !byId.has(id))
  useEffect(() => {
    if (!retained.some(({ id }) => !items.some((item) => item.id === id))) {return}
    // Cleanup even if an exit is interrupted by layout changes or a hidden WebView.
    const timeout = window.setTimeout(() => {
      setRetained((previous) => previous.filter(({ id }) => items.some((item) => item.id === id)))
    }, 240)
    return () => window.clearTimeout(timeout)
  }, [items, retained])
  const visible = [...retained.map((item) => byId.get(item.id) ?? item), ...items.filter(({ id }) => !retained.some((item) => item.id === id))]
  if (!visible.length) {
    return null
  }
  return (
    <div className={styles.attachments}>
      {visible.map((item) => (
        <div
          key={item.id}
          className={styles.attachmentSlot}
          data-app-exiting={!byId.has(item.id) || undefined}
          aria-hidden={!byId.has(item.id) || undefined}
          ref={(node) => { if (node) {node.inert = !byId.has(item.id)} }}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget && exiting.includes(item)) {
              setRetained((previous) => previous.filter(({ id }) => id !== item.id))
            }
          }}
        >
          <AttachmentItem
            item={item}
            onRetry={() => onRetry(item.id)}
            onRemove={() => onRemove(item.id)}
            onView={() => onView(item.id)}
          />
        </div>
      ))}
    </div>
  )
})

/** 输入框里的文件：图片显示缩略图（点击查看/剪裁），其余显示文件卡片 */
const AttachmentItem = ({
  item,
  onRetry,
  onRemove,
  onView,
}: {
  item: DraftAttachment
  onRetry: () => void
  onRemove: () => void
  onView: () => void
}) => {
  const t = useTranslate()
  const task = useUploads((state) => state.tasks[item.id] ?? UPLOADING)
  const status = task.status
  const error = task.status === 'error' ? t(task.error.key, task.error.params) : undefined
  // 过大、格式不支持等重试无效的失败只提示原因，需删除后再发送
  const retry = task.status === 'error' && task.retryable ? onRetry : undefined
  const failed = status === 'error'
  const retryLabel = t('uploadRetry', { message: error ?? t('uploadFileStatusFailed') })
  // 「上传失败」只显示重试图标，其余原因写在图片上：可重试时在图标下方，不可重试时贴底
  const showReason = failed && error !== undefined && error !== t('uploadFileStatusFailed')
  return item.previewUrl ? (
    <div
      className={clsx(styles.attachment, failed && styles.attachmentFailed)}
      title={error ?? item.file.name}
      onClick={item.isImage ? onView : undefined}
    >
      <img className={status === 'done' ? styles.attachmentReady : undefined} src={item.previewUrl} alt={item.file.name} />
      {status === 'uploading' ? <div className={styles.uploading} /> : null}
      {failed && retry ? (
        <Tooltip content={retryLabel}>
          <button
            type="button"
            className={styles.failed}
            aria-label={retryLabel}
            onClick={(event) => {
              event.stopPropagation()
              retry()
            }}
          >
            <IconRefreshOutline16 />
            {showReason ? <span className={styles.failedReason}>{error}</span> : null}
          </button>
        </Tooltip>
      ) : null}
      {failed && !retry ? (
        <div className={clsx(styles.failed, styles.failedStatic)} aria-label={error}>
          {showReason ? <span className={styles.failedReason}>{error}</span> : null}
        </div>
      ) : null}
      <button
        type="button"
        className={clsx(styles.remove, failed && !retry && styles.invalidRemove)}
        aria-label={t('delete')}
        onClick={(event) => {
          event.stopPropagation()
          onRemove()
        }}
      >
        <IconCloseFill14 />
      </button>
    </div>
  ) : (
    <FileCard
      name={item.file.name}
      size={item.file.size}
      status={status}
      error={error}
      onRetry={retry}
      onRemove={onRemove}
    />
  )
}
