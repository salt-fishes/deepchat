import clsx from 'clsx'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useExitPresence } from '../../app/useExitPresence.js'
import { useTranslate } from '../../i18n/index.js'
import { closeTopmostModal, registerOverlayToken } from '../base/Modal.js'
import { IconCloseOutline16 } from '../base/icons.js'
import { IconButton } from '../base/IconButton.js'
import styles from './MessageInteractions.module.css'

/** 消息用量与分享卡片共用的底部面板；支持返回键、Esc 和点击遮罩关闭。 */
export const MessageBottomSheet = ({
  open,
  title,
  onClose,
  children,
  footer,
  className,
  bodyClassName,
}: {
  open: boolean
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  className?: string
  bodyClassName?: string
}) => {
  const t = useTranslate()
  const titleId = useId()
  const overlayRef = useRef<HTMLDivElement>(null)
  const visible = useExitPresence(open ? true : null, overlayRef)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) {
      return
    }
    const unregister = registerOverlayToken(() => onCloseRef.current())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        closeTopmostModal()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      unregister()
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  if (!visible) {
    return null
  }
  return createPortal(
    <div
      ref={overlayRef}
      className={styles.sheetOverlay}
      data-app-exiting={!open || undefined}
      onPointerDown={(event) => {
        event.stopPropagation()
        if (event.target === event.currentTarget) {
          onCloseRef.current()
        }
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <section
        className={clsx(styles.sheet, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.sheetHandle} aria-hidden="true" />
        <header className={styles.sheetHeader}>
          <div id={titleId} className={styles.sheetTitle}>
            {title}
          </div>
          <IconButton
            icon={<IconCloseOutline16 />}
            tooltip={t('close')}
            tooltipPlacement="bottom"
            onClick={() => onCloseRef.current()}
          />
        </header>
        <div className={clsx(styles.sheetBody, bodyClassName)}>{children}</div>
        {footer ? <footer className={styles.sheetFooter}>{footer}</footer> : null}
      </section>
    </div>,
    document.body
  )
}
