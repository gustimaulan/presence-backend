import { DEFAULT_CACHE_DURATION } from '../config/constants.js';

class CacheService {
  constructor() {
    this.cache = new Map();
    this.cacheDuration = parseInt(process.env.CACHE_DURATION) || DEFAULT_CACHE_DURATION;
    
    console.log(`Cache service initialized with ${this.cacheDuration}ms TTL`);
  }

  /**
   * Generate cache key for data requests with search support
   * @param {string} year - Year filter (optional)
   * @param {number} page - Page number
   * @param {number} pageSize - Page size
   * @param {Object} searchParams - Search parameters (optional)
   * @returns {string} - Cache key
   */
  generateKey(year = null, page = 1, pageSize = 100, searchParams = {}) {
    const parts = ['data'];
    
    if (year) parts.push(`year:${year}`);
    parts.push(`page:${page}`);
    parts.push(`size:${pageSize}`);
    
    // Add search parameters to cache key
    if (searchParams.search) {
      parts.push(`s:${encodeURIComponent(searchParams.search.toLowerCase().trim())}`);
    }
    if (searchParams.teacher) {
      parts.push(`t:${encodeURIComponent(searchParams.teacher.toLowerCase().trim())}`);
    }
    if (searchParams.student) {
      parts.push(`st:${encodeURIComponent(searchParams.student.toLowerCase().trim())}`);
    }
    if (searchParams.dateFrom) {
      parts.push(`from:${searchParams.dateFrom}`);
    }
    if (searchParams.dateTo) {
      parts.push(`to:${searchParams.dateTo}`);
    }
    
    return parts.join('|');
  }

  /**
   * Generate cache key for simple search (backward compatibility)
   * @param {string} year - Year filter (optional)
   * @param {number} page - Page number
   * @param {number} pageSize - Page size
   * @param {string} search - Simple search term (optional)
   * @returns {string} - Cache key
   */
  generateSearchKey(year = null, page = 1, pageSize = 100, search = null) {
    const searchParams = search ? { search } : {};
    return this.generateKey(year, page, pageSize, searchParams);
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
    return { ...cached.data, cached: true }; // Add cached flag on retrieval
  }

  /**
   * Set data in cache
   * @param {string} key - Cache key
   * @param {*} data - Data to cache
   * @returns {void}
   */
  set(key, data) {
    const expiresAt = Date.now() + this.cacheDuration;
    
    // Store the data object directly without modification
    this.cache.set(key, { data, expiresAt, createdAt: Date.now() });
    
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