// SSE probe for Traefik/Coolify: 12 events, 250 ms apart, with AI SDK 7's UI_MESSAGE_STREAM_HEADERS.
import http from 'node:http'
const HEADERS = { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-vercel-ai-ui-message-stream': 'v1', 'x-accel-buffering': 'no' }
const EVENTS = 12
const GAP_MS = 250
http.createServer((req, res) => {
  if (req.url === '/health') return res.end('ok')
  if (req.url !== '/sse') { res.statusCode = 404; return res.end() }
  res.writeHead(200, HEADERS)
  let n = 0
  const t = setInterval(() => {
    res.write(`data: ${JSON.stringify({ n, sentAt: Date.now() })}\n\n`)
    if (++n === EVENTS) { clearInterval(t); res.end('data: [DONE]\n\n') }
  }, GAP_MS)
  req.on('close', () => clearInterval(t))
}).listen(3000, '::')
