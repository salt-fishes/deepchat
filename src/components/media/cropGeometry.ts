export type CropRect = { x: number; y: number; w: number; h: number }
export type CropCorner = 0 | 1 | 2 | 3
export type CropPoint = { x: number; y: number }

export const MIN_CROP_SIZE = 48
export const HANDLE_HIT_RADIUS = 44
export const MAX_OUTPUT_DIM = 4096
export const MAX_OUTPUT_PIXELS = MAX_OUTPUT_DIM * MAX_OUTPUT_DIM
export const MIN_CROP_ZOOM = 1
export const MAX_CROP_ZOOM = 6

const finiteOr = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback)

export const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

const normalizedRotation = (rotation: number) =>
  (((Math.round(finiteOr(rotation, 0) / 90) * 90) % 360) + 360) % 360

/** 图片按 contain 放入裁剪区域；旋转 90/270 度时交换宽高。 */
export const layoutCropImage = (
  areaWidth: number,
  areaHeight: number,
  imageWidth: number,
  imageHeight: number,
  rotation: number,
  padding = 12
): { imageRect: CropRect; sourceWidth: number; sourceHeight: number } => {
  const width = Math.max(0, finiteOr(areaWidth, 0))
  const height = Math.max(0, finiteOr(areaHeight, 0))
  const sideways = normalizedRotation(rotation) % 180 !== 0
  const sourceWidth = sideways
    ? Math.max(0, finiteOr(imageHeight, 0))
    : Math.max(0, finiteOr(imageWidth, 0))
  const sourceHeight = sideways
    ? Math.max(0, finiteOr(imageWidth, 0))
    : Math.max(0, finiteOr(imageHeight, 0))
  const pad = clamp(finiteOr(padding, 12), 0, Math.min(width / 4, height / 4))
  const availableWidth = Math.max(0, width - pad * 2)
  const availableHeight = Math.max(0, height - pad * 2)
  const scale =
    sourceWidth > 0 && sourceHeight > 0
      ? Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight)
      : 0
  const w = sourceWidth * scale
  const h = sourceHeight * scale
  return {
    sourceWidth,
    sourceHeight,
    imageRect: { x: (width - w) / 2, y: (height - h) / 2, w, h },
  }
}

/** 把框限制在图片内；图片本身小于最小尺寸时按图片实际尺寸收口。 */
export const clampCropRect = (box: CropRect, imageRect: CropRect): CropRect => {
  const ix = finiteOr(imageRect.x, 0)
  const iy = finiteOr(imageRect.y, 0)
  const iw = Math.max(0, finiteOr(imageRect.w, 0))
  const ih = Math.max(0, finiteOr(imageRect.h, 0))
  if (iw === 0 || ih === 0) {
    return { x: ix, y: iy, w: 0, h: 0 }
  }
  const minW = Math.min(MIN_CROP_SIZE, iw)
  const minH = Math.min(MIN_CROP_SIZE, ih)
  const w = clamp(finiteOr(box.w, minW), minW, iw)
  const h = clamp(finiteOr(box.h, minH), minH, ih)
  return {
    x: clamp(finiteOr(box.x, ix), ix, ix + iw - w),
    y: clamp(finiteOr(box.y, iy), iy, iy + ih - h),
    w,
    h,
  }
}

/** 在图片内取指定比例的最大居中框。 */
export const fitCropAspect = (imageRect: CropRect, ratio: number): CropRect => {
  const bounds = clampCropRect(imageRect, imageRect)
  if (!Number.isFinite(ratio) || ratio <= 0 || bounds.w === 0 || bounds.h === 0) {
    return bounds
  }
  let w = bounds.w
  let h = w / ratio
  if (h > bounds.h) {
    h = bounds.h
    w = h * ratio
  }
  return {
    x: bounds.x + (bounds.w - w) / 2,
    y: bounds.y + (bounds.h - h) / 2,
    w,
    h,
  }
}

export const cropCornerAt = (
  point: CropPoint,
  rect: CropRect,
  radius = HANDLE_HIT_RADIUS
): CropCorner | null => {
  const hitRadius = Math.max(0, finiteOr(radius, HANDLE_HIT_RADIUS))
  const corners: [number, number, CropCorner][] = [
    [rect.x, rect.y, 0],
    [rect.x + rect.w, rect.y, 1],
    [rect.x + rect.w, rect.y + rect.h, 2],
    [rect.x, rect.y + rect.h, 3],
  ]
  let nearest: CropCorner | null = null
  let nearestDistance = hitRadius
  for (const [x, y, corner] of corners) {
    const distance = Math.hypot(point.x - x, point.y - y)
    if (distance <= nearestDistance) {
      nearest = corner
      nearestDistance = distance
    }
  }
  return nearest
}

export const pointInsideCrop = (point: CropPoint, rect: CropRect) =>
  point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h

/**
 * 拖动角柄时保持对角固定。指针越过对角时停在最小尺寸，不翻转选择框；
 * 锁定比例时同步约束宽高，并继续受图片边界和最小尺寸限制。
 */
