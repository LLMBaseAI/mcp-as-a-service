import NodeCache from 'node-cache';
import { PackageValidationResult } from './types.js';
import { CACHE_TTL } from './config.js';

export class CacheManager {
  private packageCache: NodeCache;
  private processCache: NodeCache;
  public downloadCache: Map<string, PackageValidationResult>;

  constructor() {
    this.packageCache = new NodeCache({ stdTTL: CACHE_TTL.package });
    this.processCache = new NodeCache({ stdTTL: CACHE_TTL.process });
    this.downloadCache = new Map<string, PackageValidationResult>();
    
    // Clean up download cache periodically (every hour)
    setInterval(() => {
      this.downloadCache.clear();
    }, 60 * 60 * 1000);
  }

  // Package cache methods
  public getPackage(key: string): any {
    return this.packageCache.get(key);
  }

  public setPackage(key: string, value: any): void {
    this.packageCache.set(key, value);
  }

  public hasPackage(key: string): boolean {
    return this.packageCache.has(key);
  }

  // Process cache methods  
  public getProcess(key: string): any {
    return this.processCache.get(key);
  }

  public setProcess(key: string, value: any): void {
    this.processCache.set(key, value);
  }

  public hasProcess(key: string): boolean {
    return this.processCache.has(key);
  }

  // Download validation cache methods (using public downloadCache Map)
  public getDownloadValidation(packageName: string): PackageValidationResult | undefined {
    return this.downloadCache.get(packageName);
  }

  public setDownloadValidation(packageName: string, result: PackageValidationResult): void {
    this.downloadCache.set(packageName, result);
  }

  public hasDownloadValidation(packageName: string): boolean {
    return this.downloadCache.has(packageName);
  }

  // Memory optimization methods
  public getStats(): {
    packageCache: { keys: number; hits: number; misses: number; };
    processCache: { keys: number; hits: number; misses: number; };
    downloadCache: { size: number; };
  } {
    const packageStats = this.packageCache.getStats();
    const processStats = this.processCache.getStats();
    
    return {
      packageCache: {
        keys: packageStats.keys,
        hits: packageStats.hits,
        misses: packageStats.misses
      },
      processCache: {
        keys: processStats.keys,
        hits: processStats.hits,
        misses: processStats.misses
      },
      downloadCache: {
        size: this.downloadCache.size
      }
    };
  }

  public clearAll(): void {
    this.packageCache.flushAll();
    this.processCache.flushAll();
    this.downloadCache.clear();
  }
}