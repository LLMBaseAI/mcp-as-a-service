# MCP-as-a-Service

**HTTP/SSE Proxy for MCP Servers** - Run any MCP (Model Context Protocol) server remotely via REST API and Server-Sent Events. Built with Bun + Hono + TypeScript.

**Status**: Production-ready with full MCP Protocol v2024-11-05 compliance. Supports NPM and Python MCP packages with automatic detection, installation, and lifecycle management.

## Quickstart

- Prerequisites: Bun 1.1+
- Install deps: `bun install`
- Start dev: `bun run dev`
- Start prod: `bun run start`

Server listens on `PORT` env or `8787`.

## API Endpoints

### Core Information
- `GET /` — Service info, MCP capabilities, and usage examples
- `GET /health` — Health status with MCP protocol version
- `GET /servers` — Active MCP server statistics

### MCP Protocol (JSON-RPC 2.0)
- `POST /mcp` — Direct MCP JSON-RPC endpoint for protocol-compliant clients
- `GET /mcp/capabilities` — MCP server capabilities discovery

### HTTP/SSE Proxy (Legacy)
- `GET /package/:packageName/sse` — Server-Sent Events stream for real-time MCP communication
- `POST /package/:packageName/respond` — Send JSON-RPC requests to MCP server
- `POST /package/:packageName/messages` — Alias for respond endpoint

### Usage Examples

**Claude Desktop (Recommended)**:
```bash
# Add MCP server via HTTP transport
claude mcp add firecrawl 'https://mcp.llmbase.ai/package/firecrawl-mcp/sse?firecrawlApiKey=YOUR_KEY' -t http
```

**Direct MCP Protocol**:
```bash
curl -X POST https://mcp.llmbase.ai/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'
```

## Features

### ✅ **Production Ready**
- **Full MCP Protocol v2024-11-05 compliance** with proper initialization, capabilities discovery, and error handling
- **Automatic package detection** for NPM and Python MCP servers with registry validation
- **Process lifecycle management** with 30-minute TTL, automatic cleanup, and resource limits
- **HTTP/SSE proxy** for real-time bidirectional communication with MCP servers
- **Input validation and security** with sanitization, path traversal protection, and injection prevention

### 🔧 **Package Support**
- **NPM packages**: Automatic detection, installation, and execution via `npx`
- **Python packages**: Virtual environment creation, pip installation, and entry point execution
- **Environment mapping**: HTTP parameters automatically mapped to environment variables
- **Registry integration**: Real-time validation against NPM and PyPI registries

### 📊 **Monitoring & Observability**
- **Health endpoints** with detailed status and uptime information
- **Process monitoring** with active server statistics and resource usage
- **Comprehensive logging** with structured Winston-based logging
- **Error handling** with user-friendly error messages and debugging guidance

## Architecture

```
Client (Claude Desktop) 
    ↓ HTTP/SSE
MCP-as-a-Service Proxy
    ↓ JSON-RPC over stdio
MCP Server Process (NPM/Python)
    ↓ Tool/Resource calls
External APIs (Firecrawl, GitHub, etc.)
```

## Notes

- **In-memory state**: Process tracking and caching - restarting clears active instances
- **Resource limits**: Maximum 10 concurrent MCP servers per instance
- **Security**: Input validation, process isolation, and automatic cleanup
- **Performance**: Bun runtime provides excellent startup times and memory efficiency
