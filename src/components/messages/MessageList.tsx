import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import {
  buildMessageVersions,
  getVisibleMessages,
  type MessageVersions,
} from '../../services/chat/branches.js'
import { selectMessageVersion, useChatStore } from '../../services/chat/store.js'
import type { Session } from '../../services/chat/types.js'
import { closeSearchPanel } from '../search/searchPanelState.js'
import { chatFontOffset, useSettings } from '../../services/settings.js'
import { IconChevronDownOutline14 } from '../base/icons.js'
import { useTranslate } from '../../i18n/index.js'
import { AssistantMessage } from './AssistantMessage.js'
import { ScrollToBottomContext } from './scrollContext.js'
import { UserMessage } from './UserMessage.js'
import type { Message } from '../../services/chat/types.js'
import { useExitPresence } from '../../app/useExitPresence.js'
import { useEdgeBounce } from './useEdgeBounce.js'
import { VisibleMessage } from './VisibleMessage.js'

/**
 * 会话共用可重试的附件上传失败入口，覆盖当前提问与历史消息中的附件。
 * 点击后按失败的回答重新补传附件并请求。
 */
const getUploadRetryId = (messages: Message[], streaming: boolean) => {
  const last = messages.at(-1)
  return !streaming &&
    last?.role === 'assistant' &&
    last.status === 'error' &&
    last.error?.kind === 'upload' &&
    last.error.retryable
    ? last.id
    : null
}
import styles from './MessageList.module.css'

/** 距底部小于该值时视为在底部。 */
const STICKY_THRESHOLD = 40
const EMPTY_VERSIONS: MessageVersions = { ids: [], index: -1 }