export const resizeCropRect = (
  origin: CropRect,
  corner: CropCorner,
  point: CropPoint,
  imageRect: CropRect,
  aspectRatio?: number
): CropRect => {
  const bounds = clampCropRect(imageRect, imageRect)
  if (bounds.w === 0 || bounds.h === 0) {
    return bounds
  }
  const box = clampCropRect(origin, bounds)
  const leftMoving = corner === 0 || corner === 3
  const topMoving = corner === 0 || corner === 1
  const anchor = {
    x: leftMoving ? box.x + box.w : box.x,
    y: topMoving ? box.y + box.h : box.y,
  }
  const px = clamp(finiteOr(point.x, anchor.x), bounds.x, bounds.x + bounds.w)
  const py = clamp(finiteOr(point.y, anchor.y), bounds.y, bounds.y + bounds.h)
  const baseMinW = Math.min(MIN_CROP_SIZE, bounds.w)
  const baseMinH = Math.min(MIN_CROP_SIZE, bounds.h)
  const ratio =
    aspectRatio !== undefined && Number.isFinite(aspectRatio) && aspectRatio > 0
      ? aspectRatio
      : null
  let minW = ratio ? Math.max(baseMinW, baseMinH * ratio) : baseMinW
  let minH = ratio ? minW / ratio : baseMinH
  const maxW = leftMoving ? anchor.x - bounds.x : bounds.x + bounds.w - anchor.x
  const maxH = topMoving ? anchor.y - bounds.y : bounds.y + bounds.h - anchor.y
  if (ratio && (minW > maxW || minH > maxH)) {
    const fit = Math.min(maxW / minW, maxH / minH)
    minW *= fit
    minH *= fit
  }

  let w = Math.max(minW, Math.abs(px - anchor.x))
  let h = Math.max(minH, Math.abs(py - anchor.y))
  if (ratio) {
    if (w >= h * ratio) {
      h = w / ratio
    } else {
      w = h * ratio
    }
    const fit = Math.min(1, maxW / w, maxH / h)
    w *= fit
    h *= fit
    return {
      x: leftMoving ? anchor.x - w : anchor.x,
      y: topMoving ? anchor.y - h : anchor.y,
      w,
      h,
    }
  }
  w = Math.min(w, maxW)
  h = Math.min(h, maxH)

  return clampCropRect(
    {
      x: leftMoving ? anchor.x - w : anchor.x,
      y: topMoving ? anchor.y - h : anchor.y,
      w,
      h,
    },
    bounds
  )
}

/** 以图片中心缩放并平移；返回旋转后坐标系中的实际图片边界。 */
export const transformCropImage = (
  imageRect: CropRect,
  zoom: number,
  offset: CropPoint
): CropRect => {
  const bounds = clampCropRect(imageRect, imageRect)
  const scale = clamp(finiteOr(zoom, MIN_CROP_ZOOM), MIN_CROP_ZOOM, MAX_CROP_ZOOM)
  const centerX = bounds.x + bounds.w / 2
  const centerY = bounds.y + bounds.h / 2
  return {
    x: centerX + (bounds.x - centerX) * scale + finiteOr(offset.x, 0),
    y: centerY + (bounds.y - centerY) * scale + finiteOr(offset.y, 0),
    w: bounds.w * scale,
    h: bounds.h * scale,
  }
}

/** 限制平移，保证缩放后的图片始终覆盖裁剪框，不露出空白。 */
export const clampCropImageOffset = (
  imageRect: CropRect,
  cropRect: CropRect,
  offset: CropPoint
): CropPoint => {
  const selected = clampCropRect(cropRect, imageRect)
  const minX = selected.x + selected.w - imageRect.x - imageRect.w
  const maxX = selected.x - imageRect.x
  const minY = selected.y + selected.h - imageRect.y - imageRect.h
  const maxY = selected.y - imageRect.y
  return {
    x:
      minX <= maxX
        ? clamp(finiteOr(offset.x, 0), minX, maxX)
        : selected.x + selected.w / 2 - imageRect.x - imageRect.w / 2,
    y:
      minY <= maxY
        ? clamp(finiteOr(offset.y, 0), minY, maxY)
        : selected.y + selected.h / 2 - imageRect.y - imageRect.h / 2,
  }
}

/** 区域坐标转换为旋转后图片坐标系中的裁剪区域。 */
export const cropSourceRect = (
  imageRect: CropRect,
  selected: CropRect,
  imageWidth: number,
  imageHeight: number,
  rotation: number
) => {
  const sideways = normalizedRotation(rotation) % 180 !== 0
  const sourceWidth = sideways
    ? Math.max(0, finiteOr(imageHeight, 0))
    : Math.max(0, finiteOr(imageWidth, 0))
  const sourceHeight = sideways
    ? Math.max(0, finiteOr(imageWidth, 0))
    : Math.max(0, finiteOr(imageHeight, 0))
  const scale = sourceWidth > 0 ? imageRect.w / sourceWidth : 0
  const box = clampCropRect(selected, imageRect)
  return {
    sourceWidth,
    sourceHeight,
    sx: scale > 0 ? (box.x - imageRect.x) / scale : 0,
    sy: scale > 0 ? (box.y - imageRect.y) / scale : 0,
    sw: scale > 0 ? box.w / scale : 0,
    sh: scale > 0 ? box.h / scale : 0,
  }
}

export const cropOutputSize = (sourceWidth: number, sourceHeight: number) => {
  const width = Math.max(1, finiteOr(sourceWidth, 1))
  const height = Math.max(1, finiteOr(sourceHeight, 1))
  const dimensionScale = Math.min(1, MAX_OUTPUT_DIM / Math.max(width, height))
  const pixelScale = Math.sqrt(MAX_OUTPUT_PIXELS / (width * height))
  const scale = Math.min(dimensionScale, pixelScale)
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}
