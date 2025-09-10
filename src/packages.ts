import { PackageDetectionResult, PackageValidationResult, ParsedPackage, PackageType } from './types.js';
import { isRemoteServer } from './validation.js';
import { HTTP_TIMEOUT } from './config.js';
import { logger } from './logger.js';
import { 
  validateNPMPackageInfo, 
  validateNPMDownloadStats, 
  validatePyPIPackageInfo,
  extractDownloadCount
} from './type-guards.js';

export async function detectPackageType(packageName: string): Promise<PackageDetectionResult> {
  if (isRemoteServer(packageName)) {
    throw new Error('REMOTE_SERVER_NOT_SUPPORTED');
  }
  
  const basePackageName = packageName.split('@')[0];
  
  // Try NPM first (most common)
  try {
    const npmResponse = await fetch(`https://registry.npmjs.org/${basePackageName}`, {
      signal: AbortSignal.timeout(HTTP_TIMEOUT)
    });
    
    if (npmResponse.status === 200) {
      const rawData = await npmResponse.json();
      const packageData = validateNPMPackageInfo(rawData);
      return { 
        type: 'npm', 
        registry: 'npmjs', 
        packageData: {
          name: packageData.name,
          version: packageData['dist-tags']?.latest,
          description: packageData.description
        }
      };
    }
  } catch (error) {
    logger.debug(`Package ${basePackageName} not found in NPM: ${error}`);
  }

  // Try PyPI
  try {
    const pypiResponse = await fetch(`https://pypi.org/pypi/${basePackageName}/json`, {
      signal: AbortSignal.timeout(HTTP_TIMEOUT)
    });
    
    if (pypiResponse.status === 200) {
      const rawData = await pypiResponse.json();
      const packageData = validatePyPIPackageInfo(rawData);
      return { 
        type: 'python', 
        registry: 'pypi', 
        packageData: {
          name: packageData.info.name,
          version: packageData.info.version,
          description: packageData.info.description
        }
      };
    }
  } catch (error) {
    logger.debug(`Package ${basePackageName} not found in PyPI: ${error}`);
  }

  throw new Error('PACKAGE_NOT_FOUND');
}

export async function validatePackage(packageName: string, downloadCache: Map<string, PackageValidationResult>): Promise<PackageValidationResult> {
  try {
    // Check cache first
    const cached = downloadCache.get(packageName);
    if (cached) {
      return cached;
    }

    const { type, packageData } = await detectPackageType(packageName);
    let isValid = false;
    let reason = '';

    if (type === 'npm') {
      // Check NPM downloads
      const basePackageName = packageName.split('@')[0];
      const response = await fetch(`https://api.npmjs.org/downloads/range/last-month/${basePackageName}`, {
        signal: AbortSignal.timeout(HTTP_TIMEOUT)
      });
      
      if (response.status === 200) {
        const rawData = await response.json();
        const downloadStats = validateNPMDownloadStats(rawData);
        const totalDownloads = extractDownloadCount(downloadStats);
        
        isValid = totalDownloads >= 100;
        reason = `${totalDownloads} downloads/month (minimum 100 required)`;
        logger.info(`NPM Package ${basePackageName} validation: ${totalDownloads} downloads, valid: ${isValid}`);
      }
    } else if (type === 'python') {
      // For Python packages, check if it's a well-maintained package
      // Note: packageData is now our cleaned, typed data
      const hasDescription = Boolean(packageData.description && packageData.description.length > 10);
      
      // Since we can't easily check recent releases from our cleaned data,
      // we'll use a simpler heuristic for now
      isValid = hasDescription;
      reason = `description=${hasDescription}`;
      logger.info(`Python Package ${packageName} validation: ${reason}, valid: ${isValid}`);
    }
    
    const result: PackageValidationResult = { valid: isValid, type, reason };
    downloadCache.set(packageName, result);
    return result;
  } catch (error) {
    logger.error(`Error validating package ${packageName}:`, error);
    
    if (error instanceof Error) {
      if (error.message === 'REMOTE_SERVER_NOT_SUPPORTED') {
        return { valid: false, type: 'remote', error: 'REMOTE_SERVER_NOT_SUPPORTED' };
      } else if (error.message === 'PACKAGE_NOT_FOUND') {
        return { valid: false, type: 'unknown', error: 'PACKAGE_NOT_FOUND' };
      }
    }
    
    return { valid: false, type: 'unknown', error: 'VALIDATION_ERROR', message: String(error) };
  }
}

export function parsePackageName(packageName: string): ParsedPackage {
  // Handle scoped packages like @org/package@version
  if (packageName.startsWith('@')) {
    const parts = packageName.split('@');
    if (parts.length === 3) {
      return {
        fullName: `@${parts[1]}`,
        scope: parts[1]!.split('/')[0]!,
        name: parts[1]!.split('/')[1]!,
        version: parts[2]!
      };
    } else if (parts.length === 2) {
      return {
        fullName: packageName,
        scope: parts[1]!.split('/')[0]!,
        name: parts[1]!.split('/')[1]!,
        version: 'latest'
      };
    }
  }
  
  // Handle regular packages like package@version
  const atIndex = packageName.lastIndexOf('@');
  if (atIndex > 0) {
    return {
      fullName: packageName.substring(0, atIndex),
      scope: null,
      name: packageName.substring(0, atIndex),
      version: packageName.substring(atIndex + 1)
    };
  }
  
  return {
    fullName: packageName,
    scope: null,
    name: packageName,
    version: 'latest'
  };
}