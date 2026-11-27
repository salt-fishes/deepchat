import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useExitPresence } from '../../app/useExitPresence.js'
import { useTranslate } from '../../i18n/index.js'
import { useDismiss } from '../base/anchored.js'
import { registerOverlayToken } from '../base/Modal.js'
import { IconCopyOutline16, IconEditOutline16 } from '../base/icons.js'
import { IconSelectTextOutline16, IconShareOutline16 } from './MessageIcons.js'
import styles from './MessageInteractions.module.css'
import type { MessageLongPressDetail } from './useMessageGestures.js'

type ActionOption = {
  key: string
  label: string
  icon: ReactNode
  onSelect: () => void
  disabled?: boolean
}

export const MessageActionMenu = ({
  detail,
  onClose,
  onCopy,
  onSelectText,
  onEdit,
  onShare,
  canEdit = true,
}: {
  detail: MessageLongPressDetail | null
  onClose: () => void
  onCopy: () => void
  onSelectText: () => void
  onEdit: () => void
  onShare: () => void
  canEdit?: boolean
}) => {
  const t = useTranslate()
  const menuRef = useRef<HTMLDivElement>(null)
  const visibleDetail = useExitPresence(detail, menuRef)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const close = useCallback(() => onCloseRef.current(), [])
  useDismiss(!!detail, [menuRef], close)

  useEffect(() => {
    if (!detail) {
      return
    }
    return registerOverlayToken(close)
  }, [detail, close])

  useLayoutEffect(() => {
    if (!visibleDetail || !menuRef.current) {
      return
    }
    const { width, height } = menuRef.current.getBoundingClientRect()
    const gap = 12
    const padding = 8
    const placeRight = visibleDetail.x + gap + width <= window.innerWidth - padding
    const left = placeRight ? visibleDetail.x + gap : visibleDetail.x - width - gap
    const below = visibleDetail.y + gap + height <= window.innerHeight - padding
    const top = below ? visibleDetail.y + gap : visibleDetail.y - height - gap
    setPosition({
      left: Math.max(padding, Math.min(left, window.innerWidth - width - padding)),
      top: Math.max(padding, Math.min(top, window.innerHeight - height - padding)),
    })
  }, [visibleDetail])

  if (!visibleDetail) {
    return null
  }
  const options: ActionOption[] = [
    { key: 'copy', label: t('copy'), icon: <IconCopyOutline16 />, onSelect: onCopy },
    {
      key: 'select',
      label: t('selectText'),
      icon: <IconSelectTextOutline16 />,
      onSelect: onSelectText,
    },
    {
      key: 'edit',
      label: t('edit'),
      icon: <IconEditOutline16 />,
      onSelect: onEdit,
      disabled: !canEdit,
    },
    { key: 'share', label: t('share'), icon: <IconShareOutline16 />, onSelect: onShare },
  ]
  return createPortal(
    <div
      ref={menuRef}
      className={styles.actionMenu}
      data-app-exiting={!detail || undefined}
      aria-hidden={!detail || undefined}
      style={position ?? { left: -1000, top: -1000 }}
      role="menu"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          role="menuitem"
          className={styles.menuButton}
          disabled={option.disabled}
          onClick={() => {
            close()
            option.onSelect()
          }}
        >
          <span className={styles.menuIcon}>{option.icon}</span>
          {option.label}
        </button>
      ))}
    </div>,
    document.body
  )
}
