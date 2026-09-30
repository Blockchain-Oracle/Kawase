// Spike #7 protocol test from Node, using the same client machinery as useChat
// (DefaultChatTransport + readUIMessageStream) and mimicking addToolApprovalResponse / addToolOutput
// exactly as AbstractChat does (ai@7.0.122 dist/index.js:22212).
// Usage: node server.mjs & node test-node.mjs
import fs from 'node:fs'
import { DefaultChatTransport, readUIMessageStream, isToolUIPart } from 'ai'

const API = process.env.SPIKE_API ?? 'http://localhost:8787/api/chat'
const transport = new DefaultChatTransport({ api: API })
const results = []
const log = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`) }
const user = (text) => ({ id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text }] })
const toolParts = (m) => m.parts.filter(isToolUIPart)
const text = (m) => m.parts.filter((p) => p.type === 'text').map((p) => p.text).join(' ')

// POST the conversation; stream the reply into the last assistant message (continuation) or a new one.
async function send(messages) {
  const t0 = performance.now()
  let firstChunkMs
  const stream = await transport.sendMessages({ chatId: 'spike-07', messages, trigger: 'submit-message', messageId: undefined, abortSignal: undefined })
  const lastMsg = messages.at(-1)
  const continuing = lastMsg?.role === 'assistant'
  let reply
  let error
  for await (const m of readUIMessageStream({ message: continuing ? structuredClone(lastMsg) : undefined, stream, onError: (e) => { error = e } })) {
    firstChunkMs ??= Math.round(performance.now() - t0)
    reply = m
  }
  const out = continuing ? [...messages.slice(0, -1), reply] : [...messages, reply]
  return { messages: out, reply, error, firstChunkMs, totalMs: Math.round(performance.now() - t0) }
}
const respondApproval = (messages, approved, mutate) => messages.map((m) => ({
  ...m,
  parts: m.parts.map((p) => isToolUIPart(p) && p.state === 'approval-requested'
    ? { ...p, ...(mutate ? mutate(p) : {}), state: 'approval-responded', approval: { ...p.approval, approved, reason: approved ? undefined : 'user declined' } }
    : p),
}))

// 1. Auto tool + streaming
{
  const r = await send([user("What's my balance?")])
  const tp = toolParts(r.reply)
  log('auto tool (get_balance) runs server-side and streams', tp.some((p) => p.type === 'tool-get_balance' && p.state === 'output-available'), `first chunk ${r.firstChunkMs} ms, total ${r.totalMs} ms: "${text(r.reply)}"`)
}
// 2. Approval requested, nothing executed
let pending
{
  const r = await send([user('Send 5 USDC to Alex')])
  const p = toolParts(r.reply).find((x) => x.type === 'tool-propose_send')
  log('propose_send pauses at approval-requested', p?.state === 'approval-requested', `input=${JSON.stringify(p?.input)} approval=${JSON.stringify(p?.approval)}`)
  pending = r.messages
}
// 3. Deny
{
  const r = await send(respondApproval(pending, false))
  const p = toolParts(r.reply).find((x) => x.type === 'tool-propose_send')
  log('deny -> output-denied, not executed', p?.state === 'output-denied', `"${text(r.reply)}"`)
}
// 4. Forged: approve but change the amount the user saw
{
  const r = await send(respondApproval(pending, true, (p) => ({ input: { ...p.input, amountUsdc: '5000' } })))
  const p = toolParts(r.reply).find((x) => x.type === 'tool-propose_send')
  log('forged approval (amount changed after approval) is rejected', p?.state !== 'output-available' && /InvalidToolApprovalSignature/.test(String(r.error)), `state=${p?.state} error=${String(r.error).slice(0, 160)}`)
}
// 5. Approve
{
  const r = await send(respondApproval(pending, true))
  const p = toolParts(r.reply).find((x) => x.type === 'tool-propose_send')
  log('approve -> executed, output-available, model continues', p?.state === 'output-available', `output=${JSON.stringify(p?.output)} "${text(r.reply)}"`)
}
// 6. Client-side tool answered with addToolOutput
{
  let r = await send([user('Add Bob as a new contact')])
  const p = toolParts(r.reply).find((x) => x.type === 'tool-add_contact_form')
  log('client tool (add_contact_form) arrives as input-available', p?.state === 'input-available', `input=${JSON.stringify(p?.input)}`)
  if (p) {
    const answered = r.messages.map((m) => ({ ...m, parts: m.parts.map((q) => q === p || (isToolUIPart(q) && q.toolCallId === p.toolCallId) ? { ...q, state: 'output-available', output: { saved: true, name: 'Bob', address: '0x000000000000000000000000000000000000b0b0' } } : q) }))
    r = await send(answered)
    log('addToolOutput -> model continues with the result', text(r.reply).length > 0, `"${text(r.reply)}"`)
  }
}

console.log(`\n${results.filter((x) => x.ok).length}/${results.length} passed`)
fs.writeFileSync(new URL('./results.node.json', import.meta.url), JSON.stringify({ ranAt: new Date().toISOString(), api: API, results }, null, 2))
