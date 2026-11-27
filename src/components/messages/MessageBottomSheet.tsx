import clsx from 'clsx'
import {
  useEffect,
  useId,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useExitPresence } from '../../app/useExitPresence.js'
import { closeTopmostModal, registerOverlayToken } from '../base/Modal.js'
import { shouldDismissSheet } from './sheetDragPolicy.js'
import styles from './MessageInteractions.module.css'

type SheetDrag = {
  id: number
  startX: number
  startY: number
  startOffset: number
  distance: number
  claimed: boolean
  generation: number
  samples: { y: number; time: number }[]
}

/** 消息用量与分享卡片共用的底部面板；支持返回键、Esc、遮罩和手柄下拉关闭。 */
export const MessageBottomSheet = ({
  open,
  title,
  onClose,
  children,
  footer,
  className,
  bodyClassName,
  headerAside,
  hideHeader = false,
}: {
  open: boolean
  title: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  className?: string
  bodyClassName?: string
  headerAside?: ReactNode
  hideHeader?: boolean
}) => {
  const titleId = useId()
  const overlayRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const handleRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<SheetDrag | null>(null)
  const springRef = useRef<Animation | null>(null)
  const dragClosingRef = useRef(false)
  const gestureGenerationRef = useRef(0)
  const visible = useExitPresence(open ? true : null, overlayRef)
  const present = !!visible
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const openRef = useRef(open)
  openRef.current = open

  useEffect(() => {
    ++gestureGenerationRef.current
    springRef.current?.cancel()
    springRef.current = null
    dragRef.current = null
    const panel = panelRef.current
    if (open) {
      dragClosingRef.current = false
      panel?.style.removeProperty('transform')
      panel?.style.removeProperty('--sheet-exit-y')
      if (panel) {
        delete panel.dataset.sheetDragging
        delete panel.dataset.sheetDragClosing
      }
    } else if (!dragClosingRef.current) {
      panel?.style.removeProperty('transform')
      if (panel) {
        delete panel.dataset.sheetDragging
      }
    }
    return () => {
      springRef.current?.cancel()
      springRef.current = null
    }
  }, [open])

  useEffect(() => {
    if (!present) {
      return
    }
    const unregister = registerOverlayToken(() => onCloseRef.current())
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        closeTopmostModal()
        return
      }
      if (!openRef.current || event.key !== 'Tab' || !panelRef.current) {
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
      if (
        document.activeElement === panelRef.current ||
        !panelRef.current.contains(document.activeElement)
      ) {
        event.preventDefault()
        const target = event.shiftKey ? last : first
        target.focus()
      } else if (event.shiftKey && document.activeElement === first) {
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
      document.removeEventListener('keydown', onKeyDown, true)
      if (
        previousFocus?.isConnected &&
        !previousFocus.closest('[inert]') &&
        previousFocus.getClientRects().length > 0
      ) {
        previousFocus.focus({ preventScroll: true })
      }
    }
  }, [present])

  useEffect(() => {
    if (!present || !open) {
      return
    }
    const focusFrame = requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(focusFrame)
  }, [open, present])

  useEffect(() => {
    if (!present) {
      return
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [present])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => {
      if (!query.matches) {
        return
      }
      springRef.current?.cancel()
      springRef.current = null
      panelRef.current?.style.removeProperty('transform')
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const releaseCapture = (id: number) => {
    if (handleRef.current?.hasPointerCapture(id)) {
      handleRef.current.releasePointerCapture(id)
    }
  }

  const snapBack = (panel: HTMLElement, distance: number, generation: number) => {
    if (
      distance <= 0 ||
      gestureGenerationRef.current !== generation ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !panel.animate
    ) {
      panel.style.removeProperty('transform')
      return
    }
    springRef.current?.cancel()
    const spring = panel.animate(
      [{ transform: `translateY(${distance}px)` }, { transform: 'translateY(0)' }],
      { duration: 220, easing: 'cubic-bezier(0.2, 0.75, 0.25, 1)' }
    )
    springRef.current = spring
    void spring.finished.then(
      () => {
        if (springRef.current === spring && gestureGenerationRef.current === generation) {
          panel.style.removeProperty('transform')
          springRef.current = null
        }
      },
      () => {}
    )
  }

  const onHandlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !openRef.current ||
      !event.isPrimary ||
      (event.pointerType !== 'touch' && event.pointerType !== 'pen')
    ) {
      return
    }
    const panel = panelRef.current
    if (!panel) {
      return
    }
    springRef.current?.cancel()
    springRef.current = null
    const transform = getComputedStyle(panel).transform
    const offset = transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m42
    panel.style.transform = `translateY(${offset}px)`
    dragRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: offset,
      distance: offset,
      claimed: false,
      generation: gestureGenerationRef.current,
      samples: [{ y: event.clientY, time: event.timeStamp }],
    }
  }

  const onHandlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    const panel = panelRef.current
    if (!drag || !panel || event.pointerId !== drag.id) {
      return
    }
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (!drag.claimed) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) {
        return
      }
      if (dy < 0 || Math.abs(dx) > Math.abs(dy)) {
        dragRef.current = null
        panel.style.removeProperty('transform')
        return
      }
      drag.claimed = true
      panel.dataset.sheetDragging = 'true'
      try {
        handleRef.current?.setPointerCapture(event.pointerId)
      } catch {
        dragRef.current = null
        delete panel.dataset.sheetDragging
        panel.style.removeProperty('transform')
        return
      }
    }
    event.preventDefault()
    drag.distance = Math.max(0, drag.startOffset + dy)
    drag.samples.push({ y: event.clientY, time: event.timeStamp })
    drag.samples = drag.samples.filter(({ time }) => event.timeStamp - time <= 100)
    panel.style.transform = `translateY(${drag.distance}px)`
  }

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
    const drag = dragRef.current
    const panel = panelRef.current
    if (!drag || !panel || event.pointerId !== drag.id) {
      return
    }
    dragRef.current = null
    if (!drag.claimed) {
      panel.style.removeProperty('transform')
      return
    }
    releaseCapture(drag.id)
    delete panel.dataset.sheetDragging
    if (cancelled) {
      snapBack(panel, drag.distance, drag.generation)
      return
    }
    const first = drag.samples[0]
    drag.samples.push({ y: event.clientY, time: event.timeStamp })
    drag.samples = drag.samples.filter(({ time }) => event.timeStamp - time <= 100)
    const last = drag.samples.at(-1) ?? first
    const elapsed = Math.max(1, last.time - first.time)
    const velocity = Math.max(0, (last.y - first.y) / elapsed)
    if (
      gestureGenerationRef.current === drag.generation &&
      shouldDismissSheet(drag.distance, velocity, panel.offsetHeight)
    ) {
      dragClosingRef.current = true
      panel.style.setProperty('--sheet-exit-y', `${drag.distance}px`)
      panel.dataset.sheetDragClosing = 'true'
      panel.style.removeProperty('transform')
      onCloseRef.current()
      return
    }
    snapBack(panel, drag.distance, drag.generation)
  }

  if (!present) {
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
        tabIndex={-1}
      >
        <div
          ref={handleRef}
          className={styles.sheetHandle}
          aria-hidden="true"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={(event) => finishDrag(event)}
          onPointerCancel={(event) => finishDrag(event, true)}
          onLostPointerCapture={(event) => finishDrag(event, true)}
        />
        {hideHeader ? (
          <h2 id={titleId} className={styles.srOnly}>
            {title}
          </h2>
        ) : (
          <header className={styles.sheetHeader}>
            <div id={titleId} className={styles.sheetTitle}>
              {title}
            </div>
            <div className={styles.sheetHeaderActions}>{headerAside}</div>
          </header>
        )}
        <div className={clsx(styles.sheetBody, bodyClassName)}>{children}</div>
        {footer ? <footer className={styles.sheetFooter}>{footer}</footer> : null}
      </section>
    </div>,
    document.body
  )
}
