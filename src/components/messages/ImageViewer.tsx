import clsx from 'clsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslate } from '../../i18n/index.js'
import { loadFile } from '../../services/chat/db.js'
import { IconCloseOutline16, IconDownloadOutline16, IconPhotoErrorFill20 } from '../base/icons.js'
import { IconButton } from '../base/IconButton.js'
import { closeImageViewer, useImageViewer } from './imageViewerState.js'
import styles from './ImageViewer.module.css'

const ZOOM_STEPS = [1, 1.5, 2, 3] as const

/** 全屏图片查看器：点击图片或按钮缩放，放大后可拖动，Esc / 点空白关闭 */
export const ImageViewer = () => {
  const t = useTranslate()
  const image = useImageViewer((state) => state.image)
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [zoomIndex, setZoomIndex] = useState(0)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{
    x: number
    y: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)

  // 附件原件从 IndexedDB 读取，URL 生命周期由本组件管理
  useEffect(() => {
    setUrl(null)
    setFailed(false)
    setZoomIndex(0)
    setOffset({ x: 0, y: 0 })
    if (!image) {
      return
    }
    let objectUrl: string | null = null
    let cancelled = false
    loadFile(image.id).then((blob) => {
      if (cancelled) {
        return
      }
      if (blob) {
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      } else {
        setFailed(true)
      }
    })
    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [image])

  const close = useCallback(() => closeImageViewer(), [])

  useEffect(() => {
    if (!image) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [image, close])

  const zoomIn = () => {
    setZoomIndex((index) => Math.min(ZOOM_STEPS.length - 1, index + 1))
  }
  const zoomOut = () => {
    const next = zoomIndex - 1
    setZoomIndex(Math.max(0, next))
    if (next <= 0) {
      setOffset({ x: 0, y: 0 })
    }
  }
  const toggleZoom = useCallback(() => {
    setZoomIndex((index) => (index === 0 ? 1 : 0))
    setOffset({ x: 0, y: 0 })
  }, [])

  const onPointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      x: offset.x,
      y: offset.y,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
  }
  const onPointerMove = (event: React.PointerEvent<HTMLImageElement>) => {
    const drag = dragRef.current
    if (!drag) {
      return
    }
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      drag.moved = true
    }
    if (ZOOM_STEPS[zoomIndex] > 1) {
      setOffset({ x: drag.x + dx, y: drag.y + dy })
    }
  }
  const onPointerUp = () => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag && !drag.moved) {
      toggleZoom()
    }
  }

  const download = () => {
    if (!url || !image) {
      return
    }
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = image.name
    anchor.click()
  }

  if (!image) {
    return null
  }

  const scale = ZOOM_STEPS[zoomIndex]
  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={image.name}>
      <div className={styles.toolbar}>
        <div className={styles.name} title={image.name}>
          {image.name}
        </div>
        <IconButton
          className={styles.close}
          tone="primary"
          icon={<IconCloseOutline16 />}
          aria-label={t('close')}
          onClick={close}
        />
      </div>
      <div className={styles.stage} onMouseDown={(event) => event.target === event.currentTarget && close()}>
        {failed ? (
          <div className={styles.failed}>
            <IconPhotoErrorFill20 />
            <span>{t('imageViewerLoadFailed')}</span>
          </div>
        ) : url ? (
          <img
            className={clsx(styles.image, scale > 1 && styles.zoomed)}
            src={url}
            alt={image.name}
            draggable={false}
            style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
        ) : null}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.zoomButton} onClick={zoomOut} disabled={zoomIndex === 0} aria-label={t('imageViewerZoomOut')}>
          −
        </button>
        <span className={styles.zoomLevel}>{Math.round(scale * 100)}%</span>
        <button
          type="button"
          className={styles.zoomButton}
          onClick={zoomIn}
          disabled={zoomIndex === ZOOM_STEPS.length - 1}
          aria-label={t('imageViewerZoomIn')}
        >
          +
        </button>
        <span className={styles.separator} />
        <button type="button" className={styles.actionButton} onClick={download} disabled={!url}>
          <IconDownloadOutline16 />
          <span>{t('imageViewerDownload')}</span>
        </button>
      </div>
    </div>,
    document.body
  )
}
