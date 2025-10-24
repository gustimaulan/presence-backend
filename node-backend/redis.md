# Redis Caching Implementation Plan

This document outlines the steps to integrate Redis as the caching mechanism for the project, replacing the current in-memory `Map`-based cache.

## 1. Setup and Configuration

*   **Install Redis Client**: Add a suitable Node.js Redis client library (e.g., `ioredis` or `node-redis`) to the project dependencies.
*   **Environment Variables**: Configure Redis connection details (host, port, password, etc.) using environment variables (e.g., `REDIS_URL`) in `env.example` and load them in `src/config/constants.js`.

## 2. Refactor `CacheService`

*   **Redis Client Initialization**: Modify the `CacheService` constructor (`src/services/cacheService.js`) to initialize and connect to a Redis client instead of a JavaScript `Map`.
*   **`get(key)` Method**: Update this method to fetch data from Redis. Handle cache misses by returning `null`.
*   **`set(key, data)` Method**: Implement this method to store data in Redis, ensuring that the `cacheDuration` (Time-to-Live) is applied to each entry.
*   **`clear()` and `clearPattern()` Methods**: Adapt these methods to use appropriate Redis commands for clearing single keys or keys matching a pattern.
*   **`getStats()` Method**: Update to retrieve relevant caching statistics directly from Redis.
*   **`cleanup()` Method**: This method may be simplified or removed, as Redis inherently handles TTL and eviction policies.

## 3. Implement Cache Invalidation Strategy

*   **Identify Data Update Points**: Pinpoint all locations in the application where the primary data (e.g., Google Sheets data) is modified or updated.
*   **Invalidate Cache on Update**: After a successful data modification, trigger the `clear()` or `clearPattern()` method in `CacheService` to explicitly remove or update the corresponding stale entries in Redis. This ensures data freshness for subsequent requests.

## 4. Error Handling

*   **Robustness**: Implement comprehensive error handling for Redis connection failures and operational issues within the `CacheService`.

## 5. Testing

*   **Unit and Integration Tests**: Develop or update tests for the `CacheService` to verify that Redis caching functions correctly, including cache hits, misses, TTL, and proper invalidation.

## 6. Deployment Considerations

*   **Redis Server Setup**: Document any necessary steps for setting up and configuring a Redis server in various deployment environments.