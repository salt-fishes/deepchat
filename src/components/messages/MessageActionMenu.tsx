import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslate } from '../../i18n/index.js'
import { useDismiss } from '../base/anchored.js'
import { registerOverlayToken } from '../base/Modal.js'
import { IconCopyOutline16, IconEditOutline16, IconMultiSelect16 } from '../base/icons.js'
import { IconShareOutline16 } from './MessageIcons.js'
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
    if (!detail || !menuRef.current) {
      return
    }
    const { width, height } = menuRef.current.getBoundingClientRect()
    const gap = 12
    const padding = 8
    const placeRight = detail.x + gap + width <= window.innerWidth - padding
    const left = placeRight ? detail.x + gap : detail.x - width - gap
    const below = detail.y + gap + height <= window.innerHeight - padding
    const top = below ? detail.y + gap : detail.y - height - gap
    setPosition({
      left: Math.max(padding, Math.min(left, window.innerWidth - width - padding)),
      top: Math.max(padding, Math.min(top, window.innerHeight - height - padding)),
    })
  }, [detail])

  if (!detail) {
    return null
  }
  const options: ActionOption[] = [
    { key: 'copy', label: t('copy'), icon: <IconCopyOutline16 />, onSelect: onCopy },
    { key: 'select', label: t('selectText'), icon: <IconMultiSelect16 />, onSelect: onSelectText },
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
