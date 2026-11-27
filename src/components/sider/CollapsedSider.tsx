import { useLayoutEffect, useRef } from 'react'
import { IconPanelLeftOutline16, NewChatIcon } from '../base/icons.js'
import { useTranslate } from '../../i18n/index.js'
import { setSiderCollapsed } from '../../services/settings.js'
import { newChat } from '../../services/chat/store.js'
import { IconButton } from '../base/IconButton.js'
import styles from './Sider.module.css'

/** 收起后左上角的按钮组；常驻挂载，通过可见性过渡与侧栏收合衔接。 */
export const CollapsedSider = ({ open }: { open: boolean }) => {
  const t = useTranslate()
  const rootRef = useRef<HTMLDivElement>(null)
  const expandRef = useRef<HTMLButtonElement>(null)
  const initializedRef = useRef(false)
  useLayoutEffect(() => {
    if (rootRef.current) {
      rootRef.current.inert = !open
    }
    if (!initializedRef.current) {
      initializedRef.current = true
      return
    }
    if (open) {
      requestAnimationFrame(() => expandRef.current?.focus({ preventScroll: true }))
    }
  }, [open])
  return (
    <div
      ref={rootRef}
      className={styles.collapsed}
      data-open={open || undefined}
      aria-hidden={!open}
    >
      <div className={styles.collapsedGroup}>
        <IconButton
          ref={expandRef}
          size="m"
          tone="primary"
          icon={<IconPanelLeftOutline16 />}
          tooltip={t('expandSiderbarButton')}
          onClick={() => setSiderCollapsed(false)}
        />
        <IconButton
          size="m"
          tone="primary"
          icon={<NewChatIcon />}
          tooltip={t('newChat')}
          onClick={newChat}
        />
      </div>
    </div>
  )
}
