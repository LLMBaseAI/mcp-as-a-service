import { validateArgs } from './validation.js';
import { parsePackageName } from './packages.js';
import { ParsedPackage } from './types.js';

export interface MCPCommandResult {
  command: string;
  args: string[];
}

/**
 * Builds MCP server command using convention-based approach
 * Supports npm and python package types with version handling
 */
export function buildMCPCommand(
  packageName: string, 
  packageType: 'npm' | 'python',
  customArgs?: string
): MCPCommandResult {
  const parsedPackage = parsePackageName(packageName);
  
  if (packageType === 'npm') {
    return buildNpmCommand(parsedPackage, customArgs);
  } else if (packageType === 'python') {
    return buildPythonCommand(parsedPackage, customArgs);
  } else {
    throw new Error(`Unsupported package type: ${packageType}`);
  }
}

function buildNpmCommand(parsedPackage: ParsedPackage, customArgs?: string): MCPCommandResult {
  const command = 'npx';
  const args: string[] = ['-y'];
  
  // Add package with version if specified
  if (parsedPackage.version && parsedPackage.version !== 'latest') {
    args.push(`${parsedPackage.fullName}@${parsedPackage.version}`);
  } else {
    args.push(parsedPackage.fullName);
  }
  
  // Add custom arguments if provided
  if (customArgs) {
    const decodedArgs = decodeURIComponent(customArgs);
    const validatedArgs = validateArgs(decodedArgs);
    args.push(...validatedArgs);
  }
  
  return { command, args };
}

function buildPythonCommand(parsedPackage: ParsedPackage, customArgs?: string): MCPCommandResult {
  const command = 'uvx';
  const args: string[] = [];
  
  // Add package with version if specified
  if (parsedPackage.version && parsedPackage.version !== 'latest') {
    args.push(`${parsedPackage.fullName}==${parsedPackage.version}`);
  } else {
    args.push(parsedPackage.fullName);
  }
  
  // Add custom arguments if provided
  if (customArgs) {
    const decodedArgs = decodeURIComponent(customArgs);
    const validatedArgs = validateArgs(decodedArgs);
    args.push(...validatedArgs);
  }
  
  return { command, args };
}