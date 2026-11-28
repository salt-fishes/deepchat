import clsx from 'clsx'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useExitPresence } from '../../app/useExitPresence.js'
import { useTranslate } from '../../i18n/index.js'
import { resolveMimeType } from '../../services/attachments.js'
import { loadRecentImage } from '../../services/chat/db.js'
import { addDraftFiles } from '../../services/chat/drafts.js'
import { useChatStore } from '../../services/chat/store.js'
import { useSettings } from '../../services/settings.js'
import { showToast } from '../base/toastState.js'
import { registerOverlayToken } from '../base/Modal.js'
import {
  IconCheckOutline16,
  IconCloseOutline16,
  IconCropOutline16,
  IconDownloadOutline16,
  IconPhotoErrorFill20,
  IconRefreshOutline16,
} from '../base/icons.js'
import { ensureApiKey } from '../settings/settingsDialogState.js'
import { encodeCanvas } from './canvasEncode.js'
import {
  clamp,
  clampCropImageOffset,
  clampCropRect,
  cropCornerAt,
  cropOutputSize,
  cropSourceRect,
  fitCropAspect,
  layoutCropImage,
  MAX_CROP_ZOOM,
  MIN_CROP_ZOOM,
  resizeCropRect,
  transformCropImage,
  type CropCorner,
  type CropPoint,
  type CropRect,
} from './cropGeometry.js'
import {
  dismissImageWorkbench,
  normalizeImageBlob,
  resolveImageWorkbench,
  setImageWorkbenchMode,
  useImageWorkbench,
  viewerImageKey,
  viewerImageSource,
  type ImageWorkbenchSource,
  type ViewerImage,
} from './imageWorkbenchState.js'
import {
  clampViewerOffset,
  MAX_VIEWER_ZOOM,
  MIN_VIEWER_ZOOM,
  pinchViewer,
  resolveViewerSwipe,
  zoomViewerAt,
  type ViewerPoint,
} from './viewerGeometry.js'
import styles from './ImageWorkbench.module.css'

const DOUBLE_TAP_ZOOM = 2.5
const EMPTY_RECT: CropRect = { x: 0, y: 0, w: 0, h: 0 }
const ASPECTS = [
  { key: 'free', ratio: null },
  { key: 'original', ratio: null },
  { key: '1:1', ratio: 1 },
  { key: '3:4', ratio: 3 / 4 },
  { key: '4:3', ratio: 4 / 3 },
  { key: '16:9', ratio: 16 / 9 },
  { key: '9:16', ratio: 9 / 16 },
] as const

type DecodedImage = { el: HTMLImageElement; width: number; height: number }

type CropGesture =
  | {
      kind: 'pan'
      pointerId: number
      start: CropPoint
      origin: CropPoint
    }
  | {
      kind: 'resize'
      pointerId: number
      corner: CropCorner
      origin: CropRect
    }
  | {
      kind: 'pinch'
      startDistance: number
      startZoom: number
      startCenter: CropPoint
      origin: CropPoint
    }

type ViewerSession = {
  target: EventTarget | null
  startX: number
  startY: number
  startTime: number
  startScale: number
  startOffset: ViewerPoint
  samples: { x: number; time: number }[]
  pinched: boolean
  moved: boolean
  horizontal: boolean
  pinch: {
    distance: number
    center: ViewerPoint
    scale: number
    offset: ViewerPoint
  } | null
}

const decodeImage = (src: string): Promise<DecodedImage> => {
  const el = new Image()
  el.src = src
  return el.decode().then(() => ({ el, width: el.naturalWidth, height: el.naturalHeight }))
}

