#!/bin/bash

# Simple deployment script for MCP Registry

set -e

echo "🚀 Deploying MCP Registry..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Install PM2 if not already installed
if ! command -v pm2 &> /dev/null; then
    echo "📥 Installing PM2..."
    npm install -g pm2
fi

# Stop existing instance if running
echo "🛑 Stopping existing instance..."
pm2 stop mcp-registry 2>/dev/null || true
pm2 delete mcp-registry 2>/dev/null || true

# Start new instance
echo "▶️ Starting MCP Registry..."
pm2 start index.js --name mcp-registry

# Save PM2 configuration
pm2 save

# Show status
echo "✅ Deployment complete!"
echo "📊 Process status:"
pm2 show mcp-registry

echo ""
echo "🌐 Service endpoints:"
echo "  Health: http://localhost:3000/health"
echo "  Processes: http://localhost:3000/processes"
echo "  API: http://localhost:3000/"
echo ""
echo "📝 Example usage:"
echo "  curl 'http://localhost:3000/package/@21st-dev/magic/stdio?api_key=your_key'"
echo "  curl 'http://localhost:3000/package/@coingecko/coingecko-mcp/stdio?coingecko_pro_api_key=your_key'"