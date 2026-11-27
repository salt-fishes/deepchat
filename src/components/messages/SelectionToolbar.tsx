import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslate } from '../../i18n/index.js'
import { useDismiss } from '../base/anchored.js'
import { registerOverlayToken } from '../base/Modal.js'
import { IconCopyOutline16, IconRefreshOutline16 } from '../base/icons.js'
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
  onRegenerate,
  busy,
}: {
  selection: MessageSelection | null
  root: HTMLElement | null
  onClose: () => void
  onCopy: (text: string) => void
  onShare: (text: string) => void
  onRegenerate: () => void
  busy: boolean
}) => {
  const t = useTranslate()
  const toolbarRef = useRef<HTMLDivElement>(null)
  const rangeRef = useRef<Range | null>(null)
  const [text, setText] = useState('')
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  rangeRef.current = selection?.range ?? null
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
    if (!selection) {
      setText('')
      setPosition(null)
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
  }, [selection, root, update])

  useLayoutEffect(() => {
    if (selection) {
      update()
    }
  }, [selection, text, update])

  useEffect(() => {
    if (!selection) {
      return
    }
    const onScroll = () => update()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll, { passive: true })
    window.visualViewport?.addEventListener('scroll', onScroll, { passive: true })
    window.visualViewport?.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
      window.visualViewport?.removeEventListener('scroll', onScroll)
      window.visualViewport?.removeEventListener('resize', onScroll)
    }
  }, [selection, update])

  if (!selection || !text.trim()) {
    return null
  }
  return createPortal(
    <div
      ref={toolbarRef}
      className={styles.selectionToolbar}
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
      </button>
      <button
        type="button"
        className={styles.selectionButton}
        aria-label={t('share')}
        title={t('share')}
        onClick={() => onShare(text)}
      >
        <IconShareOutline16 />
      </button>
      <button
        type="button"
        className={styles.selectionButton}
        aria-label={t('regenerate')}
        title={t('regenerate')}
        disabled={busy}
        onClick={onRegenerate}
      >
        <IconRefreshOutline16 />
        <span>{t('regenerate')}</span>
      </button>
    </div>,
    document.body
  )
}
