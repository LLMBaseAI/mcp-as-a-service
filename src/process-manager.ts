import { spawn } from 'child_process';
import { ProcessInfo, Protocol, MCPCommandResult } from './types.js';

type MCPPackageType = 'npm' | 'python';
import { sanitizeEnvKey, sanitizeEnvValue, validateArgs } from './validation.js';
import { parsePackageName } from './packages.js';
import { SERVER_CONFIG, PROCESS_START_WAIT, CLEANUP_INTERVAL } from './config.js';
import { logger } from './logger.js';

export class ProcessManager {
  private mcpProcesses = new Map<string, ProcessInfo>();

  constructor() {
    // Start cleanup interval
    setInterval(() => this.cleanupProcesses(), CLEANUP_INTERVAL);
  }

  public getProcessCount(): number {
    return this.mcpProcesses.size;
  }

  public getAllProcesses(): Array<{
    id: string;
    packageName: string;
    protocol: string;
    startTime: number;
    lastAccess: number;
    uptime: number;
  }> {
    return Array.from(this.mcpProcesses.entries()).map(([id, info]) => ({
      id,
      packageName: info.packageName,
      protocol: info.protocol,
      startTime: info.startTime,
      lastAccess: info.lastAccess,
      uptime: Date.now() - info.startTime
    }));
  }

  public async startMCPServer(
    packageName: string,
    protocol: Protocol,
    packageType: MCPPackageType,
    params: Record<string, unknown> = {}
  ): Promise<string> {
    const processId = `${packageName}_${protocol}_${Date.now()}`;
    
    try {
      // Check concurrent process limit
      if (this.mcpProcesses.size >= SERVER_CONFIG.maxConcurrentProcesses) {
        throw new Error(`MAX_PROCESSES_EXCEEDED:${SERVER_CONFIG.maxConcurrentProcesses}`);
      }

      const { command, args, env } = this.buildMCPCommand(packageName, packageType, params);

      // Check if command exists
      if (!this.commandExists(command)) {
        throw new Error(`RUNTIME_NOT_AVAILABLE:${command}:${packageType}`);
      }

      logger.info(`Starting ${packageType} MCP server: ${command} ${args.join(' ')}`);
      
      const mcpProcess = spawn(command, args, {
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Store process information
      this.mcpProcesses.set(processId, {
        process: mcpProcess,
        packageName,
        protocol,
        startTime: Date.now(),
        lastAccess: Date.now()
      });

      // Handle process events
      mcpProcess.on('error', (error) => {
        logger.error(`MCP server ${processId} error:`, error);
        this.mcpProcesses.delete(processId);
      });

      mcpProcess.on('exit', (code) => {
        logger.info(`MCP server ${processId} exited with code ${code}`);
        this.mcpProcesses.delete(processId);
      });

      // Log process output
      mcpProcess.stdout?.on('data', (data) => {
        logger.info(`${processId} stdout: ${data}`);
      });

      mcpProcess.stderr?.on('data', (data) => {
        logger.error(`${processId} stderr: ${data}`);
      });

      // Wait for process to start
      await new Promise(resolve => setTimeout(resolve, PROCESS_START_WAIT));

      return processId;
    } catch (error) {
      logger.error(`Failed to start MCP server for ${packageName}:`, error);
      throw error;
    }
  }

  public findExistingProcess(packageName: string, protocol: Protocol): string | null {
    for (const [id, info] of this.mcpProcesses.entries()) {
      if (info.packageName === packageName && info.protocol === protocol) {
        info.lastAccess = Date.now();
        return id;
      }
    }
    return null;
  }

  public getProcessInfo(processId: string): ProcessInfo | null {
    return this.mcpProcesses.get(processId) || null;
  }

  public buildMCPCommand(
    packageName: string,
    packageType: MCPPackageType,
    params: Record<string, unknown> = {}
  ): MCPCommandResult {
    const env = this.mapParametersToEnv(params);
    const parsedPackage = parsePackageName(packageName);
    
    let command: string;
    let args: string[];

    if (packageType === 'python') {
      command = 'uvx';
      
      if (parsedPackage.version && parsedPackage.version !== 'latest') {
        args = [`${parsedPackage.fullName}==${parsedPackage.version}`];
      } else {
        args = [parsedPackage.fullName];
      }
      
      if (params.args && typeof params.args === 'string') {
        const customArgsRaw = decodeURIComponent(params.args);
        const customArgs = validateArgs(customArgsRaw);
        args.push(...customArgs);
      }
    } else if (packageType === 'npm') {
      command = 'npx';
      
      if (parsedPackage.version && parsedPackage.version !== 'latest') {
        args = ['-y', `${parsedPackage.fullName}@${parsedPackage.version}`];
      } else {
        args = ['-y', parsedPackage.fullName];
      }
      
      if (params.args && typeof params.args === 'string') {
        const customArgsRaw = decodeURIComponent(params.args);
        const customArgs = validateArgs(customArgsRaw);
        args.push(...customArgs);
      }
    } else {
      throw new Error(`Unsupported package type: ${packageType}`);
    }

    return { command, args, env };
  }

  public killAllProcesses(): void {
    for (const [processId, processInfo] of this.mcpProcesses.entries()) {
      logger.info(`Killing process ${processId}`);
      processInfo.process.kill();
      this.mcpProcesses.delete(processId);
    }
  }

  private mapParametersToEnv(params: Record<string, unknown>): Record<string, string> {
    const env = { ...process.env };
    
    // Common parameter mappings for popular MCP servers
    const parameterMappings: Record<string, string> = {
      'firecrawlApiKey': 'FIRECRAWL_API_KEY',
      'openaiApiKey': 'OPENAI_API_KEY',
      'anthropicApiKey': 'ANTHROPIC_API_KEY',
      'githubToken': 'GITHUB_TOKEN',
      'slackToken': 'SLACK_TOKEN',
      'discordToken': 'DISCORD_TOKEN',
      'apiKey': 'API_KEY',
      'accessToken': 'ACCESS_TOKEN',
      'bearerToken': 'BEARER_TOKEN',
      'clientId': 'CLIENT_ID',
      'clientSecret': 'CLIENT_SECRET'
    };
    
    for (const [key, value] of Object.entries(params)) {
      if (key !== 'args') {
        // Check for specific parameter mappings first
        let envKey: string | null | undefined = parameterMappings[key];
        
        // Fall back to generic sanitization if no specific mapping
        if (!envKey) {
          envKey = sanitizeEnvKey(key);
        }
        
        if (envKey) {
          env[envKey] = sanitizeEnvValue(value);
          logger.info(`Mapped parameter ${key} to environment variable ${envKey}`);
        } else {
          logger.warn(`Skipped invalid environment variable key: ${key}`);
        }
      }
    }
    
    return env as Record<string, string>;
  }

  private commandExists(command: string): boolean {
    try {
      // Use Node.js child_process for compatibility
      const { execSync } = require('child_process');
      execSync(`which ${command}`, { stdio: 'ignore' });
      return true;
    } catch (error) {
      return false;
    }
  }

  private cleanupProcesses(): void {
    const now = Date.now();

    for (const [processId, processInfo] of this.mcpProcesses.entries()) {
      if (now - processInfo.lastAccess > SERVER_CONFIG.maxProcessLifetime) {
        logger.info(`Cleaning up inactive process ${processId}`);
        processInfo.process.kill();
        this.mcpProcesses.delete(processId);
      }
    }
  }
}
