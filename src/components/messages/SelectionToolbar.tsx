import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useExitPresence } from '../../app/useExitPresence.js'
import { useTranslate } from '../../i18n/index.js'
import { useDismiss } from '../base/anchored.js'
import { registerOverlayToken } from '../base/Modal.js'
import { IconCopyOutline16 } from '../base/icons.js'
import { IconShareOutline16 } from './MessageIcons.js'
import styles from './MessageInteractions.module.css'

export type MessageSelection = {
  text: string
  range: Range
}

export const SelectionToolbar = ({
  selection,
  root,
  onClose,
  onCopy,
  onShare,
}: {
  selection: MessageSelection | null
  root: HTMLElement | null
  onClose: () => void
  onCopy: (text: string) => void
  onShare: (text: string) => void
}) => {
  const t = useTranslate()
  const toolbarRef = useRef<HTMLDivElement>(null)
  const visibleSelection = useExitPresence(selection, toolbarRef)
  const rangeRef = useRef<Range | null>(null)
  const [text, setText] = useState('')
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  rangeRef.current = selection?.range ?? visibleSelection?.range ?? null
  useDismiss(!!selection, [toolbarRef], () => onCloseRef.current())
  useEffect(() => {
    if (!selection) {
      return
    }
    return registerOverlayToken(() => onCloseRef.current())
  }, [selection])

  const update = useCallback(() => {
    const range = rangeRef.current
    const toolbar = toolbarRef.current
    if (!range || !toolbar || range.collapsed) {
      setPosition(null)
      return
    }
    const rect = range.getBoundingClientRect()
    const lineRect = range.getClientRects()[0] ?? rect
    const toolbarRect = toolbar.getBoundingClientRect()
    const gap = 8
    const padding = 8
    const above = lineRect.top - toolbarRect.height - gap
    const top = above >= padding ? above : lineRect.bottom + gap
    const center = lineRect.left + lineRect.width / 2
    setPosition({
      left: Math.max(
        padding,
        Math.min(center - toolbarRect.width / 2, window.innerWidth - toolbarRect.width - padding)
      ),
      top: Math.max(padding, Math.min(top, window.innerHeight - toolbarRect.height - padding)),
    })
  }, [])

  useEffect(() => {
    if (!visibleSelection) {
      setText('')
      setPosition(null)
      return
    }
    if (!selection) {
      return
    }
    setText(selection.text)
    const onSelectionChange = () => {
      const current = window.getSelection()
      if (!current || current.isCollapsed || current.rangeCount === 0) {
        onCloseRef.current()
        return
      }
      const range = current.getRangeAt(0)
      if (!root?.contains(range.commonAncestorContainer)) {
        onCloseRef.current()
        return
      }
      rangeRef.current = range.cloneRange()
      setText(current.toString())
      update()
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [selection, visibleSelection, root, update])

  useLayoutEffect(() => {
    if (visibleSelection) {
      update()
    }
  }, [visibleSelection, text, update])

  useEffect(() => {
    if (!selection) {
      return
    }
    let frame = 0
    const schedule = () => {
      if (frame) {
        return
      }
      frame = requestAnimationFrame(() => {
        frame = 0
        update()
      })
    }
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule, { passive: true })
    window.visualViewport?.addEventListener('scroll', schedule, { passive: true })
    window.visualViewport?.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('scroll', schedule)
      window.visualViewport?.removeEventListener('resize', schedule)
    }
  }, [selection, update])

  if (!visibleSelection || !text.trim()) {
    return null
  }
  return createPortal(
    <div
      ref={toolbarRef}
      className={styles.selectionToolbar}
      data-app-exiting={!selection || undefined}
      aria-hidden={!selection || undefined}
      style={position ?? { left: -1000, top: -1000 }}
      role="toolbar"
      aria-label={t('selectText')}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className={styles.selectionButton}
        aria-label={t('copy')}
        title={t('copy')}
        onClick={() => onCopy(text)}
      >
        <IconCopyOutline16 />
        <span>{t('copy')}</span>
      </button>
      <button
        type="button"
        className={styles.selectionButton}
        aria-label={t('share')}
        title={t('share')}
        onClick={() => onShare(text)}
      >
        <IconShareOutline16 />
        <span>{t('share')}</span>
      </button>
    </div>,
    document.body
  )
}
