import { ChildProcess } from 'child_process';

export interface ProcessInfo {
  process: ChildProcess;
  packageName: string;
  protocol: string;
  startTime: number;
  lastAccess: number;
}

export interface PackageValidationResult {
  valid: boolean;
  type: 'npm' | 'python' | 'remote' | 'unknown';
  reason?: string;
  error?: string;
  message?: string;
}

export interface PackageDetectionResult {
  type: 'npm' | 'python';
  registry: 'npmjs' | 'pypi';
  packageData: {
    name: string;
    version?: string;
    description?: string;
    [key: string]: unknown;
  };
}

export interface ParsedPackage {
  fullName: string;
  scope: string | null;
  name: string;
  version: string;
}


export interface ErrorResponse {
  error: string;
  message: string;
  guidance?: {
    whatYouTried?: string;
    suggestions?: string[];
    examples?: string[];
    whatToDoInstead?: string[];
    commonCauses?: string[];
    qualityRequirements?: string[];
    installation?: {
      command: string;
      description: string;
      afterInstall: string;
    };
    debugInfo?: string;
    limits?: {
      paramKeyLength: number;
      paramValueLength: number;
    };
    suggestion?: string;
    requirements?: string[];
  };
}

export type Protocol = 'stdio' | 'sse' | 'websocket';
export type PackageType = 'npm' | 'python' | 'remote' | 'unknown';

// MCP Protocol Constants
export const MCP_PROTOCOL_VERSION = '2024-11-05';

// MCP Error Codes (as per JSON-RPC 2.0 and MCP specification)
export const MCPErrorCodes = {
  // JSON-RPC Standard Errors
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  PARSE_ERROR: -32700,
  
  // MCP-Specific Errors (range -32000 to -32099)
  UNSUPPORTED_PROTOCOL_VERSION: -32000,
  RESOURCE_NOT_FOUND: -32001,
  RESOURCE_ACCESS_DENIED: -32002,
  TOOL_NOT_FOUND: -32003,
  TOOL_EXECUTION_ERROR: -32004,
  PROMPT_NOT_FOUND: -32005,
  SERVER_NOT_READY: -32006,
  CAPABILITY_NOT_SUPPORTED: -32007,
  INVALID_TOOL_ARGUMENTS: -32008,
  RATE_LIMIT_EXCEEDED: -32009,
  TIMEOUT_ERROR: -32010,
  
  // Custom Application Errors (extending MCP range)
  PACKAGE_NOT_FOUND: -32020,
  RUNTIME_NOT_AVAILABLE: -32021,
  SERVER_START_FAILED: -32022,
  MAX_PROCESSES_EXCEEDED: -32023,
  INVALID_PACKAGE_NAME: -32024,
  QUALITY_CHECK_FAILED: -32025,
  REMOTE_SERVER_NOT_SUPPORTED: -32026
} as const;

// MCP JSON-RPC Interfaces
export interface MCPJSONRPCRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface MCPJSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: MCPJSONRPCError;
}

export interface MCPJSONRPCError {
  code: number;
  message: string;
  data?: unknown;
}

export interface MCPJSONRPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

// MCP Initialization Interfaces
export interface MCPClientCapabilities {
  roots?: {
    listChanged?: boolean;
  };
  sampling?: Record<string, unknown>;
  elicitation?: Record<string, unknown>;
}

export interface MCPServerCapabilities {
  logging?: Record<string, unknown>;
  prompts?: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  tools?: {
    listChanged?: boolean;
  };
}

export interface MCPImplementationInfo {
  name: string;
  title?: string;
  version: string;
}

export interface MCPInitializeRequest extends MCPJSONRPCRequest {
  method: 'initialize';
  params: {
    protocolVersion: string;
    capabilities: MCPClientCapabilities;
    clientInfo: MCPImplementationInfo;
  };
}

export interface MCPInitializeResult {
  protocolVersion: string;
  capabilities: MCPServerCapabilities;
  serverInfo: MCPImplementationInfo;
  instructions?: string;
  _meta?: Record<string, unknown>;
}

export interface ServerConfig {
  maxConcurrentProcesses: number;
  maxPackageNameLength: number;
  maxParamKeyLength: number;
  maxParamValueLength: number;
  maxProcessLifetime: number;
  allowedProtocols: Protocol[];
}