// Spike #7 server: Hono + AI SDK 7 streaming chat with (a) a server tool that needs user approval,
// (b) an auto tool, and (c) a client-side tool answered with addToolOutput.
// Approval policy is central (`toolApproval`), and approvals are HMAC-signed
// (`experimental_toolApprovalSecret`) so a client cannot forge one.
// Usage: node server.mjs   (PORT=8787; KAWASE_SPIKE_MODEL=gpt-5.6-luna)
import crypto from 'node:crypto'
import { config } from 'dotenv'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import {
  streamText, tool, convertToModelMessages, createUIMessageStreamResponse, toUIMessageStream, isStepCount,
} from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
config({ path: new URL('../../../../.env', import.meta.url).pathname, quiet: true })

const PORT = Number(process.env.PORT ?? 8787)
const MODEL_ID = process.env.KAWASE_SPIKE_MODEL ?? 'gpt-5.6-luna' // D29 default role model
const MAX_STEPS = 5
const APPROVAL_SECRET = process.env.SPIKE_APPROVAL_SECRET ?? crypto.randomBytes(32)
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
const ts = () => new Date().toISOString().slice(11, 23)
let turn = 0

const tools = {
  get_balance: tool({
    description: "Read the user's USDC balance on the active network.",
    inputSchema: z.object({}),
    execute: async () => ({ asset: 'USDC', amount: '42.50', network: 'testnet' }),
  }),
  propose_send: tool({
    description: 'Propose sending USDC to a saved contact. The user must approve before anything happens.',
    inputSchema: z.object({ contactName: z.string(), amountUsdc: z.string().describe('decimal string, e.g. "5"') }),
    execute: async ({ contactName, amountUsdc }) => ({
      status: 'draft_ready_for_wallet_signature', // spike: in Kawase this creates intent_drafts[v] + a Circle challenge
      contactName, amountUsdc, intentId: crypto.randomUUID(),
    }),
  }),
  add_contact_form: tool({
    description: 'Ask the user to fill in a form to save a new contact (name + address). Runs on the device.',
    inputSchema: z.object({ suggestedName: z.string() }),
    // no execute: client-side tool, answered with addToolOutput
  }),
}

const app = new Hono()
app.get('/health', (c) => c.json({ ok: true, model: MODEL_ID }))
app.post('/api/chat', async (c) => {
  const n = ++turn
  const { messages } = await c.req.json()
  const last = messages.at(-1)
  const states = last?.parts?.filter((p) => p.type?.startsWith('tool-')).map((p) => `${p.type}:${p.state}${p.approval ? `(approved=${p.approval.approved})` : ''}`)
  console.log(`${ts()} [turn ${n}] POST /api/chat messages=${messages.length} last=${last?.role} tools=${JSON.stringify(states)}`)
  let chunks = 0
  const result = streamText({
    model: openai(MODEL_ID),
    instructions: 'You are Kawase, a wallet assistant. Use tools. To pay someone, call propose_send. Saved contacts: Alex, Maria. If a contact is not saved, call add_contact_form. Keep replies to one short sentence.',
    messages: await convertToModelMessages(messages, { tools }),
    tools,
    toolApproval: { propose_send: 'user-approval' },
    experimental_toolApprovalSecret: APPROVAL_SECRET,
    stopWhen: isStepCount(MAX_STEPS),
    onChunk: () => { chunks++ },
    onToolExecutionEnd: (e) => console.log(`${ts()} [turn ${n}] executed ${e.toolCall?.toolName ?? e.toolName} ->`, JSON.stringify(e.output ?? e.result ?? e).slice(0, 160)),
    onError: ({ error }) => console.log(`${ts()} [turn ${n}] ERROR ${error?.name}: ${error?.message}`),
  })
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      onEnd: ({ responseMessage, outcome, finishReason }) => {
        const parts = responseMessage.parts.map((p) => p.type === 'text' ? `text:"${p.text.slice(0, 60)}"` : `${p.type}:${p.state ?? ''}`)
        console.log(`${ts()} [turn ${n}] END outcome=${JSON.stringify(outcome)} finish=${finishReason} chunks=${chunks} parts=${JSON.stringify(parts)}`)
      },
      onError: (e) => { console.log(`${ts()} [turn ${n}] STREAM ERROR ${e?.name}: ${e?.message}`); return `${e?.name}: ${e?.message}` },
    }),
  })
})

serve({ fetch: app.fetch, port: PORT, hostname: '0.0.0.0' }, () => console.log(`${ts()} spike-07 server on :${PORT} model=${MODEL_ID}`))
