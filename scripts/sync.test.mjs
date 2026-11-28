import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  encodeSyncCode,
  isValidSyncKey,
  normalizeServerUrl,
  parseSyncCode,
  parseSyncInput,
  resolveServerUrl,
} from '../src/services/sync/code.ts'
import {
  collectDeletedSessions,
  groupChanges,
  isSettledMessage,
  mergeRemoteSession,
  toSyncSession,
} from '../src/services/sync/model.ts'
import { imageRefs, sha256Hex } from '../src/services/sync/fileModel.ts'

const KEY = 'a'.repeat(43)

const userMessage = (overrides = {}) => ({
  id: 'm1',
  role: 'user',
  content: '你好',
  files: [],
  createdAt: 1000,
  parentId: null,
  ...overrides,
})

const assistantMessage = (id, parentId, createdAt, overrides = {}) => ({
  id,
  role: 'assistant',
  createdAt,
  model: 'deepseek-flash',
  prefix: true,
  status: 'done',
  blocks: [{ type: 'text', text: '回答' }],
  parentId,
  ...overrides,
})

const sessionRecord = (overrides = {}) => ({
  kind: 'session',
  id: 's1',
  sessionId: 's1',
  updatedAt: 1000,
  deleted: false,
  payload: {
    id: 's1',
    title: '会话',
    createdAt: 1000,
    updatedAt: 1000,
    rootMessageId: 'm1',
  },
  rev: 1,
  ...overrides,
})

const messageRecord = (message, rev) => ({
  kind: 'message',
  id: message.id,
  sessionId: 's1',
  updatedAt: 1000,
  deleted: false,
  payload: message,
  rev,
})

test('sync codes round-trip and reject unsafe input', () => {
  const target = { url: 'https://sync.example.com', key: KEY }
  const code = encodeSyncCode(target)
  assert.ok(code.startsWith('dsc1.'))
  assert.deepEqual(parseSyncCode(code), target)

  // 允许直接粘贴 JSON 和带空白的码
  assert.deepEqual(parseSyncCode(JSON.stringify({ url: target.url, key: KEY })), target)
  assert.deepEqual(parseSyncCode(`  ${code}  `), target)

  assert.equal(parseSyncCode(''), null)
  assert.equal(parseSyncCode('dsc1.not-base64!!'), null)
  assert.equal(parseSyncCode('https://sync.example.com'), null)
  assert.equal(parseSyncCode(JSON.stringify({ url: 'ftp://sync.example.com', key: KEY })), null)
  assert.equal(parseSyncCode(JSON.stringify({ url: target.url, key: 'short' })), null)
})

test('a bare key can be paired with a separately entered server address', () => {
  assert.deepEqual(parseSyncInput(KEY), { url: null, key: KEY })
  assert.deepEqual(parseSyncInput(`  ${KEY}  `), { url: null, key: KEY })
  assert.deepEqual(parseSyncInput(encodeSyncCode({ url: 'https://sync.example.com', key: KEY })), {
    url: 'https://sync.example.com',
    key: KEY,
  })
  assert.equal(parseSyncInput('not a key'), null)

  assert.equal(resolveServerUrl('sync.example.com'), 'https://sync.example.com')
  assert.equal(resolveServerUrl('sync.example.com/'), 'https://sync.example.com')
  assert.equal(resolveServerUrl('http://127.0.0.1:8787'), 'http://127.0.0.1:8787')
  assert.equal(resolveServerUrl('ftp://sync.example.com'), null)
  assert.equal(resolveServerUrl('   '), null)
})

test('server urls are normalized without losing a path prefix', () => {  assert.equal(normalizeServerUrl('https://sync.example.com/'), 'https://sync.example.com')
  assert.equal(normalizeServerUrl(' https://example.com/sync/ '), 'https://example.com/sync')
  assert.equal(normalizeServerUrl('http://127.0.0.1:8787'), 'http://127.0.0.1:8787')
  assert.equal(normalizeServerUrl('https://example.com/#x'), 'https://example.com')
  assert.equal(normalizeServerUrl('example.com'), null)
  assert.equal(normalizeServerUrl('ftp://example.com'), null)
  assert.equal(isValidSyncKey(KEY), true)
  assert.equal(isValidSyncKey('has space'), false)
})

test('push payloads leave out replies that are still streaming', () => {
  const session = {
    id: 's1',
    title: '会话',
    createdAt: 1000,
    updatedAt: 1000,
    rootMessageId: 'm1',
    messages: [
      userMessage(),
      assistantMessage('m2', 'm1', 1001),
      assistantMessage('m3', 'm2', 1002, { status: 'streaming', blocks: [] }),
    ],
  }
  const payload = toSyncSession(session)
  assert.deepEqual(
    payload.messages.map((message) => message.id),
    ['m1', 'm2']
  )
  assert.equal(payload.rootMessageId, 'm1')
  assert.equal(isSettledMessage(session.messages[2]), false)
  assert.equal(isSettledMessage(session.messages[0]), true)
})

