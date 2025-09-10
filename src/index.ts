import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger as honoLogger } from 'hono/logger'
import { SSEHandler } from './sse-handler.js'
import { MCPProxy } from './mcp-proxy.js'
import { MCPHandler } from './mcp-handler.js'
import { MCP_PROTOCOL_VERSION } from './types.js'

const app = new Hono()
const proxy = new MCPProxy()
const sse = new SSEHandler(proxy)
const mcpHandler = new MCPHandler()

app.use('*', cors())
app.use('*', honoLogger())

app.get('/', (c) => c.json({
  name: 'mcp-as-a-service',
  runtime: 'Bun + Hono',
  status: 'ok',
  version: '0.1.0',
  mcp: {
    protocolVersion: MCP_PROTOCOL_VERSION,
    compliant: true,
    capabilities: ['tools', 'resources', 'prompts', 'logging']
  },
  usage: {
    mcp: '/mcp (JSON-RPC 2.0 over HTTP POST)',
    sse: '/package/:packageName/sse?param=value',
    respond: '/package/:packageName/respond',
    messages: '/package/:packageName/messages'
  }
}))

app.get('/health', (c) => c.json({
  status: 'healthy',
  uptime: process.uptime(),
  timestamp: new Date().toISOString(),
  mcp: {
    protocolVersion: MCP_PROTOCOL_VERSION,
    initialized: mcpHandler.getStatus().initialized
  }
}))

app.get('/servers', (c) => c.json(proxy.getStats()))

// MCP Protocol endpoint
app.post('/mcp', (c) => mcpHandler.handleMCPRequest(c))

// MCP capabilities discovery endpoint
app.get('/mcp/capabilities', (c) => c.json({
  protocolVersion: MCP_PROTOCOL_VERSION,
  status: mcpHandler.getStatus()
}))

// MCP over HTTP (SSE outbound, POST inbound)
app.get('/package/:packageName/sse', (c) => sse.handleSSE(c))

// Support multiple POST endpoints commonly used by clients
app.post('/package/:packageName/respond', (c) => sse.handleMessage(c))
app.post('/package/:packageName/messages', (c) => sse.handleMessage(c))
app.post('/package/:packageName/message', (c) => sse.handleMessage(c))

const port = Number(process.env.PORT || 8787)

// Start the server
const server = Bun.serve({ 
  fetch: app.fetch, 
  port 
})

console.log(`mcp-as-a-service listening on http://localhost:${server.port}`)

// Export named exports instead of default to avoid Bun auto-serve
export { port, server, app }
