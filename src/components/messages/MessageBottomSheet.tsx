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
  headerAside,
}: {
  open: boolean
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  className?: string
  bodyClassName?: string
  headerAside?: ReactNode
}) => {
  const t = useTranslate()
  const titleId = useId()
  const overlayRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const visible = useExitPresence(open ? true : null, overlayRef)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) {
      return
    }
    const unregister = registerOverlayToken(() => onCloseRef.current())
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusFrame = requestAnimationFrame(() => closeRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        closeTopmostModal()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) {
        return
      }
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null)
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) {
        event.preventDefault()
        return
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      unregister()
      cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', onKeyDown, true)
      if (previousFocus?.isConnected) {
        previousFocus.focus({ preventScroll: true })
      }
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
        ref={panelRef}
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
          <div className={styles.sheetHeaderActions}>
            {headerAside}
            <IconButton
              ref={closeRef}
              icon={<IconCloseOutline16 />}
              tooltip={t('close')}
              tooltipPlacement="bottom"
              onClick={() => onCloseRef.current()}
            />
          </div>
        </header>
        <div className={clsx(styles.sheetBody, bodyClassName)}>{children}</div>
        {footer ? <footer className={styles.sheetFooter}>{footer}</footer> : null}
      </section>
    </div>,
    document.body
  )
}
