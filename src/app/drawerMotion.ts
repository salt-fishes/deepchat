export const DRAWER_COMMIT_PROGRESS = 0.26
export const DRAWER_FLING_VELOCITY = 0.35
const MIN_RECENT_TRAVEL = 14

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** Keep the familiar distance threshold, but use the latest samples for a fling. */
export const resolveDrawerTarget = (
  progress: number,
  startedOpen: boolean,
  velocity: number,
  recentTravel: number
) => {
  const flung =
    recentTravel >= MIN_RECENT_TRAVEL &&
    (startedOpen ? velocity <= -DRAWER_FLING_VELOCITY : velocity >= DRAWER_FLING_VELOCITY)
  if (startedOpen) {
    return !(progress <= 1 - DRAWER_COMMIT_PROGRESS || flung)
  }
  return progress >= DRAWER_COMMIT_PROGRESS || flung
}

/** Remaining distance dominates; a fast flick finishes sooner without overshoot. */
export const getDrawerMotion = (
  progress: number,
  targetOpen: boolean,
  velocity: number,
  width: number
) => {
  const target = targetOpen ? 1 : 0
  const distance = Math.abs(target - progress) * width
  // Keep the release responsive: the sheet should continue the finger's
  // movement immediately, not ease in from a dead stop.
  const duration = Math.round(clamp(230 + distance * 0.18 - Math.abs(velocity) * 130, 140, 280))
  return { duration, easing: targetOpen ? 'enter' : 'exit' } as const
}
