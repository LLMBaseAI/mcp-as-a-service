import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import { logger } from './logger.js';
import { mapParametersToEnvironment } from './parameter-mapping.js';
import { buildMCPCommand } from './command-builder.js';
import { attachJsonRpc } from './jsonrpc.js';

export interface MCPServerProcess {
  process: ChildProcess;
  packageName: string;
  startTime: number;
  lastActivity: number;
  clients: Set<string>;
  events: EventEmitter; // emits 'message' with parsed JSON-RPC objects
}

export class MCPProxy {
  private servers = new Map<string, MCPServerProcess>();
  
  constructor() {
    // Cleanup inactive servers every 5 minutes
    setInterval(() => this.cleanupInactiveServers(), 5 * 60 * 1000);
  }

  /**
   * Compute the canonical server ID used for storing/retrieving processes
   */
  public computeServerId(packageName: string, params: Record<string, unknown>): string {
    return `${packageName}_${this.hashParams(params)}`;
  }

  /**
   * Get or create an MCP server process
   */
  public async getOrCreateServer(
    packageName: string, 
    packageType: 'npm' | 'python',
    params: Record<string, unknown>
  ): Promise<MCPServerProcess> {
    const serverId = this.computeServerId(packageName, params);
    
    let server = this.servers.get(serverId);
    if (server && !server.process.killed) {
      server.lastActivity = Date.now();
      return server;
    }

    // Create new server process
    logger.info(`Starting MCP server: ${packageName}`);
    
    const customArgs = typeof params.args === 'string' ? params.args : undefined;
    const { command, args } = buildMCPCommand(packageName, packageType, customArgs);
    const env = mapParametersToEnvironment(params);
    
    const mcpProcess = spawn(command, args, {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const events = new EventEmitter();
    const rpc = attachJsonRpc(mcpProcess);
    rpc.parser.on('message', (obj) => {
      events.emit('message', obj);
    });

    server = {
      process: mcpProcess,
      packageName,
      startTime: Date.now(),
      lastActivity: Date.now(),
      clients: new Set(),
      events,
    };

    this.servers.set(serverId, server);
    
    // Handle process events
    mcpProcess.on('error', (error) => {
      logger.error(`MCP server ${serverId} error:`, error);
      this.servers.delete(serverId);
    });

    mcpProcess.on('exit', (code) => {
      logger.info(`MCP server ${serverId} exited with code ${code}`);
      this.servers.delete(serverId);
    });

    // Log stderr for debugging
    mcpProcess.stderr?.on('data', (data) => {
      logger.warn(`MCP server ${serverId} stderr:`, data.toString());
    });

    return server;
  }

  // Write a JSON-RPC message to the server using proper framing
  public send(serverId: string, message: unknown): void {
    const server = this.servers.get(serverId);
    if (!server || server.process.killed) {
      throw new Error(`MCP server ${serverId} not found or dead`);
    }
    const { stdin } = server.process
    if (!stdin) throw new Error('stdin not available')
    // Use the framer directly to avoid extra imports here
    const json = Buffer.from(JSON.stringify(message), 'utf8')
    const header = Buffer.from(`Content-Length: ${json.length}\r\n\r\n`, 'utf8')
    stdin.write(Buffer.concat([header, json]))
    server.lastActivity = Date.now();
  }

  /**
   * Add client to server
   */
  public addClient(serverId: string, clientId: string): void {
    const server = this.servers.get(serverId);
    if (server) {
      server.clients.add(clientId);
      server.lastActivity = Date.now();
    }
  }

  /**
   * Remove client from server
   */
  public removeClient(serverId: string, clientId: string): void {
    const server = this.servers.get(serverId);
    if (server) {
      server.clients.delete(clientId);
    }
  }

  /**
   * Get server stats
   */
  public getStats() {
    return {
      activeServers: this.servers.size,
      servers: Array.from(this.servers.entries()).map(([id, server]) => ({
        id,
        packageName: server.packageName,
        uptime: Date.now() - server.startTime,
        clients: server.clients.size,
        lastActivity: server.lastActivity
      }))
    };
  }



  private hashParams(params: Record<string, unknown>): string {
    const str = JSON.stringify(params, Object.keys(params).sort());
    return Buffer.from(str).toString('base64').slice(0, 8);
  }

  private cleanupInactiveServers(): void {
    const now = Date.now();
    const maxInactivity = 30 * 60 * 1000; // 30 minutes

    for (const [serverId, server] of this.servers.entries()) {
      if (server.clients.size === 0 && (now - server.lastActivity) > maxInactivity) {
        logger.info(`Cleaning up inactive MCP server: ${serverId}`);
        server.process.kill();
        this.servers.delete(serverId);
      }
    }
  }

  public shutdown(): void {
    logger.info('Shutting down all MCP servers...');
    for (const [serverId, server] of this.servers.entries()) {
      server.process.kill();
      this.servers.delete(serverId);
    }
  }
}
