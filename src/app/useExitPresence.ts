import { useLayoutEffect, useState, type RefObject } from 'react'

/** Keep the last surface visible during its CSS exit, but stop accepting input. */
export const useExitPresence = <T, E extends HTMLElement>(value: T | null, ref: RefObject<E>) => {
  const [last, setLast] = useState(value)
  useLayoutEffect(() => {
    const element = ref.current
    if (element) {
      element.inert = value === null
    }
    if (value !== null) {
      setLast(value)
      return
    }
    if (last === null) {
      return
    }
    const animations = element?.getAnimations() ?? []
    if (!animations.length) {
      setLast(null)
      return
    }
    let active = true
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (active) {
        setLast(null)
      }
    })
    return () => { active = false }
  }, [last, ref, value])
  return value ?? last
}
