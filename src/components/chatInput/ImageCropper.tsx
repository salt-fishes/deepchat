import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslate } from '../../i18n/index.js'
import { IconCheckOutline16, IconCloseOutline16, IconCropOutline16 } from '../base/icons.js'
import { registerOverlayToken } from '../base/Modal.js'
import { resolveCropper, useImageCropper } from './imageCropperState.js'
import styles from './ImageCropper.module.css'

/** 裁剪输出最长边上限，与原生拍照路径一致，避免超大图拖垮上传 */
const MAX_OUTPUT_DIM = 4096
const JPEG_QUALITY = 0.92
/** 裁剪框最小边长（区域坐标 px） */
const MIN_SIZE = 48
/** 角柄的命中半径（区域坐标 px） */
const HANDLE_HIT = 34

type Mode = 'preview' | 'crop'
type Rect = { x: number; y: number; w: number; h: number }
type Corner = 0 | 1 | 2 | 3 // 左上 / 右上 / 右下 / 左下

/** 比例预设；ratio 为 null 时按图片原始比例 */
const ASPECTS: { key: string; ratio: number | null }[] = [
  { key: 'free', ratio: null },
  { key: 'original', ratio: null },
  { key: '1:1', ratio: 1 },
  { key: '3:4', ratio: 3 / 4 },
  { key: '4:3', ratio: 4 / 3 },
  { key: '16:9', ratio: 16 / 9 },
  { key: '9:16', ratio: 9 / 16 },
]

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

/**
 * 全屏照片回览/剪裁浮层（对齐官方拍照后的界面）：
 * - preview：整图居中展示，顶部左 X、右「剪裁」入口，底部大 ✓ 确认；
 * - crop：图片定住，裁剪框可整体拖动、四角拖拽自由改变大小与比例（另有比例预设一键套用），
 *   ✓ 按当前框裁剪。确认时未做任何操作则原样交回原文件。
 */
