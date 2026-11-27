import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** Keep the last surface visible during its CSS exit, but stop accepting input. */
export const useExitPresence = <T, E extends HTMLElement>(
  value: T | null,
  ref: RefObject<E | null>
) => {
  const [last, setLast] = useState(value)
  const lastRef = useRef(last)
  const frameRef = useRef(0)
  const generationRef = useRef(0)
  const dismissedRef = useRef(false)

  const release = useCallback((generation: number) => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current)
    }
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0
      if (dismissedRef.current && generationRef.current === generation) {
        lastRef.current = null
        setLast(null)
      }
    })
  }, [])

  useLayoutEffect(() => {
    const generation = ++generationRef.current
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = 0
    }
    if (value === null && last === null) {
      return
    }
    const element = ref.current
    if (element) {
      element.inert = value === null
    }
    if (value !== null) {
      dismissedRef.current = false
      lastRef.current = value
      setLast(value)
      return
    }
    dismissedRef.current = true
    if (lastRef.current === null) {
      return
    }
    const animations = element?.getAnimations?.() ?? []
    if (animations.length === 0) {
      lastRef.current = null
      setLast(null)
      return
    }
    let active = true
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (active) {
        release(generation)
      }
    })
    return () => {
      active = false
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = 0
      }
    }
  }, [last, ref, release, value])
  return value ?? last
}
