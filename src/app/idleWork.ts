/** Work that is safe to postpone until after the current input or scroll event. */
const idle = window as typeof window & {
  requestIdleCallback?: (callback: () => void, options: { timeout: number }) => number
  cancelIdleCallback?: (id: number) => void
}
export const scheduleIdle = (work: () => void): (() => void) => {
  if (idle.requestIdleCallback) {
    const id = idle.requestIdleCallback(work, { timeout: 400 })
    return () => idle.cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(work, 32)
  return () => window.clearTimeout(id)
}

/** Run at most one chunk per frame so a burst of newly visible messages cannot monopolize input. */
export const scheduleFrame = (work: () => void): (() => void) => {
  const id = window.requestAnimationFrame(() => window.setTimeout(work, 0))
  return () => {
    window.cancelAnimationFrame(id)
    window.clearTimeout(id)
  }
}
