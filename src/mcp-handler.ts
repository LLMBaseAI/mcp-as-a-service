import { Context } from 'hono';
import {
  MCP_PROTOCOL_VERSION,
  MCPJSONRPCRequest,
  MCPJSONRPCResponse,
  MCPInitializeRequest,
  MCPInitializeResult,
  MCPServerCapabilities,
  MCPImplementationInfo,
  MCPClientCapabilities
} from './types.js';
import { MCPErrorResponses, createMCPErrorResponse, createMCPSuccessResponse } from './error-responses.js';
import { logger } from './logger.js';

/**
 * MCP Handler for protocol-compliant initialization and capabilities
 */
export class MCPHandler {
  private isInitialized = false;
  private clientCapabilities: MCPClientCapabilities | null = null;
  private protocolVersion: string | null = null;

  /**
   * Server capabilities exposed to MCP clients
   */
  private readonly serverCapabilities: MCPServerCapabilities = {
    // We support tools (MCP servers can expose tools)
    tools: {
      listChanged: true  // We can notify when available tools change
    },
    // We support resources (MCP servers can expose resources)
    resources: {
      subscribe: true,    // Clients can subscribe to resource updates
      listChanged: true   // We can notify when available resources change
    },
    // We support prompts (MCP servers can expose prompts)
    prompts: {
      listChanged: true   // We can notify when available prompts change
    },
    // We support logging (we can receive and handle log messages)
    logging: {}
  };

  /**
   * Server implementation information
   */
  private readonly serverInfo: MCPImplementationInfo = {
    name: 'mcp-as-a-service',
    title: 'MCP as a Service',
    version: '0.1.0'
  };

  /**
   * Handle MCP JSON-RPC requests
   */
  public async handleMCPRequest(c: Context): Promise<Response> {
    try {
      const request = await c.req.json() as MCPJSONRPCRequest;
      
      // Validate JSON-RPC format
      if (request.jsonrpc !== '2.0') {
        const error = MCPErrorResponses.invalidParams('Invalid JSON-RPC version. Expected "2.0"');
        return c.json(createMCPErrorResponse(request.id ?? null, error), 400);
      }

      logger.info(`Handling MCP request: ${request.method}`);

      // Route to appropriate handler
      switch (request.method) {
        case 'initialize':
          return this.handleInitialize(c, request as MCPInitializeRequest);
        
        case 'notifications/initialized':
          return this.handleInitialized(c);
          
        case 'capabilities/list':
          return this.handleListCapabilities(c, request);
          
        case 'tools/list':
          return this.handleListTools(c, request);
          
        case 'resources/list':
          return this.handleListResources(c, request);
          
        case 'prompts/list':
          return this.handleListPrompts(c, request);
          
        default:
          const error = MCPErrorResponses.methodNotFound(request.method);
          return c.json(createMCPErrorResponse(request.id || null, error), 404);
      }
      
    } catch (parseError) {
      logger.error('Error parsing MCP request:', parseError);
      const error = MCPErrorResponses.invalidParams('Invalid JSON format');
      return c.json(createMCPErrorResponse(null, error), 400);
    }
  }

  /**
   * Handle MCP initialize request
   */
  private async handleInitialize(c: Context, request: MCPInitializeRequest): Promise<Response> {
    try {
      const { protocolVersion, capabilities, clientInfo } = request.params;

      // Validate protocol version
      if (protocolVersion !== MCP_PROTOCOL_VERSION) {
        const error = MCPErrorResponses.unsupportedProtocolVersion(
          [MCP_PROTOCOL_VERSION],
          protocolVersion
        );
        return c.json(createMCPErrorResponse(request.id ?? null, error), 400);
      }

      // Store client information
      this.protocolVersion = protocolVersion;
      this.clientCapabilities = capabilities;

      logger.info(`MCP client connected: ${clientInfo.name} v${clientInfo.version}`);
      logger.info(`Client capabilities:`, capabilities);

      // Create initialize result
      const result: MCPInitializeResult = {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: this.serverCapabilities,
        serverInfo: this.serverInfo,
        instructions: 'This MCP server allows you to run any NPM or Python MCP server remotely via HTTP/SSE. ' +
                     'Use the package name format: "package-name" for NPM or "python-package" for Python packages. ' +
                     'Parameters can be passed as URL query parameters and will be mapped to environment variables.'
      };

      return c.json(createMCPSuccessResponse(request.id ?? null, result));

    } catch (error) {
      logger.error('Error during MCP initialization:', error);
      const mcpError = MCPErrorResponses.internalError('Initialization failed', String(error));
      return c.json(createMCPErrorResponse(request.id ?? null, mcpError), 500);
    }
  }

