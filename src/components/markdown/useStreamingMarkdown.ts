import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const MIN_INTERVAL = 48
const MAX_INTERVAL = 120
const MAX_BACKLOG_TIME = 260
const CHARACTERS_PER_UPDATE = 48
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const graphemes = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter() : null

const revealChunk = (content: string, shownLength: number, size: number) => {
  const end = shownLength + size
  if (end >= content.length) {
    return content
  }
  const segment = graphemes?.segment(content).containing(end - 1)
  // 旧版 WebView 至少保留 UTF-16 代理对，避免显示半个表情。
  const safeEnd = segment
    ? segment.index + segment.segment.length
    : /[\uD800-\uDBFF]/.test(content[end - 1])
      ? end + 1
      : end
  return content.slice(0, safeEnd)
}

/** 只调节 Markdown 的显示节奏。结束或停止生成时直接展示完整内容。 */
export const useStreamingMarkdown = (content: string, streaming: boolean) => {
  const [output, setOutput] = useState(() =>
    streaming && !reducedMotion() ? revealChunk(content, 0, CHARACTERS_PER_UPDATE) : content
  )
  const latest = useRef(content)
  const shown = useRef(output)
  const timer = useRef<number | undefined>(undefined)
  const backlogSince = useRef<number | undefined>(undefined)
  const updatedAt = useRef(0)
  const renderStartedAt = useRef<number | undefined>(undefined)
  const interval = useRef(MIN_INTERVAL)

  useLayoutEffect(() => {
    shown.current = output
    if (renderStartedAt.current !== undefined) {
      const renderTime = performance.now() - renderStartedAt.current
      interval.current = Math.max(MIN_INTERVAL, Math.min(MAX_INTERVAL, renderTime * 2))
      renderStartedAt.current = undefined
    }
  }, [output])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  useLayoutEffect(() => {
    latest.current = content
    if (!streaming || !content.startsWith(output)) {
      window.clearTimeout(timer.current)
      timer.current = undefined
      backlogSince.current = undefined
      if (output !== content) {
        setOutput(content)
      }
      return
    }
    if (output === content || timer.current !== undefined) {
      return
    }

    const now = performance.now()
    backlogSince.current ??= now
    const nextUpdate = Math.min(
      updatedAt.current + interval.current,
      backlogSince.current + MAX_BACKLOG_TIME
    )
    const delay = Math.max(0, nextUpdate - now)
    timer.current = window.setTimeout(() => {
      timer.current = undefined
      const target = latest.current
      const previous = shown.current
      const time = performance.now()
      const wait = time - (backlogSince.current ?? time)
      const backlog = target.length - previous.length
      const size = Math.max(CHARACTERS_PER_UPDATE, Math.ceil(backlog / 3))
      const next =
        reducedMotion() || wait >= MAX_BACKLOG_TIME
          ? target
          : revealChunk(target, previous.length, size)
      if (next === target) {
        backlogSince.current = undefined
      }
      updatedAt.current = time
      renderStartedAt.current = time
      setOutput(next)
    }, delay)
  }, [content, output, streaming])

  return streaming && content.startsWith(output) ? output : content
}
