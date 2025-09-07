# Cloudflare Configuration for MCP Registry

This guide shows how to configure Cloudflare for optimal performance and security with your MCP Registry.

## 🛡️ Security Rules

### 1. Rate Limiting Rules

Create these rules in **Security > WAF > Rate limiting rules**:

#### Basic API Rate Limiting
```
Rule Name: MCP Registry API Rate Limit
Match: Hostname equals "mcp.llmbase.ai"
Rate: 100 requests per minute per IP
Action: Block for 10 minutes
```

#### Package Endpoint Rate Limiting (More Restrictive)
```
Rule Name: MCP Package Endpoint Rate Limit  
Match: 
  - Hostname equals "mcp.llmbase.ai"
  - URI Path starts with "/package/"
Rate: 20 requests per minute per IP
Action: Block for 5 minutes
```

#### Health Check Exception
```
Rule Name: Health Check Exception
Match:
  - Hostname equals "mcp.llmbase.ai" 
  - URI Path equals "/health"
Action: Skip all remaining rules
```

### 2. Security Level

**Security > Settings**:
- Security Level: `High`
- Challenge Passage: `30 minutes`
- Browser Integrity Check: `Enabled`

### 3. Bot Fight Mode

**Security > Bots**:
- Bot Fight Mode: `Enabled`
- Static Resource Protection: `Enabled`

## 🚀 Performance Optimization

### 1. Caching Rules

**Caching > Caching Rules**:

#### Cache Static Responses
```
Rule Name: Cache API Documentation
Match: URI Path equals "/"
Cache Level: Standard
Edge TTL: 5 minutes
```

#### Don't Cache Package Requests
```
Rule Name: No Cache Package Requests
Match: URI Path starts with "/package/"
Cache Level: Bypass
```

#### Cache Health Checks
```
Rule Name: Cache Health Checks
Match: URI Path equals "/health"
Cache Level: Standard
Edge TTL: 1 minute
```

### 2. Speed Optimization

**Speed > Optimization**:
- Auto Minify: `JavaScript`, `CSS`, `HTML`
- Rocket Loader: `Off` (can break API responses)
- Mirage: `Off`
- Polish: `Off`
- Brotli: `Enabled`

## 🌐 DNS Configuration

**DNS > Records**:

```
Type: A
Name: mcp (or @ for root)
IPv4: YOUR_HETZNER_VPS_IP
Proxy status: Proxied (Orange cloud)
TTL: Auto
```

Optional subdomain:
```
Type: CNAME
Name: api
Target: mcp.llmbase.ai
Proxy status: Proxied
```

## 🔒 SSL/TLS Configuration

**SSL/TLS > Overview**:
- SSL/TLS encryption mode: `Full (strict)`

**SSL/TLS > Edge Certificates**:
- Always Use HTTPS: `Enabled`
- HTTP Strict Transport Security (HSTS): `Enabled`
  - Max Age Header: `6 months`
  - Include subdomains: `Enabled`
  - No-Sniff header: `Enabled`

## 📊 Analytics & Monitoring

### 1. Analytics

**Analytics > Web Analytics**:
- Enable Web Analytics for detailed traffic insights

### 2. Alerts

**Notifications > Notifications**:
- Rate Limiting Threshold Exceeded
- High Error Rate (4xx/5xx)
- Traffic Spike

## 🔧 Page Rules (Legacy - use Rules engine instead)

If you prefer Page Rules over the new Rules engine:

```
1. mcp.llmbase.ai/health*
   - Cache Level: Standard
   - Edge Cache TTL: 1 minute

2. mcp.llmbase.ai/package/*
   - Cache Level: Bypass
   - Security Level: High

3. mcp.llmbase.ai/*
   - Cache Level: Standard
   - Edge Cache TTL: 5 minutes
   - Security Level: Medium
```

## 🛠️ Advanced Security (Pro/Business Plans)

### 1. Custom Firewall Rules

**Security > WAF > Custom rules**:

#### Block Known Bad Patterns
```javascript
// Block common attack patterns
(http.request.uri.query contains "<?php" or 
 http.request.uri.query contains "<script" or
 http.request.uri.query contains "javascript:" or
 http.request.uri.query contains "vbscript:")
```

#### Geographic Restrictions (if needed)
```javascript
// Allow only specific countries (adjust as needed)
not (ip.geoip.country in {"US" "DE" "GB" "CA" "AU" "FR" "NL" "JP"})
```

### 2. Rate Limiting by Country/ASN

More advanced rate limiting based on:
- Geographic location
- ASN (hosting providers)
- User agent patterns

## 📱 Mobile Optimization

**Speed > Optimization**:
- Accelerated Mobile Pages (AMP): `Off`
- Image Resizing: `Enabled` (Pro+)
- Mirage: `Off` (can interfere with API responses)

## 🔍 Logging & Debugging

### Cloudflare Logpush (Enterprise)

If you have Enterprise plan, configure Logpush to send logs to your preferred destination for analysis.

### Basic Debugging

Use Cloudflare's **Trace** tool:
```bash
curl -H "CF-RAY: on" https://mcp.llmbase.ai/health
```

## 📋 Recommended Cloudflare Plan

For production MCP Registry:

- **Free**: Basic protection, good for development
- **Pro ($20/month)**: 
  - Advanced DDoS protection
  - Web Analytics
  - Image Optimization
  - Custom Page Rules (20)
- **Business ($200/month)**:
  - Advanced security features
  - Load balancing
  - Custom SSL certificates

## ⚡ Testing Your Setup

After configuration, test your setup:

```bash
# Test rate limiting
for i in {1..25}; do
  curl -w "%{http_code}\n" -o /dev/null -s "https://mcp.llmbase.ai/package/firecrawl-mcp/stdio?test=rate$i"
  sleep 1
done

# Test caching
curl -I "https://mcp.llmbase.ai/"
# Look for: cf-cache-status: HIT

# Test security headers
curl -I "https://mcp.llmbase.ai/"
# Look for security headers
```

## 🚨 Monitoring & Alerts

Set up monitoring for:
- Response time increases
- Error rate spikes
- Rate limit triggers
- SSL certificate expiration
- DNS resolution issues

With this Cloudflare configuration, your MCP Registry will have enterprise-grade security and performance without any application-level rate limiting! 🎯