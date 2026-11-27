import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useExitPresence } from '../../app/useExitPresence.js'
import { useIsMobile } from '../../app/viewport.js'
import { useAnchoredPosition, useDelayedOpen } from './anchored.js'
import styles from './Tooltip.module.css'

export type TooltipPlacement = 'top' | 'bottom'

const ENTER_DELAY = 100

/**
 * 悬停 100ms 后出现，离开立即消失，移动端不显示。
 * 触发元素外包一层 display: contents，不影响布局。
 */
export const Tooltip = ({
  content,
  placement = 'top',
  children,
}: {
  content: ReactNode
  placement?: TooltipPlacement
  children: ReactNode
}) => {
  const isMobile = useIsMobile()
  const { open, setOpen, schedule, cancel } = useDelayedOpen()
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const desired = open && !isMobile && Boolean(content)
  const present = useExitPresence(desired ? content : null, tooltipRef)
  const { anchorRef, floatingRef, position } = useAnchoredPosition<HTMLSpanElement, HTMLDivElement>(
    !!present,
    { side: placement, align: 'center', measureFirstChild: true, measureKey: content }
  )

  useEffect(() => () => cancel(), [cancel])

  // 滚动时收起提示。
  useEffect(() => {
    if (!open) {
      return
    }
    const onScroll = () => setOpen(false)
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [open, setOpen])

  return (
    <>
      <span
        ref={anchorRef}
        className={styles.trigger}
        onMouseEnter={() => schedule(true, ENTER_DELAY)}
        onMouseLeave={() => schedule(false, 0)}
      >
        {children}
      </span>
      {present
        ? createPortal(
            <div
              ref={(node) => {
                tooltipRef.current = floatingRef.current = node
              }}
              role="tooltip"
              className={styles.tooltip}
              data-app-exiting={!desired || undefined}
              aria-hidden={!desired || undefined}
              style={position ?? { top: 0, left: 0, visibility: 'hidden' }}
            >
              {present}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
