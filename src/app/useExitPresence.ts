import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** Keep the last surface visible during its CSS exit, but stop accepting input. */
export const useExitPresence = <T, E extends HTMLElement>(value: T | null, ref: RefObject<E | null>) => {
  const [last, setLast] = useState(value)
  const lastRef = useRef(last)
  lastRef.current = last
  const frameRef = useRef(0)
  const release = useCallback(() => {
    if (frameRef.current) {return}
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      if (useDismissed.current) {setLast(null)}
    })
  }, [])
  const useDismissed = useRef(false)
  useLayoutEffect(() => {
    if (value === null && last === null) {return}
    const element = ref.current
    if (element) {element.inert = value === null}
    if (value !== null) {
      useDismissed.current = false
      lastRef.current = value
      setLast(value)
      return
    }
    useDismissed.current = true
    if (lastRef.current === null) {return}
    const animations = element?.getAnimations() ?? []
    if (!animations.length) {setLast(null); return}
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(release)
    return release
  }, [last, ref, release, value])
  return value ?? last
}
