import { useTranslate } from '../../i18n/index.js'
import clsx from 'clsx'
import { memo, useEffect, useRef, useState } from 'react'
import { IconRefreshOutline16, IconWarningOutline16 } from '../base/icons.js'
import { describeReply } from '../../services/chat/describe.js'
import { canContinueReply } from '../../services/chat/reply.js'
import { continueReply, regenerateReply, useChatStore } from '../../services/chat/store.js'
import { getVisibleMessages } from '../../services/chat/branches.js'
import {
  describeReadAloudError,
  stopReadAloud,
  toggleReadAloud,
  useAutoReadAloud,
} from '../../services/speech/readAloud.js'
import { shareText } from '../../services/share.js'
import { openInAppLink } from '../../services/externalLinks.js'
import { showToast } from '../base/toastState.js'
import { useSettings } from '../../services/settings.js'
import type { AssistantMessage as AssistantMessageType } from '../../services/chat/types.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { IconButton } from '../base/IconButton.js'
import { Button } from '../base/Button.js'
import { Markdown } from '../markdown/Markdown.js'
import { SiteThumbnails } from '../search/SiteLogo.js'
import { toggleSearchPanel, useSearchPanel } from '../search/searchPanelState.js'
import { ReadAloudButton } from './ReadAloudButton.js'
import { CopyButton, copyWithFeedback } from './CopyButton.js'
import { ReplyArea } from './ReplyArea.js'
import { MessageActionMenu } from './MessageActionMenu.js'
import { SelectionToolbar, type MessageSelection } from './SelectionToolbar.js'
import { ShareCardDialog } from './ShareCardDialog.js'
import { UsagePanel } from './UsagePanel.js'
import { IconShareOutline16, IconUsageOutline16 } from './MessageIcons.js'
import { requestUserMessageEdit } from './messageGestureEvents.js'
import {
  selectMessageText,
  useMessageGestures,
  type MessageLongPressDetail,
} from './useMessageGestures.js'
import { useReplyView } from './useReplyView.js'
import {
  BranchSwitcher,
  type MessageVersions,
  type SelectMessageVersion,
} from './BranchSwitcher.js'
import styles from './AssistantMessage.module.css'

const TOP_UP_URL = 'https://platform.deepseek.com/top_up'

