import { ensureKatex, type Katex } from '../../services/markdown/katex.js'

const wrapper = {
  inline: ['<span class="katex">', '</span>'],
  display: ['<span class="katex-display"><span class="katex">', '</span></span>'],
} as const

let ready: Promise<Katex> | null = null
const load = () => (ready ??= Promise.resolve(ensureKatex()).then((value) => value instanceof Promise ? value : Promise.resolve(value)))

export const render = async (input: string, isInline: boolean): Promise<string | null> => {
  const katex = await load()
  try {
    const [prefix, suffix] = wrapper[isInline ? 'inline' : 'display']
    return katex.renderToString(input, { throwOnError: true, strict: false, displayMode: !isInline })
      .slice(prefix.length, -suffix.length)
  } catch {
    return null
  }
}