export const MessageList = ({
  session,
  streaming,
  footer,
}: {
  session: Session
  streaming: boolean
  footer: React.ReactNode
}) => {
  const isMobile = useIsMobile()
  const t = useTranslate()
  const [showLatest, setShowLatest] = useState(false)
  const latestRef = useRef<HTMLButtonElement>(null)
  const latestVisible = useExitPresence(showLatest ? true : null, latestRef)
  const fontOffset = useSettings((s) => chatFontOffset[s.chatFontSize])
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  useEdgeBounce(scrollRef, isMobile, session.id)
  useLayoutEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {return}
    const animation = contentRef.current?.animate([{ opacity: 0.55 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' })
    return () => animation?.cancel()
  }, [session.id])
  const stickyRef = useRef(true)
  const scrollTopRef = useRef(0)
  const turnAnchor = useRef<string>()
  const spacerRef = useRef<HTMLDivElement>(null)
  const restoreScrollRef = useRef<{ messageId: string; top: number } | null>(null)
  const messages = getVisibleMessages(session)
  const [previousVersions, setPreviousVersions] = useState(() =>
    buildMessageVersions(session, new Map())
  )
  const versions = useMemo(
    () => buildMessageVersions(session, previousVersions),
    [session, previousVersions]
  )
  if (versions !== previousVersions) {
    setPreviousVersions(versions)
  }
  const lastMessageId = messages.at(-1)?.id
  const previousStream = useRef<{ sessionId: string; messageId?: string; streaming: boolean }>()
  const promptId = messages.at(-2)?.role === 'user' ? messages.at(-2)?.id : undefined
  const updateScroll = useCallback(() => {
    const scroll = scrollRef.current
    const spacer = spacerRef.current
    if (!scroll || !spacer) {
      return
    }
    const id = turnAnchor.current
    const prompt = id && contentRef.current?.querySelector<HTMLElement>(`[data-prompt-id="${CSS.escape(id)}"]`)
    if (prompt) {
      const target = Math.max(0, scroll.scrollTop + prompt.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 8)
      const end = scroll.scrollTop + spacer.getBoundingClientRect().top - scroll.getBoundingClientRect().top
      // 短回复也能把提问对齐顶端。回复长高时等量缩小占位，不追着正文向下滚。
      spacer.style.height = `${Math.max(0, Math.ceil(target + scroll.clientHeight - end))}px`
      scroll.scrollTop = target
      scrollTopRef.current = scroll.scrollTop
    } else if (stickyRef.current) {
      scroll.scrollTop = scroll.scrollHeight
      scrollTopRef.current = scroll.scrollTop
    }
    const bottom = scroll.getBoundingClientRect().bottom
    setShowLatest(spacer.getBoundingClientRect().top > bottom + STICKY_THRESHOLD)
  }, [])
  const scrollToBottom = useCallback(() => {
    updateScroll()
  }, [updateScroll])

  // 入场动画：仅同会话内新追加的末条消息、或版本切换后的新消息淡入，
  // 会话首次挂载不动画，避免整屏闪动（全局 prefers-reduced-motion 时被禁用）
  const [enteringId, setEnteringId] = useState<string | null>(null)
  const [enteringPrompt, setEnteringPrompt] = useState<string>()
  const enteringTimerRef = useRef(0)
  const flashEntering = useCallback((id: string | null) => {
    window.clearTimeout(enteringTimerRef.current)
    setEnteringId(id)
    if (id) {
      enteringTimerRef.current = window.setTimeout(() => setEnteringId(null), 320)
    }
  }, [])
  const renderedLastRef = useRef<{ sessionId: string; lastId: string | null } | null>(null)
  useEffect(() => {
    const lastId = lastMessageId ?? null
    const rendered = renderedLastRef.current
    renderedLastRef.current = { sessionId: session.id, lastId }
    if (lastId && ((rendered?.sessionId === session.id && rendered.lastId !== lastId) || (!rendered && streaming && messages.length === 2))) {
      flashEntering(lastId)
    }
  }, [session.id, lastMessageId, flashEntering, messages.length, streaming])
  useEffect(() => () => window.clearTimeout(enteringTimerRef.current), [])

  // 内容、键盘和输入框高度变化时，继续遵循当前跟随状态。
  useLayoutEffect(() => {
    const content = contentRef.current
    const scroll = scrollRef.current
    if (!content || !scroll) {
      return
    }
    const observer = new ResizeObserver(scrollToBottom)
    observer.observe(content)
    observer.observe(scroll)
    return () => observer.disconnect()
  }, [isMobile, scrollToBottom])

  // 切换版本后将选择器留在原位置，避免回答长短变化导致操作区跳出视口。
  useLayoutEffect(() => {
    const anchor = restoreScrollRef.current
    const scroll = scrollRef.current
    if (anchor && scroll) {
      const switcher = scroll.querySelector<HTMLElement>(
        `[data-message-version="${CSS.escape(anchor.messageId)}"]`
      )
      if (switcher) {
        scroll.scrollTop += switcher.getBoundingClientRect().top - anchor.top
      }
      restoreScrollRef.current = null
      previousStream.current = { sessionId: session.id, messageId: lastMessageId, streaming }
      return
    }
    const previous = previousStream.current
    previousStream.current = { sessionId: session.id, messageId: lastMessageId, streaming }
    const changed = previous?.sessionId !== session.id || previous.messageId !== lastMessageId
    if (streaming && promptId && (changed || !previous?.streaming)) {
      turnAnchor.current = promptId
      stickyRef.current = false
      setEnteringPrompt(changed ? promptId : undefined)
    } else if (changed) {
      turnAnchor.current = undefined
      setEnteringPrompt(undefined)
      stickyRef.current = true
      if (spacerRef.current) {
        spacerRef.current.style.height = '0px'
      }
    }
    updateScroll()
  }, [session.id, lastMessageId, promptId, streaming, updateScroll])

  useEffect(closeSearchPanel, [session.id, lastMessageId])

  const selectVersion = useCallback(
    (messageId: string, anchorTop: number) => {
      if (streaming) {
        return
      }
    restoreScrollRef.current = { messageId, top: anchorTop }
    turnAnchor.current = undefined
    if (spacerRef.current) {
      spacerRef.current.style.height = '0px'
    }
      stickyRef.current = false
      closeSearchPanel()
      selectMessageVersion(session.id, messageId)
      // 选择器之后显示的消息已换成兄弟版本，让它淡入并保持其余消息不动
      const updated = useChatStore.getState().sessionCache[session.id]
      if (updated) {
        const visible = getVisibleMessages(updated)
        const index = visible.findIndex((message) => message.id === messageId)
        const next = index >= 0 ? visible[index + 1] : undefined
        if (next) {
          flashEntering(next.id)
        }
      }
    },
    [session.id, streaming, flashEntering]
  )

  // 跨移动端断点时切换滚动层，并保持输入框及当前阅读位置。
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    if (stickyRef.current) {
      scrollToBottom()
    } else {
      el.scrollTop = scrollTopRef.current
    }
    const onScroll = () => {
      if (Math.abs(el.scrollTop - scrollTopRef.current) > 1) {
        turnAnchor.current = undefined
        stickyRef.current = !useChatStore.getState().streaming[session.id] &&
          el.scrollHeight - el.scrollTop - el.clientHeight < STICKY_THRESHOLD
      }
      setShowLatest((spacerRef.current?.getBoundingClientRect().top ?? 0) > el.getBoundingClientRect().bottom + STICKY_THRESHOLD)
      scrollTopRef.current = el.scrollTop
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [isMobile, scrollToBottom, session.id])

  const lastIndex = messages.length - 1
  const uploadRetryId = getUploadRetryId(messages, streaming)
  return (
    <ScrollToBottomContext.Provider value={scrollToBottom}>
      <div ref={isMobile ? undefined : scrollRef} data-chat-scroll={!isMobile || undefined} className={styles.container}>
        <div ref={isMobile ? scrollRef : undefined} data-chat-scroll={isMobile || undefined} className={styles.scroll}>
          <div ref={contentRef} className={styles.column} style={{ '--chat-font-offset': `${fontOffset}px` } as CSSProperties}>
            {messages.map((message, index) => (
              <VisibleMessage key={message.id} eager={index >= lastIndex - 1 || message.id === enteringId}
                height={message.role === 'user'
                  ? 65 + Math.ceil(message.content.length / 45) * 23 + (message.files.length ? 100 : 0)
                  : 90 + Math.min(1600, Math.ceil(message.blocks.reduce((size, block) => size + (block.type === 'text' ? block.text.length : 0), 0) / 55) * 25)}>
              {
              message.role === 'user' ? (
                <UserMessage
                  key={message.id}
                  sessionId={session.id}
                  message={message}
                  retryUploadId={uploadRetryId}
                  isFirst={index === 0}
                  isLast={index === lastIndex || index === lastIndex - 1}
                  busy={streaming}
                  entering={message.id === enteringId || message.id === enteringPrompt}
                  versions={versions.get(message.id) ?? EMPTY_VERSIONS}
                  onSelectVersion={selectVersion}
                />
              ) : (
                <AssistantMessage
                  key={message.id}
                  sessionId={session.id}
                  message={message}
                  isLast={index === lastIndex}
                  streaming={streaming && index === lastIndex}
                  busy={streaming}
                  entering={message.id === enteringId}
                  versions={versions.get(message.id) ?? EMPTY_VERSIONS}
                  onSelectVersion={selectVersion}
                />
              )
              }
              </VisibleMessage>
            ))}
            <div ref={spacerRef} aria-hidden="true" />
          </div>
        </div>
        <div className={styles.footerAnchor}>
          {latestVisible ? <button ref={latestRef} data-app-exiting={!showLatest || undefined} type="button" className={styles.jumpLatest} aria-label={t('jumpToLatest')} onClick={() => {
            turnAnchor.current = undefined
            if (spacerRef.current) {
              spacerRef.current.style.height = '0px'
            }
            stickyRef.current = true
            scrollToBottom()
            setShowLatest(false)
          }}><IconChevronDownOutline14 /></button> : null}
          {footer}
        </div>
      </div>
    </ScrollToBottomContext.Provider>
  )
}
