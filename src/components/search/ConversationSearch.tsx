import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { loadSession } from '../../services/chat/db.js'
import { selectSession, useChatStore } from '../../services/chat/store.js'
import type { Message } from '../../services/chat/types.js'
import { useSettings } from '../../services/settings.js'
import {
  IconChatOutline24,
  IconChevronRightOutline14,
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

const clipSnippet = (text: string, keyword: string): string => {
  const index = text.toLowerCase().indexOf(keyword)
  const start = Math.max(0, index - 10)
  const end = Math.min(text.length, index + keyword.length + 42)
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
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

type Hit = { key: string; id: string; title: string; snippet?: string; time: number }
const BATCH_SIZE = 8
const RESULT_LIMIT_INCREMENT = 60

/** 全屏会话搜索：标题与正文都参与匹配，结果按最近更新排序。 */
export const ConversationSearch = () => {
  const t = useTranslate()
  const { open, query } = useConversationSearch()
  const sessions = useChatStore((state) => state.sessions)
  const locale = useSettings((state) => state.locale)
  const keyword = query.trim().toLowerCase()
  const [scan, setScan] = useState<{ keyword: string; hits: Hit[]; done: boolean }>()
  const [visibleLimit, setVisibleLimit] = useState(RESULT_LIMIT_INCREMENT)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }), [locale])
  const recent = useMemo<Hit[]>(() => sessions.map((session) => ({
    key: session.id, id: session.id, title: session.title, time: session.updatedAt,
  })), [sessions])

  useEffect(() => {
    if (!open || !keyword) {
      setScan(undefined)
      return
    }
    let cancelled = false
    setScan({ keyword, hits: [], done: false })
    const load = async () => {
      const hits: Hit[] = []
      let published = 0
      for (let offset = 0; offset < sessions.length && !cancelled; offset += BATCH_SIZE) {
        const batch = await Promise.all(sessions.slice(offset, offset + BATCH_SIZE).map(async (summary) => {
          const session = useChatStore.getState().sessionCache[summary.id] ?? await loadSession(summary.id).catch(() => undefined)
          const result: Hit[] = []
          const base = { id: summary.id, title: summary.title, time: summary.updatedAt }
          if (session && !cancelled) {
            for (let index = session.messages.length - 1; index >= 0; index--) {
              const text = messageText(session.messages[index]).replace(/\s+/g, ' ').trim()
              if (text.toLowerCase().includes(keyword)) {
                result.push({ ...base, key: `${summary.id}:${session.messages[index].id}`, snippet: clipSnippet(text, keyword) })
              }
            }
          }
          if (result.length === 0 && summary.title.toLowerCase().includes(keyword)) {
            result.push({ ...base, key: summary.id })
          }
          return result
        }))
        if (cancelled) {
          return
        }
        for (const matches of batch) {
          for (const match of matches) {
            hits.push(match)
          }
        }
        if (hits.length > published && (published === 0 || (offset / BATCH_SIZE) % 4 === 0)) {
          published = hits.length
          setScan({ keyword, hits: hits.slice(), done: false })
        }
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
      }
      if (!cancelled) {
        setScan({ keyword, hits, done: true })
      }
    }
    const debounce = window.setTimeout(() => void load(), 180)
    return () => {
      cancelled = true
      window.clearTimeout(debounce)
    }
  }, [open, sessions, keyword])

  useEffect(() => {
    setVisibleLimit(RESULT_LIMIT_INCREMENT)
    if (resultsRef.current) {
      resultsRef.current.scrollTop = 0
    }
  }, [open, keyword])

  useEffect(() => {
    if (open) {
      inputRef.current?.focus({ preventScroll: true })
    }
  }, [open])

  const current = scan?.keyword === keyword ? scan : undefined
  const searching = Boolean(keyword) && !current?.done
  const hits = keyword ? current?.hits ?? [] : recent

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
          <IconChevronRightOutline14 />
        </button>
        <div className={styles.searchBox}>
          <span className={styles.searchIcon}>
            <IconSearchOutline16 />
          </span>
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            placeholder={t('chatHistorySearch')}
            aria-label={t('searchSessions')}
            enterKeyHint="search"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.currentTarget.blur()
              }
            }}
            onChange={(event) => setConversationSearchQuery(event.target.value)}
          />
          {query ? (
            <button
              type="button"
              className={styles.clear}
              aria-label={t('clearConversationSearch')}
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
      <div ref={resultsRef} className={styles.results} onScroll={(event) => {
        const list = event.currentTarget
        if (visibleLimit < hits.length && list.scrollHeight - list.scrollTop - list.clientHeight < 350) {
          setVisibleLimit((limit) => limit + RESULT_LIMIT_INCREMENT)
        }
      }}>
        {hits.length === 0 ? (
          <div className={styles.empty} role="status">{t(searching ? 'conversationSearching' : 'searchNoResults')}</div>
        ) : (
          hits.slice(0, visibleLimit).map(({ key, id, title, snippet, time }) => (
            <button
              type="button"
              key={key}
              className={styles.item}
              onClick={() => {
                closeConversationSearch()
                closeMobileSider()
                selectSession(id)
              }}
            >
              <span className={styles.avatar}>
                <IconChatOutline24 />
              </span>
              <span className={styles.body}>
                <span className={styles.heading}>
                  <span className={styles.title}>
                    <Highlighted text={title || t('untitledChat')} query={query} />
                  </span>
                  <span className={styles.date}>{dateFormat.format(time)}</span>
                </span>
                {snippet ? (
                  <span className={styles.snippet}>
                    <Highlighted text={snippet} query={query} />
                  </span>
                ) : null}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
