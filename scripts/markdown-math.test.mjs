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

test('renders bold adjacent to Chinese punctuation', () => {
  const paragraph = toMdAst('这是关于名为**《天枢曲》**的作品', {
    sources: undefined,
    disableLink: false,
  }).children[0]
  assert.equal(paragraph.type, 'paragraph')
  if (paragraph.type !== 'paragraph') return
  assert.deepEqual(paragraph.children.map((node) => node.type), ['text', 'strong', 'text'])
  const strong = paragraph.children[1]
  assert.equal(strong.type, 'strong')
  if (strong.type === 'strong') {
    assert.equal(strong.children[0].type, 'text')
    if (strong.children[0].type === 'text') {
      assert.equal(strong.children[0].value, '《天枢曲》')
    }
  }
})

test('keeps escaped bold and inline code literal', () => {
  const escaped = toMdAst(String.raw`名为\*\*《天枢曲》\*\*的作品`, {
    sources: undefined,
    disableLink: false,
  }).children[0]
  assert.equal(escaped.type, 'paragraph')
  if (escaped.type === 'paragraph') {
    assert.equal(escaped.children[0].type, 'text')
    if (escaped.children[0].type === 'text') {
      assert.equal(escaped.children[0].value, '名为**《天枢曲》**的作品')
    }
  }
  const code = toMdAst('`**《天枢曲》**`', { sources: undefined, disableLink: false }).children[0]
  assert.equal(code.type, 'paragraph')
  if (code.type === 'paragraph') {
    assert.equal(code.children[0].type, 'inlineCode')
  }
})
