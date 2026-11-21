import clsx from 'clsx'
import { useEffect, useMemo, useState, type RefObject } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  IconPanelLeftOutline16,
  IconSearchOutline16,
  IconSettingsOutline16,
  NewChatIcon,
} from '../base/icons.js'
import { setSiderCollapsed } from '../../services/settings.js'
import { groupSessions } from '../../services/chat/sessionGroups.js'
import { newChat, removeSession, useChatStore } from '../../services/chat/store.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { useMobileSider } from './mobileSiderState.js'
import { SessionItem } from './SessionItem.js'
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
  const [deleting, setDeleting] = useState<SessionSummary | null>(null)
  const [deletePending, setDeletePending] = useState(false)

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
        : groupSessions(sessions, now, t),
    [filtered, sessions, now, t]
  )

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
      {!mobile ? (
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
      <div className={styles.listWrap}>
        <div className={styles.list}>
          {filtered && filtered.length === 0 ? (
            <div className={styles.searchEmpty}>{t('searchNoResults')}</div>
          ) : (
            groups.map((group) => (
              <div key={group.key} className={styles.section}>
                {group.label ? <div className={styles.sectionHeader}>{group.label}</div> : null}
                {group.sessions.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    active={session.id === activeId}
                    onDelete={() => setDeleting(session)}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>
      <div className={styles.bottom}>
        <button type="button" className={styles.settings} onClick={() => openSettings('general')}>
          <span className={styles.settingsIcon}>
            <IconSettingsOutline16 />
          </span>
          <span className={styles.settingsLabel}>{t('settings')}</span>
        </button>
      </div>
      {deleting ? (
        <Modal
          title={t('deleteSessionModalContentTitle')}
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
                    if (await removeSession(deleting.id)) {
                      setDeleting(null)
                    } else {
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
