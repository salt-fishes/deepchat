import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  FONT_SIZE_OFFSETS,
  FONT_SIZE_STANDARD_STEP,
  FONT_SIZE_STEPS,
  chatFontOffset,
  chatFontSizeAtStep,
  clampFontSizeStep,
  fontSizeStep,
  isChatFontSize,
  normalizeChatFontSize,
  normalizeSystemFontScale,
} from '../src/services/settingsModel.ts'
import {
  buildUsageTrend,
  normalizeUsageTrend,
  summarizeUsageAverage,
  usageTrendLabelIndexes,
} from '../src/components/settings/usageModel.ts'

test('five font steps keep standard in the middle and preserve every legacy offset', () => {
  assert.equal(FONT_SIZE_STEPS.length, 5)
  assert.equal(FONT_SIZE_STEPS[FONT_SIZE_STANDARD_STEP], 'default')
  assert.deepEqual(FONT_SIZE_OFFSETS, [-4, -2, 0, 2, 4])
  assert.deepEqual(
    ['small', 'default', 'large', 'extraLarge'].map((size) => chatFontOffset[size]),
    [-2, 0, 2, 4]
  )
})

test('legacy stored values remain valid without rewriting or migrating them', () => {
  for (const size of ['small', 'default', 'large', 'extraLarge']) {
    assert.equal(isChatFontSize(size), true)
    assert.equal(normalizeChatFontSize(size), size)
    assert.equal(chatFontSizeAtStep(fontSizeStep(size)), size)
  }
})

test('unknown stored font values fall back to standard', () => {
  for (const value of [null, undefined, '', 'medium', 16, {}]) {
    assert.equal(normalizeChatFontSize(value), 'default')
  }
})

test('slider steps clamp to the five supported positions', () => {
  assert.deepEqual([-10, 0, 1, 2, 3, 4, 10].map(chatFontSizeAtStep), [
    'extraSmall',
    'extraSmall',
    'small',
    'default',
    'large',
    'extraLarge',
    'extraLarge',
  ])
  assert.equal(clampFontSizeStep(2.9), 2)
  assert.equal(clampFontSizeStep(Number.NaN), FONT_SIZE_STANDARD_STEP)
  assert.equal(clampFontSizeStep(Number.POSITIVE_INFINITY), FONT_SIZE_STANDARD_STEP)
})

test('system font scale accepts positive finite values and otherwise falls back to one', () => {
  assert.equal(normalizeSystemFontScale(1), 1)
  assert.equal(normalizeSystemFontScale(1.35), 1.35)
  assert.equal(normalizeSystemFontScale(2), 2)
  for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(normalizeSystemFontScale(value), 1)
  }
})

const usageTotals = (patch = {}) => ({
  requests: 0,
  input: 0,
  output: 0,
  missingInput: 0,
  missingOutput: 0,
  ...patch,
})

test('usage trend fills missing dates in chronological order and normalizes to the period maximum', () => {
  const trend = buildUsageTrend(
    [
      { date: '2026-11-27', ...usageTotals({ requests: 4, input: 40, output: 10 }) },
      { date: '2026-11-25', ...usageTotals({ requests: 2, input: 20, output: 5 }) },
    ],
    3,
    new Date(2026, 10, 27, 12)
  )

  assert.deepEqual(
    trend.map((row) => row.date),
    ['2026-11-25', '2026-11-26', '2026-11-27']
  )
  assert.deepEqual(
    trend.map((row) => row.requests),
    [2, 0, 4]
  )
  assert.deepEqual(
    trend.map((row) => row.height),
    [50, 0, 100]
  )
})

test('an all-zero usage interval keeps every bar at zero height', () => {
  const rows = [
    { date: '2026-11-26', ...usageTotals() },
    { date: '2026-11-27', ...usageTotals() },
  ]
  assert.deepEqual(
    normalizeUsageTrend(rows).map((row) => row.height),
    [0, 0]
  )
})

test('average tokens per request is shown only when both token series are complete', () => {
  const average = summarizeUsageAverage(
    usageTotals({
      requests: 4,
      input: 400,
      output: 100,
    })
  )
  assert.equal(average.kind, 'complete')
  assert.equal(average.value, 125)
})

test('partial token data never produces a fabricated complete average', () => {
  const average = summarizeUsageAverage(
    usageTotals({
      requests: 4,
      input: 400,
      output: 100,
      missingInput: 1,
      missingOutput: 2,
    })
  )
  assert.equal(average.kind, 'partial')
  assert.equal(average.value, null)
  assert.equal(average.missingInput, 1)
  assert.equal(average.missingOutput, 2)
})

test('empty and fully unrecorded usage have distinct non-numeric average states', () => {
  assert.equal(summarizeUsageAverage(usageTotals()).kind, 'empty')
  const unrecorded = summarizeUsageAverage(
    usageTotals({
      requests: 3,
      missingInput: 3,
      missingOutput: 3,
    })
  )
  assert.equal(unrecorded.kind, 'unrecorded')
  assert.equal(unrecorded.value, null)
})

test('trend axis labels stay sparse and unique for short and long periods', () => {
  assert.deepEqual(usageTrendLabelIndexes(0), [])
  assert.deepEqual(usageTrendLabelIndexes(1), [0])
  assert.deepEqual(usageTrendLabelIndexes(7), [0, 2, 4, 6])
  assert.deepEqual(usageTrendLabelIndexes(30), [0, 9, 19, 29])
})
