import { sanitizeEnvKey, sanitizeEnvValue } from './validation.js';
import { logger } from './logger.js';

/**
 * Common parameter mappings for popular MCP servers
 * This follows convention-over-configuration principle
 */
const PARAMETER_MAPPINGS: Record<string, string> = {
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

/**
 * Maps HTTP parameters to environment variables for MCP servers
 * Uses convention-based mappings with fallback to sanitized keys
 */
export function mapParametersToEnvironment(params: Record<string, unknown>): Record<string, string> {
  const env: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(params)) {
    // Skip 'args' as it's handled separately in command building
    if (key === 'args') {
      continue;
    }
    
    // Use specific mapping if available, otherwise sanitize the key
    const envKey = PARAMETER_MAPPINGS[key] || sanitizeEnvKey(key);
    
    if (envKey) {
      env[envKey] = sanitizeEnvValue(value);
      logger.info(`Mapped parameter ${key} to environment variable ${envKey}`);
    } else {
      logger.warn(`Skipped invalid environment variable key: ${key}`);
    }
  }
  
  return env;
}

/**
 * Add a new parameter mapping at runtime
 */
export function addParameterMapping(paramKey: string, envKey: string): void {
  PARAMETER_MAPPINGS[paramKey] = envKey;
  logger.info(`Added parameter mapping: ${paramKey} -> ${envKey}`);
}