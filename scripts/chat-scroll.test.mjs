import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  shouldFollowAfterScroll,
  STICKY_THRESHOLD,
} from '../src/components/messages/scrollPolicy.ts'

test('scrolling to the bottom does not reattach during streaming', () => {
  assert.equal(shouldFollowAfterScroll(true, 0), false)
  assert.equal(shouldFollowAfterScroll(true, STICKY_THRESHOLD - 1), false)
})

test('an idle list reattaches only near the bottom', () => {
  assert.equal(shouldFollowAfterScroll(false, 0), true)
  assert.equal(shouldFollowAfterScroll(false, STICKY_THRESHOLD - 1), true)
  assert.equal(shouldFollowAfterScroll(false, STICKY_THRESHOLD), false)
  assert.equal(shouldFollowAfterScroll(false, STICKY_THRESHOLD + 1), false)
})
