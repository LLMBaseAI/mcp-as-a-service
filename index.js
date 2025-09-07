import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { spawn, execSync } from 'child_process'
import axios from 'axios'
import NodeCache from 'node-cache'
import { v4 as uuidv4 } from 'uuid'
import winston from 'winston'

// Security constants
const MAX_CONCURRENT_PROCESSES = 10
const MAX_PACKAGE_NAME_LENGTH = 200
const MAX_PARAM_KEY_LENGTH = 100
const MAX_PARAM_VALUE_LENGTH = 1000
const MAX_PROCESS_LIFETIME = 30 * 60 * 1000 // 30 minutes
const ALLOWED_PROTOCOLS = ['stdio', 'sse', 'websocket']

// Security validation functions
function validatePackageName(packageName) {
  if (!packageName || typeof packageName !== 'string') {
    throw new Error('INVALID_PACKAGE_NAME:empty_or_invalid_type')
  }

  // Length check
  if (packageName.length > MAX_PACKAGE_NAME_LENGTH) {
    throw new Error('INVALID_PACKAGE_NAME:too_long')
  }

  // Remove version specifier for validation
  const basePackageName = packageName.split('@').slice(0, packageName.startsWith('@') ? 2 : 1).join('@')
  
  // NPM package name validation (supports scoped packages)
  const validPattern = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/
  if (!validPattern.test(basePackageName)) {
    throw new Error('INVALID_PACKAGE_NAME:invalid_format')
  }
  
  // Prevent path traversal
  if (packageName.includes('..') || packageName.includes('/./') || packageName.includes('\\')) {
    throw new Error('INVALID_PACKAGE_NAME:path_traversal')
  }
  
  // Prevent shell metacharacters
  if (/[;&|`$(){}[\]<>'"\\]/.test(packageName)) {
    throw new Error('INVALID_PACKAGE_NAME:shell_metacharacters')
  }

  return packageName
}

function validateProtocol(protocol) {
  if (!protocol || typeof protocol !== 'string') {
    throw new Error('INVALID_PROTOCOL:empty_or_invalid_type')
  }

  if (!ALLOWED_PROTOCOLS.includes(protocol.toLowerCase())) {
    throw new Error('INVALID_PROTOCOL:not_allowed')
  }

  return protocol.toLowerCase()
}

function sanitizeEnvKey(key) {
  if (!key || typeof key !== 'string' || key.length > MAX_PARAM_KEY_LENGTH) {
    return null
  }
  
  // Convert to valid environment variable name
  const envKey = key.replace(/[^a-zA-Z0-9_]/g, '_').toUpperCase()
  
  // Must start with letter or underscore
  if (!/^[A-Z_]/.test(envKey)) {
    return null
  }
  
  return envKey
}

function sanitizeEnvValue(value) {
  if (!value || typeof value !== 'string') {
    return ''
  }
  
  // Length limit
  if (value.length > MAX_PARAM_VALUE_LENGTH) {
    value = value.substring(0, MAX_PARAM_VALUE_LENGTH)
  }
  
  // Remove dangerous shell metacharacters
  return value.replace(/[;&|`$(){}[\]\\<>'"]/g, '')
}

function validateInputLimits(params) {
  Object.keys(params).forEach(key => {
    if (key.length > MAX_PARAM_KEY_LENGTH) {
      throw new Error('INVALID_INPUT:param_key_too_long')
    }
    if (typeof params[key] === 'string' && params[key].length > MAX_PARAM_VALUE_LENGTH) {
      throw new Error('INVALID_INPUT:param_value_too_long')
    }
  })
}

// Setup logging
const log = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ],
})

const app = new Hono()
const port = process.env.PORT || 3000

// Caches
const packageCache = new NodeCache({ stdTTL: 3600 }) // 1 hour
const processCache = new NodeCache({ stdTTL: 1800 }) // 30 minutes
const downloadCache = new NodeCache({ stdTTL: 86400 }) // 24 hours

// Store running MCP processes
const mcpProcesses = new Map()

