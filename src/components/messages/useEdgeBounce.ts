import { useEffect, type RefObject } from 'react'

/** Leave normal scrolling to the browser; only take over an outward drag at an edge. */
export const useEdgeBounce = (ref: RefObject<HTMLDivElement>, enabled: boolean, sessionId: string) => {
  useEffect(() => {
    const scroll = ref.current
    if (!enabled || !scroll) {return}
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let gesture: { x: number; y: number; previousY: number; edge: number; distance: number } | null = null
    let offset = 0
    let spring: Animation | undefined
    const release = () => {
      gesture = null
      if (!offset) {return}
      spring?.cancel()
      if (!reduceMotion.matches) {
        spring = scroll.animate(
          [{ translate: `0 ${offset}px` }, { translate: '0 0' }],
          { duration: 180, easing: 'cubic-bezier(.18,.7,.32,1)' },
        )
      }
      offset = 0
      scroll.style.removeProperty('translate')
    }
    const start = (event: TouchEvent) => {
      release()
      if (event.touches.length !== 1 || reduceMotion.matches || !(event.target instanceof Element)) {return}
      // Keep long-press selection and nested code/table scrollers native.
      if (event.target.closest('input, textarea, [contenteditable], pre, table') || window.getSelection()?.type === 'Range') {return}
      const { clientX: x, clientY: y } = event.touches[0]
      gesture = { x, y, previousY: y, edge: 0, distance: 0 }
    }
    const move = (event: TouchEvent) => {
      if (!gesture || event.touches.length !== 1 || reduceMotion.matches) {
        release()
        return
      }
      const { clientX, clientY } = event.touches[0]
      const delta = clientY - gesture.previousY
      gesture.previousY = clientY
      if (!gesture.edge) {
        const dx = Math.abs(clientX - gesture.x)
        const dy = Math.abs(clientY - gesture.y)
        if (dx > 8 && dx >= dy) { gesture = null; return }
        if (dy < 7 || !delta) {return}
        if (delta > 0 && scroll.scrollTop <= 1) {gesture.edge = 1}
        else if (delta < 0 && scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop <= 1) {gesture.edge = -1}
        else {return}
        spring?.cancel()
      }
      // Once the browser owns the scroll, events can be non-cancelable. Native
      // overscroll is disabled, so we can still paint a stretch at the limit.
      if (event.cancelable) {event.preventDefault()}
      gesture.distance = Math.max(0, gesture.distance + delta * gesture.edge)
      offset = gesture.edge * 22 * (1 - Math.exp(-gesture.distance / 125))
      scroll.style.translate = `0 ${offset}px`
    }
    scroll.addEventListener('touchstart', start, { passive: true })
    scroll.addEventListener('touchmove', move, { passive: false })
    scroll.addEventListener('touchend', release)
    scroll.addEventListener('touchcancel', release)
    reduceMotion.addEventListener('change', release)
    return () => {
      scroll.removeEventListener('touchstart', start)
      scroll.removeEventListener('touchmove', move)
      scroll.removeEventListener('touchend', release)
      scroll.removeEventListener('touchcancel', release)
      reduceMotion.removeEventListener('change', release)
      spring?.cancel()
      scroll.style.removeProperty('translate')
    }
  }, [enabled, ref, sessionId])
}
