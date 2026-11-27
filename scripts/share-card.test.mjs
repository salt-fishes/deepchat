import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  SHARE_CARD_BODY_MAX_HEIGHT,
  SHARE_CARD_MAX_HEIGHT,
  SHARE_CARD_MAX_TEXT_LENGTH,
  fitShareCardLines,
  formatShareCardDate,
  getShareCardHeight,
  normalizeShareCardText,
  wrapShareCardLines,
} from '../src/services/shareCard.ts'

const measure = (value) => Array.from(value).length * 10

test('share card text removes Markdown decoration but keeps content and paragraphs', () => {
  const normalized = normalizeShareCardText(
    '# 标题\n\n**重点**与[链接](https://example.com)以及![图片](image.png)[citation:2]\n\n- 第一项\n- 第二项\n\n`代码`'
  )
  assert.equal(normalized, '标题\n\n重点与链接以及图片\n\n• 第一项\n• 第二项\n\n代码')
})

test('share card text limits Unicode characters with an ellipsis', () => {
  const normalized = normalizeShareCardText('😀'.repeat(20), 8)
  assert.equal(normalized, '😀'.repeat(7) + '…')
  assert.ok(
    Array.from(normalizeShareCardText('字'.repeat(SHARE_CARD_MAX_TEXT_LENGTH + 20))).length <=
      SHARE_CARD_MAX_TEXT_LENGTH
  )
})

test('wrapping handles Chinese characters, English words, blank lines and long tokens', () => {
  assert.deepEqual(wrapShareCardLines('一二三四五', 30, measure), ['一二三', '四五'])
  assert.deepEqual(wrapShareCardLines('alpha beta\ngamma', 70, measure), ['alpha', 'beta', 'gamma'])
  assert.deepEqual(wrapShareCardLines('abcdefghij', 30, measure), ['abc', 'def', 'ghi', 'j'])
  assert.deepEqual(wrapShareCardLines('甲\n\n乙', 100, measure), ['甲', '', '乙'])
})

test('height fitting truncates and reserves room for the ellipsis', () => {
  const result = fitShareCardLines({
    lines: ['一二三', '四五六', '七八九'],
    maxHeight: 50,
    lineHeight: 25,
    maxWidth: 30,
    measure,
  })
  assert.deepEqual(result, { lines: ['一二三', '四五…'], truncated: true })
  const short = fitShareCardLines({
    lines: ['一二三'],
    maxHeight: 50,
    lineHeight: 25,
    maxWidth: 30,
    measure,
  })
  assert.deepEqual(short, { lines: ['一二三'], truncated: false })
})

test('card height shrinks with content and never exceeds the maximum', () => {
  assert.equal(getShareCardHeight(1), 720)
  assert.ok(getShareCardHeight(10) > getShareCardHeight(1))
  assert.equal(getShareCardHeight(10_000), SHARE_CARD_MAX_HEIGHT)
  assert.ok(SHARE_CARD_BODY_MAX_HEIGHT < SHARE_CARD_MAX_HEIGHT)
})

test('excerpt date is stable in Beijing time', () => {
  assert.equal(formatShareCardDate(Date.UTC(2026, 10, 2, 16, 30)), '2026-11-03')
  assert.equal(formatShareCardDate(Date.UTC(2026, 10, 2, 15, 59)), '2026-11-02')
})
