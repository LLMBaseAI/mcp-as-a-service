/**
 * Runtime type validation utilities for external API responses
 * Replaces unsafe 'any' type casting with proper validation
 */

// NPM Registry API Response Types
export interface NPMPackageInfo {
  name: string;
  'dist-tags': { latest: string };
  versions: Record<string, unknown>;
  description?: string;
  [key: string]: unknown;
}

export interface NPMDownloadStats {
  downloads: Array<{
    day: string;
    downloads: number;
  }>;
  start: string;
  end: string;
  package: string;
}

// PyPI API Response Types
export interface PyPIPackageInfo {
  info: {
    name: string;
    version: string;
    description?: string;
    [key: string]: unknown;
  };
  urls?: Array<{
    upload_time: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

// Type Guards
export function isNPMPackageInfo(obj: unknown): obj is NPMPackageInfo {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'name' in obj &&
    typeof (obj as any).name === 'string' &&
    'dist-tags' in obj &&
    typeof (obj as any)['dist-tags'] === 'object'
  );
}

export function isNPMDownloadStats(obj: unknown): obj is NPMDownloadStats {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'downloads' in obj &&
    Array.isArray((obj as any).downloads) &&
    (obj as any).downloads.every((item: any) => 
      typeof item === 'object' &&
      'day' in item &&
      'downloads' in item &&
      typeof item.downloads === 'number'
    )
  );
}

export function isPyPIPackageInfo(obj: unknown): obj is PyPIPackageInfo {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'info' in obj &&
    typeof (obj as any).info === 'object' &&
    (obj as any).info !== null &&
    'name' in (obj as any).info &&
    typeof (obj as any).info.name === 'string'
  );
}

// Safe validation functions with fallback values
export function validateNPMPackageInfo(obj: unknown): NPMPackageInfo {
  if (isNPMPackageInfo(obj)) {
    return obj;
  }
  throw new Error('Invalid NPM package info format');
}

export function validateNPMDownloadStats(obj: unknown): NPMDownloadStats {
  if (isNPMDownloadStats(obj)) {
    return obj;
  }
  throw new Error('Invalid NPM download stats format');
}

export function validatePyPIPackageInfo(obj: unknown): PyPIPackageInfo {
  if (isPyPIPackageInfo(obj)) {
    return obj;
  }
  throw new Error('Invalid PyPI package info format');
}

/**
 * Safely extracts download count from NPM stats with fallback
 */
export function extractDownloadCount(stats: NPMDownloadStats): number {
  try {
    return stats.downloads.reduce((sum, day) => sum + day.downloads, 0);
  } catch (error) {
    return 0;
  }
}