/** 单一图片工作台：消息查看、本地回览与裁剪共用图片、浮层和关闭生命周期。 */
export const ImageWorkbench = () => {
  const t = useTranslate()
  const current = useImageWorkbench((state) => state.request)
  const currentId = current?.id
  const overlayRef = useRef<HTMLDivElement>(null)
  const request = useExitPresence(current, overlayRef)
  const stageRef = useRef<HTMLDivElement>(null)
  const viewImageRef = useRef<HTMLImageElement>(null)
  const cropImageRef = useRef<HTMLImageElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const ownedUrls = useRef(new Set<string>())
  const displayUrlRef = useRef<string | null>(null)
  const blobRef = useRef<Blob | null>(null)
  const remoteBlobRef = useRef<Promise<Blob> | null>(null)
  const geometry = useRef({ imageRect: { ...EMPTY_RECT }, rect: { ...EMPTY_RECT } })
  const baseImageRect = useRef<CropRect>({ ...EMPTY_RECT })
  const cropView = useRef<{ zoom: number; offset: CropPoint }>({
    zoom: MIN_CROP_ZOOM,
    offset: { x: 0, y: 0 },
  })
  const cropPointers = useRef(new Map<number, CropPoint>())
  const cropGesture = useRef<CropGesture | null>(null)
  const viewer = useRef<{ scale: number; offset: ViewerPoint }>({
    scale: MIN_VIEWER_ZOOM,
    offset: { x: 0, y: 0 },
  })
  const viewerPointers = useRef(new Map<number, ViewerPoint>())
  const viewerSession = useRef<ViewerSession | null>(null)
  const viewerIndexRef = useRef(0)
  const viewerSwitch = useRef(0)
  const dirty = useRef(false)
  const askSessionId = useRef<string | null>(null)

  const [displayUrl, setDisplayUrl] = useState<string | null>(null)
  const [image, setImage] = useState<DecodedImage | null>(null)
  const [failed, setFailed] = useState(false)
  const [actionError, setActionError] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [aspect, setAspect] = useState<string>('free')
  const [viewerSelection, setViewerSelection] = useState({ requestId: 0, index: 0 })

  const mode = request?.mode ?? 'preview'
  const sideways = rotation % 180 !== 0
  const gallery = useMemo<ViewerImage[]>(() => {
    if (!request) {
      return []
    }
    if (request.gallery?.length) {
      return request.gallery
    }
    if (request.source.kind === 'stored') {
      return [
        {
          id: request.source.id,
          name: request.source.name,
          mimeType: request.source.mimeType,
        },
      ]
    }
    if (request.source.kind === 'remote') {
      return [
        {
          src: request.source.src,
          name: request.source.name,
          mimeType: request.source.mimeType,
        },
      ]
    }
    return []
  }, [request])
  const rawViewerIndex =
    request && viewerSelection.requestId === request.id
      ? viewerSelection.index
      : (request?.index ?? 0)
  const viewerIndex = clamp(rawViewerIndex, 0, Math.max(0, gallery.length - 1))
  viewerIndexRef.current = viewerIndex
  const activeImage = gallery[viewerIndex]
  const activeSource = useMemo(
    () =>
      request?.source.kind === 'file'
        ? request.source
        : activeImage
          ? viewerImageSource(activeImage)
          : null,
    [activeImage, request?.source]
  )
  const activeKey =
    request?.source.kind === 'file'
      ? `file:${request.source.file.name}:${request.source.file.size}`
      : activeImage
        ? viewerImageKey(activeImage)
        : ''

  const updateDisplayUrl = useCallback((url: string | null) => {
    displayUrlRef.current = url
    setDisplayUrl(url)
  }, [])

  const createObjectUrl = useCallback((blob: Blob) => {
    const url = URL.createObjectURL(blob)
    ownedUrls.current.add(url)
    return url
  }, [])

  const releaseObjectUrl = useCallback((url: string | null) => {
    if (url && ownedUrls.current.delete(url)) {
      URL.revokeObjectURL(url)
    }
  }, [])

  // 每张图只建立一份可编辑 Blob；远程图先在后台取回，进入裁剪时无需再次请求。
  useEffect(() => {
    geometry.current = { imageRect: { ...EMPTY_RECT }, rect: { ...EMPTY_RECT } }
    baseImageRect.current = { ...EMPTY_RECT }
    cropView.current = { zoom: MIN_CROP_ZOOM, offset: { x: 0, y: 0 } }
    cropPointers.current.clear()
    cropGesture.current = null
    stageRef.current?.removeAttribute('data-crop-manipulating')
    viewer.current = { scale: MIN_VIEWER_ZOOM, offset: { x: 0, y: 0 } }
    viewerPointers.current.clear()
    viewerSession.current = null
    viewerSwitch.current++
    dirty.current = false
    askSessionId.current = null
    remoteBlobRef.current = null
    blobRef.current = null
    setImage(null)
    setFailed(false)
    setActionError(false)
    setBusy(false)
    setRotation(0)
    setAspect('free')
    updateDisplayUrl(null)
    if (!request || !activeSource) {
      return
    }

    let cancelled = false
    const controller = new AbortController()
    const requestUrls = ownedUrls.current
    const timeout = window.setTimeout(() => controller.abort(), 10_000)
    const source = activeSource
    const fallbackMime =
      source.kind === 'file' ? resolveMimeType(source.file) : (source.mimeType ?? '')

    const acceptBlob = (blob: Blob) => {
      if (cancelled) {
        return
      }
      const normalized = normalizeImageBlob(blob, fallbackMime)
      blobRef.current = normalized
      const url = createObjectUrl(normalized)
      updateDisplayUrl(url)
      return decodeImage(url).then((decoded) => {
        if (!cancelled) {
          setImage(decoded)
        }
      })
    }

    const fail = () => {
      if (cancelled) {
        return
      }
      // 保留工作台与失败提示，由用户主动关闭；不把加载失败误判为“取消”。
      setFailed(true)
    }

    if (source.kind === 'file') {
      void acceptBlob(source.file)?.catch(fail)
    } else if (source.kind === 'stored') {
      void loadRecentImage(source.id, source.mimeType)
        .then((blob) => {
          if (cancelled) {
            return undefined
          }
          if (!blob || blob.size === 0) {
            throw new Error('Missing stored image')
          }
          return acceptBlob(blob)
        })
        .catch(fail)
    } else {
      updateDisplayUrl(source.src)
      void decodeImage(source.src)
        .then((decoded) => {
          if (!cancelled) {
            setImage(decoded)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setFailed(true)
          }
        })
      const remote = fetch(source.src, {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Image request failed: ${response.status}`)
          }
          return response.blob()
        })
        .then((blob) => {
          if (!blob || blob.size === 0) {
            throw new Error('Empty remote image')
          }
          return normalizeImageBlob(blob, fallbackMime)
        })
      remoteBlobRef.current = remote
      // 查看远程图不依赖 CORS 取回；失败只影响裁剪，保留查看器可用。
      void remote.catch(() => {})
    }

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timeout)
      for (const url of requestUrls) {
        URL.revokeObjectURL(url)
      }
      requestUrls.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, request?.id, viewerIndex])

  // 返回键/Esc 也走统一状态；离开裁剪时撤销旋转、框选和远程编辑地址。
  useEffect(() => {
    if (!request || request.mode === 'crop') {
      return
    }
    cropPointers.current.clear()
    cropGesture.current = null
    cropView.current = { zoom: MIN_CROP_ZOOM, offset: { x: 0, y: 0 } }
    stageRef.current?.removeAttribute('data-crop-manipulating')
    dirty.current = false
    askSessionId.current = null
    setActionError(false)
    setRotation(0)
    setAspect('free')
    viewer.current = { scale: MIN_VIEWER_ZOOM, offset: { x: 0, y: 0 } }
    viewerPointers.current.clear()
    viewerSession.current = null
    viewerSwitch.current++
    geometry.current.rect = { ...EMPTY_RECT }
    if (activeSource?.kind === 'remote' && displayUrlRef.current !== activeSource.src) {
      releaseObjectUrl(displayUrlRef.current)
      updateDisplayUrl(activeSource.src)
    }
  }, [activeSource, releaseObjectUrl, request, updateDisplayUrl])

  const close = useCallback(() => resolveImageWorkbench(null), [])

  useEffect(() => {
    if (!currentId) {
      return
    }
    const trigger = document.activeElement
    overlayRef.current?.focus({ preventScroll: true })
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        dismissImageWorkbench()
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      if (trigger instanceof HTMLElement && trigger.isConnected) {
        trigger.focus({ preventScroll: true })
      }
    }
  }, [currentId])

  useEffect(() => {
    if (!currentId) {
      return
    }
    return registerOverlayToken(dismissImageWorkbench)
  }, [currentId])

  const applyLayout = useCallback(() => {
    const img = cropImageRef.current
    const frame = frameRef.current
    const { imageRect, rect } = geometry.current
    if (img) {
      const w = sideways ? imageRect.h : imageRect.w
      const h = sideways ? imageRect.w : imageRect.h
      img.style.left = `${imageRect.x + (imageRect.w - w) / 2}px`
      img.style.top = `${imageRect.y + (imageRect.h - h) / 2}px`
      img.style.width = `${w}px`
      img.style.height = `${h}px`
      img.style.opacity = '1'
    }
    if (frame) {
      frame.style.left = `${rect.x}px`
      frame.style.top = `${rect.y}px`
      frame.style.width = `${rect.w}px`
      frame.style.height = `${rect.h}px`
    }
  }, [sideways])

  const applyCropTransform = useCallback(
    (markDirty = false) => {
      const selected = geometry.current.rect
      const previous = geometry.current.imageRect
      let offset = cropView.current.offset
      let imageRect = transformCropImage(baseImageRect.current, cropView.current.zoom, offset)
      if (selected.w > 0 && selected.h > 0) {
        offset = clampCropImageOffset(imageRect, selected, offset)
        cropView.current.offset = offset
        imageRect = transformCropImage(baseImageRect.current, cropView.current.zoom, offset)
      }
      geometry.current.imageRect = imageRect
      if (
        markDirty &&
        (previous.x !== imageRect.x ||
          previous.y !== imageRect.y ||
          previous.w !== imageRect.w ||
          previous.h !== imageRect.h)
      ) {
        dirty.current = true
      }
      applyLayout()
    },
    [applyLayout]
  )

  useEffect(() => {
    if (mode !== 'crop' || !image) {
      return
    }
    const layout = () => {
      const area = stageRef.current
      if (!area || area.clientWidth <= 0 || area.clientHeight <= 0) {
        return
      }
      const { imageRect } = layoutCropImage(
        area.clientWidth,
        area.clientHeight,
        image.width,
        image.height,
        rotation
      )
      baseImageRect.current = imageRect
      geometry.current.rect =
        geometry.current.rect.w > 0
          ? clampCropRect(geometry.current.rect, imageRect)
          : { ...imageRect }
      applyCropTransform()
    }
    layout()
    window.addEventListener('resize', layout)
    return () => window.removeEventListener('resize', layout)
  }, [applyCropTransform, image, mode, rotation])

  const ensureEditableBlob = async (
    requestId: number,
    source: ImageWorkbenchSource
  ): Promise<Blob | null> => {
    if (blobRef.current) {
      return blobRef.current
    }
    if (source.kind !== 'remote' || !remoteBlobRef.current) {
      return null
    }
    const blob = await remoteBlobRef.current
    if (useImageWorkbench.getState().request?.id !== requestId) {
      return null
    }
    blobRef.current = blob
    return blob
  }

  const enterCrop = async () => {
    const source = activeSource
    if (!request || !source || mode !== 'preview' || busy || failed) {
      return
    }
    setBusy(true)
    setActionError(false)
    try {
      const blob = await ensureEditableBlob(request.id, source)
      if (!blob || useImageWorkbench.getState().request?.id !== request.id) {
        return
      }
      const remoteUrl =
        source.kind === 'remote' && displayUrlRef.current === source.src
          ? createObjectUrl(blob)
          : displayUrlRef.current
      if (!remoteUrl) {
        return
      }
      const decoded =
        image && remoteUrl === displayUrlRef.current ? image : await decodeImage(remoteUrl)
      if (useImageWorkbench.getState().request?.id !== request.id) {
        releaseObjectUrl(remoteUrl)
        return
      }
      updateDisplayUrl(remoteUrl)
      setImage(decoded)
      setRotation(0)
      setAspect('free')
      viewer.current = { scale: MIN_VIEWER_ZOOM, offset: { x: 0, y: 0 } }
      viewerPointers.current.clear()
      viewerSession.current = null
      viewerSwitch.current++
      cropView.current = { zoom: MIN_CROP_ZOOM, offset: { x: 0, y: 0 } }
      cropPointers.current.clear()
      cropGesture.current = null
      geometry.current.rect = { ...EMPTY_RECT }
      dirty.current = false
      if (source.kind !== 'file') {
        askSessionId.current = useChatStore.getState().activeId
      }
      setImageWorkbenchMode('crop')
    } catch {
      if (useImageWorkbench.getState().request?.id === request.id) {
        setActionError(true)
      }
    } finally {
      if (useImageWorkbench.getState().request?.id === request.id) {
        setBusy(false)
      }
    }
  }

  const exitCrop = () => {
    if (!request || request.mode !== 'crop') {
      return
    }
    cropPointers.current.clear()
    cropGesture.current = null
    cropView.current = { zoom: MIN_CROP_ZOOM, offset: { x: 0, y: 0 } }
    stageRef.current?.removeAttribute('data-crop-manipulating')
    dirty.current = false
    askSessionId.current = null
    setActionError(false)
    setRotation(0)
    setAspect('free')
    viewer.current = { scale: MIN_VIEWER_ZOOM, offset: { x: 0, y: 0 } }
    viewerPointers.current.clear()
    viewerSession.current = null
    viewerSwitch.current++
    geometry.current.rect = { ...EMPTY_RECT }
    if (activeSource?.kind === 'remote') {
      releaseObjectUrl(displayUrlRef.current)
      updateDisplayUrl(activeSource.src)
    }
    setImageWorkbenchMode('preview')
  }

  const stagePoint = (clientX: number, clientY: number): ViewerPoint => {
    const stage = stageRef.current
    if (!stage) {
      return { x: 0, y: 0 }
    }
    const rect = stage.getBoundingClientRect()
    return {
      x: clientX - rect.left - rect.width / 2,
      y: clientY - rect.top - rect.height / 2,
    }
  }

  const clampCurrentViewer = (scale: number, offset: ViewerPoint): ViewerPoint => {
    const stage = stageRef.current
    const element = viewImageRef.current
    if (!stage || !element) {
      return offset
    }
    return clampViewerOffset(
      offset,
      scale,
      element.offsetWidth,
      element.offsetHeight,
      stage.clientWidth,
      stage.clientHeight
    )
  }

  const applyViewer = useCallback((scale: number, offset: ViewerPoint, animate: boolean) => {
    viewer.current = { scale, offset }
    const element = viewImageRef.current
    if (!element) {
      return
    }
    if (animate) {
      element.style.transition = 'none'
      void element.offsetWidth
      element.style.transition = ''
    } else {
      element.style.transition = 'none'
    }
    element.style.transform = `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`
    element.classList.toggle(styles.zoomed, scale > MIN_VIEWER_ZOOM + 0.001)
  }, [])

  const zoomViewerTo = (nextScale: number, point: ViewerPoint, animate: boolean) => {
    const current = viewer.current
    const scale = clamp(nextScale, MIN_VIEWER_ZOOM, MAX_VIEWER_ZOOM)
    if (scale <= MIN_VIEWER_ZOOM + 0.001) {
      applyViewer(MIN_VIEWER_ZOOM, { x: 0, y: 0 }, animate)
      return
    }
    const offset = clampCurrentViewer(
      scale,
      zoomViewerAt(point, current.offset, current.scale, scale)
    )
    applyViewer(scale, offset, animate)
  }

  const goToViewerIndex = (next: number) => {
    if (!request || gallery.length < 2) {
      return
    }
    const target = clamp(next, 0, gallery.length - 1)
    if (target === viewerIndexRef.current) {
      return
    }
    viewerIndexRef.current = target
    setViewerSelection({ requestId: request.id, index: target })
  }

  const animateViewerTo = (element: HTMLImageElement, dx: number, target: number) => {
    const stage = stageRef.current
    if (!stage || target === viewerIndexRef.current) {
      return false
    }
    const from = `translate3d(${dx}px, 0, 0) scale(1)`
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      goToViewerIndex(target)
      return true
    }
    const requestId = request?.id
    const generation = ++viewerSwitch.current
    const out = stage.clientWidth * (target > viewerIndexRef.current ? -1 : 1)
    const animation = element.animate(
      [
        { transform: from, opacity: 1 },
        { transform: `translate3d(${out}px, 0, 0) scale(1)`, opacity: 0.35 },
      ],
      { duration: 180, easing: 'cubic-bezier(0.2, 0.75, 0.25, 1)' }
    )
    void animation.finished
      .catch(() => {})
      .then(() => {
        if (viewerSwitch.current !== generation) {
          return
        }
        if (useImageWorkbench.getState().request?.id !== requestId) {
          return
        }
        goToViewerIndex(target)
      })
    return true
  }

  const snapViewerBack = (element: HTMLImageElement, dx: number) => {
    const from = `translate3d(${dx}px, 0, 0) scale(1)`
    const animation = element.animate(
      [
        { transform: from, opacity: 1 },
        { transform: 'translate3d(0, 0, 0) scale(1)', opacity: 1 },
      ],
      { duration: 190, easing: 'cubic-bezier(0.18, 0.7, 0.32, 1)' }
    )
    const generation = ++viewerSwitch.current
    void animation.finished
      .catch(() => {})
      .then(() => {
        if (viewerSwitch.current !== generation) {
          return
        }
        element.style.transform = 'translate3d(0, 0, 0) scale(1)'
        animation.cancel()
      })
  }

  const finishViewerSwipe = (dx: number, velocity: number) => {
    const element = viewImageRef.current
    const stage = stageRef.current
    if (!element || !stage) {
      return
    }
    const target = resolveViewerSwipe(
      dx,
      velocity,
      viewerIndexRef.current,
      gallery.length,
      stage.clientWidth
    )
    if (!animateViewerTo(element, dx, target)) {
      snapViewerBack(element, dx)
    }
  }

  const startViewerPinch = (session: ViewerSession) => {
    const points = Array.from(viewerPointers.current.values()).slice(0, 2)
    if (points.length < 2) {
      return
    }
    const [first, second] = points
    const center = stagePoint((first.x + second.x) / 2, (first.y + second.y) / 2)
    applyViewer(viewer.current.scale, viewer.current.offset, false)
    session.pinch = {
      distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      center,
      scale: viewer.current.scale,
      offset: viewer.current.offset,
    }
    session.pinched = true
    session.moved = true
    session.horizontal = false
  }

  const onViewPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== 'preview' || event.button !== 0) {
      return
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // 合成事件没有活跃指针时忽略。
    }
    viewerPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    let session = viewerSession.current
    if (!session) {
      viewerSwitch.current++
      // A new touch wins over an unfinished slide; snap back to the current
      // image before tracking the new gesture.
      const element = viewImageRef.current
      if (element) {
        for (const animation of element.getAnimations()) {
          animation.cancel()
        }
      }
      applyViewer(viewer.current.scale, viewer.current.offset, false)
      session = {
        target: event.target,
        startX: event.clientX,
        startY: event.clientY,
        startTime: event.timeStamp,
        startScale: viewer.current.scale,
        startOffset: viewer.current.offset,
        samples: [{ x: event.clientX, time: event.timeStamp }],
        pinched: false,
        moved: false,
        horizontal: false,
        pinch: null,
      }
      viewerSession.current = session
    }
    if (viewerPointers.current.size >= 2) {
      startViewerPinch(session)
    }
  }

  const onViewPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = viewerSession.current
    if (!session || !viewerPointers.current.has(event.pointerId)) {
      return
    }
    viewerPointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    session.samples.push({ x: event.clientX, time: event.timeStamp })
    session.samples = session.samples.filter(({ time }) => event.timeStamp - time <= 100)

    if (viewerPointers.current.size >= 2) {
      if (!session.pinch) {
        startViewerPinch(session)
        return
      }
      const points = Array.from(viewerPointers.current.values()).slice(0, 2)
      const [first, second] = points
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y))
      const center = stagePoint((first.x + second.x) / 2, (first.y + second.y) / 2)
      const next = pinchViewer(
        session.pinch.center,
        center,
        session.pinch.offset,
        session.pinch.scale,
        distance / session.pinch.distance
      )
      applyViewer(next.scale, clampCurrentViewer(next.scale, next.offset), false)
      return
    }

    if (session.pinched) {
      return
    }

    const dx = event.clientX - session.startX
    const dy = event.clientY - session.startY
    if (viewer.current.scale > MIN_VIEWER_ZOOM + 0.001) {
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        session.moved = true
      }
      const offset = clampCurrentViewer(viewer.current.scale, {
        x: session.startOffset.x + dx,
        y: session.startOffset.y + dy,
      })
      applyViewer(viewer.current.scale, offset, false)
      return
    }

    if (!session.horizontal) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
        return
      }
      if (Math.abs(dy) > Math.abs(dx) * 1.15) {
        session.moved = true
        return
      }
      session.horizontal = true
      applyViewer(MIN_VIEWER_ZOOM, { x: 0, y: 0 }, false)
    }
    session.moved = true
    const atEdge =
      (dx > 0 && viewerIndexRef.current === 0) ||
      (dx < 0 && viewerIndexRef.current === gallery.length - 1)
    const shift = atEdge ? dx * 0.5 : dx
    const element = viewImageRef.current
    if (element) {
      element.style.transition = 'none'
      element.style.transform = `translate3d(${shift}px, 0, 0) scale(1)`
    }
  }

  const onViewPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = viewerSession.current
    if (!session || !viewerPointers.current.has(event.pointerId)) {
      return
    }
    if (!session.pinched && !session.horizontal && viewer.current.scale > 1.001) {
      const offset = clampCurrentViewer(viewer.current.scale, {
        x: session.startOffset.x + event.clientX - session.startX,
        y: session.startOffset.y + event.clientY - session.startY,
      })
      applyViewer(viewer.current.scale, offset, false)
    }
    viewerPointers.current.delete(event.pointerId)
    if (viewerPointers.current.size === 1 && session.pinched) {
      const remaining = Array.from(viewerPointers.current.values())[0]
      session.pinched = false
      session.pinch = null
      session.startX = remaining.x
      session.startY = remaining.y
      session.startScale = viewer.current.scale
      session.startOffset = viewer.current.offset
      session.samples = [{ x: remaining.x, time: event.timeStamp }]
      return
    }
    if (viewerPointers.current.size > 0) {
      return
    }
    viewerSession.current = null

    if (session.pinched) {
      const scale =
        viewer.current.scale <= MIN_VIEWER_ZOOM + 0.001 ? MIN_VIEWER_ZOOM : viewer.current.scale
      applyViewer(
        scale,
        scale === MIN_VIEWER_ZOOM
          ? { x: 0, y: 0 }
          : clampCurrentViewer(scale, viewer.current.offset),
        true
      )
      return
    }

    if (session.horizontal) {
      session.samples.push({ x: event.clientX, time: event.timeStamp })
      const first = session.samples[0]
      const last = session.samples.at(-1) ?? first
      const elapsed = Math.max(1, last.time - first.time)
      finishViewerSwipe(event.clientX - session.startX, (last.x - first.x) / elapsed)
      return
    }

    if (viewer.current.scale > MIN_VIEWER_ZOOM + 0.001 && session.moved) {
      applyViewer(
        viewer.current.scale,
        clampCurrentViewer(viewer.current.scale, viewer.current.offset),
        true
      )
      return
    }

    if (session.moved) {
      return
    }
    const target = session.target
    if (target instanceof Element && target.closest('img')) {
      zoomViewerTo(
        viewer.current.scale > MIN_VIEWER_ZOOM + 0.001 ? MIN_VIEWER_ZOOM : DOUBLE_TAP_ZOOM,
        stagePoint(event.clientX, event.clientY),
        true
      )
    } else if (activeSource?.kind !== 'file') {
      close()
    }
  }

  const onViewPointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    viewerPointers.current.delete(event.pointerId)
    const session = viewerSession.current
    if (viewerPointers.current.size === 1 && session?.pinched) {
      const remaining = Array.from(viewerPointers.current.values())[0]
      session.pinched = false
      session.pinch = null
      session.startX = remaining.x
      session.startY = remaining.y
      session.startOffset = viewer.current.offset
      session.samples = [{ x: remaining.x, time: event.timeStamp }]
      return
    }
    if (viewerPointers.current.size > 0) {
      return
    }
    viewerSession.current = null
    const scale =
      viewer.current.scale <= MIN_VIEWER_ZOOM + 0.001 ? MIN_VIEWER_ZOOM : viewer.current.scale
    applyViewer(
      scale,
      scale === MIN_VIEWER_ZOOM ? { x: 0, y: 0 } : clampCurrentViewer(scale, viewer.current.offset),
      false
    )
  }

  const onViewWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (mode !== 'preview' || Math.abs(event.deltaY) < 1) {
      return
    }
    event.preventDefault()
    zoomViewerTo(
      viewer.current.scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15),
      stagePoint(event.clientX, event.clientY),
      false
    )
  }

  useLayoutEffect(() => {
    if (mode !== 'preview' || !displayUrl || !image) {
      return
    }
    applyViewer(MIN_VIEWER_ZOOM, { x: 0, y: 0 }, false)
  }, [applyViewer, displayUrl, image, mode])

  const pointerInStage = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const setCropRect = (box: CropRect) => {
    geometry.current.rect = clampCropRect(box, geometry.current.imageRect)
    applyCropTransform()
  }

  const startCropPinch = () => {
    const points = Array.from(cropPointers.current.entries())
    if (points.length < 2) {
      return
    }
    const [firstId, first] = points[0]
    const [secondId, second] = points[1]
    if (firstId === secondId) {
      return
    }
    const distance = Math.hypot(second.x - first.x, second.y - first.y)
    if (distance <= 0) {
      return
    }
    cropGesture.current = {
      kind: 'pinch',
      startDistance: distance,
      startZoom: cropView.current.zoom,
      startCenter: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
      origin: { ...cropView.current.offset },
    }
  }

  const onCropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || mode !== 'crop' || busy || !image) {
      return
    }
    const point = pointerInStage(event)
    cropPointers.current.set(event.pointerId, point)
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // 无活跃指针时忽略。
    }
    stageRef.current?.setAttribute('data-crop-manipulating', 'true')
    if (cropPointers.current.size >= 2) {
      startCropPinch()
      return
    }
    const corner = cropCornerAt(point, geometry.current.rect)
    cropGesture.current =
      corner === null
        ? {
            kind: 'pan',
            pointerId: event.pointerId,
            start: point,
            origin: { ...cropView.current.offset },
          }
        : {
            kind: 'resize',
            pointerId: event.pointerId,
            corner,
            origin: { ...geometry.current.rect },
          }
  }

  const onCropPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = cropGesture.current
    if (
      !gesture ||
      mode !== 'crop' ||
      busy ||
      !image ||
      !cropPointers.current.has(event.pointerId)
    ) {
      return
    }
    const point = pointerInStage(event)
    cropPointers.current.set(event.pointerId, point)
    if (gesture.kind === 'pinch') {
      const points = Array.from(cropPointers.current.entries())
      if (points.length < 2) {
        return
      }
      const first = points[0][1]
      const second = points[1][1]
      const distance = Math.hypot(second.x - first.x, second.y - first.y)
      if (distance <= 0) {
        return
      }
      const zoom = clamp(
        (gesture.startZoom * distance) / gesture.startDistance,
        MIN_CROP_ZOOM,
        MAX_CROP_ZOOM
      )
      const ratio = zoom / gesture.startZoom
      const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
      const base = baseImageRect.current
      const baseCenter = { x: base.x + base.w / 2, y: base.y + base.h / 2 }
      cropView.current.zoom = zoom
      cropView.current.offset = {
        x:
          center.x -
          baseCenter.x -
          ratio * (gesture.startCenter.x - baseCenter.x - gesture.origin.x),
        y:
          center.y -
          baseCenter.y -
          ratio * (gesture.startCenter.y - baseCenter.y - gesture.origin.y),
      }
      applyCropTransform(true)
      return
    }
    if (gesture.pointerId !== event.pointerId) {
      return
    }
    if (gesture.kind === 'pan') {
      cropView.current.offset = {
        x: gesture.origin.x + point.x - gesture.start.x,
        y: gesture.origin.y + point.y - gesture.start.y,
      }
      applyCropTransform(true)
      return
    }
    const ratio =
      aspect === 'free'
        ? undefined
        : aspect === 'original'
          ? sideways
            ? image.height / image.width
            : image.width / image.height
          : (ASPECTS.find((item) => item.key === aspect)?.ratio ?? undefined)
    const previous = geometry.current.rect
    setCropRect(
      resizeCropRect(gesture.origin, gesture.corner, point, geometry.current.imageRect, ratio)
    )
    const next = geometry.current.rect
    if (
      previous.x !== next.x ||
      previous.y !== next.y ||
      previous.w !== next.w ||
      previous.h !== next.h
    ) {
      dirty.current = true
    }
  }

  const onCropPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    // Pointer up carries the final coordinate. Apply it before ending the
    // gesture so the crop frame and image stop exactly under the finger.
    onCropPointerMove(event)
    cropPointers.current.delete(event.pointerId)
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      // 指针已由系统回收。
    }
    const gesture = cropGesture.current
    if (cropPointers.current.size >= 2) {
      startCropPinch()
      return
    }
    if (cropPointers.current.size === 1) {
      const [pointerId, start] = cropPointers.current.entries().next().value as [number, CropPoint]
      cropGesture.current = gesture
        ? { kind: 'pan', pointerId, start, origin: { ...cropView.current.offset } }
        : null
      return
    }
    cropGesture.current = null
    stageRef.current?.removeAttribute('data-crop-manipulating')
  }

  const onCropWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (mode !== 'crop' || busy || !image || Math.abs(event.deltaY) < 1) {
      return
    }
    event.preventDefault()
    const previousZoom = cropView.current.zoom
    const zoom = clamp(
      previousZoom * (event.deltaY < 0 ? 1.2 : 1 / 1.2),
      MIN_CROP_ZOOM,
      MAX_CROP_ZOOM
    )
    if (zoom === previousZoom) {
      return
    }
    const point = pointerInStage(event)
    const base = baseImageRect.current
    const center = { x: base.x + base.w / 2, y: base.y + base.h / 2 }
    const ratio = zoom / previousZoom
    const origin = cropView.current.offset
    cropView.current.zoom = zoom
    cropView.current.offset = {
      x: point.x - center.x - ratio * (point.x - center.x - origin.x),
      y: point.y - center.y - ratio * (point.y - center.y - origin.y),
    }
    applyCropTransform(true)
  }

  const applyAspect = (key: string) => {
    if (!image || busy || mode !== 'crop') {
      return
    }
    setAspect(key)
    if (key === 'free') {
      return
    }
    cropPointers.current.clear()
    cropGesture.current = null
    cropView.current = { zoom: MIN_CROP_ZOOM, offset: { x: 0, y: 0 } }
    stageRef.current?.removeAttribute('data-crop-manipulating')
    applyCropTransform()
    const previous = geometry.current.rect
    const ratio =
      key === 'original'
        ? sideways
          ? image.height / image.width
          : image.width / image.height
        : (ASPECTS.find((item) => item.key === key)?.ratio ?? 1)
    setCropRect(fitCropAspect(baseImageRect.current, ratio))
    const next = geometry.current.rect
    if (
      previous.x !== next.x ||
      previous.y !== next.y ||
      previous.w !== next.w ||
      previous.h !== next.h
    ) {
      dirty.current = true
    }
  }

  const rotate = () => {
    if (!image || busy) {
      return
    }
    cropPointers.current.clear()
    cropGesture.current = null
    cropView.current = { zoom: MIN_CROP_ZOOM, offset: { x: 0, y: 0 } }
    stageRef.current?.removeAttribute('data-crop-manipulating')
    geometry.current.rect = { ...EMPTY_RECT }
    setRotation((value) => (value + 90) % 360)
  }

  const addCroppedToDraft = (file: File) => {
    const sessionId = askSessionId.current
    if (
      !sessionId ||
      useChatStore.getState().importingHistory ||
      useChatStore.getState().activeId !== sessionId
    ) {
      return
    }
    const apiKey = useSettings.getState().apiKey ?? ''
    const error = addDraftFiles(sessionId, [file], apiKey)
    if (error) {
      showToast(error)
      return
    }
    // 图片先留在输入框；没有 Key 时再打开配置，不丢掉裁剪结果。
    if (!apiKey) {
      ensureApiKey()
    }
  }

  const confirm = async () => {
    const imageSource = activeSource
    if (!request || !image || !imageSource || busy) {
      return
    }
    setBusy(true)
    setActionError(false)
    try {
      const unchanged = !dirty.current && rotation === 0
      let result: File
      if (unchanged) {
        if (imageSource.kind === 'file') {
          result = imageSource.file
        } else {
          const blob = blobRef.current
          if (!blob) {
            throw new Error('Missing image bytes')
          }
          result = new File([blob], imageSource.name, { type: blob.type })
        }
      } else {
        const { imageRect, rect } = geometry.current
        const selected = mode === 'crop' ? rect : imageRect
        if (selected.w <= 0 || selected.h <= 0) {
          throw new Error('Empty crop selection')
        }
        const source = cropSourceRect(imageRect, selected, image.width, image.height, rotation)
        const output = cropOutputSize(source.sw, source.sh)
        const canvas = document.createElement('canvas')
        canvas.width = output.width
        canvas.height = output.height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          throw new Error('Canvas unavailable')
        }
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.imageSmoothingQuality = 'high'
        ctx.scale(canvas.width / source.sw, canvas.height / source.sh)
        ctx.translate(source.sourceWidth / 2 - source.sx, source.sourceHeight / 2 - source.sy)
        ctx.rotate((rotation * Math.PI) / 180)
        ctx.drawImage(image.el, -image.width / 2, -image.height / 2)
        const blob = await encodeCanvas(canvas)
        const active = useImageWorkbench.getState().request
        if (!active || active.id !== request.id || active.mode !== 'crop') {
          return
        }
        const base =
          imageSource.kind === 'file'
            ? imageSource.file.name.replace(/\.[^.]+$/, '')
            : imageSource.name.replace(/\.[^.]+$/, '')
        result = new File([blob], `${base}.jpg`, { type: 'image/jpeg' })
      }
      if (!resolveImageWorkbench(result, request.id)) {
        return
      }
      if (imageSource.kind !== 'file') {
        addCroppedToDraft(result)
      }
    } catch {
      if (useImageWorkbench.getState().request?.id === request.id) {
        setActionError(true)
      }
    } finally {
      if (useImageWorkbench.getState().request?.id === request.id) {
        setBusy(false)
      }
    }
  }

  const download = () => {
    if (!displayUrl || !request || !activeSource || failed) {
      return
    }
    const anchor = document.createElement('a')
    anchor.href = displayUrl
    if (activeSource.kind === 'remote') {
      anchor.target = '_blank'
      anchor.rel = 'noreferrer'
    } else {
      anchor.download = activeSource.kind === 'file' ? activeSource.file.name : activeSource.name
    }
    anchor.click()
  }

  if (!request) {
    return null
  }

  const fileFlow = activeSource?.kind === 'file'
  const viewerLabel =
    activeSource?.kind === 'file' ? t('cropView') : (activeSource?.name ?? t('cropView'))
  const loadingIndicator = (
    <div className={styles.loading} role="status" aria-live="polite">
      <div className={styles.loadingSpinner} aria-hidden />
      <span>{t('imageProcessing')}</span>
    </div>
  )

  return createPortal(
    <div
      key={request.id}
      ref={overlayRef}
      tabIndex={-1}
      className={styles.overlay}
      data-app-exiting={!current || undefined}
      role="dialog"
      aria-modal="true"
      aria-busy={busy || (!image && !failed)}
      aria-label={mode === 'crop' ? t('cropTitle') : viewerLabel}
    >
      {mode === 'crop' || fileFlow ? (
        <div className={styles.topBar}>
          <button
            type="button"
            className={styles.topButton}
            aria-label={mode === 'crop' ? t('cancel') : t('close')}
            title={mode === 'crop' ? t('cancel') : t('close')}
            onClick={mode === 'crop' ? exitCrop : close}
          >
            <IconCloseOutline16 />
          </button>
          <div className={styles.title}>{mode === 'crop' ? t('cropTitle') : t('cropView')}</div>
          {mode === 'crop' ? (
            <button
              type="button"
              className={styles.topButton}
              aria-label={t('imageViewerRotate')}
              title={t('imageViewerRotate')}
              disabled={busy || !image}
              onClick={rotate}
            >
              <IconRefreshOutline16 />
            </button>
          ) : (
            <button
              type="button"
              className={styles.topButton}
              aria-label={t('cropTitle')}
              title={t('cropTitle')}
              disabled={busy || !image || failed}
              onClick={() => void enterCrop()}
            >
              <IconCropOutline16 />
            </button>
          )}
        </div>
      ) : null}

      <div
        ref={stageRef}
        className={clsx(styles.stage, mode === 'crop' && styles.cropStage)}
        onPointerDown={mode === 'crop' ? onCropPointerDown : onViewPointerDown}
        onPointerMove={mode === 'crop' ? onCropPointerMove : onViewPointerMove}
        onPointerUp={mode === 'crop' ? onCropPointerUp : onViewPointerUp}
        onPointerCancel={mode === 'crop' ? onCropPointerUp : onViewPointerCancel}
        onWheel={mode === 'crop' ? onCropWheel : onViewWheel}
      >
        {busy ? (
          <div className={styles.processing} role="status" aria-live="polite">
            <div className={styles.processingSpinner} aria-hidden />
            <span>{t('imageProcessing')}</span>
          </div>
        ) : null}
        {actionError ? (
          <div className={styles.errorNotice} role="alert">
            {t('imageViewerCropFailed')}
          </div>
        ) : null}
        {failed ? (
          <div className={styles.failed}>
            <IconPhotoErrorFill20 />
            <span>{t('imageViewerLoadFailed')}</span>
          </div>
        ) : mode === 'crop' ? (
          <>
            <img
              ref={cropImageRef}
              className={styles.cropImage}
              style={{ rotate: `${rotation}deg` }}
              src={displayUrl ?? undefined}
              alt=""
              draggable={false}
              referrerPolicy="no-referrer"
            />
            {image ? (
              <div ref={frameRef} className={styles.cropFrame}>
                <span className={clsx(styles.corner, styles.cornerTL)} />
                <span className={clsx(styles.corner, styles.cornerTR)} />
                <span className={clsx(styles.corner, styles.cornerBL)} />
                <span className={clsx(styles.corner, styles.cornerBR)} />
              </div>
            ) : (
              loadingIndicator
            )}
          </>
        ) : displayUrl && image ? (
          <img
            ref={viewImageRef}
            className={styles.viewImage}
            src={displayUrl}
            alt={
              activeSource?.kind === 'file' ? activeSource.file.name : (activeSource?.name ?? '')
            }
            draggable={false}
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : (
          loadingIndicator
        )}
      </div>

      {mode === 'crop' ? (
        <div className={styles.cropBottom}>
          <div className={styles.cropHint} role="status">
            {t('cropPinchHint')}
          </div>
          <div className={styles.aspects}>
            {ASPECTS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={clsx(styles.aspect, aspect === item.key && styles.aspectActive)}
                disabled={busy}
                onClick={() => applyAspect(item.key)}
              >
                {item.key === 'free'
                  ? t('cropFree')
                  : item.key === 'original'
                    ? t('cropOriginal')
                    : item.key}
              </button>
            ))}
          </div>
          {fileFlow ? (
            <button
              type="button"
              className={styles.confirm}
              aria-label={t('confirm')}
              title={t('confirm')}
              disabled={busy || !image}
              onClick={() => void confirm()}
            >
              <IconCheckOutline16 />
            </button>
          ) : (
            <button
              type="button"
              className={styles.askConfirm}
              disabled={busy || !image}
              onClick={() => void confirm()}
            >
              {t('imageViewerAsk')}
            </button>
          )}
        </div>
      ) : fileFlow ? (
        <div className={styles.previewBottom}>
          <button
            type="button"
            className={styles.confirm}
            aria-label={t('confirm')}
            title={t('confirm')}
            disabled={busy || !image || failed}
            onClick={() => void confirm()}
          >
            <IconCheckOutline16 />
          </button>
        </div>
      ) : (
        <div className={styles.actions}>
          <button
            type="button"
            className={clsx(styles.actionButton, styles.closeButton)}
            aria-label={t('close')}
            title={t('close')}
            onClick={close}
          >
            <IconCloseOutline16 />
          </button>
          <button
            type="button"
            className={styles.actionButton}
            aria-label={t('cropTitle')}
            title={t('cropTitle')}
            disabled={busy || !image || failed}
            onClick={() => void enterCrop()}
          >
            <IconCropOutline16 />
          </button>
          <button
            type="button"
            className={styles.actionButton}
            aria-label={
              activeSource?.kind === 'remote'
                ? t('imageViewerOpenOriginal')
                : t('imageViewerDownload')
            }
            title={
              activeSource?.kind === 'remote'
                ? t('imageViewerOpenOriginal')
                : t('imageViewerDownload')
            }
            disabled={!displayUrl || failed}
            onClick={download}
          >
            <IconDownloadOutline16 />
          </button>
        </div>
      )}
    </div>,
    document.body
  )
}
