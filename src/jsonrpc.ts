import { ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

export class JsonRpcFramer {
  static encode(message: unknown): Buffer {
    const json = Buffer.from(JSON.stringify(message), 'utf8')
    const header = Buffer.from(`Content-Length: ${json.length}\r\n\r\n`, 'utf8')
    return Buffer.concat([header, json])
  }
}

export class JsonRpcParser extends EventEmitter {
  private buffer: Buffer = Buffer.alloc(0)

  feed(chunk: Buffer) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    // Try to parse as many frames as available
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) break

      const headerPart = this.buffer.slice(0, headerEnd).toString('utf8')
      const match = headerPart.match(/Content-Length:\s*(\d+)/i)
      const len = match ? parseInt(match[1]!, 10) : NaN
      if (!Number.isFinite(len)) {
        // If header malformed, drop until after separator and continue
        this.buffer = this.buffer.slice(headerEnd + 4)
        continue
      }

      const frameStart = headerEnd + 4
      const frameEnd = frameStart + len
      if (this.buffer.length < frameEnd) break // wait for more

      const body = this.buffer.slice(frameStart, frameEnd).toString('utf8')
      this.buffer = this.buffer.slice(frameEnd)
      try {
        const obj = JSON.parse(body)
        this.emit('message', obj)
      } catch {
        // ignore invalid JSON
      }
    }
  }
}

export function attachJsonRpc(child: ChildProcess) {
  const parser = new JsonRpcParser()
  child.stdout?.on('data', (d: Buffer) => parser.feed(d))
  return {
    parser,
    send: (msg: unknown) => child.stdin?.write(JsonRpcFramer.encode(msg)),
  }
}

