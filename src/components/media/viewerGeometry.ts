export type ViewerPoint = { x: number; y: number }

export const MIN_VIEWER_ZOOM = 1
export const MAX_VIEWER_ZOOM = 4
export const VIEWER_SWIPE_RATIO = 0.18
export const VIEWER_SWIPE_VELOCITY = 0.45

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const finiteOr = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback)

/** Keep a zoomed image covering the stage; at fit scale the offset is always zero. */
export const clampViewerOffset = (
  offset: ViewerPoint,
  scale: number,
  contentWidth: number,
  contentHeight: number,
  stageWidth: number,
  stageHeight: number
): ViewerPoint => {
  const zoom = Math.max(MIN_VIEWER_ZOOM, finiteOr(scale, MIN_VIEWER_ZOOM))
  const maxX = Math.max(0, (Math.max(0, contentWidth) * zoom - Math.max(0, stageWidth)) / 2)
  const maxY = Math.max(0, (Math.max(0, contentHeight) * zoom - Math.max(0, stageHeight)) / 2)
  return {
    x: clamp(finiteOr(offset.x, 0), -maxX, maxX) || 0,
    y: clamp(finiteOr(offset.y, 0), -maxY, maxY) || 0,
  }
}

/**
 * Offset that keeps the content point under `point` fixed while scaling from
 * `scale` to `nextScale`. Points are relative to the stage center.
 */
export const zoomViewerAt = (
  point: ViewerPoint,
  offset: ViewerPoint,
  scale: number,
  nextScale: number
): ViewerPoint => {
  const current = Math.max(MIN_VIEWER_ZOOM, finiteOr(scale, MIN_VIEWER_ZOOM))
  const next = clamp(finiteOr(nextScale, current), MIN_VIEWER_ZOOM, MAX_VIEWER_ZOOM)
  const ratio = next / current
  return {
    x: point.x - (point.x - finiteOr(offset.x, 0)) * ratio,
    y: point.y - (point.y - finiteOr(offset.y, 0)) * ratio,
  }
}

/** Pinch zoom around the current midpoint of two pointers. */
export const pinchViewer = (
  startCenter: ViewerPoint,
  center: ViewerPoint,
  startOffset: ViewerPoint,
  startScale: number,
  distanceRatio: number
) => {
  const scale = clamp(
    finiteOr(startScale, MIN_VIEWER_ZOOM) * finiteOr(distanceRatio, 1),
    MIN_VIEWER_ZOOM,
    MAX_VIEWER_ZOOM
  )
  const anchor = {
    x:
      (startCenter.x - finiteOr(startOffset.x, 0)) /
      Math.max(MIN_VIEWER_ZOOM, finiteOr(startScale, MIN_VIEWER_ZOOM)),
    y:
      (startCenter.y - finiteOr(startOffset.y, 0)) /
      Math.max(MIN_VIEWER_ZOOM, finiteOr(startScale, MIN_VIEWER_ZOOM)),
  }
  return {
    scale,
    offset: {
      x: center.x - scale * anchor.x,
      y: center.y - scale * anchor.y,
    },
  }
}

/** A horizontal release either advances one image or snaps back. */
export const resolveViewerSwipe = (
  dx: number,
  velocity: number,
  index: number,
  count: number,
  width: number
) => {
  if (count < 2) {
    return index
  }
  const distance = Math.abs(finiteOr(dx, 0))
  const speed = Math.abs(finiteOr(velocity, 0))
  const flung = distance >= 12 && speed >= VIEWER_SWIPE_VELOCITY
  if (!flung && distance < Math.max(24, width * VIEWER_SWIPE_RATIO)) {
    return index
  }
  const direction = dx < 0 ? 1 : -1
  const next = index + direction
  return next < 0 || next >= count ? index : next
}
