import { useEffect, useRef, type HTMLAttributes, type MouseEvent, type RefObject } from 'react'
import { haptic } from '../../services/haptics.js'

const LONG_PRESS_DELAY = 480
const MOVE_TOLERANCE = 10
const INTERACTIVE_SELECTOR = [
  'a',
  'button',
  'input',
  'textarea',
  'select',
  '[contenteditable="true"]',
  '[data-no-message-gesture]',
  '[role="button"]',
  'img',
  'video',
  'canvas',
  'svg',
].join(',')

export type MessageLongPressDetail = {
  x: number
  y: number
  target: HTMLElement
}

const isTextTarget = (
  target: EventTarget | null,
  root: HTMLElement | null
): target is HTMLElement =>
  target instanceof Element && !!root?.contains(target) && !target.closest(INTERACTIVE_SELECTOR)

/**
 *  touch/pen 长按不 preventDefault，移动或 pointercancel 时立即取消，因此不会拦截滚动。
 * 已有文本选择时也不弹菜单，保留浏览器原生选择与复制。
 */
export const useMessageGestures = ({
  rootRef,
  onDoubleClick,
  onLongPress,
}: {
  rootRef: RefObject<HTMLElement | null>
  onDoubleClick?: (event: MouseEvent<HTMLElement>) => void
  onLongPress?: (detail: MessageLongPressDetail) => void
}) => {
  const activeRef = useRef<{
    pointerId: number
    x: number
    y: number
    timer: number
    triggered: boolean
  } | null>(null)
  const suppressClickRef = useRef(false)
  const suppressTimerRef = useRef(0)
  const callbacksRef = useRef({ onDoubleClick, onLongPress })
  callbacksRef.current = { onDoubleClick, onLongPress }

  const cancel = () => {
    if (activeRef.current) {
      window.clearTimeout(activeRef.current.timer)
    }
    activeRef.current = null
  }

  useEffect(
    () => () => {
      cancel()
      window.clearTimeout(suppressTimerRef.current)
    },
    []
  )

  const props: HTMLAttributes<HTMLElement> = {
    onPointerDown: (event) => {
      if (!event.isPrimary) {
        cancel()
        return
      }
      if (event.pointerType === 'mouse' || event.button !== 0) {
        return
      }
      if (!isTextTarget(event.target, rootRef.current)) {
        return
      }
      const selection = window.getSelection()
      if (selection && !selection.isCollapsed) {
        return
      }
      cancel()
      const target = event.target as HTMLElement
      const pointer = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        timer: 0,
        triggered: false,
      }
      pointer.timer = window.setTimeout(() => {
        if (activeRef.current !== pointer) {
          return
        }
        const selection = window.getSelection()
        if (selection && !selection.isCollapsed) {
          cancel()
          return
        }
        pointer.triggered = true
        suppressClickRef.current = true
        window.clearTimeout(suppressTimerRef.current)
        suppressTimerRef.current = window.setTimeout(() => {
          suppressClickRef.current = false
        }, 700)
        haptic('medium')
        callbacksRef.current.onLongPress?.({ x: pointer.x, y: pointer.y, target })
      }, LONG_PRESS_DELAY)
      activeRef.current = pointer
    },
    onPointerMove: (event) => {
      const active = activeRef.current
      if (!active || active.pointerId !== event.pointerId) {
        return
      }
      if (Math.hypot(event.clientX - active.x, event.clientY - active.y) > MOVE_TOLERANCE) {
        cancel()
      }
    },
    onPointerUp: (event) => {
      if (activeRef.current?.pointerId === event.pointerId) {
        cancel()
      }
    },
    onPointerCancel: cancel,
    onDragStart: cancel,
    onContextMenu: (event) => {
      if (activeRef.current?.triggered || suppressClickRef.current) {
        event.preventDefault()
      }
    },
    onClickCapture: (event) => {
      const target = event.target
      if (
        !suppressClickRef.current ||
        !(target instanceof Node) ||
        !rootRef.current?.contains(target)
      ) {
        return
      }
      suppressClickRef.current = false
      event.preventDefault()
      event.stopPropagation()
    },
    onDoubleClick: (event) => {
      if (!isTextTarget(event.target, rootRef.current)) {
        return
      }
      haptic('light')
      callbacksRef.current.onDoubleClick?.(event)
    },
  }
  return props
}

/** 优先选择被触摸的 Markdown 块，否则选择整条消息的正文容器。 */
export const selectMessageText = (root: HTMLElement | null, target?: HTMLElement): boolean => {
  if (!root) {
    return false
  }
  const candidate =
    target?.closest<HTMLElement>('[data-markdown-block]') ??
    target?.closest<HTMLElement>('[data-message-text]') ??
    root.querySelector<HTMLElement>('[data-message-text]') ??
    root.querySelector<HTMLElement>('.ds-assistant-message-main-content') ??
    root
  const selection = window.getSelection()
  if (!selection) {
    return false
  }
  const range = document.createRange()
  range.selectNodeContents(candidate)
  selection.removeAllRanges()
  selection.addRange(range)
  return true
}
