import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getVisibleMessages } from '../src/services/chat/branches.ts'
import { toRequestMessages } from '../src/services/chat/reply.ts'
import { buildSystemPrompt } from '../src/services/chat/systemPrompt.ts'

const question = (id, content) => ({ id, content, role: 'user', files: [], createdAt: 0 })
const reply = (id, text, extra = {}) => ({
  id,
  role: 'assistant',
  status: 'done',
  blocks: [{ type: 'text', text }],
  createdAt: 0,
  model: null,
  prefix: false,
  ...extra,
})
const followup = question('followup', '我刚才说的代号是什么？')

test('smart search is explicitly described in the system prompt only when enabled', () => {
  assert.doesNotMatch(buildSystemPrompt(false), /智能搜索|deepseek_web_search/)
  assert.match(buildSystemPrompt(true), /智能搜索/)
  assert.match(buildSystemPrompt(true), /deepseek_web_search/)
  assert.match(buildSystemPrompt(true), /deepseek_read_url/)
})

test('follow-up request includes the current session’s earlier turns in order', () => {
  const history = [question('q', '记住代号蓝鲸'), reply('a', '记住了')]
  assert.deepEqual(JSON.parse(JSON.stringify(toRequestMessages(history, followup))), [
    { role: 'user', content: '记住代号蓝鲸' },
    { role: 'assistant', content: [{ type: 'text', text: '记住了' }] },
    { role: 'user', content: followup.content },
  ])
  assert.deepEqual(toRequestMessages([], followup), [{ role: 'user', content: followup.content }])
})

test('only the selected answer branch is sent', () => {
  const session = {
    rootMessageId: 'q',
    messages: [
      { ...question('q', '代号是什么？'), selectedChildId: 'new' },
      reply('old', '旧回答', { parentId: 'q' }),
      reply('new', '当前回答', { parentId: 'q' }),
    ],
  }
  const body = JSON.stringify(toRequestMessages(getVisibleMessages(session), followup))
  assert.match(body, /当前回答/)
  assert.doesNotMatch(body, /旧回答/)
})

test('keeps visible interrupted text but excludes empty, rejected and failed uploads', () => {
  const history = [
    question('q1', '保留本轮'),
    reply('a1', '断流前的文字', { status: 'error', error: { kind: 'interrupted' } }),
    question('q2', '空白轮次'),
    reply('a2', '   '),
    question('q3', '拒绝轮次'),
    reply('a3', '拒绝', { stopReason: 'refusal' }),
    question('q4', '上传失败轮次'),
    reply('a4', '', { status: 'error', error: { kind: 'upload' } }),
  ]
  const body = JSON.stringify(toRequestMessages(history, followup))
  assert.match(body, /断流前的文字/)
  assert.doesNotMatch(body, /空白轮次|拒绝轮次|上传失败轮次/)
})
