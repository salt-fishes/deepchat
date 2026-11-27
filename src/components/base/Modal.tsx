import clsx from 'clsx'
import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useExitPresence } from '../../app/useExitPresence.js'
import { useTranslate } from '../../i18n/index.js'
import { IconCloseOutline16 } from './icons.js'
import { IconButton } from './IconButton.js'
import styles from './Modal.module.css'

/** 当前打开的弹窗，后打开的在末尾；叠放时 Esc 只关闭最上层 */
type ModalToken = { close: () => void }
const openModals: ModalToken[] = []
const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'

/** 关闭最上层的弹窗；栈为空时返回 false，供返回键逐层关闭 */
export const closeTopmostModal = (): boolean => {
  const top = openModals.at(-1)
  if (!top) {
    return false
  }
  top.close()
  return true
}

/**
 * 把自定义浮层（如附件面板）挂入弹窗关闭栈：返回键/Esc 关闭最上层时一并覆盖。
 * 返回注销函数。
 */
export const registerOverlayToken = (close: () => void): (() => void) => {
  const token: ModalToken = { close }
  openModals.push(token)
  return () => {
    const index = openModals.indexOf(token)
    if (index >= 0) {
      openModals.splice(index, 1)
    }
  }
}

const canRestoreFocus = (element: HTMLElement | null): element is HTMLElement =>
  !!element &&
  element.isConnected &&
  !element.closest('[inert]') &&
  element.getClientRects().length > 0

type ModalProps = Parameters<typeof ModalSurface>[0]

/** 遮罩 + 居中卡片，Esc / 点遮罩关闭 */
export const Modal = (props: ModalProps & { open?: boolean }) => {
  const ref = useRef<HTMLDivElement>(null)
  const visible = useExitPresence(props.open === true ? true : null, ref)
  if (props.open === undefined) {
    return <ModalSurface {...props} />
  }
  return visible ? <ModalSurface {...props} surfaceRef={ref} closing={!props.open} /> : null
}

const ModalSurface = ({
  title,
  children,
  footer,
  closable = false,
  className,
  mainClassName,
  surfaceRef,
  closing = false,
  onClose,
}: {
  title: ReactNode
  children?: ReactNode
  footer?: ReactNode
  /** 标题栏右侧显示关闭按钮 */
  closable?: boolean
  className?: string
  /** 内容区的 class */
  mainClassName?: string
  /** 弹窗卡片节点；退场期间保持挂载并 inert */
  surfaceRef?: RefObject<HTMLDivElement>
  closing?: boolean
  onClose: () => void
}) => {
  const t = useTranslate()
  const titleId = useId()
  const internalRef = useRef<HTMLDivElement>(null)
  const dialogRef = surfaceRef ?? internalRef
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const token: ModalToken = { close: () => onCloseRef.current() }
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    openModals.push(token)
    const focusFrame = requestAnimationFrame(() => {
      const dialog = dialogRef.current
      if (!dialog || dialog.contains(document.activeElement)) {
        return
      }
      const target = dialog.querySelector<HTMLElement>('[data-autofocus], [autofocus]') ?? dialog
      target.focus({ preventScroll: true })
    })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && openModals.at(-1) === token) {
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) {
        return
      }
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)
      ).filter((element) => element.getClientRects().length > 0 && !element.closest('[inert]'))
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) {
        event.preventDefault()
        dialogRef.current.focus({ preventScroll: true })
        return
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      } else if (!dialogRef.current.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(focusFrame)
      const index = openModals.indexOf(token)
      if (index >= 0) {
        openModals.splice(index, 1)
      }
      document.removeEventListener('keydown', onKeyDown)
      if (canRestoreFocus(previousFocus)) {
        previousFocus.focus({ preventScroll: true })
      }
    }
  }, [dialogRef])

  return createPortal(
    <div
      className={clsx(styles.overlay, closing && styles.closing)}
      onPointerDown={(event) => {
        if (!closing && event.button === 0 && event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        ref={dialogRef}
        className={clsx(styles.content, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={styles.header}>
          <div id={titleId} className={styles.title}>
            {title}
          </div>
          {closable ? (
            <IconButton
              className={styles.close}
              tone="primary"
              icon={<IconCloseOutline16 />}
              aria-label={t('close')}
              onClick={onClose}
            />
          ) : null}
        </div>
        {children ? <div className={clsx(styles.main, mainClassName)}>{children}</div> : null}
        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>,
    document.body
  )
}
