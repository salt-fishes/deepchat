import { useTranslate } from '../../i18n/index.js'
import clsx from 'clsx'
import { memo, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import { IconChevronDownOutline14, IconEditOutline16 } from '../base/icons.js'
import { retryUpload } from '../../services/chat/store.js'
import { shareText } from '../../services/share.js'
import type { UserMessage as UserMessageType } from '../../services/chat/types.js'
import { IconButton } from '../base/IconButton.js'
import { showToast } from '../base/toastState.js'
import {
  BranchSwitcher,
  type MessageVersions,
  type SelectMessageVersion,
} from './BranchSwitcher.js'
import { MessageFile } from './MessageFile.js'
import { CopyButton, copyWithFeedback } from './CopyButton.js'
import { MessageActionMenu } from './MessageActionMenu.js'
import { requestUserMessageEdit } from './messageGestureEvents.js'
import {
  selectMessageText,
  useMessageGestures,
  type MessageLongPressDetail,
} from './useMessageGestures.js'
import styles from './UserMessage.module.css'

export const UserMessage = memo(function UserMessage({
  sessionId,
  message,
  retryUploadId,
  isFirst,
  isLast,
  busy,
  entering,
  versions,
  onSelectVersion,
}: {
  sessionId: string
  message: UserMessageType
  /** 回答因补传附件失败可重试时为该回答 id */
  retryUploadId: string | null
  isFirst: boolean
  isLast: boolean
  busy: boolean
  /** 新消息入场 / 版本切换时为 true，播放一次性淡入 */
  entering: boolean
  versions: MessageVersions
  onSelectVersion: SelectMessageVersion
}) {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const [expanded, setExpanded] = useState(false)
  const [overflow, setOverflow] = useState(false)
  const bubbleText = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const [actionMenu, setActionMenu] = useState<MessageLongPressDetail | null>(null)
  useLayoutEffect(() => {
    const text = bubbleText.current
    if (!text || !isMobile || expanded) {
      return
    }
    const measure = () => setOverflow(text.scrollHeight > text.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(text)
    return () => observer.disconnect()
  }, [expanded, isMobile, message.content])

  const beginEdit = useCallback(() => {
    if (busy) {
      return
    }
    requestUserMessageEdit(sessionId, message.id)
  }, [busy, sessionId, message.id])

  const gestureProps = useMessageGestures({
    rootRef,
    onLongPress: (detail) => setActionMenu(detail),
    onDoubleClick: () => {
      if (message.content) {
        beginEdit()
      }
    },
  })

  return (
    <div
      {...gestureProps}
      ref={rootRef}
      data-prompt-id={message.id}
      data-message-role="user"
      className={clsx(styles.container, isFirst && styles.isFirst, entering && styles.entering)}
    >
      {message.files.length > 0 ? (
        <div
          className={clsx(
            styles.files,
            message.files.some((file) => !file.isImage) && styles.filesWithDocuments
          )}
        >
          {message.files.map((file) => (
            <MessageFile
              key={file.id}
              file={file}
              onRetry={retryUploadId ? () => retryUpload(sessionId, retryUploadId) : null}
            />
          ))}
        </div>
      ) : null}
      {message.content ? (
        <div
          className={clsx(styles.bubble, isMobile && overflow && !expanded && styles.bubbleFaded)}
        >
          <div
            ref={bubbleText}
            data-message-text="true"
            className={clsx(isMobile && !expanded && styles.bubbleClamp)}
          >
            {message.content}
          </div>
          {isMobile && (overflow || expanded) ? (
            <button
              type="button"
              className={styles.bubbleToggle}
              aria-expanded={expanded}
              aria-label={t(expanded ? 'collapsePrompt' : 'expandPrompt')}
              onClick={() => setExpanded(!expanded)}
            >
              <IconChevronDownOutline14 />
            </button>
          ) : null}
        </div>
      ) : null}
      <div className={styles.bottom}>
        <div className={clsx(styles.actions, isLast && styles.alwaysShow)}>
          {message.content ? <CopyButton text={message.content} /> : null}
          <IconButton
            icon={<IconEditOutline16 />}
            tooltip={t('editMessage')}
            tooltipPlacement="bottom"
            disabled={busy}
            onClick={beginEdit}
          />
        </div>
        <BranchSwitcher versions={versions} disabled={busy} onSelect={onSelectVersion} />
      </div>
      <MessageActionMenu
        detail={actionMenu}
        onClose={() => setActionMenu(null)}
        onCopy={() => {
          if (message.content) {
            void copyWithFeedback(message.content)
          }
        }}
        onSelectText={() => {
          if (actionMenu) {
            selectMessageText(rootRef.current, actionMenu.target)
          }
        }}
        onEdit={beginEdit}
        onShare={() => {
          if (!message.content) {
            return
          }
          void shareText(message.content, t('share')).catch(() => showToast(t('shareCardFailed')))
        }}
        canEdit={!busy}
      />
    </div>
  )
})
