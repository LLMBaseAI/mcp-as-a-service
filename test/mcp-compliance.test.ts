import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { Hono } from 'hono';
import { MCPHandler } from '../src/mcp-handler.js';
import { MCP_PROTOCOL_VERSION, MCPErrorCodes } from '../src/types.js';

describe('MCP Protocol Compliance Tests', () => {
  let mcpHandler: MCPHandler;
  let app: Hono;

  beforeAll(() => {
    mcpHandler = new MCPHandler();
    app = new Hono();
    app.post('/mcp', (c) => mcpHandler.handleMCPRequest(c));
  });

  afterAll(() => {
    mcpHandler.reset();
  });

  describe('Protocol Version', () => {
    it('should declare MCP protocol version 2024-11-05', () => {
      expect(MCP_PROTOCOL_VERSION).toBe('2024-11-05');
    });

    it('should expose protocol version in status', () => {
      const status = mcpHandler.getStatus();
      expect(status.serverInfo.version).toBeDefined();
    });
  });

  describe('MCP Error Codes', () => {
    it('should define MCP-specific error codes in -32000 to -32099 range', () => {
      expect(MCPErrorCodes.UNSUPPORTED_PROTOCOL_VERSION).toBe(-32000);
      expect(MCPErrorCodes.RESOURCE_NOT_FOUND).toBe(-32001);
      expect(MCPErrorCodes.TOOL_NOT_FOUND).toBe(-32003);
      expect(MCPErrorCodes.SERVER_NOT_READY).toBe(-32006);
      
      // Custom application errors (extending MCP range)
      expect(MCPErrorCodes.PACKAGE_NOT_FOUND).toBe(-32020);
      expect(MCPErrorCodes.RUNTIME_NOT_AVAILABLE).toBe(-32021);
      expect(MCPErrorCodes.SERVER_START_FAILED).toBe(-32022);
    });

    it('should define standard JSON-RPC error codes', () => {
      expect(MCPErrorCodes.INVALID_REQUEST).toBe(-32600);
      expect(MCPErrorCodes.METHOD_NOT_FOUND).toBe(-32601);
      expect(MCPErrorCodes.INVALID_PARAMS).toBe(-32602);
      expect(MCPErrorCodes.INTERNAL_ERROR).toBe(-32603);
      expect(MCPErrorCodes.PARSE_ERROR).toBe(-32700);
    });
  });

  describe('Capabilities Discovery', () => {
    it('should expose server capabilities', () => {
      const status = mcpHandler.getStatus();
      expect(status.serverCapabilities).toBeDefined();
      expect(status.serverCapabilities.tools).toBeDefined();
      expect(status.serverCapabilities.resources).toBeDefined();
      expect(status.serverCapabilities.prompts).toBeDefined();
      expect(status.serverCapabilities.logging).toBeDefined();
    });

    it('should support listChanged capability for tools', () => {
      const status = mcpHandler.getStatus();
      expect(status.serverCapabilities.tools?.listChanged).toBe(true);
    });

    it('should support subscribe and listChanged capabilities for resources', () => {
      const status = mcpHandler.getStatus();
      expect(status.serverCapabilities.resources?.subscribe).toBe(true);
      expect(status.serverCapabilities.resources?.listChanged).toBe(true);
    });
  });

  describe('MCP Initialization Flow', () => {
    it('should handle initialize request with correct protocol version', async () => {
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            roots: { listChanged: true },
            sampling: {}
          },
          clientInfo: {
            name: 'TestClient',
            version: '1.0.0'
          }
        }
      };

      const req = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(initRequest)
      });

      const res = await app.request(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBe(1);
      expect(body.result).toBeDefined();
      expect(body.result.protocolVersion).toBe('2024-11-05');
      expect(body.result.capabilities).toBeDefined();
      expect(body.result.serverInfo).toBeDefined();
    });

    it('should reject unsupported protocol version', async () => {
      const initRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'initialize',
        params: {
          protocolVersion: '1.0.0',
          capabilities: {},
          clientInfo: {
            name: 'TestClient',
            version: '1.0.0'
          }
        }
      };

      const req = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(initRequest)
      });

      const res = await app.request(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBe(2);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(MCPErrorCodes.UNSUPPORTED_PROTOCOL_VERSION);
      expect(body.error.message).toBe('Unsupported protocol version');
      expect(body.error.data.supported).toEqual(['2024-11-05']);
      expect(body.error.data.requested).toBe('1.0.0');
    });

    it('should handle initialized notification', async () => {
      const notification = {
        jsonrpc: '2.0',
        method: 'notifications/initialized'
      };

      const req = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notification)
      });

      const res = await app.request(req);
      expect(res.status).toBe(204);
    });

    it('should reject unknown methods', async () => {
      const unknownRequest = {
        jsonrpc: '2.0',
        id: 3,
        method: 'unknown/method'
      };

      const req = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(unknownRequest)
      });

      const res = await app.request(req);
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBe(3);
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(MCPErrorCodes.METHOD_NOT_FOUND);
      expect(body.error.message).toBe('Method not found: unknown/method');
    });
  });

  describe('JSON-RPC Format Compliance', () => {
    it('should reject requests without proper JSON-RPC version', async () => {
      const invalidRequest = {
        id: 4,
        method: 'initialize',
        params: {}
      };

      const req = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidRequest)
      });

      const res = await app.request(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.jsonrpc).toBe('2.0');
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(MCPErrorCodes.INVALID_PARAMS);
      expect(body.error.message).toBe('Invalid JSON-RPC version. Expected "2.0"');
    });

    it('should handle malformed JSON', async () => {
      const req = new Request('http://localhost/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ invalid json }'
      });

      const res = await app.request(req);
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.jsonrpc).toBe('2.0');
      expect(body.error).toBeDefined();
      expect(body.error.code).toBe(MCPErrorCodes.INVALID_PARAMS);
      expect(body.error.message).toBe('Invalid JSON format');
    });
  });
});