// Common error responses with user guidance
const ErrorResponses = {
  REMOTE_SERVER_NOT_SUPPORTED: (packageName) => ({
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
  
  PACKAGE_NOT_FOUND: (packageName) => ({
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

  INVALID_VERSION: (packageName, version) => ({
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

  QUALITY_CHECK_FAILED: (packageName, type, reason) => ({
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

  RUNTIME_NOT_AVAILABLE: (command, packageType) => ({
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

  SERVER_START_FAILED: (packageName, reason) => ({
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
  })
}

// Middleware
app.use('*', cors())
app.use('*', secureHeaders())
app.use('*', logger())

// Check if package name contains URL patterns (remote servers)
function isRemoteServer(packageName) {
  const urlPatterns = [
    /^https?:\/\//, // http:// or https://
    /^wss?:\/\//, // ws:// or wss://
    /\.com/, /\.org/, /\.net/, /\.io/, // common TLDs
    /\/sse$/, /\/stdio$/, // MCP endpoints
    /mcp-remote/ // mcp-remote package pattern
  ]
  
  return urlPatterns.some(pattern => pattern.test(packageName))
}

// Detect package type and registry
async function detectPackageType(packageName) {
  // Check for remote server patterns first
  if (isRemoteServer(packageName)) {
    throw new Error('REMOTE_SERVER_NOT_SUPPORTED')
  }
  
  const basePackageName = packageName.split('@')[0] // Remove version if present
  
  // Try NPM first (most common)
  try {
    const npmResponse = await axios.get(`https://registry.npmjs.org/${basePackageName}`, { timeout: 5000 })
    if (npmResponse.status === 200) {
      return { type: 'npm', registry: 'npmjs', packageData: npmResponse.data }
    }
  } catch (error) {
    log.debug(`Package ${basePackageName} not found in NPM: ${error.message}`)
  }

  // Try PyPI
  try {
    const pypiResponse = await axios.get(`https://pypi.org/pypi/${basePackageName}/json`, { timeout: 5000 })
    if (pypiResponse.status === 200) {
      return { type: 'python', registry: 'pypi', packageData: pypiResponse.data }
    }
  } catch (error) {
    log.debug(`Package ${basePackageName} not found in PyPI: ${error.message}`)
  }

  throw new Error('PACKAGE_NOT_FOUND')
}

// Validate package downloads dynamically
async function validatePackage(packageName) {
  try {
    // Check cache first
    const cached = downloadCache.get(packageName)
    if (cached !== undefined) {
      return cached
    }

    const { type, packageData } = await detectPackageType(packageName)
    let isValid = false
    let reason = ''

    if (type === 'npm') {
      // Check NPM downloads
      const basePackageName = packageName.split('@')[0]
      const response = await axios.get(`https://api.npmjs.org/downloads/range/last-month/${basePackageName}`)
      const totalDownloads = response.data.downloads?.reduce((sum, day) => sum + day.downloads, 0) || 0
      
      isValid = totalDownloads >= 100
      reason = `${totalDownloads} downloads/month (minimum 100 required)`
      log.info(`NPM Package ${basePackageName} validation: ${totalDownloads} downloads, valid: ${isValid}`)
    } else if (type === 'python') {
      // For Python packages, check if it's a well-maintained package (basic heuristics)
      const info = packageData.info
      const hasRecentRelease = new Date(packageData.urls?.[0]?.upload_time || 0) > new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) // Within last year
      const hasDescription = info.description && info.description.length > 10
      
      isValid = hasRecentRelease && hasDescription
      reason = `recent=${hasRecentRelease}, description=${hasDescription}`
      log.info(`Python Package ${packageName} validation: ${reason}, valid: ${isValid}`)
    }
    
    downloadCache.set(packageName, { valid: isValid, type, reason })
    return { valid: isValid, type, reason }
  } catch (error) {
    log.error(`Error validating package ${packageName}:`, error.message)
    
    // Handle specific error types
    if (error.message === 'REMOTE_SERVER_NOT_SUPPORTED') {
      return { valid: false, type: 'remote', error: 'REMOTE_SERVER_NOT_SUPPORTED' }
    } else if (error.message === 'PACKAGE_NOT_FOUND') {
      return { valid: false, type: 'unknown', error: 'PACKAGE_NOT_FOUND' }
    }
    
    return { valid: false, type: 'unknown', error: 'VALIDATION_ERROR', message: error.message }
  }
}

// Dynamic parameter mapping (converts snake_case to UPPER_CASE env vars)
function mapParametersToEnv(params) {
  const env = { ...process.env }
  
  // Convert all parameters to environment variables with sanitization
  Object.keys(params).forEach(key => {
    if (key !== 'args') { // 'args' is handled separately in buildMCPCommand
      const envKey = sanitizeEnvKey(key)
      if (envKey) {
        env[envKey] = sanitizeEnvValue(params[key])
      } else {
        log.warn(`Skipped invalid environment variable key: ${key}`)
      }
    }
  })
  
  return env
}

// Parse package name with version support
function parsePackageName(packageName) {
  // Handle scoped packages like @org/package@version
  if (packageName.startsWith('@')) {
    const parts = packageName.split('@')
    if (parts.length === 3) {
      return {
        fullName: `@${parts[1]}`,
        scope: parts[1].split('/')[0],
        name: parts[1].split('/')[1],
        version: parts[2]
      }
    } else if (parts.length === 2) {
      return {
        fullName: packageName,
        scope: parts[1].split('/')[0],
        name: parts[1].split('/')[1],
        version: 'latest'
      }
    }
  }
  
  // Handle regular packages like package@version
  const atIndex = packageName.lastIndexOf('@')
  if (atIndex > 0) {
    return {
      fullName: packageName.substring(0, atIndex),
      scope: null,
      name: packageName.substring(0, atIndex),
      version: packageName.substring(atIndex + 1)
    }
  }
  
  return {
    fullName: packageName,
    scope: null,
    name: packageName,
    version: 'latest'
  }
}

// Build MCP command dynamically based on package type
function buildMCPCommand(packageName, packageType, params = {}) {
  const env = mapParametersToEnv(params)
  const parsedPackage = parsePackageName(packageName)
  
  let command, args

  if (packageType === 'python') {
    // Python packages use uvx
    command = 'uvx'
    
    // Handle version specification
    if (parsedPackage.version && parsedPackage.version !== 'latest') {
      args = [`${parsedPackage.fullName}==${parsedPackage.version}`]
    } else {
      args = [parsedPackage.fullName]
    }
    
    // Add any additional arguments passed as 'args' parameter (with validation)
    if (params.args) {
      const customArgsRaw = decodeURIComponent(params.args)
      
      // Validate args don't contain dangerous patterns
      if (/[;&|`$(){}[\]<>'"\\]/.test(customArgsRaw)) {
        throw new Error('INVALID_ARGS:contains_dangerous_characters')
      }
      
      const customArgs = customArgsRaw.split(' ')
        .filter(arg => arg.trim())
        .map(arg => arg.substring(0, 100)) // Limit arg length
        .slice(0, 20) // Limit number of args
      
      args.push(...customArgs)
    }
    
  } else if (packageType === 'npm') {
    // NPM packages use npx
    command = 'npx'
    
    // Handle version specification
    if (parsedPackage.version && parsedPackage.version !== 'latest') {
      args = ['-y', `${parsedPackage.fullName}@${parsedPackage.version}`]
    } else {
      args = ['-y', parsedPackage.fullName]
    }
    
    // Add any additional arguments passed as 'args' parameter (with validation)
    if (params.args) {
      const customArgsRaw = decodeURIComponent(params.args)
      
      // Validate args don't contain dangerous patterns
      if (/[;&|`$(){}[\]<>'"\\]/.test(customArgsRaw)) {
        throw new Error('INVALID_ARGS:contains_dangerous_characters')
      }
      
      const customArgs = customArgsRaw.split(' ')
        .filter(arg => arg.trim())
        .map(arg => arg.substring(0, 100)) // Limit arg length
        .slice(0, 20) // Limit number of args
      
      args.push(...customArgs)
    }
    
  } else {
    throw new Error(`Unsupported package type: ${packageType}`)
  }

  return { command, args, env }
}

// Check if command exists
function commandExists(command) {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' })
    return true
  } catch (error) {
    return false
  }
}

// Start MCP server process
async function startMCPServer(packageName, protocol, packageType, params = {}) {
  const processId = `${packageName}_${protocol}_${Date.now()}`
  
  try {
    // Check concurrent process limit
    if (mcpProcesses.size >= MAX_CONCURRENT_PROCESSES) {
      throw new Error(`MAX_PROCESSES_EXCEEDED:${MAX_CONCURRENT_PROCESSES}`)
    }

    const { command, args, env } = buildMCPCommand(packageName, packageType, params)

    // Check if command exists
    if (!commandExists(command)) {
      throw new Error(`RUNTIME_NOT_AVAILABLE:${command}:${packageType}`)
    }

    log.info(`Starting ${packageType} MCP server: ${command} ${args.join(' ')}`)
    
    const mcpProcess = spawn(command, args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    })

    // Store process information
    mcpProcesses.set(processId, {
      process: mcpProcess,
      packageName,
      protocol,
      startTime: Date.now(),
      lastAccess: Date.now()
    })

    // Handle process events
    mcpProcess.on('error', (error) => {
      log.error(`MCP server ${processId} error:`, error)
      mcpProcesses.delete(processId)
    })

    mcpProcess.on('exit', (code) => {
      log.info(`MCP server ${processId} exited with code ${code}`)
      mcpProcesses.delete(processId)
    })

    // Log process output
    mcpProcess.stdout.on('data', (data) => {
      log.info(`${processId} stdout: ${data}`)
    })

    mcpProcess.stderr.on('data', (data) => {
      log.error(`${processId} stderr: ${data}`)
    })

    // Wait a bit for the process to start
    await new Promise(resolve => setTimeout(resolve, 2000))

    return processId
  } catch (error) {
    log.error(`Failed to start MCP server for ${packageName}:`, error)
    throw error
  }
}

// Clean up inactive processes
function cleanupProcesses() {
  const now = Date.now()
  const maxAge = 30 * 60 * 1000 // 30 minutes

  mcpProcesses.forEach((processInfo, processId) => {
    if (now - processInfo.lastAccess > maxAge) {
      log.info(`Cleaning up inactive process ${processId}`)
      processInfo.process.kill()
      mcpProcesses.delete(processId)
    }
  })
}

// Run cleanup every 10 minutes
setInterval(cleanupProcesses, 10 * 60 * 1000)

// Routes

// Root endpoint with API documentation
app.get('/', (c) => {
  return c.json({
    name: 'MCP Registry',
    version: '2.0.0',
    description: 'Fully dynamic MCP server registry powered by Hono',
    runtime: 'Hono + Node.js',
    usage: {
      endpoint: '/package/:packageName/:protocol',
      examples: [
        '/package/firecrawl-mcp/stdio?firecrawlApiKey=your_key',
        '/package/@coingecko/coingecko-mcp/stdio?coingeckoProApiKey=key&args=--client%3Dclaude'
      ],
      parameters: 'Pass configuration via URL query parameters (automatically mapped to env vars)'
    },
    endpoints: {
      health: '/health',
      processes: '/processes'
    },
    features: [
      'Dynamic package detection (NPM + PyPI)',
      'Version support (@latest, @1.2.3)',
      'Smart parameter mapping',
      'Comprehensive error guidance',
      'Process management with auto-cleanup'
    ]
  })
})

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ 
    status: 'healthy',
    activeProcesses: mcpProcesses.size,
    uptime: process.uptime(),
    runtime: 'Hono',
    timestamp: new Date().toISOString()
  })
})

// List active processes
app.get('/processes', (c) => {
  const processes = Array.from(mcpProcesses.entries()).map(([id, info]) => ({
    id,
    packageName: info.packageName,
    protocol: info.protocol,
    startTime: info.startTime,
    lastAccess: info.lastAccess,
    uptime: Date.now() - info.startTime
  }))
  
  return c.json({ 
    processes,
    total: processes.length,
    timestamp: new Date().toISOString()
  })
})

// Main route handler - handle scoped packages with @
app.get('/package/*', async (c) => {
  try {
    // Extract package name and protocol from the full path
    const fullPath = c.req.path.replace('/package/', '')
    const pathParts = fullPath.split('/')
    const rawProtocol = pathParts.pop() // last part is protocol
    const rawPackageName = pathParts.join('/') // everything else is package name
    const params = c.req.query()

    // Validate all inputs immediately
    const packageName = validatePackageName(rawPackageName)
    const protocol = validateProtocol(rawProtocol)
    validateInputLimits(params)

    log.info(`Request for package: ${packageName}, protocol: ${protocol}, params:`, params)

    // Validate package and detect type
    const packageInfo = await validatePackage(packageName)
    if (!packageInfo.valid) {
      // Handle specific error types with helpful guidance
      if (packageInfo.error === 'REMOTE_SERVER_NOT_SUPPORTED') {
        return c.json(ErrorResponses.REMOTE_SERVER_NOT_SUPPORTED(packageName), 400)
      } else if (packageInfo.error === 'PACKAGE_NOT_FOUND') {
        return c.json(ErrorResponses.PACKAGE_NOT_FOUND(packageName), 404)
      } else if (packageInfo.type !== 'unknown') {
        return c.json(ErrorResponses.QUALITY_CHECK_FAILED(packageName, packageInfo.type, packageInfo.reason), 400)
      } else {
        return c.json(ErrorResponses.PACKAGE_NOT_FOUND(packageName), 400)
      }
    }

    // Check if we already have a running process for this package/protocol combo
    let processId = null
    for (const [id, info] of mcpProcesses.entries()) {
      if (info.packageName === packageName && info.protocol === protocol) {
        info.lastAccess = Date.now()
        processId = id
        break
      }
    }

    // Start new process if needed
    if (!processId) {
      try {
        processId = await startMCPServer(packageName, protocol, packageInfo.type, params)
      } catch (startError) {
        log.error(`Failed to start MCP server for ${packageName}:`, startError.message)
        
        // Handle specific startup errors
        if (startError.message.startsWith('RUNTIME_NOT_AVAILABLE:')) {
          const [, command, packageType] = startError.message.split(':')
          return c.json(ErrorResponses.RUNTIME_NOT_AVAILABLE(command, packageType), 424)
        } else if (startError.message.includes('ETARGET') || startError.message.includes('No matching version')) {
          const parsedPackage = parsePackageName(packageName)
          return c.json(ErrorResponses.INVALID_VERSION(parsedPackage.fullName, parsedPackage.version), 404)
        } else {
          return c.json(ErrorResponses.SERVER_START_FAILED(packageName, startError.message), 500)
        }
      }
    }

    const processInfo = mcpProcesses.get(processId)
    if (!processInfo) {
      return c.json(ErrorResponses.SERVER_START_FAILED(packageName, 'Process not found after startup'), 500)
    }

    // Return process information and connection details
    const { command, args, env } = buildMCPCommand(packageName, packageInfo.type, params)
    const parsedPackage = parsePackageName(packageName)
    
    return c.json({
      success: true,
      processId,
      packageName,
      packageType: packageInfo.type,
      version: parsedPackage.version,
      protocol,
      status: 'running',
      startTime: processInfo.startTime,
      message: `${packageInfo.type.toUpperCase()} MCP server is running. For full MCP protocol support, implement WebSocket or stdio connection.`,
      connectionInfo: {
        command,
        args,
        env: Object.keys(params).reduce((envVars, key) => {
          const envKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
                             .toUpperCase()
                             .replace(/-/g, '_')
          envVars[envKey] = params[key]
          return envVars
        }, {})
      },
      runtime: 'Hono'
    })

  } catch (error) {
    log.error('Request error:', error.message)
    
    // Handle security validation errors
    if (error.message.startsWith('INVALID_PACKAGE_NAME:')) {
      const errorType = error.message.split(':')[1]
      const errorMessages = {
        'empty_or_invalid_type': 'Package name is required and must be a string',
        'too_long': `Package name too long (max ${MAX_PACKAGE_NAME_LENGTH} characters)`,
        'invalid_format': 'Invalid package name format. Must be valid NPM/PyPI package name',
        'path_traversal': 'Path traversal detected in package name',
        'shell_metacharacters': 'Package name contains dangerous shell characters'
      }
      return c.json({
        error: 'Invalid package name',
        message: errorMessages[errorType] || 'Package name validation failed',
        guidance: {
          examples: ['firecrawl-mcp', '@supabase/mcp-server-supabase'],
          requirements: ['Valid NPM/PyPI format', 'No shell metacharacters', 'No path traversal']
        }
      }, 400)
    }
    
    if (error.message.startsWith('INVALID_PROTOCOL:')) {
      return c.json({
        error: 'Invalid protocol',
        message: 'Protocol must be one of: ' + ALLOWED_PROTOCOLS.join(', '),
        guidance: {
          examples: ['stdio', 'sse', 'websocket']
        }
      }, 400)
    }
    
    if (error.message.startsWith('INVALID_INPUT:')) {
      return c.json({
        error: 'Invalid input',
        message: 'Request parameters exceed size limits',
        guidance: {
          limits: {
            paramKeyLength: MAX_PARAM_KEY_LENGTH,
            paramValueLength: MAX_PARAM_VALUE_LENGTH
          }
        }
      }, 400)
    }
    
    if (error.message.startsWith('MAX_PROCESSES_EXCEEDED:')) {
      return c.json({
        error: 'Too many active processes',
        message: `Maximum ${MAX_CONCURRENT_PROCESSES} concurrent processes allowed`,
        guidance: {
          suggestion: 'Wait for existing processes to complete or contact administrator'
        }
      }, 429)
    }
    
    if (error.message.startsWith('INVALID_ARGS:')) {
      return c.json({
        error: 'Invalid arguments',
        message: 'Command arguments contain dangerous characters',
        guidance: {
          suggestion: 'Remove shell metacharacters from args parameter'
        }
      }, 400)
    }
    
    return c.json({ error: 'Internal server error', runtime: 'Hono' }, 500)
  }
})

// Graceful shutdown
process.on('SIGTERM', () => {
  log.info('SIGTERM received, shutting down gracefully')
  
  // Kill all MCP processes
  mcpProcesses.forEach((processInfo, processId) => {
    log.info(`Killing process ${processId}`)
    processInfo.process.kill()
  })
  
  process.exit(0)
})

// Start server
serve({
  fetch: app.fetch,
  port
}, (info) => {
  log.info(`🔥 Hono MCP Registry server running on port ${port}`)
})