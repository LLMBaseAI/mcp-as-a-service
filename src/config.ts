import { ServerConfig } from './types.js';

export const SERVER_CONFIG: ServerConfig = {
  maxConcurrentProcesses: 10,
  maxPackageNameLength: 200,
  maxParamKeyLength: 100,
  maxParamValueLength: 1000,
  maxProcessLifetime: 30 * 60 * 1000, // 30 minutes
  allowedProtocols: ['stdio', 'sse', 'websocket']
};

export const CACHE_TTL = {
  package: 3600,      // 1 hour
  process: 1800,      // 30 minutes  
  download: 86400     // 24 hours
};

export const CLEANUP_INTERVAL = 10 * 60 * 1000; // 10 minutes
export const PROCESS_START_WAIT = 2000; // 2 seconds
export const HTTP_TIMEOUT = 5000; // 5 seconds