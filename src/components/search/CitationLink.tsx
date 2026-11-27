import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { useIsMobile } from '../../app/viewport.js'
import { useAnchoredPosition, useDelayedOpen, useDismiss } from '../base/anchored.js'
import type { Source } from '../../services/chat/view.js'
import { SourceCard } from './SourceCard.js'
import styles from '../messages/MessageInteractions.module.css'

/**
 * 正文引用角标：桌面悬停预览，点击后固定来源卡片。
 * 角标本身只打开应用内预览，绝不直接跳网页；网页入口由 SourceCard 的显式按钮触发。
 */
export const CitationLink = ({ source }: { source: Source }) => {
  const isMobile = useIsMobile()
  const [pinned, setPinned] = useState(false)
  const anchorRef = useRef<HTMLSpanElement | null>(null)
  const { open: hoverOpen, setOpen: setHoverOpen, schedule, cancel } = useDelayedOpen()
  const open = pinned || (!isMobile && hoverOpen)
  const { floatingRef, position } = useAnchoredPosition<HTMLSpanElement, HTMLDivElement>(open, {
    anchorRef,
    align: 'center',
    offset: 6,
    fitVisualViewport: true,
    measureKey: source.url,
  })
  const close = () => {
    setPinned(false)
    setHoverOpen(false)
  }
  useDismiss(pinned, [anchorRef, floatingRef], close)
  useEffect(() => () => cancel(), [cancel])

  const pin = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    cancel()
    setPinned(true)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    cancel()
    setPinned(true)
  }

  return (
    <>
      <span
        ref={anchorRef}
        className="ds-markdown-cite"
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={source.title}
        onClick={pin}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
        onMouseEnter={() => {
          if (!pinned && !isMobile) {
            schedule(true, 300)
          }
        }}
        onMouseLeave={() => {
          if (!pinned) {
            schedule(false, 100)
          }
        }}
      >
        {source.index}
      </span>
      {open
        ? createPortal(
            <div
              ref={floatingRef}
              className={styles.citationPreview}
              style={position ?? { top: 0, left: 0, visibility: 'hidden' }}
              role="dialog"
              aria-label={source.title}
              onMouseEnter={() => {
                if (!pinned) {
                  cancel()
                }
              }}
              onMouseLeave={() => {
                if (!pinned) {
                  schedule(false, 100)
                }
              }}
            >
              <SourceCard source={source} variant="preview" onOpen={close} />
            </div>,
            document.body
          )
        : null}
    </>
  )
}
