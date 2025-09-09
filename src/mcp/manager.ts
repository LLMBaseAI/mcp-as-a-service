export type Language = 'node' | 'python'

export type InstanceStatus = 'starting' | 'running' | 'stopped' | 'error'

export interface InstanceSpec {
  pkg: string
  language: Language
  command?: string
  args?: string[]
}

export interface MCPInstance {
  id: string
  pkg: string
  language: Language
  status: InstanceStatus
  startedAt?: string
  stoppedAt?: string
  pid?: number
  errorMessage?: string
}

function randomId() {
  return Math.random().toString(36).slice(2, 10)
}

export class InstanceManager {
  private instances = new Map<string, MCPInstance>()

  list() {
    return Array.from(this.instances.values())
  }

  get(id: string) {
    return this.instances.get(id)
  }

  async create(spec: InstanceSpec): Promise<MCPInstance> {
    const id = randomId()
    const base: MCPInstance = {
      id,
      pkg: spec.pkg,
      language: spec.language,
      status: 'starting',
      startedAt: new Date().toISOString(),
    }
    this.instances.set(id, base)

    // Placeholder: Defer actual install/spawn to later.
    // For now, pretend it starts successfully.
    await Bun.sleep(10)
    const running: MCPInstance = {
      ...base,
      status: 'running',
    }
    this.instances.set(id, running)
    return running
  }

  async stop(id: string): Promise<boolean> {
    const inst = this.instances.get(id)
    if (!inst) return false
    // Placeholder: terminate spawned process when implemented
    inst.status = 'stopped'
    inst.stoppedAt = new Date().toISOString()
    this.instances.set(id, inst)
    return true
  }

  async call(id: string, payload: unknown): Promise<unknown> {
    const inst = this.instances.get(id)
    if (!inst) return { error: 'not_found' }
    if (inst.status !== 'running') return { error: 'not_running', status: inst.status }
    // Placeholder: This will proxy JSON-RPC over stdio to the MCP server.
    return { ok: false, error: 'not_implemented', echo: payload }
  }
}

