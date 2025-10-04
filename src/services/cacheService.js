import Redis from 'ioredis';
import { DEFAULT_CACHE_DURATION, REDIS_URL } from '../config/constants.js';

class CacheService {
  constructor() {
    this.cacheDuration = parseInt(process.env.CACHE_DURATION, 10) || DEFAULT_CACHE_DURATION;
    
    try {
      this.redis = new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        connectTimeout: 10000,
      });

      this.redis.on('connect', () => console.log('Redis client connected'));
      this.redis.on('error', (err) => console.error('Redis client error:', err));

      console.log(`Cache service initialized with Redis at ${REDIS_URL.split('@').pop()} and ${this.cacheDuration}ms TTL`);
    } catch (error) {
      console.error('Failed to initialize Redis client:', error);
      this.redis = null; // Set to null if initialization fails
    }
  }

  generateKey(year = null, page = 1, pageSize = 100, searchParams = {}) {
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

  generateSearchKey(year = null, page = 1, pageSize = 100, search = null) {
    const searchParams = search ? { search } : {};
    return this.generateKey(year, page, pageSize, searchParams);
  }

  async get(key) {
    if (!this.redis) return null;

    try {
      const data = await this.redis.get(key);
      if (!data) {
        console.log(`Cache miss for key: ${key}`);
        return null;
      }
      
      console.log(`Cache hit for key: ${key}`);
      const parsedData = JSON.parse(data);
      return { ...parsedData, cached: true };
    } catch (error) {
      console.error(`Error getting cache for key ${key}:`, error);
      return null;
    }
  }

  async set(key, data) {
    if (!this.redis) return;

    try {
      const jsonData = JSON.stringify(data);
      // Use 'PX' for millisecond precision TTL
      await this.redis.set(key, jsonData, 'PX', this.cacheDuration);
      console.log(`Data cached with key: ${key}, expires in: ${this.cacheDuration}ms`);
    } catch (error) {
      console.error(`Error setting cache for key ${key}:`, error);
    }
  }

  async clear() {
    if (!this.redis) return;

    try {
      const result = await this.redis.flushdb();
      console.log(`Cache cleared (flushdb). Result: ${result}`);
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  async clearPattern(pattern) {
    if (!this.redis) return 0;

    let cleared = 0;
    try {
      const stream = this.redis.scanStream({
        match: `*${pattern}*`,
        count: 100,
      });

      const keysToDelete = [];
      stream.on('data', (keys) => {
        if (keys.length) {
          keysToDelete.push(...keys);
        }
      });

      return new Promise((resolve) => {
        stream.on('end', async () => {
          if (keysToDelete.length > 0) {
            cleared = await this.redis.del(keysToDelete);
            console.log(`Cache pattern clear: '${pattern}'. Removed ${cleared} entries.`);
          } else {
            console.log(`Cache pattern clear: '${pattern}'. No matching keys found.`);
          }
          resolve(cleared);
        });
        stream.on('error', (err) => {
          console.error(`Error scanning keys with pattern ${pattern}:`, err);
          resolve(0);
        });
      });
    } catch (error) {
      console.error(`Error clearing pattern ${pattern}:`, error);
      return 0;
    }
  }

  async getStats() {
    if (!this.redis) return {};

    try {
      const info = await this.redis.info();
      const keyspace = await this.redis.info('keyspace');
      const db0 = keyspace.split('\n')[1]?.split(',').reduce((acc, item) => {
        const [key, value] = item.split('=');
        acc[key] = value;
        return acc;
      }, {});

      return {
        redis_version: info.match(/redis_version:(.*)/)[1],
        uptime_in_seconds: info.match(/uptime_in_seconds:(.*)/)[1],
        connected_clients: info.match(/connected_clients:(.*)/)[1],
        used_memory_human: info.match(/used_memory_human:(.*)/)[1],
        total_keys: db0?.keys || 0,
        expires: db0?.expires || 0,
        cacheDuration: this.cacheDuration,
      };
    } catch (error) {
      console.error('Error getting Redis stats:', error);
      return { error: 'Could not retrieve stats' };
    }
  }
}

export default CacheService;