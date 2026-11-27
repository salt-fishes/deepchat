const MIN_DISMISS_DISTANCE = 72
const MAX_DISMISS_DISTANCE = 140
const DISMISS_HEIGHT_RATIO = 0.25
const FLING_VELOCITY = 0.5
const MIN_FLING_DISTANCE = 24

export const shouldDismissSheet = (distance: number, velocity: number, height: number) => {
  const threshold = Math.min(
    MAX_DISMISS_DISTANCE,
    Math.max(MIN_DISMISS_DISTANCE, height * DISMISS_HEIGHT_RATIO)
  )
  return distance >= threshold || (distance >= MIN_FLING_DISTANCE && velocity >= FLING_VELOCITY)
}