export const ImageCropper = () => {
  const t = useTranslate()
  const request = useImageCropper((state) => state.request)
  const [image, setImage] = useState<{ el: HTMLImageElement; width: number; height: number } | null>(
    null
  )
  const [mode, setMode] = useState<Mode>('preview')
  const [aspect, setAspect] = useState<string>('free')
  const [busy, setBusy] = useState(false)
  const areaRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const rectRef = useRef<HTMLDivElement>(null)
  /** 图片与裁剪框的区域坐标几何（随布局重算） */
  const geometry = useRef({ imageRect: { x: 0, y: 0, w: 0, h: 0 }, rect: { x: 0, y: 0, w: 0, h: 0 } })
  const drag = useRef<{
    pointerId: number
    mode: 'move' | Corner
    startX: number
    startY: number
    origin: Rect
  } | null>(null)
  /** 确认时据此判断是否原样交回原文件 */
  const dirty = useRef(false)

  // 打开时解码图片；失败按取消关闭
  useEffect(() => {
    if (!request) {
      setImage(null)
      return
    }
    let cancelled = false
    const el = new Image()
    el.src = request.src
    el.decode()
      .then(() => {
        if (!cancelled) {
          setImage({ el, width: el.naturalWidth, height: el.naturalHeight })
          setMode(request.mode)
          setAspect(request.mode === 'crop' ? 'original' : 'free')
          dirty.current = false
        }
      })
      .catch(() => {
        if (!cancelled) {
          resolveCropper(null)
        }
      })
    return () => {
      cancelled = true
    }
  }, [request])

  // 返回键关闭（复用弹窗关闭栈）
  useEffect(() => {
    if (!request) {
      return
    }
    return registerOverlayToken(() => resolveCropper(null))
  }, [request])

  /** 把几何写到 DOM：图片 contain 居中 + 裁剪框位置 */
  const applyLayout = () => {
    const img = imgRef.current
    const rect = rectRef.current
    const { imageRect } = geometry.current
    if (img) {
      img.style.left = `${imageRect.x}px`
      img.style.top = `${imageRect.y}px`
      img.style.width = `${imageRect.w}px`
      img.style.height = `${imageRect.h}px`
      img.style.opacity = '1'
    }
    if (rect) {
      const { rect: box } = geometry.current
      rect.style.left = `${box.x}px`
      rect.style.top = `${box.y}px`
      rect.style.width = `${box.w}px`
      rect.style.height = `${box.h}px`
    }
  }

  /** 按容器尺寸重排：图片 contain 居中，裁剪框裁到图片内（首次初始化为整图） */
  useEffect(() => {
    if (!image) {
      return
    }
    const layout = () => {
      const area = areaRef.current
      if (!area) {
        return
      }
      const width = area.clientWidth
      const height = area.clientHeight
      if (width <= 0 || height <= 0) {
        return
      }
      const pad = 12
      const scale = Math.min((width - pad * 2) / image.width, (height - pad * 2) / image.height)
      const w = image.width * scale
      const h = image.height * scale
      const imageRect = { x: (width - w) / 2, y: (height - h) / 2, w, h }
      geometry.current.imageRect = imageRect
      const current = geometry.current.rect
      if (current.w <= 0 || current.h <= 0) {
        // 首次布局：裁剪框取整张图
        geometry.current.rect = { ...imageRect }
      } else {
        // 布局变化（转屏等）：把已有裁剪框裁回图片范围内
        const x1 = clamp(current.x, imageRect.x, imageRect.x + w - MIN_SIZE)
        const y1 = clamp(current.y, imageRect.y, imageRect.y + h - MIN_SIZE)
        geometry.current.rect = {
          x: x1,
          y: y1,
          w: Math.min(current.w, imageRect.x + w - x1),
          h: Math.min(current.h, imageRect.y + h - y1),
        }
      }
      applyLayout()
    }
    layout()
    window.addEventListener('resize', layout)
    return () => window.removeEventListener('resize', layout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image])

  // 进入剪裁模式时把裁剪框几何同步到 DOM（布局效果只在图片加载/转屏时跑）
  useEffect(() => {
    if (mode === 'crop' && image) {
      applyLayout()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, image])

  const pointerInArea = (event: React.PointerEvent) => {
    const area = areaRef.current
    if (!area) {
      return { x: 0, y: 0 }
    }
    const rect = area.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  const clampRect = (box: Rect) => {
    const { imageRect } = geometry.current
    const w = clamp(box.w, MIN_SIZE, imageRect.w)
    const h = clamp(box.h, MIN_SIZE, imageRect.h)
    return {
      x: clamp(box.x, imageRect.x, imageRect.x + imageRect.w - w),
      y: clamp(box.y, imageRect.y, imageRect.y + imageRect.h - h),
      w,
      h,
    }
  }

  const setRect = (box: Rect) => {
    geometry.current.rect = clampRect(box)
    applyLayout()
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (mode !== 'crop' || drag.current) {
      return
    }
    const pos = pointerInArea(event)
    const { rect } = geometry.current
    const corners: [number, number, Corner][] = [
      [rect.x, rect.y, 0],
      [rect.x + rect.w, rect.y, 1],
      [rect.x + rect.w, rect.y + rect.h, 2],
      [rect.x, rect.y + rect.h, 3],
    ]
    let corner: Corner | null = null
    for (const [cx, cy, index] of corners) {
      if (Math.hypot(pos.x - cx, pos.y - cy) <= HANDLE_HIT) {
        corner = index
        break
      }
    }
    const inside =
      pos.x >= rect.x && pos.x <= rect.x + rect.w && pos.y >= rect.y && pos.y <= rect.y + rect.h
    if (corner === null && !inside) {
      return
    }
    drag.current = {
      pointerId: event.pointerId,
      mode: corner ?? 'move',
      startX: pos.x,
      startY: pos.y,
      origin: { ...rect },
    }
    dirty.current = true
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // 无活跃指针时忽略
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const active = drag.current
    if (!active || event.pointerId !== active.pointerId || mode !== 'crop') {
      return
    }
    const pos = pointerInArea(event)
    const { origin } = active
    if (active.mode === 'move') {
      const dx = pos.x - active.startX
      const dy = pos.y - active.startY
      setRect({ x: origin.x + dx, y: origin.y + dy, w: origin.w, h: origin.h })
      return
    }
    // 角柄拖拽：对角固定，自由改变宽高（任意比例），限缩在图片内
    const { imageRect } = geometry.current
    const px = clamp(pos.x, imageRect.x, imageRect.x + imageRect.w)
    const py = clamp(pos.y, imageRect.y, imageRect.y + imageRect.h)
    const anchor = {
      x: origin.x + (active.mode === 0 || active.mode === 3 ? origin.w : 0),
      y: origin.y + (active.mode === 0 || active.mode === 1 ? origin.h : 0),
    }
    const w = Math.max(MIN_SIZE, Math.abs(px - anchor.x))
    const h = Math.max(MIN_SIZE, Math.abs(py - anchor.y))
    // 最小尺寸朝指针方向扩展，保持对角不动
    setRect({
      x: px >= anchor.x ? anchor.x : anchor.x - w,
      y: py >= anchor.y ? anchor.y : anchor.y - h,
      w,
      h,
    })
  }

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) {
      drag.current = null
    }
  }

  /** 套用比例预设：在图片内取该比例的最大框并居中 */
  const applyAspect = (key: string) => {
    if (!image) {
      return
    }
    setAspect(key)
    dirty.current = true
    const { imageRect } = geometry.current
    if (key === 'free') {
      return
    }
    const ratio = key === 'original' ? image.width / image.height : (ASPECTS.find((item) => item.key === key)?.ratio ?? 1)
    let w = imageRect.w
    let h = w / ratio
    if (h > imageRect.h) {
      h = imageRect.h
      w = h * ratio
    }
    setRect({
      x: imageRect.x + (imageRect.w - w) / 2,
      y: imageRect.y + (imageRect.h - h) / 2,
      w,
      h,
    })
  }

  const confirm = async () => {
    if (!image || !request || busy) {
      return
    }
    // 预览模式或未做任何操作：原样交回原文件
    if (mode === 'preview' || !dirty.current) {
      resolveCropper(request.file)
      return
    }
    setBusy(true)
    try {
      const { imageRect, rect } = geometry.current
      const scale = imageRect.w / image.width
      const sx = (rect.x - imageRect.x) / scale
      const sy = (rect.y - imageRect.y) / scale
      const sw = rect.w / scale
      const sh = rect.h / scale
      const outputScale = Math.min(1, MAX_OUTPUT_DIM / Math.max(sw, sh))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(sw * outputScale))
      canvas.height = Math.max(1, Math.round(sh * outputScale))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        return
      }
      // JPEG 无透明通道，先铺白底
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image.el, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
      )
      if (!blob) {
        return
      }
      const base = request.name.replace(/\.[^.]+$/, '')
      resolveCropper(new File([blob], `${base}.jpg`, { type: 'image/jpeg' }))
    } finally {
      setBusy(false)
    }
  }

  if (!request) {
    return null
  }

  return createPortal(
    <div className={styles.overlay}>
      <div className={styles.top}>
        <button
          type="button"
          className={styles.topButton}
          aria-label={t('cancel')}
          onClick={() => resolveCropper(null)}
        >
          <IconCloseOutline16 />
        </button>
        <div className={styles.title}>{mode === 'crop' ? t('cropTitle') : t('cropView')}</div>
        <button
          type="button"
          className={clsx(styles.topButton, mode === 'crop' && styles.topButtonActive)}
          aria-label={t('cropTitle')}
          onClick={() => setMode(mode === 'crop' ? 'preview' : 'crop')}
        >
          <IconCropOutline16 />
        </button>
      </div>
      <div
        ref={areaRef}
        className={styles.frameArea}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <img ref={imgRef} className={styles.img} src={request.src} alt="" draggable={false} />
        {image && mode === 'crop' ? (
          <div ref={rectRef} className={styles.frame}>
            <span className={clsx(styles.corner, styles.cornerTL)} />
            <span className={clsx(styles.corner, styles.cornerTR)} />
            <span className={clsx(styles.corner, styles.cornerBL)} />
            <span className={clsx(styles.corner, styles.cornerBR)} />
          </div>
        ) : null}
        {!image ? <div className={styles.loading} aria-hidden /> : null}
      </div>
      <div className={styles.bottom}>
        {mode === 'crop' ? (
          <div className={styles.chipsRow}>
            {ASPECTS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={clsx(styles.chip, aspect === item.key && styles.chipActive)}
                onClick={() => applyAspect(item.key)}
              >
                {item.key === 'free' ? t('cropFree') : item.key === 'original' ? t('cropOriginal') : item.key}
              </button>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          className={styles.confirm}
          aria-label={t('confirm')}
          disabled={busy || !image}
          onClick={() => void confirm()}
        >
          <IconCheckOutline16 />
        </button>
      </div>
    </div>,
    document.body
  )
}
