type Mermaid = typeof import('mermaid').default

let mermaidPromise: Promise<Mermaid> | null = null
let renderQueue = Promise.resolve()
let nextId = 0
let nextDiagramAt = 0
const rendered = new Map<string, string>()

const loadMermaid = () => {
  mermaidPromise ??= import('mermaid')
    .then((module) => module.default)
    .catch((error: unknown) => {
      mermaidPromise = null
      throw error
    })
  return mermaidPromise
}

const sanitizeMermaid = (code: string) => code.replace(/<((?:img|image)\s+)/gi, '&lt;$1')

/** Serial rendering keeps Mermaid's global state safe. Cached SVGs never enter the queue again. */
export const renderMermaid = (
  code: string,
  dark: boolean,
  isCancelled: () => boolean
): Promise<string | null> => {
  const key = `${dark}:${code}`
  const cached = rendered.get(key)
  if (cached) {return Promise.resolve(cached)}
  const result = renderQueue.then(async () => {
    if (isCancelled() || !code.trim()) {return null}
    if (nextDiagramAt > performance.now()) {
      await new Promise<void>((resolve) => setTimeout(resolve, nextDiagramAt - performance.now()))
    }
    if (isCancelled()) {return null}
    const mermaid = await loadMermaid()
    if (isCancelled()) {return null}
    mermaid.initialize({
      theme: dark ? 'dark' : 'default',
      securityLevel: 'strict',
      startOnLoad: false,
      suppressErrorRendering: true,
    })
    const { svg } = await mermaid.render(`standalone-mermaid-${nextId++}`, sanitizeMermaid(code))
    nextDiagramAt = performance.now() + 50
    if (rendered.size >= 24) {
      const oldest = rendered.keys().next().value
      if (oldest !== undefined) {rendered.delete(oldest)}
    }
    rendered.set(key, svg)
    return svg
  })
  renderQueue = result.then(() => {}, () => {})
  return result
}
