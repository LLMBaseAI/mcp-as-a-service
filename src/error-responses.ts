import { ErrorResponse, MCPErrorCodes, MCPJSONRPCError } from './types.js';
import { SERVER_CONFIG } from './config.js';

// MCP-compliant JSON-RPC error responses
export const MCPErrorResponses = {
  createError(code: number, message: string, data?: unknown): MCPJSONRPCError {
    return { code, message, data };
  },

  unsupportedProtocolVersion(supported: string[], requested: string): MCPJSONRPCError {
    return this.createError(
      MCPErrorCodes.UNSUPPORTED_PROTOCOL_VERSION,
      'Unsupported protocol version',
      { supported, requested }
    );
  },

  methodNotFound(method: string): MCPJSONRPCError {
    return this.createError(
      MCPErrorCodes.METHOD_NOT_FOUND,
      `Method not found: ${method}`
    );
  },

  invalidParams(message: string, data?: unknown): MCPJSONRPCError {
    return this.createError(
      MCPErrorCodes.INVALID_PARAMS,
      message,
      data
    );
  },

  internalError(message?: string, data?: unknown): MCPJSONRPCError {
    return this.createError(
      MCPErrorCodes.INTERNAL_ERROR,
      message || 'Internal error',
      data
    );
  },

  serverNotReady(): MCPJSONRPCError {
    return this.createError(
      MCPErrorCodes.SERVER_NOT_READY,
      'Server is not ready to accept requests'
    );
  },

  packageNotFound(packageName: string): MCPJSONRPCError {
    return this.createError(
      MCPErrorCodes.PACKAGE_NOT_FOUND,
      `Package '${packageName}' was not found in NPM or PyPI registries`
    );
  },

  runtimeNotAvailable(command: string, packageType: string): MCPJSONRPCError {
    return this.createError(
      MCPErrorCodes.RUNTIME_NOT_AVAILABLE,
      `Command '${command}' not found. ${packageType.toUpperCase()} packages require ${command}.`
    );
  },

  serverStartFailed(packageName: string, reason: string): MCPJSONRPCError {
    return this.createError(
      MCPErrorCodes.SERVER_START_FAILED,
      `Package '${packageName}' was installed but failed to start: ${reason}`
    );
  },

  maxProcessesExceeded(): MCPJSONRPCError {
    return this.createError(
      MCPErrorCodes.MAX_PROCESSES_EXCEEDED,
      `Maximum ${SERVER_CONFIG.maxConcurrentProcesses} concurrent processes allowed`
    );
  },

  invalidPackageName(errorType: string): MCPJSONRPCError {
    const errorMessages: Record<string, string> = {
      'empty_or_invalid_type': 'Package name is required and must be a string',
      'too_long': `Package name too long (max ${SERVER_CONFIG.maxPackageNameLength} characters)`,
      'invalid_format': 'Invalid package name format. Must be valid NPM/PyPI package name',
      'path_traversal': 'Path traversal detected in package name',
      'shell_metacharacters': 'Package name contains dangerous shell characters'
    };
    
    return this.createError(
      MCPErrorCodes.INVALID_PACKAGE_NAME,
      errorMessages[errorType] || 'Package name validation failed'
    );
  },

  remoteServerNotSupported(packageName: string): MCPJSONRPCError {
    return this.createError(
      MCPErrorCodes.REMOTE_SERVER_NOT_SUPPORTED,
      `Package '${packageName}' appears to be a remote MCP server (contains URL). This registry only supports installable packages from NPM or PyPI.`
    );
  },

  qualityCheckFailed(packageName: string, type: string, reason: string): MCPJSONRPCError {
    return this.createError(
      MCPErrorCodes.QUALITY_CHECK_FAILED,
      `Package '${packageName}' (${type}) does not meet quality requirements: ${reason}`
    );
  }
};