export const AssistantMessage = memo(function AssistantMessage({
  sessionId,
  message,
  isLast,
  streaming,
  busy,
  entering,
  versions,
  onSelectVersion,
}: {
  sessionId: string
  message: AssistantMessageType
  isLast: boolean
  streaming: boolean
  busy: boolean
  /** 新消息入场 / 版本切换时为 true，播放一次性淡入 */
  entering: boolean
  versions: MessageVersions
  onSelectVersion: SelectMessageVersion
}) {
  const t = useTranslate()
  const view = useReplyView(message, streaming)
  const panelEntry = useSearchPanel((state) => state.entry)
  const notice = streaming ? null : describeReply(message)
  // 安全拒绝：已下发的思考与正文按协议丢弃，只显示模板答复。
  const refused = message.stopReason === 'refusal'
  const answer = refused ? null : view.answer
  const responseText = [answer?.text, notice?.presentation === 'response' ? notice.text : null]
    .filter(Boolean)
    .join('\n\n')
  const copyText = responseText || notice?.text
  const waiting = streaming && view.steps.length === 0 && !view.answer && !message.thinking
  const summaryEntry = `${message.id}-summary`
  const rootRef = useRef<HTMLDivElement>(null)
  const [actionMenu, setActionMenu] = useState<MessageLongPressDetail | null>(null)
  const [selection, setSelection] = useState<MessageSelection | null>(null)
  const [shareOpen, setShareOpen] = useState(false)
  const [usageOpen, setUsageOpen] = useState(false)

  useEffect(() => {
    setActionMenu(null)
    setSelection(null)
  }, [message.id])

  const editPreviousUser = () => {
    const session = useChatStore.getState().sessionCache[sessionId]
    if (!session) {
      return
    }
    const directParent = session.messages.find((item) => item.id === message.parentId)
    let userId = directParent?.role === 'user' ? directParent.id : undefined
    if (!userId) {
      const visible = getVisibleMessages(session)
      const index = visible.findIndex((item) => item.id === message.id)
      const previous = index > 0 ? visible[index - 1] : undefined
      if (previous?.role === 'user') {
        userId = previous.id
      }
    }
    if (!userId) {
      return
    }
    requestUserMessageEdit(sessionId, userId)
    const target = document.querySelector<HTMLElement>(`[data-prompt-id="${CSS.escape(userId)}"]`)
    target?.scrollIntoView({
      block: 'center',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    })
  }

  const regenerate = () => {
    stopReadAloud()
    regenerateReply(sessionId, message.id)
  }

  const shareSelection = (text: string) => {
    void shareText(text, t('shareCardTitle')).catch(() => showToast(t('shareCardFailed')))
  }

  const gestureProps = useMessageGestures({
    rootRef,
    onLongPress: (detail) => {
      setSelection(null)
      setActionMenu(detail)
    },
    onDoubleClick: (event) => {
      if (streaming || refused) {
        return
      }
      const block = (event.target as HTMLElement).closest<HTMLElement>('[data-markdown-block]')
      if (!block || !rootRef.current?.contains(block)) {
        return
      }
      event.preventDefault()
      const current = window.getSelection()
      if (!current) {
        return
      }
      const range = document.createRange()
      range.selectNodeContents(block)
      current.removeAllRanges()
      current.addRange(range)
      setActionMenu(null)
      setSelection({ text: current.toString(), range: range.cloneRange() })
    },
  })
  // 流式刚结束时操作栏淡入一次；历史消息挂载与之后的重渲染不动画
  const [finishedFlash, setFinishedFlash] = useState(false)
  const wasStreamingRef = useRef(false)
  useEffect(() => {
    if (streaming) {
      wasStreamingRef.current = true
      return
    }
    if (!wasStreamingRef.current) {
      return
    }
    wasStreamingRef.current = false
    if (
      message.status === 'done' &&
      answer?.text.trim() &&
      useAutoReadAloud.getState().enabled &&
      useSettings.getState().apiKey &&
      useChatStore.getState().activeId === sessionId
    ) {
      toggleReadAloud(
        message.id,
        answer.text,
        (error) => showToast(describeReadAloudError(error)),
        true
      )
    }
    setFinishedFlash(true)
    const timer = window.setTimeout(() => setFinishedFlash(false), 280)
    return () => window.clearTimeout(timer)
  }, [answer?.text, message.id, message.status, sessionId, streaming])
  return (
    <div
      {...gestureProps}
      ref={rootRef}
      className={clsx(styles.message, entering && styles.entering)}
      data-reply-id={message.id}
      data-message-role="assistant"
    >
      {refused ? null : (
        <ReplyArea
          message={message}
          view={view}
          streaming={streaming}
          hasResponse={!!responseText}
        />
      )}
      {answer ? (
        <Markdown
          className="ds-assistant-message-main-content"
          content={answer.markdown}
          loading={streaming}
          cacheKey={message.id}
          disableLink={false}
          sources={view.sources}
        />
      ) : null}
      {waiting ? (
        <div className={styles.waiting}>
          {[0, 1, 2].map((index) => (
            <span key={index} className={styles.waitingDot} />
          ))}
        </div>
      ) : null}
      {notice?.presentation === 'response' ? (
        <Markdown
          className="ds-assistant-message-main-content"
          content={notice.text}
          loading={false}
          cacheKey={`${message.id}-template`}
          disableLink={false}
        />
      ) : notice ? (
        <div className={styles.notice}>
          <IconWarningOutline16 />
          <span>
            {notice.text}
            {notice.action === 'apiKey' ? (
              <>
                {' '}
                <button
                  type="button"
                  className={styles.noticeAction}
                  onClick={() => openSettings('api')}
                >
                  {t('changeApiKey')}
                </button>
              </>
            ) : null}
            {notice.action === 'topUp' ? (
              <>
                {' '}
                <button
                  type="button"
                  className={styles.noticeAction}
                  onClick={() => openInAppLink(TOP_UP_URL, t('topUp'))}
                >
                  {t('topUp')}
                </button>
              </>
            ) : null}
          </span>
        </div>
      ) : null}
      {!streaming && !refused && view.searchResults.length > 0 ? (
        <div
          className={clsx(styles.summary, panelEntry === summaryEntry && styles.summaryActive)}
          onClick={() => toggleSearchPanel(summaryEntry, view.searchResults)}
        >
          <SiteThumbnails sources={view.searchResults} />
          <span>
            {t(
              view.searchResults.length === 1 ? 'messageSearchSummary' : 'messageSearchSummaries',
              { count: view.searchResults.length }
            )}
          </span>
        </div>
      ) : null}
      {streaming ? null : (
        <div className={clsx(styles.bottom, finishedFlash && styles.bottomIn)}>
          <BranchSwitcher versions={versions} disabled={busy} onSelect={onSelectVersion} />
          <div className={clsx(styles.actions, isLast && styles.alwaysShow)}>
            {copyText ? <CopyButton text={copyText} /> : null}
            {responseText && !refused ? (
              <IconButton
                icon={<IconShareOutline16 />}
                tooltip={t('share')}
                tooltipPlacement="bottom"
                onClick={() => {
                  setUsageOpen(false)
                  setShareOpen(true)
                }}
              />
            ) : null}
            {responseText && !refused ? (
              <ReadAloudButton messageId={message.id} text={responseText} />
            ) : null}
            <IconButton
              icon={<IconRefreshOutline16 />}
              tooltip={t('regenerate')}
              tooltipPlacement="bottom"
              disabled={busy || refused}
              onClick={regenerate}
            />
            {isLast && message.usage ? (
              <IconButton
                icon={<IconUsageOutline16 />}
                tooltip={t('usageTitle')}
                tooltipPlacement="bottom"
                aria-expanded={usageOpen}
                onClick={() => {
                  setShareOpen(false)
                  setUsageOpen((value) => !value)
                }}
              />
            ) : null}
          </div>
          {isLast && canContinueReply(message) ? (
            <Button
              variant="outlined"
              size="s"
              className={styles.continueButton}
              disabled={busy}
              onClick={() => {
                stopReadAloud()
                continueReply(sessionId, message.id)
              }}
            >
              {t('continueGenerating')}
            </Button>
          ) : null}
        </div>
      )}
      <MessageActionMenu
        detail={actionMenu}
        onClose={() => setActionMenu(null)}
        onCopy={() => {
          if (copyText) {
            void copyWithFeedback(copyText)
          }
        }}
        onSelectText={() => {
          if (actionMenu) {
            selectMessageText(rootRef.current, actionMenu.target)
          }
        }}
        onEdit={editPreviousUser}
        onShare={() => {
          if (responseText) {
            setUsageOpen(false)
            setShareOpen(true)
          } else if (copyText) {
            shareSelection(copyText)
          }
        }}
        canEdit={!busy}
      />
      <SelectionToolbar
        selection={selection}
        root={rootRef.current}
        onClose={() => setSelection(null)}
        onCopy={(text) => {
          void copyWithFeedback(text)
        }}
        onShare={shareSelection}
        onRegenerate={() => {
          setSelection(null)
          regenerate()
        }}
        busy={busy}
      />
      <ShareCardDialog open={shareOpen} text={responseText} onClose={() => setShareOpen(false)} />
      <UsagePanel open={usageOpen} message={message} onClose={() => setUsageOpen(false)} />
    </div>
  )
})
