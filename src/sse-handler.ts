import { Context } from 'hono'
import { MCPProxy } from './mcp-proxy.js'
import { logger } from './logger.js'
import { v4 as uuidv4 } from 'uuid'
import { detectPackageType } from './packages.js'

export class SSEHandler {
  constructor(private mcpProxy: MCPProxy) {}

  /**
   * Handle SSE connection for MCP server
   */
  public async handleSSE(c: Context): Promise<Response> {
    const packageName = (c.req.param('*') || c.req.param('packageName')) as string;
    const params = Object.fromEntries(new URL(c.req.url).searchParams.entries());
    
    if (!packageName) {
      return c.json({ error: 'Package name required' }, 400);
    }

    const clientId = uuidv4();
    logger.info(`SSE client ${clientId} connecting to ${packageName}`);

    try {
      // Detect package type (npm or python) and start server accordingly
      const detected = await detectPackageType(packageName);
      const server = await this.mcpProxy.getOrCreateServer(
        packageName,
        detected.type,
        params
      );
      
      const serverId = this.mcpProxy.computeServerId(packageName, params);
      this.mcpProxy.addClient(serverId, clientId);

      // Create SSE response manually
      const proxy = this.mcpProxy;
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          let closed = false;

          const safeSend = (payload: string) => {
            if (closed) return;
            try {
              controller.enqueue(encoder.encode(payload));
            } catch (_) {
              // Controller likely closed; trigger cleanup
              cleanup();
            }
          };

          // Set up message forwarding from MCP server
          const messageHandler = (obj: unknown) => {
            try {
              const sseMsg = `event: message\n` + `data: ${JSON.stringify(obj)}\n\n`;
              safeSend(sseMsg);
            } catch (error) {
              logger.error(`Error forwarding MCP message to SSE client ${clientId}:`, error);
            }
          };

          server.events.on('message', messageHandler as any);

          // Send connection status event (not a JSON-RPC message)
          safeSend(`event: status\n` + `data: ${JSON.stringify({ type: 'connected', server: packageName, clientId })}\n\n`);

          // Keep alive ping (comment line or ping event)
          const keepAlive = setInterval(() => {
            safeSend(`event: ping\n` + `data: ${JSON.stringify({ type: 'ping', timestamp: Date.now() })}\n\n`);
          }, 30000);

          // Cleanup on close
          const cleanup = () => {
            if (closed) return;
            closed = true;
            clearInterval(keepAlive);
            server.events.off('message', messageHandler as any);
            try {
              controller.close();
            } catch (_) {}
            proxy.removeClient(serverId, clientId);
            logger.info(`SSE connection closed for client ${clientId}`);
          };

          // Ensure cleanup on GC/timeout
          setTimeout(cleanup, 30 * 60 * 1000); // 30 minute timeout

          // Attempt to tie cleanup to request abort if available
          try {
            const rawReq: any = (c as any).req?.raw ?? (c as any).req;
            rawReq?.signal?.addEventListener?.('abort', cleanup);
          } catch (_) { /* ignore */ }

          // Expose cancel handler for stream consumer shutdown
          // Note: cancel is defined below in ReadableStream initializer
          (this as any).cleanup = cleanup;
        },
        cancel() {
          // @ts-ignore - injected in start()
          this.cleanup?.();
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });

    } catch (error) {
      logger.error(`Failed to start SSE for ${packageName}:`, error);
      return c.json({ 
        error: 'Failed to start MCP server',
        message: String(error)
      }, 500);
    }
  }

  /**
   * Handle HTTP POST messages to MCP server
   */
  public async handleMessage(c: Context): Promise<Response> {
    const packageName = (c.req.param('*') || c.req.param('packageName')) as string;
    const params = Object.fromEntries(new URL(c.req.url).searchParams.entries());
    
    if (!packageName) {
      return c.json({ error: 'Package name required' }, 400);
    }

    try {
      const message = await c.req.json();
      const serverId = this.mcpProxy.computeServerId(packageName, params);

      // Ensure server exists with correct package type
      const detected = await detectPackageType(packageName);
      await this.mcpProxy.getOrCreateServer(packageName, detected.type, params);

      // Fire-and-forget: write message to MCP server stdin using JSON-RPC framing
      this.mcpProxy.send(serverId, message);

      return c.json({ accepted: true }, 202);

    } catch (error) {
      logger.error(`Error handling MCP message for ${packageName}:`, error);
      return c.json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32603,
          message: 'Internal error',
          data: String(error)
        }
      }, 500);
    }
  }
}