test('changes are grouped by session and tombstones win', () => {
  const changes = groupChanges([
    sessionRecord(),
    messageRecord(userMessage(), 2),
    messageRecord(assistantMessage('m2', 'm1', 1001), 3),
    sessionRecord({ id: 's2', sessionId: 's2', rev: 4 }),
    sessionRecord({
      id: 's2',
      sessionId: 's2',
      deleted: true,
      rev: 5,
      payload: { id: 's2', deleted: true },
    }),
  ])
  assert.deepEqual(changes.deleted, ['s2'])
  assert.deepEqual([...changes.sessions.keys()], ['s1'])
  assert.equal(changes.sessions.get('s1').messages.length, 2)
  assert.equal(changes.sessions.get('s1').meta.title, '会话')
})

test('a message that arrives before its session record keeps a placeholder', () => {
  const changes = groupChanges([messageRecord(userMessage(), 3)])
  const session = changes.sessions.get('s1')
  assert.equal(session.meta.title, '')
  assert.equal(session.messages.length, 1)
})

test('creating a session from remote sorts messages and picks the root', () => {
  const changes = groupChanges([
    sessionRecord(),
    messageRecord(assistantMessage('m2', 'm1', 1001), 3),
    messageRecord(userMessage(), 2),
  ])
  const merged = mergeRemoteSession(undefined, changes.sessions.get('s1'))
  assert.deepEqual(
    merged.messages.map((message) => message.id),
    ['m1', 'm2']
  )
  assert.equal(merged.rootMessageId, 'm1')
  assert.equal(merged.title, '会话')
})

test('appending a remote message keeps local content and branch pointers', () => {
  const local = {
    id: 's1',
    title: '本地标题',
    createdAt: 1000,
    updatedAt: 5000,
    rootMessageId: 'm1',
    messages: [userMessage({ selectedChildId: 'm2' }), assistantMessage('m2', 'm1', 1001)],
  }
  const remote = groupChanges([
    sessionRecord({
      updatedAt: 4000,
      payload: { ...sessionRecord().payload, title: '远端标题', updatedAt: 4000 },
    }),
    messageRecord(userMessage({ selectedChildId: 'm2' }), 2),
    messageRecord(assistantMessage('m2', 'm1', 1001), 3),
    messageRecord(userMessage({ id: 'm3', content: '新消息', createdAt: 4000, parentId: 'm2' }), 4),
  ]).sessions.get('s1')

  const merged = mergeRemoteSession(local, remote)
  assert.equal(merged.title, '本地标题')
  assert.deepEqual(
    merged.messages.map((message) => message.id),
    ['m1', 'm2', 'm3']
  )
  assert.equal(merged.updatedAt, 5000)
})

test('newer remote timestamps win for the title', () => {
  const local = {
    id: 's1',
    title: '旧标题',
    createdAt: 1000,
    updatedAt: 2000,
    rootMessageId: 'm1',
    messages: [userMessage()],
  }
  const remote = groupChanges([
    sessionRecord({
      updatedAt: 3000,
      payload: { ...sessionRecord().payload, title: '新标题', updatedAt: 3000 },
    }),
    messageRecord(userMessage(), 2),
  ]).sessions.get('s1')

  const merged = mergeRemoteSession(local, remote)
  assert.equal(merged.title, '新标题')
  assert.equal(merged.updatedAt, 3000)
})

test('merging an unchanged session returns the same object', () => {
  const local = {
    id: 's1',
    title: '会话',
    createdAt: 1000,
    updatedAt: 1000,
    rootMessageId: 'm1',
    messages: [userMessage()],
  }
  const remote = groupChanges([sessionRecord(), messageRecord(userMessage(), 2)]).sessions.get('s1')
  assert.equal(mergeRemoteSession(local, remote), local)
})

test('image hashes are stable and only hashed images need downloading', async () => {
  const digest = '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81'
  assert.equal(await sha256Hex(new Blob([new Uint8Array([1, 2, 3])])), digest)

  const session = {
    id: 's1',
    title: '会话',
    createdAt: 1,
    updatedAt: 1,
    rootMessageId: 'u1',
    messages: [
      {
        id: 'u1',
        role: 'user',
        content: '看图',
        createdAt: 1,
        parentId: null,
        files: [
          {
            id: 'f1',
            serverId: null,
            name: 'a.png',
            size: 3,
            isImage: true,
            mimeType: 'image/png',
            sha256: digest,
          },
          { id: 'f2', serverId: null, name: 'b.txt', size: 3, isImage: false, mimeType: 'text/plain' },
          { id: 'f3', serverId: null, name: 'c.png', size: 3, isImage: true, mimeType: 'image/png' },
        ],
      },
      {
        id: 'a1',
        role: 'assistant',
        createdAt: 2,
        model: null,
        prefix: true,
        status: 'done',
        blocks: [],
        parentId: 'u1',
      },
    ],
  }
  assert.deepEqual(imageRefs(session), [{ id: 'f1', sha256: digest, mimeType: 'image/png' }])
})

test('only previously pushed sessions need a tombstone when deleted locally', () => {
  assert.deepEqual(
    collectDeletedSessions(['a', 'b', 'c'], new Set(['a']), new Set(['b', 'c', 'd'])),
    ['b', 'c']
  )
  assert.deepEqual(collectDeletedSessions(['a'], new Set(['a']), new Set(['a'])), [])
  assert.deepEqual(collectDeletedSessions(['local-only'], new Set(), new Set()), [])
})
