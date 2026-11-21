import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { loadSession } from '../../services/chat/db.js'
import { selectSession, useChatStore } from '../../services/chat/store.js'
import type { Message, Session } from '../../services/chat/types.js'
import {
  IconArrowLeftOutline16,
  IconChatOutline24,
  IconCloseFill14,
  IconSearchOutline16,
} from '../base/icons.js'
import { closeMobileSider } from '../sider/mobileSiderState.js'
import {
  closeConversationSearch,
  setConversationSearchQuery,
  useConversationSearch,
} from './conversationSearchState.js'
import styles from './ConversationSearch.module.css'

const messageText = (message: Message): string => {
  if (message.role === 'user') {
    return message.content
  }
  return message.blocks
    .map((block) =>
      block.type === 'text' ? block.text : block.type === 'thinking' ? block.thinking : ''
    )
    .join(' ')
}

/** 取第一条命中的消息作为摘要；没有关键词时用最近一条有内容的消息。 */
const findSnippet = (session: Session, keyword: string): string => {
  const messages = [...session.messages].reverse()
  for (const message of messages) {
    const text = messageText(message).replace(/\s+/g, ' ').trim()
    if (!text) {
      continue
    }
    if (!keyword || text.toLowerCase().includes(keyword)) {
      return text
    }
  }
  return ''
}

const clipSnippet = (text: string, keyword: string): string => {
  if (!keyword) {
    return text.length > 90 ? `${text.slice(0, 90)}...` : text
  }
  const index = text.toLowerCase().indexOf(keyword)
  const start = Math.max(0, index - 18)
  const end = Math.min(text.length, index + keyword.length + 42)
  return `${start > 0 ? '...' : ''}${text.slice(start, end)}${end < text.length ? '...' : ''}`
}

const shortDate = (timestamp: number): string => {
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

const Highlighted = ({ text, query }: { text: string; query: string }) => {
  const keyword = query.trim()
  if (!keyword) {
    return <>{text}</>
  }
  const lower = text.toLowerCase()
  const key = keyword.toLowerCase()
  const parts: ReactNode[] = []
  let cursor = 0
  for (let index = lower.indexOf(key, cursor); index >= 0; index = lower.indexOf(key, cursor)) {
    if (index > cursor) {
      parts.push(text.slice(cursor, index))
    }
    parts.push(
      <mark key={index} className={styles.mark}>
        {text.slice(index, index + keyword.length)}
      </mark>
    )
    cursor = index + keyword.length
  }
  parts.push(text.slice(cursor))
  return <>{parts}</>
}

type Hit = { session: Session; snippet: string; date: string }

/** 全屏会话搜索：标题与正文都参与匹配，结果按最近更新排序。 */
export const ConversationSearch = () => {
  const t = useTranslate()
  const { open, query } = useConversationSearch()
  const sessions = useChatStore((state) => state.sessions)
  const [loaded, setLoaded] = useState<Session[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    let cancelled = false
    const load = async () => {
      const cache = useChatStore.getState().sessionCache
      const list = await Promise.all(
        sessions.map(async (summary) => cache[summary.id] ?? (await loadSession(summary.id)))
      )
      if (!cancelled) {
        setLoaded(list.filter((session): session is Session => Boolean(session)))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [open, sessions])

  useEffect(() => {
    if (open) {
      inputRef.current?.focus({ preventScroll: true })
    }
  }, [open])

  const hits = useMemo<Hit[]>(() => {
    const keyword = query.trim().toLowerCase()
    return loaded
      .filter((session) => {
        if (!keyword) {
          return true
        }
        return (
          session.title.toLowerCase().includes(keyword) ||
          session.messages.some((message) => messageText(message).toLowerCase().includes(keyword))
        )
      })
      .map((session) => ({
        session,
        snippet: clipSnippet(findSnippet(session, keyword), keyword),
        date: shortDate(session.updatedAt),
      }))
      .sort((a, b) => b.session.updatedAt - a.session.updatedAt)
  }, [loaded, query])

  if (!open) {
    return null
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.back}
          aria-label={t('back')}
          onClick={closeConversationSearch}
        >
          <IconArrowLeftOutline16 />
        </button>
        <div className={styles.searchBox}>
          <span className={styles.searchIcon}>
            <IconSearchOutline16 />
          </span>
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            placeholder={t('searchSessions')}
            aria-label={t('searchSessions')}
            onChange={(event) => setConversationSearchQuery(event.target.value)}
          />
          {query ? (
            <button
              type="button"
              className={styles.clear}
              aria-label={t('close')}
              onClick={() => {
                setConversationSearchQuery('')
                inputRef.current?.focus({ preventScroll: true })
              }}
            >
              <IconCloseFill14 />
            </button>
          ) : null}
        </div>
      </div>
      <div className={styles.results}>
        {hits.length === 0 ? (
          <div className={styles.empty}>{t('searchNoResults')}</div>
        ) : (
          hits.map(({ session, snippet, date }) => (
            <button
              type="button"
              key={session.id}
              className={styles.item}
              onClick={() => {
                closeConversationSearch()
                closeMobileSider()
                selectSession(session.id)
              }}
            >
              <span className={styles.avatar}>
                <IconChatOutline24 />
              </span>
              <span className={styles.body}>
                <span className={styles.title}>
                  <Highlighted text={session.title} query={query} />
                </span>
                {snippet ? (
                  <span className={styles.snippet}>
                    <Highlighted text={snippet} query={query} />
                  </span>
                ) : null}
              </span>
              <span className={styles.date}>{date}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
