# MCP as a Service

Run any MCP server (Node.js or Python) behind a simple REST API. Built with Bun + Hono + TypeScript.

Status: initial scaffold. Instance lifecycle is in-memory, with placeholders for package install, spawn, and JSON-RPC proxying.

## Quickstart

- Prerequisites: Bun 1.1+
- Install deps: `bun install`
- Start dev: `bun run dev`
- Start prod: `bun run start`

Server listens on `PORT` env or `8787`.

## API

- GET `/` — info and usage
- GET `/health` — health
- GET `/servers` — active MCP server stats
- GET `/package/:packageName/sse` — SSE stream for MCP over HTTP
- POST `/package/:packageName/respond` — send JSON-RPC to server
- POST `/package/:packageName/messages` — alias for respond

Example (Claude MCP over HTTP):

```
# Note: quote the URL in zsh because of '?'
claude mcp add firecrawl 'https://<host>/package/firecrawl-mcp/sse?firecrawlApiKey=YOUR_KEY' -t http
```

## Roadmap (keep it simple)

- Node: install npm package (per-instance working dir), spawn via Bun.spawn, speak MCP JSON-RPC over stdio.
- Python: create venv, `pip install` package, spawn entry point, connect via stdio.
- Minimal JSON-RPC proxy: pass-through of `initialize`, `tools/*`, `resources/*`.
- Basic auth + simple per-instance TTL eviction.

## Notes

- Current version does not install or run MCP servers yet; it’s a clean base to add that without overengineering.
- Everything is in-memory; restarting the process clears instances.
