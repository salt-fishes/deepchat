import { useLayoutEffect, useState, type ReactNode } from 'react'
import { ActiveTurnProvider } from '../markdown/RenderBudget.js'

/** Mount heavy message bodies near the scrollport. Keep visited bodies mounted so
 * selection, editing and measured heights survive scrolling away and back. */
export const VisibleMessage = ({ eager, height, children }: {
  eager: boolean
  height: number
  children: ReactNode
}) => {
  const [seen, setSeen] = useState(eager)
  const mounted = eager || seen
  const [mountedRef] = useState(() => ({ current: null as HTMLDivElement | null }))
  useLayoutEffect(() => {
    if (eager) {return}
    const element = mountedRef.current
    const root = element?.closest<HTMLElement>('[data-chat-scroll]')
    if (!element || !root || !window.IntersectionObserver) {
      setSeen(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {setSeen(true)}
    }, { root, rootMargin: '340px 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [mounted, eager, seen, mountedRef])

  return mounted ? <ActiveTurnProvider value={eager}>{children}</ActiveTurnProvider> : <div ref={mountedRef} style={{ height }} aria-hidden="true" />
}
