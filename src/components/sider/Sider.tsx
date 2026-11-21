import clsx from 'clsx'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  IconPanelLeftOutline16,
  IconSearchOutline16,
  IconSettingsOutline16,
  IconMultiSelect16,
  IconEllipsisOutline16,
  IconCloseOutline16,
  IconPinOutline16,
  IconTrashOutline16,
  NewChatIcon,
} from '../base/icons.js'
import { setSiderCollapsed } from '../../services/settings.js'
import { groupSessions } from '../../services/chat/sessionGroups.js'
import { newChat, removeSession, useChatStore } from '../../services/chat/store.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { Modal, registerOverlayToken } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { openConversationSearch } from '../search/conversationSearchState.js'
import { useMobileSider } from './mobileSiderState.js'
import { SessionItem } from './SessionItem.js'
import { setSessionPins, useSessionPins } from './sessionPins.js'
import styles from './Sider.module.css'

/**
 * 展开的侧边栏：名称与收起按钮、搜索、开启新对话、按时间分组的会话列表、底部设置；
 * 移动端放在推挤式抽屉里，收起按钮关闭抽屉。
 */
export const Sider = ({ mobile = false }: { mobile?: boolean }) => {
  const t = useTranslate()
  const sessions = useChatStore((state) => state.sessions)
  const activeId = useChatStore((state) => state.activeId)
  const [now, setNow] = useState(Date.now)
  const [query, setQuery] = useState('')
  const [managing, setManaging] = useState(false)
  const [selection, setSelection] = useState<string[]>([])
  const [deleting, setDeleting] = useState<SessionSummary[] | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const drawerOpen = useMobileSider((state) => state.open)
  const pinIds = useSessionPins((state) => state.ids)
  const pins = useMemo(() => new Set(pinIds), [pinIds])
  const selectedSessions = sessions.filter(({ id }) => selection.includes(id))
  const allPinned = selectedSessions.length > 0 && selectedSessions.every(({ id }) => pins.has(id))
  const finishSelection = () => { setManaging(false); setSelection([]) }
  useEffect(() => {
    if (mobile && !drawerOpen) {
      setManaging(false)
      setSelection([])
    }
  }, [drawerOpen, mobile])
  useEffect(() => managing ? registerOverlayToken(finishSelection) : undefined, [managing])
  const listRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ top: 0, height: 0 })
  const rowHeight = mobile ? 46 : 40
  const headerHeight = mobile ? 28 : 22
  const groupGap = mobile ? 12 : 20

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) {
      return
    }
    const measure = () => setViewport({ top: list.scrollTop, height: list.clientHeight })
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    list.addEventListener('scroll', measure, { passive: true })
    measure()
    return () => {
      observer.disconnect()
      list.removeEventListener('scroll', measure)
    }
  }, [])

  useLayoutEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0
    }
  }, [query])

  // 搜索只按标题即时过滤，避免为搜索加载全部会话消息
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) {
      return null
    }
    return sessions.filter((session) => session.title.toLowerCase().includes(keyword))
  }, [sessions, query])

  const groups = useMemo(
    () =>
      filtered
        ? [{ key: 'search', label: '', sessions: filtered }]
        : [
          { key: 'pinned', label: t('pinnedChats'), sessions: sessions.filter(({ id }) => pins.has(id)) },
          ...groupSessions(sessions.filter(({ id }) => !pins.has(id)), now, t),
        ].filter((group) => group.sessions.length > 0),
    [filtered, sessions, now, t, pins]
  )

  const virtualGroups = useMemo(() => {
    let offset = 0
    return groups.map((group, index) => {
      if (index !== 0) {
        offset += groupGap
      }
      const start = offset + (group.label ? headerHeight : 0)
      offset = start + group.sessions.length * rowHeight
      return { group, start }
    })
  }, [groups, groupGap, headerHeight, rowHeight])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      clearTimeout(timer)
      const time = Date.now()
      setNow(time)
      const midnight = new Date(time).setHours(24, 0, 0, 0)
      timer = setTimeout(refresh, midnight - time)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }
    refresh()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return (
    <div className={clsx(styles.sider, mobile && styles.mobile)}>
      {/* 移动端按官方布局：顶部直接是搜索框，应用名/收起按钮/新对话按钮只在桌面显示 */}
      {!mobile ? (
        <div className={styles.top}>
          <div className={styles.appName}>{t('appName')}</div>
          <IconButton
            size="m"
            icon={<IconPanelLeftOutline16 />}
            tooltip={t('collapseSiderbarButton')}
            tooltipPlacement="bottom"
            onClick={() => setSiderCollapsed(true)}
          />
        </div>
      ) : null}
      {managing ? <div className={styles.selectionHeader}>
        <strong>{t('selectChats')}</strong>
        <IconButton icon={<IconCloseOutline16 />} aria-label={t('close')} onClick={finishSelection} />
      </div> : mobile ? (
        <button
          type="button"
          className={clsx(styles.searchBox, styles.searchButton)}
          onClick={openConversationSearch}
        >
          <span className={styles.searchIcon}>
            <IconSearchOutline16 />
          </span>
          <span className={styles.searchPlaceholder}>{t('chatHistorySearch')}</span>
        </button>
      ) : (
        <div className={styles.searchBox}>
          <span className={styles.searchIcon}>
            <IconSearchOutline16 />
          </span>
          <input
            className={styles.searchInput}
            value={query}
            placeholder={t('searchSessions')}
            aria-label={t('searchSessions')}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      )}
      {!mobile && !managing ? (
        <button
          type="button"
          className={styles.newChat}
          onClick={() => {
            newChat()
          }}
        >
          <span className={styles.newChatIcon}>
            <NewChatIcon />
          </span>
          {t('newChat')}
        </button>
      ) : null}
      <div className={styles.listWrap} data-fade={mobile && !managing ? 'true' : undefined}>
        <div ref={listRef} className={styles.list}>
          {filtered && filtered.length === 0 ? (
            <div className={styles.searchEmpty}>{t('searchNoResults')}</div>
          ) : (
            virtualGroups.map(({ group, start }, index) => {
              const count = group.sessions.length
              const first = Math.min(count, Math.max(0, Math.floor((viewport.top - start) / rowHeight) - 5))
              const last = Math.max(first, Math.min(count, Math.ceil((viewport.top + viewport.height - start) / rowHeight) + 5))
              return (
              <div key={group.key} className={styles.section}>
                {group.label ? (
                  <div className={styles.sectionHeader}>
                    {group.label}
                     {!managing && index === 0 ? (
                      <IconButton
                         icon={<IconMultiSelect16 />}
                         aria-label={t('selectChats')}
                         onClick={() => setManaging(true)}
                      />
                    ) : null}
                  </div>
                ) : null}
                {first > 0 ? <div aria-hidden="true" style={{ height: first * rowHeight }} /> : null}
                {group.sessions.slice(first, last).map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    active={session.id === activeId}
                     hideActions={mobile || managing}
                     selected={managing ? selection.includes(session.id) : undefined}
                     pinned={pins.has(session.id)}
                     onToggle={() => setSelection((current) => current.includes(session.id) ? current.filter((id) => id !== session.id) : [...current, session.id])}
                     onMultiSelect={() => { setSelection([session.id]); setManaging(true) }}
                     onPin={() => setSessionPins([session.id], !pins.has(session.id))}
                     onDelete={() => setDeleting([session])}
                  />
                ))}
                {last < count ? <div aria-hidden="true" style={{ height: (count - last) * rowHeight }} /> : null}
              </div>
              )
            })
          )}
        </div>
      </div>
       {managing ? <div className={styles.selectionActions}>
         <button type="button" disabled={!selectedSessions.length} onClick={() => {
           setSessionPins(selectedSessions.map(({ id }) => id), !allPinned)
           finishSelection()
         }}><IconPinOutline16 />{t(allPinned ? 'unpinChat' : 'pinChat')}</button>
         <button type="button" disabled={!selectedSessions.length} onClick={() => setDeleting(selectedSessions)}><IconTrashOutline16 />{t('delete')}</button>
       </div> : <div className={styles.bottom}>
        <button
          type="button"
          className={styles.settings}
          aria-label={t('settings')}
          onClick={() => openSettings('general')}
        >
          {mobile ? (
            <span className={styles.account}>
              <span className={styles.avatar} aria-hidden="true">
                D
              </span>
              <span className={styles.settingsLabel}>{t('appName')}</span>
            </span>
          ) : null}
          <span className={styles.settingsIcon}>
            {mobile ? <IconEllipsisOutline16 /> : <IconSettingsOutline16 />}
          </span>
          {!mobile ? <span className={styles.settingsLabel}>{t('settings')}</span> : null}
        </button>
       </div>}
      {deleting ? (
        <Modal
           title={t(deleting.length > 1 ? 'deleteSelectedChats' : 'deleteSessionModalContentTitle')}
          onClose={() => {
            if (!deletePending) {
              setDeleting(null)
            }
          }}
          footer={
            <>
              <Button variant="outlined" disabled={deletePending} onClick={() => setDeleting(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={deletePending}
                onClick={async () => {
                  setDeletePending(true)
                  try {
                     const failed = []
                     for (const session of deleting) {
                       if (await removeSession(session.id)) {
                         setSessionPins([session.id], false)
                       } else {
                         failed.push(session)
                       }
                     }
                     if (!failed.length) {
                       setDeleting(null)
                       finishSelection()
                     } else {
                       setDeleting(failed)
                      showToast({ key: 'sessionDeleteFailed', type: 'error' })
                    }
                  } finally {
                    setDeletePending(false)
                  }
                }}
              >
                {t('delete')}
              </Button>
            </>
          }
        >
          {t('deleteSessionWithFilesDescription')}
        </Modal>
      ) : null}
    </div>
  )
}

/**
 * 移动端推挤式抽屉：常驻挂载在 .frame 内（主内容右移把它露出来）。
 * 不能 portal 到 body：.frame 是 fixed（Chrome 必建层叠上下文），portal 出去后
 * 抽屉会整体盖在主内容上层，推挤式「主内容压在抽屉上」的层级就反了。
 * transform 由 CSS 过渡在开合时驱动；手势拖动中由 useDrawerGesture 直写 inline 样式。
 */
export const MobileSider = ({ drawerRef }: { drawerRef: RefObject<HTMLDivElement> }) => {
  const open = useMobileSider((state) => state.open)
  const dragging = useMobileSider((state) => state.dragging)
  return (
    <div
      ref={drawerRef}
      className={clsx(
        styles.drawer,
        (open || dragging) && styles.drawerVisible,
        open && !dragging && styles.drawerOpen,
        dragging && styles.drawerNoTransition
      )}
      aria-hidden={!open && !dragging}
    >
      <Sider mobile />
    </div>
  )
}