  /**
   * Handle initialized notification
   */
  private async handleInitialized(c: Context): Promise<Response> {
    this.isInitialized = true;
    logger.info('MCP session initialized successfully');
    
    // Notifications don't have responses in JSON-RPC
    return new Response(null, { status: 204 });
  }

  /**
   * Handle list capabilities request
   */
  private async handleListCapabilities(c: Context, request: MCPJSONRPCRequest): Promise<Response> {
    if (!this.isInitialized) {
      const error = MCPErrorResponses.serverNotReady();
      return c.json(createMCPErrorResponse(request.id || null, error), 400);
    }

    return c.json(createMCPSuccessResponse(request.id || null, {
      capabilities: this.serverCapabilities
    }));
  }

  /**
   * Handle list tools request (placeholder - will be populated based on active MCP servers)
   */
  private async handleListTools(c: Context, request: MCPJSONRPCRequest): Promise<Response> {
    if (!this.isInitialized) {
      const error = MCPErrorResponses.serverNotReady();
      return c.json(createMCPErrorResponse(request.id || null, error), 400);
    }

    // TODO: Dynamically list tools from active MCP server processes
    const tools = [
      {
        name: 'start_mcp_server',
        description: 'Start a new MCP server instance from NPM or PyPI package',
        inputSchema: {
          type: 'object',
          properties: {
            packageName: {
              type: 'string',
              description: 'NPM or PyPI package name containing MCP server'
            },
            packageType: {
              type: 'string',
              enum: ['npm', 'python'],
              description: 'Type of package (npm or python)'
            },
            parameters: {
              type: 'object',
              description: 'Environment variables/parameters for the MCP server',
              additionalProperties: { type: 'string' }
            }
          },
          required: ['packageName']
        }
      }
    ];

    return c.json(createMCPSuccessResponse(request.id || null, { tools }));
  }

  /**
   * Handle list resources request (placeholder)
   */
  private async handleListResources(c: Context, request: MCPJSONRPCRequest): Promise<Response> {
    if (!this.isInitialized) {
      const error = MCPErrorResponses.serverNotReady();
      return c.json(createMCPErrorResponse(request.id || null, error), 400);
    }

    // TODO: Dynamically list resources from active MCP server processes
    const resources = [
      {
        uri: 'mcp-as-a-service://servers/status',
        name: 'Active MCP Servers Status',
        description: 'Current status of all active MCP server instances',
        mimeType: 'application/json'
      }
    ];

    return c.json(createMCPSuccessResponse(request.id || null, { resources }));
  }

  /**
   * Handle list prompts request (placeholder)
   */
  private async handleListPrompts(c: Context, request: MCPJSONRPCRequest): Promise<Response> {
    if (!this.isInitialized) {
      const error = MCPErrorResponses.serverNotReady();
      return c.json(createMCPErrorResponse(request.id || null, error), 400);
    }

    // TODO: Dynamically list prompts from active MCP server processes
    const prompts = [
      {
        name: 'server_setup_help',
        description: 'Get help setting up an MCP server with proper parameters',
        arguments: [
          {
            name: 'packageName',
            description: 'The MCP server package name',
            required: true
          }
        ]
      }
    ];

    return c.json(createMCPSuccessResponse(request.id || null, { prompts }));
  }

  /**
   * Get current initialization status
   */
  public getStatus() {
    return {
      initialized: this.isInitialized,
      protocolVersion: this.protocolVersion,
      clientCapabilities: this.clientCapabilities,
      serverCapabilities: this.serverCapabilities,
      serverInfo: this.serverInfo
    };
  }

  /**
   * Check if MCP client supports a specific capability
   */
  public hasClientCapability(capability: keyof MCPClientCapabilities): boolean {
    return this.clientCapabilities !== null && capability in this.clientCapabilities;
  }

  /**
   * Reset initialization state (useful for testing)
   */
  public reset() {
    this.isInitialized = false;
    this.clientCapabilities = null;
    this.protocolVersion = null;
  }
}