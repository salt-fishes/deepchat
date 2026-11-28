import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stripSafetyBlocks, stripSafetyText } from '../src/services/chat/reply.ts'

test('safety check blocks are removed from the visible answer', () => {
  const answer = '黎曼猜想目前还没有证明。\n\n'
  const raw = `${answer}<ds_safety>[用户未成年]否\n[分类]其他\n[判定]正常学术讨论\n[规则]无</ds_safety>`
  assert.equal(stripSafetyText(raw), answer)
})

test('a block that only contains safety metadata becomes empty', () => {
  assert.equal(stripSafetyText('\n\n<ds_safety>[分类]其他</ds_safety>'), '')
})

test('a streaming half block is hidden until it closes', () => {
  assert.equal(stripSafetyText('答案\n\n<ds_safety>[用户未成年'), '答案\n\n')
  assert.equal(stripSafetyText('<ds_safety>'), '')
})

test('a stray closing tag is removed and normal text is untouched', () => {
  assert.equal(stripSafetyText('答案</ds_safety>'), '答案')
  assert.equal(stripSafetyText('普通 <b>文本</b> 和 <ds_other> 标签'), '普通 <b>文本</b> 和 <ds_other> 标签')
})

test('settling a reply drops safety-only blocks and keeps the answer', () => {
  assert.deepEqual(
    stripSafetyBlocks([{ type: 'text', text: '答案\n\n<ds_safety>[分类]其他</ds_safety>' }]),
    [{ type: 'text', text: '答案\n\n' }]
  )
  assert.deepEqual(stripSafetyBlocks([{ type: 'text', text: '<ds_safety>[分类]其他</ds_safety>' }]), [])
})