// Legacy error responses for HTTP endpoints (backward compatibility)
export const ErrorResponses = {
  REMOTE_SERVER_NOT_SUPPORTED: (packageName: string): ErrorResponse => ({
    error: "Remote MCP servers not supported",
    message: `Package '${packageName}' appears to be a remote MCP server (contains URL). This registry only supports installable packages from NPM or PyPI.`,
    guidance: {
      whatYouTried: "Remote server URL",
      whatToDoInstead: [
        "Use installable MCP packages: /package/firecrawl-mcp/stdio",
        "Check if there's an NPM version of this MCP server",
        "For remote servers, connect directly in your MCP client configuration"
      ],
      examples: [
        "✅ /package/@supabase/mcp-server-supabase/stdio",
        "✅ /package/firecrawl-mcp/stdio",
        "❌ Remote URLs like https://mcp.webflow.com/sse"
      ]
    }
  }),

  PACKAGE_NOT_FOUND: (packageName: string): ErrorResponse => ({
    error: "Package not found",
    message: `Package '${packageName}' was not found in NPM or PyPI registries.`,
    guidance: {
      whatYouTried: `Package: ${packageName}`,
      suggestions: [
        "Check the package name spelling",
        "Verify the package exists on npmjs.com or pypi.org",
        "Try without version specifier first: /package/package-name/stdio"
      ],
      examples: [
        "✅ /package/firecrawl-mcp/stdio (correct)",
        "❌ /package/fire-crawl-mcp/stdio (wrong spelling)"
      ]
    }
  }),

  INVALID_VERSION: (packageName: string, version: string): ErrorResponse => ({
    error: "Invalid package version",
    message: `Version '${version}' does not exist for package '${packageName}'.`,
    guidance: {
      whatYouTried: `${packageName}@${version}`,
      suggestions: [
        "Try without version: /package/" + packageName + "/stdio",
        "Use @latest: /package/" + packageName + "@latest/stdio",
        "Check available versions on npmjs.com or pypi.org"
      ]
    }
  }),

  QUALITY_CHECK_FAILED: (packageName: string, type: string, reason: string): ErrorResponse => ({
    error: "Package quality check failed",
    message: `Package '${packageName}' (${type}) does not meet quality requirements: ${reason}`,
    guidance: {
      whatYouTried: `${type.toUpperCase()} package: ${packageName}`,
      qualityRequirements: type === 'npm'
        ? ["Minimum 100 downloads per month"]
        : ["Recent release within last year", "Proper package description"],
      suggestions: [
        "Try a more popular alternative package",
        "Check the package's maintenance status",
        "Contact the registry admin if you believe this is an error"
      ]
    }
  }),

  RUNTIME_NOT_AVAILABLE: (command: string, packageType: string): ErrorResponse => ({
    error: "Runtime not available",
    message: `Command '${command}' not found. ${packageType.toUpperCase()} packages require ${command}.`,
    guidance: {
      whatYouTried: `${packageType.toUpperCase()} package`,
      installation: packageType === 'python'
        ? {
            command: "curl -LsSf https://astral.sh/uv/install.sh | sh",
            description: "Install uv (Python package manager)",
            afterInstall: "Restart your terminal, then try the request again"
          }
        : {
            command: "npm install -g npx",
            description: "Install npx (comes with Node.js)",
            afterInstall: "Ensure Node.js is installed and npx is available"
          }
    }
  }),

  SERVER_START_FAILED: (packageName: string, reason: string): ErrorResponse => ({
    error: "MCP server failed to start",
    message: `Package '${packageName}' was installed but failed to start: ${reason}`,
    guidance: {
      commonCauses: [
        "Missing required environment variables (API keys, etc.)",
        "Package is not actually an MCP server",
        "Incompatible package version",
        "Network connectivity issues"
      ],
      suggestions: [
        "Check if required parameters are provided in URL query",
        "Try a different version of the package",
        "Verify this is actually an MCP server package"
      ],
      debugInfo: `Process exited. Check server logs for details.`
    }
  }),

  INVALID_PACKAGE_NAME: (errorType: string): ErrorResponse => {
    const errorMessages: Record<string, string> = {
      'empty_or_invalid_type': 'Package name is required and must be a string',
      'too_long': `Package name too long (max ${SERVER_CONFIG.maxPackageNameLength} characters)`,
      'invalid_format': 'Invalid package name format. Must be valid NPM/PyPI package name',
      'path_traversal': 'Path traversal detected in package name',
      'shell_metacharacters': 'Package name contains dangerous shell characters'
    };

    return {
      error: 'Invalid package name',
      message: errorMessages[errorType] || 'Package name validation failed',
      guidance: {
        examples: ['firecrawl-mcp', '@supabase/mcp-server-supabase'],
        requirements: ['Valid NPM/PyPI format', 'No shell metacharacters', 'No path traversal']
      }
    };
  },

  INVALID_PROTOCOL: (): ErrorResponse => ({
    error: 'Invalid protocol',
    message: 'Protocol must be one of: ' + SERVER_CONFIG.allowedProtocols.join(', '),
    guidance: {
      examples: ['stdio', 'sse', 'websocket']
    }
  }),

  INVALID_INPUT: (): ErrorResponse => ({
    error: 'Invalid input',
    message: 'Request parameters exceed size limits',
    guidance: {
      limits: {
        paramKeyLength: SERVER_CONFIG.maxParamKeyLength,
        paramValueLength: SERVER_CONFIG.maxParamValueLength
      }
    }
  }),

  MAX_PROCESSES_EXCEEDED: (): ErrorResponse => ({
    error: 'Too many active processes',
    message: `Maximum ${SERVER_CONFIG.maxConcurrentProcesses} concurrent processes allowed`,
    guidance: {
      suggestion: 'Wait for existing processes to complete or contact administrator'
    }
  }),

  INVALID_ARGS: (): ErrorResponse => ({
    error: 'Invalid arguments',
    message: 'Command arguments contain dangerous characters',
    guidance: {
      suggestion: 'Remove shell metacharacters from args parameter'
    }
  })
};

// Helper function to create MCP-compliant JSON-RPC error response
export function createMCPErrorResponse(id: string | number | null, error: MCPJSONRPCError) {
  return {
    jsonrpc: '2.0' as const,
    id,
    error
  };
}

// Helper function to create MCP-compliant JSON-RPC success response
export function createMCPSuccessResponse(id: string | number | null, result: unknown) {
  return {
    jsonrpc: '2.0' as const,
    id,
    result
  };
}