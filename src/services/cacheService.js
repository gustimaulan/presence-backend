import { DEFAULT_CACHE_DURATION } from '../config/constants.js';

class CacheService {
  constructor() {
    this.cache = new Map();
    this.cacheDuration = parseInt(process.env.CACHE_DURATION) || DEFAULT_CACHE_DURATION;
    
    console.log(`Cache service initialized with ${this.cacheDuration}ms TTL`);
  }

  /**
   * Generate cache key for data requests
   * @param {string} year - Year filter (optional)
   * @param {number} page - Page number
   * @param {number} pageSize - Page size
   * @returns {string} - Cache key
   */
  generateKey(year = null, page = 1, pageSize = 100) {
    const parts = ['data'];
    if (year) parts.push(`year:${year}`);
    parts.push(`page:${page}`);
    parts.push(`size:${pageSize}`);
    return parts.join('|');
  }

  /**
   * Get data from cache
   * @param {string} key - Cache key
   * @returns {Object|null} - Cached data or null if not found/expired
   */
  get(key) {
    const cached = this.cache.get(key);
    
    if (!cached) {
      return null;
    }
    
    const now = Date.now();
    if (now > cached.expiresAt) {
      // Cache expired, remove it
      this.cache.delete(key);
      console.log(`Cache expired for key: ${key}`);
      return null;
    }
    
    console.log(`Cache hit for key: ${key}`);
    return {
      ...cached.data,
      cached: true
    };
  }

  /**
   * Set data in cache
   * @param {string} key - Cache key
   * @param {*} data - Data to cache
   * @returns {void}
   */
  set(key, data) {
    const expiresAt = Date.now() + this.cacheDuration;
    
    this.cache.set(key, {
      data: {
        ...data,
        cached: false
      },
      expiresAt,
      createdAt: Date.now()
    });
    
    console.log(`Data cached with key: ${key}, expires at: ${new Date(expiresAt).toISOString()}`);
  }

  /**
   * Clear all cache entries
   * @returns {void}
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    console.log(`Cache cleared. Removed ${size} entries.`);
  }

  /**
   * Clear cache entries by pattern
   * @param {string} pattern - Pattern to match keys
   * @returns {number} - Number of entries cleared
   */
  clearPattern(pattern) {
    let cleared = 0;
    
    for (const [key] of this.cache) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
        cleared++;
      }
    }
    
    console.log(`Cache pattern clear: ${pattern}. Removed ${cleared} entries.`);
    return cleared;
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache statistics
   */
  getStats() {
    const now = Date.now();
    let active = 0;
    let expired = 0;
    let totalMemory = 0;

    for (const [key, cached] of this.cache) {
      if (now > cached.expiresAt) {
        expired++;
      } else {
        active++;
      }
      
      // Rough memory calculation
      totalMemory += JSON.stringify(cached).length;
    }

    return {
      totalEntries: this.cache.size,
      activeEntries: active,
      expiredEntries: expired,
      approximateMemoryBytes: totalMemory,
      cacheDuration: this.cacheDuration
    };
  }

  /**
   * Clean up expired cache entries
   * @returns {number} - Number of entries cleaned up
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, cached] of this.cache) {
      if (now > cached.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`Cache cleanup: removed ${cleaned} expired entries`);
    }

    return cleaned;
  }
}

export default CacheService; 