import clsx from 'clsx'
import { memo, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslate } from '../../i18n/index.js'
import { IconCheckOutline16, IconEditOutline16, IconEllipsisOutline16, IconMultiSelect16, IconPinOutline16, IconTrashOutline16 } from '../base/icons.js'
import { renameSession, selectSession } from '../../services/chat/store.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { IconButton } from '../base/IconButton.js'
import { Menu } from '../base/Menu.js'
import { registerOverlayToken } from '../base/Modal.js'
import { useAnchoredPosition, useDismiss } from '../base/anchored.js'
import { closeMobileSider } from './mobileSiderState.js'
import styles from './SessionItem.module.css'

export const SessionItem = memo(function SessionItem({
  session,
  active,
  hideActions,
  selected,
  pinned,
  onToggle,
  onMultiSelect,
  onPin,
  onDelete,
}: {
  session: SessionSummary
  active: boolean
  hideActions: boolean
  selected?: boolean
  pinned: boolean
  onToggle: () => void
  onMultiSelect: () => void
  onPin: () => void
  onDelete: () => void
}) {
  const t = useTranslate()
  const [editing, setEditing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const press = useRef<{ id: number; x: number; y: number; timer: number }>()
  const suppressClick = useRef(false)
  const close = () => setMenuOpen(false)
  const { anchorRef, floatingRef, position } = useAnchoredPosition<HTMLDivElement, HTMLDivElement>(menuOpen, { align: 'end', fitVisualViewport: true })
  useDismiss(menuOpen, [anchorRef, floatingRef], close, { captureEscape: true })
  useEffect(() => menuOpen ? registerOverlayToken(() => setMenuOpen(false)) : undefined, [menuOpen])
  const cancelPress = () => {
    window.clearTimeout(press.current?.timer)
    press.current = undefined
  }
  useEffect(() => cancelPress, [])
  const displayTitle = session.title || t('untitledChat')
  const options = [
    { key: 'rename', label: t('sessionItemMenuRenameOption'), icon: <IconEditOutline16 />, onSelect: () => setEditing(true) },
    { key: 'pin', label: t(pinned ? 'unpinChat' : 'pinChat'), icon: <IconPinOutline16 />, onSelect: onPin },
    { key: 'multiple', label: t('selectMultipleChats'), icon: <IconMultiSelect16 />, onSelect: onMultiSelect },
    { key: 'delete', label: t('delete'), icon: <IconTrashOutline16 />, danger: true, onSelect: onDelete },
  ]

  if (editing) {
    const finish = (title: string) => {
      setEditing(false)
      if (title.trim() && title.trim() !== displayTitle) {
        renameSession(session.id, title.trim())
      }
    }
    return (
      <input
        className={styles.renameInput}
        defaultValue={displayTitle}
        autoFocus
        onFocus={(event) => event.target.select()}
        onBlur={(event) => finish(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            finish(event.currentTarget.value)
          } else if (event.key === 'Escape') {
            setEditing(false)
          }
        }}
      />
    )
  }

  return (
    <div
      ref={anchorRef}
      className={clsx(styles.item, active && selected === undefined && styles.active, menuOpen && styles.highlighted)}
      role={selected === undefined ? undefined : 'checkbox'}
      aria-checked={selected}
      tabIndex={selected === undefined ? undefined : 0}
      onKeyDown={(event) => {
        if (selected !== undefined && (event.key === ' ' || event.key === 'Enter')) {
          event.preventDefault()
          onToggle()
        }
      }}
      onPointerDown={(event) => {
        suppressClick.current = false
        if (selected !== undefined || !event.isPrimary || event.button !== 0 || event.pointerType === 'mouse') {
          return
        }
        const { pointerId: id, clientX: x, clientY: y } = event
        press.current = { id, x, y, timer: window.setTimeout(() => {
          suppressClick.current = true
          setMenuOpen(true)
        }, 450) }
      }}
      onPointerMove={(event) => {
        const start = press.current
        if (start?.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 9) {
          cancelPress()
        }
      }}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onContextMenu={(event) => {
        event.preventDefault()
        if (selected === undefined) { setMenuOpen(true) }
      }}
      onClick={() => {
        if (suppressClick.current || menuOpen) {
          suppressClick.current = false
          return
        }
        if (selected !== undefined) {
          onToggle()
          return
        }
        selectSession(session.id)
        closeMobileSider()
      }}
    >
      {selected !== undefined ? <span aria-hidden="true" className={clsx(styles.selection, selected && styles.checked)}>{selected ? <IconCheckOutline16 /> : null}</span> : null}
      <div className={styles.title}>{displayTitle}</div>
      {selected === undefined && pinned ? <IconPinOutline16 /> : null}
      {hideActions && active && selected === undefined ? (
        <IconButton className={styles.mobileAction} icon={<IconEllipsisOutline16 />} aria-label={t('more')}
          aria-expanded={menuOpen} aria-haspopup="menu" onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); setMenuOpen(!menuOpen) }} />
      ) : null}
      {!hideActions && selected === undefined ? (
        <div className={styles.action} onClick={(event) => event.stopPropagation()}>
          <Menu
            options={options}
          >
            {({ toggle }) => (
              <IconButton
                icon={<IconEllipsisOutline16 />}
                aria-label={t('more')}
                onClick={toggle}
              />
            )}
          </Menu>
        </div>
      ) : null}
      {menuOpen && selected === undefined ? createPortal(
        <div className={styles.contextMenu} role="menu" ref={floatingRef} style={position ?? { visibility: 'hidden' }}>
          {options.map((option) => <button type="button" role="menuitem" key={option.key} data-danger={option.danger || undefined} onClick={(event) => {
            event.stopPropagation()
            close()
            option.onSelect()
          }}>{option.icon}<span>{option.label}</span></button>)}
        </div>, document.body
      ) : null}
    </div>
  )
})
