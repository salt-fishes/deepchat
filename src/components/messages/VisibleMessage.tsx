import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

/** Mount heavy message bodies near the scrollport. Keep visited bodies mounted so
 * selection, editing and measured heights survive scrolling away and back. */
export const VisibleMessage = ({ eager, height, children }: {
  eager: boolean
  height: number
  children: ReactNode
}) => {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(eager)
  const mounted = eager || seen
  useLayoutEffect(() => {
    if (mounted) {
      if (!seen) {setSeen(true)}
      return
    }
    const element = ref.current
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
  }, [mounted, seen])

  return mounted ? <>{children}</> : <div ref={ref} style={{ height }} aria-hidden="true" />
}
