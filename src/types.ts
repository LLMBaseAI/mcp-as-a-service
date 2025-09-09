export interface ProcessInfo {
  process: any;
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
  packageData: any;
}

export interface ParsedPackage {
  fullName: string;
  scope: string | null;
  name: string;
  version: string;
}

export interface MCPCommandResult {
  command: string;
  args: string[];
  env: Record<string, string>;
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

export interface ServerConfig {
  maxConcurrentProcesses: number;
  maxPackageNameLength: number;
  maxParamKeyLength: number;
  maxParamValueLength: number;
  maxProcessLifetime: number;
  allowedProtocols: Protocol[];
}