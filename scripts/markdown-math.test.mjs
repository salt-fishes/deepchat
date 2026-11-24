import assert from 'node:assert/strict'
import { test } from 'node:test'
import katex from 'katex'
import 'katex/contrib/mhchem'
import { toMdAst } from '../src/services/markdown/parse.ts'

const cases = [
  ['inline dollar', '$x^2$', 'inlineMath'],
  ['display dollar', '$$\n\\begin{aligned}x &= 1 \\\\ y &= 2\\end{aligned}\n$$', 'math'],
  ['inline parentheses', String.raw`\(\frac{1}{2}\)`, 'inlineMath'],
  ['display brackets', '\\[\n\\sqrt{2}\n\\]', 'math'],
  ['chemistry', String.raw`$\ce{H2O}$`, 'inlineMath'],
]

for (const [name, source, type] of cases) {
  test(`renders ${name}`, () => {
    const block = toMdAst(source, { sources: undefined, disableLink: false }).children[0]
    const node = block.type === 'paragraph' ? block.children[0] : block
    assert.equal(node.type, type)
    assert.match(katex.renderToString(node.value, { throwOnError: true, displayMode: type === 'math' }), /class="katex/)
  })
}
