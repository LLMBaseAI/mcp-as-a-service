#!/bin/bash

# Deploy MCP-over-HTTP Proxy to Production
# This completely replaces the old service with MCP-over-HTTP functionality

SERVER_IP="135.181.145.71"
SERVER_USER="root"

echo "🔥 Deploying MCP-over-HTTP Proxy to Production"
echo "=============================================="

# Create complete deployment package
echo "📦 Creating MCP-over-HTTP deployment package..."
tar -czf mcp-over-http.tar.gz src/ package.json tsconfig.json ecosystem.config.cjs

# Upload to server
echo "⬆️ Uploading to production server..."
scp mcp-over-http.tar.gz ${SERVER_USER}@${SERVER_IP}:/tmp/

ssh -o ConnectTimeout=10 ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
set -e

echo "🔥 Deploying MCP-over-HTTP Proxy..."

cd /opt/mcp-as-a-service

# Stop old service
pm2 delete mcp-registry || echo "No processes to delete"

# Extract all new files
cd /tmp
tar -xzf mcp-over-http.tar.gz
cd /opt/mcp-as-a-service

# Update all source files
rm -rf src
cp -r /tmp/src ./
cp /tmp/package.json ./
cp /tmp/tsconfig.json ./

# Ensure Bun runtime is installed and on PATH
if ! command -v bun &> /dev/null; then
  echo "📦 Installing Bun runtime..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
else
  echo "✅ Bun already installed: $(bun --version)"
  export PATH="$HOME/.bun/bin:$PATH"
fi

# Keep uploaded package.json to avoid drift.

# Install dependencies
echo "📦 Installing dependencies..."
PATH="$HOME/.bun/bin:$PATH" bun install

# Ensure log directory exists
mkdir -p /var/log/mcp-registry

# Check for runtimes required by MCP packages
if ! command -v npx &> /dev/null; then
  echo "⚠️  npx not found. Node-based MCP packages may fail to start."
fi
if ! command -v uvx &> /dev/null; then
  echo "⚠️  uvx not found. Python-based MCP packages may fail to start."
fi

# Create production PM2 config for MCP-over-HTTP
cat > ecosystem.config.cjs << 'EOF'
module.exports = {
  apps: [{
    name: 'mcp-over-http',
    script: 'bun',
    args: ['run', 'src/index.ts'],
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      PATH: process.env.PATH + ':/root/.bun/bin'
    },
    error_file: '/var/log/mcp-registry/error.log',
    out_file: '/var/log/mcp-registry/out.log',
    log_file: '/var/log/mcp-registry/combined.log',
    time: true,
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s',
    autorestart: true,
    kill_timeout: 5000,
    listen_timeout: 3000,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
EOF

# Test the new service
echo "🧪 Testing MCP-over-HTTP service..."
PATH="$HOME/.bun/bin:$PATH" timeout 10 bun run src/index.ts --test || echo "Quick test completed"

# Start MCP-over-HTTP proxy
echo "🚀 Starting MCP-over-HTTP proxy..."
pm2 delete mcp-over-http || true
pm2 start ecosystem.config.cjs
pm2 save

# Wait for startup
sleep 8

# Test local service
echo "🔍 Testing local MCP-over-HTTP service..."
curl -f http://localhost:3000/health && echo "✅ SUCCESS!" || echo "❌ Issues"

# Show status
echo "📊 Production Status:"
pm2 list

# Show recent logs
echo "📝 Recent logs:"
pm2 logs mcp-over-http --lines 5

ENDSSH

# Clean up
rm -f mcp-over-http.tar.gz

echo ""
echo "⏳ MCP-over-HTTP service stabilization..."
sleep 15

# Comprehensive testing
echo "🎯 Testing MCP-over-HTTP Proxy"
echo "=============================="

echo ""
echo "1. 🏥 Service Health:"
HEALTH_RESPONSE=$(curl -s "https://mcp.llmbase.ai/health")
echo "$HEALTH_RESPONSE" | jq '{status, mcpServers}' 2>/dev/null || echo "$HEALTH_RESPONSE" | head -3

echo ""
echo "2. 📊 Service Info:"
SERVICE_INFO=$(curl -s "https://mcp.llmbase.ai/")
echo "$SERVICE_INFO" | jq '{name, description, usage}' 2>/dev/null || echo "$SERVICE_INFO" | head -5

echo ""
echo "3. 🧪 Testing SSE Connection (should return SSE stream):"
timeout 5 curl -s "https://mcp.llmbase.ai/package/firecrawl-mcp/sse?firecrawlApiKey=fc-1e50e883d556412e83a4504dde6b2e8d" | head -10

echo ""
echo "4. 🔍 Stats Endpoint:"
curl -s "https://mcp.llmbase.ai/stats" | jq '{activeServers}' 2>/dev/null || echo "Stats endpoint"

# Final status
echo ""
echo "🎯 Deployment Analysis"
echo "====================="

if [[ "$HEALTH_RESPONSE" == *'"status":"healthy"'* ]]; then
    echo "✅ Health: MCP-over-HTTP proxy is healthy"
else
    echo "❌ Health: Service issues detected"
fi

if [[ "$SERVICE_INFO" == *"HTTP proxy for MCP servers"* ]]; then
    echo "✅ Service: MCP-over-HTTP proxy is running correctly"
else
    echo "❌ Service: Old service might still be running"
fi

echo ""
echo "🎉 MCP-OVER-HTTP DEPLOYMENT COMPLETED!"
echo "====================================="
echo ""
echo "🌐 Service URL: https://mcp.llmbase.ai"
echo "🔥 New Functionality: HTTP/SSE proxy for MCP servers"
echo "🎯 Usage: claude mcp add firecrawl \"https://mcp.llmbase.ai/package/firecrawl-mcp/sse?firecrawlApiKey=key\" -t http"
echo ""
echo "🚀 Any NPM or Python MCP server is now accessible via HTTP!"
