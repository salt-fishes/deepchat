import clsx from 'clsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useExitPresence } from '../../app/useExitPresence.js'
import { useTranslate } from '../../i18n/index.js'
import { loadRecentImage } from '../../services/chat/db.js'
import { IconCloseOutline16, IconCropOutline16, IconDownloadOutline16, IconPhotoErrorFill20 } from '../base/icons.js'
import { addDraftFiles } from '../../services/chat/drafts.js'
import { useChatStore } from '../../services/chat/store.js'
import { useSettings } from '../../services/settings.js'
import { openCropper } from '../chatInput/imageCropperState.js'
import { ensureApiKey } from '../settings/settingsDialogState.js'
import { showToast } from '../base/toastState.js'
import { closeImageViewer, useImageViewer } from './imageViewerState.js'
import styles from './ImageViewer.module.css'

const ZOOM_STEPS = [1, 1.5, 2, 3] as const

/** 全屏图片查看器：点击图片或按钮缩放，放大后可拖动，Esc / 点空白关闭 */
export const ImageViewer = () => {
  const t = useTranslate()
  const current = useImageViewer((state) => state.image)
  const overlayRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const image = useExitPresence(current, overlayRef)
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [openingCrop, setOpeningCrop] = useState(false)
  const [zoomIndex, setZoomIndex] = useState(0)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{
    id: number
    x: number
    y: number
    startX: number
    startY: number
    moved: boolean
  } | null>(null)
  const clampOffset = (point: { x: number; y: number }, scale: number) => {
    const stage = stageRef.current
    const element = imageRef.current
    if (!stage || !element || scale <= 1) {return { x: 0, y: 0 }}
    const x = Math.max(0, (element.offsetWidth * scale - stage.clientWidth) / 2)
    const y = Math.max(0, (element.offsetHeight * scale - stage.clientHeight) / 2)
    return { x: Math.max(-x, Math.min(x, point.x)), y: Math.max(-y, Math.min(y, point.y)) }
  }

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
    if ('src' in image) {
      setUrl(image.src)
      return
    }
    loadRecentImage(image.id).then((blob) => {
      if (cancelled) {
        return
      }
      if (blob) {
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      } else {
        setFailed(true)
      }
    }).catch(() => { if (!cancelled) {setFailed(true)} })
    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [image])

  const close = useCallback(() => closeImageViewer(), [])

  useEffect(() => {
    if (!current) {
      return
    }
    const trigger = document.activeElement
    overlayRef.current?.focus({ preventScroll: true })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        close()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      if (trigger instanceof HTMLElement && trigger.isConnected) { trigger.focus({ preventScroll: true }) }
    }
  }, [current, close])

  const toggleZoom = useCallback(() => {
    setZoomIndex((index) => (index + 1) % ZOOM_STEPS.length)
    setOffset({ x: 0, y: 0 })
  }, [])

  const onPointerDown = (event: React.PointerEvent<HTMLImageElement>) => {
    if (!event.isPrimary || event.button !== 0) {return}
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      id: event.pointerId,
      x: offset.x,
      y: offset.y,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    }
  }
  const onPointerMove = (event: React.PointerEvent<HTMLImageElement>) => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) {
      return
    }
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      drag.moved = true
    }
    if (drag.moved && ZOOM_STEPS[zoomIndex] > 1) {
      setOffset({ x: drag.x + dx, y: drag.y + dy })
    }
  }
  const onPointerUp = (event: React.PointerEvent<HTMLImageElement>) => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) {return}
    dragRef.current = null
    if (!drag.moved) {
      toggleZoom()
    } else {
      setOffset((point) => clampOffset(point, ZOOM_STEPS[zoomIndex]))
    }
  }

  const onPointerCancel = (event: React.PointerEvent<HTMLImageElement>) => {
    if (dragRef.current?.id !== event.pointerId) {return}
    dragRef.current = null
    setOffset((point) => clampOffset(point, ZOOM_STEPS[zoomIndex]))
  }

  const download = () => {
    if (!url || !image) {
      return
    }
    const anchor = document.createElement('a')
    anchor.href = url
    if ('src' in image) {
      anchor.target = '_blank'
      anchor.rel = 'noreferrer'
    } else {
      anchor.download = image.name
    }
    anchor.click()
  }

  const crop = async () => {
    if (!image || !url || openingCrop) {return}
    const sessionId = useChatStore.getState().activeId
    setOpeningCrop(true)
    try {
      const blob = 'id' in image ? await loadRecentImage(image.id) : await fetch(url, {
        credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(10_000),
      }).then((response) => response.ok ? response.blob() : undefined)
      if (useImageViewer.getState().image !== image) {return}
      if (!blob?.type.startsWith('image/')) {
        showToast({ key: 'imageViewerCropFailed', type: 'error' })
        return
      }
      const filename = 'id' in image ? image.name : `image.${blob.type.split('/')[1].split('+')[0]}`
      close()
      const result = await openCropper(new File([blob], filename, { type: blob.type }), 'crop', 'ask')
      if (!result || useChatStore.getState().importingHistory || useChatStore.getState().activeId !== sessionId || !ensureApiKey()) {return}
      const error = addDraftFiles(sessionId, [result], useSettings.getState().apiKey ?? '')
      if (error) {showToast(error)}
    } catch {
      showToast({ key: 'imageViewerCropFailed', type: 'error' })
    } finally {
      setOpeningCrop(false)
    }
  }

  if (!image) {
    return null
  }

  const scale = ZOOM_STEPS[zoomIndex]
  return createPortal(
    <div key={'id' in image ? image.id : image.src} ref={overlayRef} tabIndex={-1} className={styles.overlay} data-app-exiting={!current || undefined} role="dialog" aria-modal="true" aria-label={image.name}>
      <div ref={stageRef} className={styles.stage} onClick={(event) => event.target === event.currentTarget && close()}>
        {failed ? (
          <div className={styles.failed}>
            <IconPhotoErrorFill20 />
            <span>{t('imageViewerLoadFailed')}</span>
          </div>
        ) : url ? (
          <img
            ref={imageRef}
            className={clsx(styles.image, scale > 1 && styles.zoomed)}
            src={url}
            alt={image.name}
            draggable={false}
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})` }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          />
        ) : null}
      </div>
      <div className={styles.actions}>
        <button type="button" className={clsx(styles.actionButton, styles.close)} aria-label={t('close')} title={t('close')} onClick={close}><IconCloseOutline16 /></button>
        <button type="button" className={styles.actionButton} onClick={() => void crop()} disabled={!url || failed || openingCrop} aria-label={t('cropTitle')} title={t('cropTitle')}><IconCropOutline16 /></button>
        <button type="button" className={styles.actionButton} onClick={download} disabled={!url || failed} aria-label={t('src' in image ? 'imageViewerOpenOriginal' : 'imageViewerDownload')} title={t('src' in image ? 'imageViewerOpenOriginal' : 'imageViewerDownload')}>
          <IconDownloadOutline16 />
        </button>
      </div>
    </div>,
    document.body
  )
}
