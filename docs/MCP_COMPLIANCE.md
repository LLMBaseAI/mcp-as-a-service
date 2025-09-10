# MCP Protocol Compliance Documentation

This document outlines the Model Context Protocol (MCP) compliance implementation for `mcp-as-a-service`.

## Overview

`mcp-as-a-service` is now fully compliant with the MCP specification version `2024-11-05`. This implementation provides:

- **MCP Protocol Version Declaration**: Proper version negotiation during initialization
- **MCP-Specific Error Codes**: JSON-RPC error responses using the correct MCP error code ranges
- **Capabilities Discovery**: Full server capabilities negotiation and exposure
- **Proper Initialization Flow**: Standard MCP client-server handshake process

## MCP Protocol Version

- **Version**: `2024-11-05` (as per MCP specification)
- **Location**: Declared in `src/types.ts` as `MCP_PROTOCOL_VERSION`
- **Usage**: Used in initialization responses and capability negotiation

## Error Code Compliance

### Standard JSON-RPC Errors
- `-32700`: Parse error
- `-32600`: Invalid Request
- `-32601`: Method not found
- `-32602`: Invalid params
- `-32603`: Internal error

### MCP-Specific Error Codes (-32000 to -32099)
- `-32000`: Unsupported protocol version
- `-32001`: Resource not found
- `-32002`: Resource access denied
- `-32003`: Tool not found
- `-32004`: Tool execution error
- `-32005`: Prompt not found
- `-32006`: Server not ready
- `-32007`: Capability not supported
- `-32008`: Invalid tool arguments
- `-32009`: Rate limit exceeded
- `-32010`: Timeout error

### Custom Application Errors (extending MCP range)
- `-32020`: Package not found
- `-32021`: Runtime not available
- `-32022`: Server start failed
- `-32023`: Max processes exceeded
- `-32024`: Invalid package name
- `-32025`: Quality check failed
- `-32026`: Remote server not supported

## Server Capabilities

The MCP server exposes the following capabilities:

```json
{
  \"tools\": {
    \"listChanged\": true
  },
  \"resources\": {
    \"subscribe\": true,
    \"listChanged\": true
  },
  \"prompts\": {
    \"listChanged\": true
  },
  \"logging\": {}
}
```

### Capabilities Explanation

- **Tools**: The server can expose tools from MCP packages and notify when available tools change
- **Resources**: The server can expose resources and supports subscriptions for updates
- **Prompts**: The server can expose prompts and notify when available prompts change
- **Logging**: The server supports logging messages

## MCP Endpoints

### JSON-RPC over HTTP

**Endpoint**: `POST /mcp`
**Content-Type**: `application/json`

Handles all MCP JSON-RPC 2.0 requests including:

- `initialize`: MCP initialization with capability negotiation
- `notifications/initialized`: Completion of initialization handshake
- `capabilities/list`: List server capabilities
- `tools/list`: List available tools from active MCP servers
- `resources/list`: List available resources
- `prompts/list`: List available prompts

### Capabilities Discovery

**Endpoint**: `GET /mcp/capabilities`

Returns current server capabilities and initialization status.

## Initialization Flow

### 1. Client Initialize Request

```json
{
  \"jsonrpc\": \"2.0\",
  \"id\": 1,
  \"method\": \"initialize\",
  \"params\": {
    \"protocolVersion\": \"2024-11-05\",
    \"capabilities\": {
      \"roots\": { \"listChanged\": true },
      \"sampling\": {}
    },
    \"clientInfo\": {
      \"name\": \"ExampleClient\",
      \"version\": \"1.0.0\"
    }
  }
}
```

### 2. Server Initialize Response

```json
{
  \"jsonrpc\": \"2.0\",
  \"id\": 1,
  \"result\": {
    \"protocolVersion\": \"2024-11-05\",
    \"capabilities\": {
      \"tools\": { \"listChanged\": true },
      \"resources\": { \"subscribe\": true, \"listChanged\": true },
      \"prompts\": { \"listChanged\": true },
      \"logging\": {}
    },
    \"serverInfo\": {
      \"name\": \"mcp-as-a-service\",
      \"title\": \"MCP as a Service\",
      \"version\": \"0.1.0\"
    },
    \"instructions\": \"This MCP server allows you to run any NPM or Python MCP server remotely...\"
  }
}
```

### 3. Client Initialized Notification

```json
{
  \"jsonrpc\": \"2.0\",
  \"method\": \"notifications/initialized\"
}
```

## Error Handling

All MCP-compliant error responses follow the JSON-RPC 2.0 error format:

```json
{
  \"jsonrpc\": \"2.0\",
  \"id\": 1,
  \"error\": {
    \"code\": -32000,
    \"message\": \"Unsupported protocol version\",
    \"data\": {
      \"supported\": [\"2024-11-05\"],
      \"requested\": \"1.0.0\"
    }
  }
}
```

## Package.json MCP Metadata

The `package.json` now includes MCP-specific metadata:

```json
{
  \"mcp\": {
    \"protocolVersion\": \"2024-11-05\",
    \"server\": {
      \"name\": \"mcp-as-a-service\",
      \"version\": \"0.1.0\",
      \"description\": \"Proxy service for running MCP servers remotely\",
      \"capabilities\": {
        \"tools\": { \"listChanged\": true },
        \"resources\": { \"subscribe\": true, \"listChanged\": true },
        \"prompts\": { \"listChanged\": true },
        \"logging\": {}
      }
    },
    \"transport\": {
      \"http\": {
        \"endpoint\": \"/mcp\",
        \"methods\": [\"POST\"]
      },
      \"sse\": {
        \"endpoint\": \"/package/{packageName}/sse\"
      }
    }
  }
}
```

## Backward Compatibility

The MCP compliance implementation maintains full backward compatibility:

- **Legacy HTTP endpoints**: All existing `/package/*/sse` and `/package/*/respond` endpoints continue to work
- **Error responses**: Legacy HTTP error responses are preserved alongside new MCP-compliant responses
- **API format**: No breaking changes to existing API contracts

## Testing

MCP compliance is verified through comprehensive tests in `src/test/mcp-compliance.test.ts`:

- Protocol version validation
- Error code compliance
- Capabilities discovery
- Initialization flow
- JSON-RPC format compliance

Run tests with: `bun test src/test/mcp-compliance.test.ts`

## Usage Examples

### Connect MCP Client

```javascript
// Example MCP client connection
const response = await fetch('http://localhost:8787/mcp', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {
        sampling: {}
      },
      clientInfo: {
        name: 'MyMCPClient',
        version: '1.0.0'
      }
    }
  })
});

const result = await response.json();
console.log('MCP Server initialized:', result.result);
```

### Check Server Status

```bash
curl -X GET http://localhost:8787/mcp/capabilities
```

### Health Check with MCP Status

```bash
curl -X GET http://localhost:8787/health
```

This will return MCP initialization status alongside health information.

## Implementation Files

- **`src/types.ts`**: MCP protocol constants, interfaces, and error codes
- **`src/mcp-handler.ts`**: Main MCP protocol handler
- **`src/error-responses.ts`**: MCP-compliant error response functions
- **`src/index.ts`**: MCP endpoint routing
- **`src/test/mcp-compliance.test.ts`**: MCP compliance verification tests

## References

- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification/2024-11-05/)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [MCP Error Handling Guidelines](https://modelcontextprotocol.io/specification/2024-11-05/basic/error-handling)