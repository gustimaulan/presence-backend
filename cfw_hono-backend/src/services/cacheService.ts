import { DEFAULT_CACHE_DURATION } from '../config/constants';
import { SearchCriteria } from '../utils/dataProcessor';

export interface CloudflareBindings {
  presence_be_kv: KVNamespace;
  GOOGLE_SHEET_ID: string;
  GOOGLE_API_KEY: string;
  GOOGLE_SHEET_RANGE: string;
  CACHE_DURATION?: string;
  ALLOWED_ORIGINS?: string;
}

class CacheService {
  private cacheKV: KVNamespace;
  private cacheDuration: number;

  constructor(env: CloudflareBindings) {
    this.cacheKV = env.presence_be_kv;
    this.cacheDuration = parseInt(env.CACHE_DURATION || '', 10) || DEFAULT_CACHE_DURATION;
    console.log(`Cache service initialized with Cloudflare KV and ${this.cacheDuration}ms TTL`);
  }

  generateKey(year: string | null = null, page: number = 1, pageSize: number = 100, searchParams: SearchCriteria = {}): string {
    const parts = ['data'];
    if (year) parts.push(`year:${year}`);
    parts.push(`page:${page}`);
    parts.push(`size:${pageSize}`);
    
    if (searchParams.search) parts.push(`s:${encodeURIComponent(searchParams.search.toLowerCase().trim())}`);
    if (searchParams.teacher) parts.push(`t:${encodeURIComponent(searchParams.teacher.toLowerCase().trim())}`);
    if (searchParams.student) parts.push(`st:${encodeURIComponent(searchParams.student.toLowerCase().trim())}`);
    if (searchParams.dateFrom) parts.push(`from:${searchParams.dateFrom}`);
    if (searchParams.dateTo) parts.push(`to:${searchParams.dateTo}`);
    
    return parts.join('|');
  }

  generateSearchKey(year: string | null = null, page: number = 1, pageSize: number = 100, search: string | null = null): string {
    const searchParams = search ? { search } : {};
    return this.generateKey(year, page, pageSize, searchParams);
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.cacheKV.get(key);
      if (!data) {
        console.log(`Cache miss for key: ${key}`);
        return null;
      }
      
      console.log(`Cache hit for key: ${key}`);
      const parsedData = JSON.parse(data);
      return { ...parsedData, cached: true } as T;
    } catch (error) {
      console.error(`Error getting cache for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, data: any): Promise<void> {
    try {
      const jsonData = JSON.stringify(data);
      // Cloudflare KV uses expirationTtl in seconds
      const expirationTtl = Math.floor(this.cacheDuration / 1000);
      await this.cacheKV.put(key, jsonData, { expirationTtl });
      console.log(`Data cached with key: ${key}, expires in: ${expirationTtl}s`);
    } catch (error) {
      console.error(`Error setting cache for key ${key}:`, error);
    }
  }

  async clear(): Promise<void> {
    try {
      const { keys } = await this.cacheKV.list();
      await Promise.all(keys.map(key => this.cacheKV.delete(key.name)));
      console.log(`Cache cleared. Removed ${keys.length} entries.`);
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  async clearPattern(pattern: string): Promise<number> {
    let cleared = 0;
    try {
      let allKeys: string[] = [];
      let listComplete = false;
      
      // Get all keys with the data prefix
      const { keys } = await this.cacheKV.list({ prefix: 'data|' });
      allKeys = allKeys.concat(keys.map(k => k.name));

      const keysToDelete = allKeys.filter(key => key.includes(pattern));

      if (keysToDelete.length > 0) {
        await Promise.all(keysToDelete.map(key => this.cacheKV.delete(key)));
        cleared = keysToDelete.length;
        console.log(`Cache pattern clear: '${pattern}'. Removed ${cleared} entries.`);
      } else {
        console.log(`Cache pattern clear: '${pattern}'. No matching keys found.`);
      }
    } catch (error) {
      console.error(`Error clearing pattern ${pattern}:`, error);
    }
    return cleared;
  }

  async getStats(): Promise<any> {
    // Cloudflare KV does not expose detailed stats like Redis. Provide basic info.
    try {
      const { keys } = await this.cacheKV.list();
      return {
        total_keys: keys.length,
        cacheDuration: this.cacheDuration,
        // Add other relevant KV stats if available or necessary
      };
    } catch (error) {
      console.error('Error getting KV stats:', error);
      return { error: 'Could not retrieve KV stats' };
    }
  }
}

export default CacheService;
