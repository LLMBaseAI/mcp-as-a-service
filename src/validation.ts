import { SERVER_CONFIG } from './config.js';
import { Protocol, PackageType } from './types.js';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validatePackageName(packageName: unknown): string {
  if (!packageName || typeof packageName !== 'string') {
    throw new ValidationError('INVALID_PACKAGE_NAME:empty_or_invalid_type');
  }

  if (packageName.length > SERVER_CONFIG.maxPackageNameLength) {
    throw new ValidationError('INVALID_PACKAGE_NAME:too_long');
  }

  const basePackageName = packageName.split('@').slice(0, packageName.startsWith('@') ? 2 : 1).join('@');
  
  const validPattern = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
  if (!validPattern.test(basePackageName)) {
    throw new ValidationError('INVALID_PACKAGE_NAME:invalid_format');
  }
  
  if (packageName.includes('..') || packageName.includes('/./') || packageName.includes('\\')) {
    throw new ValidationError('INVALID_PACKAGE_NAME:path_traversal');
  }
  
  if (/[;&|`$(){}[\]<>'"\\]/.test(packageName)) {
    throw new ValidationError('INVALID_PACKAGE_NAME:shell_metacharacters');
  }

  return packageName;
}

export function validateProtocol(protocol: unknown): Protocol {
  if (!protocol || typeof protocol !== 'string') {
    throw new ValidationError('INVALID_PROTOCOL:empty_or_invalid_type');
  }

  const normalizedProtocol = protocol.toLowerCase();
  if (!SERVER_CONFIG.allowedProtocols.includes(normalizedProtocol as Protocol)) {
    throw new ValidationError('INVALID_PROTOCOL:not_allowed');
  }

  return normalizedProtocol as Protocol;
}

export function sanitizeEnvKey(key: string): string | null {
  if (!key || typeof key !== 'string' || key.length > SERVER_CONFIG.maxParamKeyLength) {
    return null;
  }
  
  const envKey = key.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase();
  
  if (!/^[A-Z_]/.test(envKey)) {
    return null;
  }
  
  return envKey;
}

export function sanitizeEnvValue(value: unknown): string {
  if (!value || typeof value !== 'string') {
    return '';
  }
  
  let sanitizedValue = value;
  if (sanitizedValue.length > SERVER_CONFIG.maxParamValueLength) {
    sanitizedValue = sanitizedValue.substring(0, SERVER_CONFIG.maxParamValueLength);
  }
  
  return sanitizedValue.replace(/[;&|`$(){}[\]\\<>'"]/g, '');
}

export function validateInputLimits(params: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(params)) {
    if (key.length > SERVER_CONFIG.maxParamKeyLength) {
      throw new ValidationError('INVALID_INPUT:param_key_too_long');
    }
    if (typeof value === 'string' && value.length > SERVER_CONFIG.maxParamValueLength) {
      throw new ValidationError('INVALID_INPUT:param_value_too_long');
    }
  }
}

export function isRemoteServer(packageName: string): boolean {
  const urlPatterns = [
    /^https?:\/\//, // http:// or https://
    /^wss?:\/\//, // ws:// or wss://
    /\.com/, /\.org/, /\.net/, /\.io/, // common TLDs
    /\/sse$/, /\/stdio$/, // MCP endpoints
    /mcp-remote/ // mcp-remote package pattern
  ];
  
  return urlPatterns.some(pattern => pattern.test(packageName));
}

export function validateArgs(argsString: string): string[] {
  if (/[;&|`$(){}[\]<>'"\\]/.test(argsString)) {
    throw new ValidationError('INVALID_ARGS:contains_dangerous_characters');
  }
  
  return argsString.split(' ')
    .filter(arg => arg.trim())
    .map(arg => arg.substring(0, 100))
    .slice(0, 20);
}