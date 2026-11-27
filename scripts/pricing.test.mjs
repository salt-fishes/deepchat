import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CONTEXT_WINDOW_TOKENS,
  estimateMessageCost,
  getBeijingTime,
  getPricingPeriod,
  MODEL_PRICING,
} from '../src/services/pricing.ts'

const usage = {
  input_tokens: 100_000,
  cache_creation_input_tokens: 50_000,
  cache_read_input_tokens: 500_000,
  output_tokens: 25_000,
}

const closeTo = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`)

test('Beijing peak boundaries use UTC+8 and weekday rules', () => {
  assert.equal(getPricingPeriod(Date.UTC(2026, 10, 2, 1, 0)), 'peak') // Monday 09:00
  assert.equal(getPricingPeriod(Date.UTC(2026, 10, 2, 3, 59)), 'peak') // Monday 11:59
  assert.equal(getPricingPeriod(Date.UTC(2026, 10, 2, 4, 0)), 'offPeak') // Monday 12:00
  assert.equal(getPricingPeriod(Date.UTC(2026, 10, 2, 5, 59)), 'offPeak') // Monday 13:59
  assert.equal(getPricingPeriod(Date.UTC(2026, 10, 2, 6, 0)), 'peak') // Monday 14:00
  assert.equal(getPricingPeriod(Date.UTC(2026, 10, 2, 9, 59)), 'peak') // Monday 17:59
  assert.equal(getPricingPeriod(Date.UTC(2026, 10, 2, 10, 0)), 'offPeak') // Monday 18:00
  assert.equal(getPricingPeriod(Date.UTC(2026, 10, 1, 6, 0)), 'offPeak') // Sunday 14:00
  assert.equal(
    getBeijingTime(Date.UTC(2026, 10, 2, 1, 0)).toISOString(),
    '2026-11-02T09:00:00.000Z'
  )
})

test('published Flash and V4 Pro rates match the official table', () => {
  assert.deepEqual(MODEL_PRICING['deepseek-flash'], {
    peak: { cacheHit: 0.04, cacheMiss: 2, output: 8 },
    offPeak: { cacheHit: 0.02, cacheMiss: 1, output: 4 },
  })
  assert.deepEqual(MODEL_PRICING['deepseek-v4-pro'], {
    peak: { cacheHit: 0.3, cacheMiss: 9, output: 27 },
    offPeak: { cacheHit: 0.15, cacheMiss: 4.5, output: 13.5 },
  })
})

test('Flash peak estimate combines cache creation with cache misses', () => {
  const estimate = estimateMessageCost({
    model: 'deepseek-flash',
    usage,
    createdAt: Date.UTC(2026, 10, 2, 1, 0),
  })
  assert.ok(estimate)
  assert.equal(estimate.period, 'peak')
  assert.equal(estimate.cacheMiss.tokens, 150_000)
  closeTo(estimate.cacheMiss.amount, 0.3)
  assert.equal(estimate.cacheHit.tokens, 500_000)
  closeTo(estimate.cacheHit.amount, 0.02)
  closeTo(estimate.output.amount, 0.2)
  closeTo(estimate.totalAmount, 0.52)
  assert.equal(estimate.contextTokens, 675_000)
  closeTo(estimate.contextPercent, 67.5)
})

test('off-peak rates halve the Flash peak estimate', () => {
  const estimate = estimateMessageCost({
    model: 'deepseek-flash',
    usage,
    createdAt: Date.UTC(2026, 10, 2, 4, 0),
  })
  assert.ok(estimate)
  assert.equal(estimate.period, 'offPeak')
  closeTo(estimate.totalAmount, 0.26)
})

test('V4 Pro uses its own rates and context is capped at the 1M window', () => {
  const estimate = estimateMessageCost({
    model: 'deepseek-v4-pro',
    usage: { ...usage, input_tokens: 900_000, cache_creation_input_tokens: 200_000 },
    createdAt: Date.UTC(2026, 10, 2, 1, 0),
  })
  assert.ok(estimate)
  closeTo(estimate.cacheMiss.amount, 9.9)
  closeTo(estimate.cacheHit.amount, 0.15)
  closeTo(estimate.output.amount, 0.675)
  closeTo(estimate.totalAmount, 10.725)
  assert.equal(estimate.contextTokens, 1_625_000)
  assert.equal(estimate.contextPercent, 100)
  assert.equal(CONTEXT_WINDOW_TOKENS, 1_000_000)
})

test('zero cache hits remain measurable and missing model/usage is unavailable', () => {
  const estimate = estimateMessageCost({
    model: 'deepseek-flash',
    usage: { ...usage, cache_read_input_tokens: 0 },
    createdAt: Date.UTC(2026, 10, 2, 1, 0),
  })
  assert.ok(estimate)
  assert.equal(estimate.cacheHit.tokens, 0)
  assert.equal(estimate.cacheHit.amount, 0)
  assert.equal(estimateMessageCost({ model: null, usage, createdAt: Date.now() }), null)
  assert.equal(
    estimateMessageCost({ model: 'deepseek-flash', usage: undefined, createdAt: Date.now() }),
    null
  )
})
