import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { scheduleIdle } from '../../app/idleWork.js'
import { scheduleMath } from './mathQueue.js'

const rendered = new Map<string, string>()
const limit = 600
const cache = (key: string, value: string) => {
  if (rendered.size >= limit) {
    const oldest = rendered.keys().next().value
    if (oldest !== undefined) {rendered.delete(oldest)}
  }
  rendered.delete(key)
  rendered.set(key, value)
}

let modulePromise: Promise<typeof import('./mathRender.js')> | undefined
const loadRenderer = () => (modulePromise ??= import('./mathRender.js'))

const useFormula = (input: string, isInline: boolean, stageRef: RefObject<HTMLSpanElement>, loading: boolean) => {
  const [renderer, setRenderer] = useState<Awaited<typeof import('./mathRender.js')> | null>(null)
  const [html, setHtml] = useState<string | null>(() => rendered.get(`${isInline}:${input}`) ?? null)
  const [visible, setVisible] = useState(true)

  useLayoutEffect(() => {
    const root = stageRef.current?.closest<HTMLElement>('[data-chat-scroll]')
    if (!root || !window.IntersectionObserver) {return}
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { root, rootMargin: '120px 0px' })
    if (stageRef.current) {observer.observe(stageRef.current)}
    return () => observer.disconnect()
  }, [stageRef])

  useEffect(() => {
    let active = true
    void loadRenderer().then((module) => { if (active) {setRenderer(module)} }, () => {})
    return () => {active = false}
  }, [])

  useEffect(() => {
    setHtml(rendered.get(`${isInline}:${input}`) ?? null)
    if (!renderer || !visible) {return}
    const key = `${isInline}:${input}`
    if (rendered.has(key)) {return}
    let active = true
    let cancelMath = () => {}
    let cancelIdle = () => {}
    const render = () => {
      if (!active) {return}
      cancelMath = scheduleMath(async () => {
        if (!active) {return}
        const value = await renderer.render(input, isInline)
        if (value === null) {if (active) {setHtml(null)}; return}
        cache(key, value)
        if (active) {setHtml(value)}
      })
    }
    if (loading) {cancelIdle = scheduleIdle(render)}
    else {render()}
    return () => {active = false; cancelMath(); cancelIdle()}
  }, [input, isInline, loading, renderer, visible])

  return useMemo(() => renderer && html !== null
    ? { html, rendered: true }
    : { html: input, rendered: false }, [html, input, renderer])
}

export const MathBlock = memo(function MathBlock({ value, loading = true }: { value: string; loading?: boolean }) {
  const stageRef = useRef<HTMLSpanElement>(null)
  const { html, rendered } = useFormula(value, false, stageRef, loading)
  return rendered
    ? <span ref={stageRef} className="katex-display ds-markdown-math"><span className="katex" dangerouslySetInnerHTML={{ __html: html }}></span></span>
    : <span ref={stageRef}><p className="ds-markdown-paragraph">{html}</p></span>
})

export const InlineMath = memo(function InlineMath({ value, loading = true }: { value: string; loading?: boolean }) {
  const stageRef = useRef<HTMLSpanElement>(null)
  const { html, rendered } = useFormula(value, true, stageRef, loading)
  return rendered
    ? <span ref={stageRef} className="katex" dangerouslySetInnerHTML={{ __html: html }}></span>
    : <span ref={stageRef}>{html}</span>
})
