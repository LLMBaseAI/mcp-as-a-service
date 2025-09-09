import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { SSEHandler } from './sse-handler.js'
import { MCPProxy } from './mcp-proxy.js'

const app = new Hono()
const proxy = new MCPProxy()
const sse = new SSEHandler(proxy)

app.use('*', cors())
app.use('*', honoLogger())

app.get('/', (c) => c.json({
  name: 'mcp-as-a-service',
  runtime: 'Bun + Hono',
  status: 'ok',
  version: '0.1.0',
  usage: {
    sse: '/package/:packageName/sse?param=value',
    respond: '/package/:packageName/respond',
    messages: '/package/:packageName/messages'
  }
}))

app.get('/health', (c) => c.json({
  status: 'healthy',
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
}))

app.get('/servers', (c) => c.json(proxy.getStats()))

// MCP over HTTP (SSE outbound, POST inbound)
app.get('/package/:packageName/sse', (c) => sse.handleSSE(c))

// Support multiple POST endpoints commonly used by clients
app.post('/package/:packageName/respond', (c) => sse.handleMessage(c))
app.post('/package/:packageName/messages', (c) => sse.handleMessage(c))
app.post('/package/:packageName/message', (c) => sse.handleMessage(c))

const port = Number(process.env.PORT || 8787)

// Run with Bun
export default {
  port,
  fetch: app.fetch,
}

if (import.meta.main) {
  Bun.serve({ fetch: app.fetch, port })
  console.log(`mcp-as-a-service listening on http://localhost:${port}`)
}
