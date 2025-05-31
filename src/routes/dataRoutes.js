import express from 'express';
import GoogleSheetsService from '../services/googleSheetsService.js';
import CacheService from '../services/cacheService.js';
import { filterByYear, paginateData } from '../utils/dataProcessor.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, HTTP_STATUS } from '../config/constants.js';
import { requestTimeout } from '../middleware/errorHandler.js';

const router = express.Router();
const googleSheetsService = new GoogleSheetsService();
const cacheService = new CacheService();

// Cleanup expired cache entries every 10 minutes
setInterval(() => {
  cacheService.cleanup();
}, 10 * 60 * 1000);

/**
 * GET /api/data
 * Retrieve paginated attendance data with optional year filtering
 */
router.get('/data', requestTimeout(45000), async (req, res) => {
  try {
    // Parse and validate query parameters
    const year = req.query.year || null;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.pageSize) || DEFAULT_PAGE_SIZE));

    // Generate cache key
    const cacheKey = cacheService.generateKey(year, page, pageSize);
    
    // Check cache first
    const cachedResult = cacheService.get(cacheKey);
    if (cachedResult) {
      console.log(`Cache hit for: ${cacheKey}`);
      return res.status(HTTP_STATUS.OK).json(cachedResult);
    }

    console.log(`Cache miss for: ${cacheKey} - Fetching from Google Sheets...`);
    
    // Fetch fresh data from Google Sheets
    const startTime = Date.now();
    const allData = await googleSheetsService.fetchData();
    const fetchTime = Date.now() - startTime;
    
    console.log(`Google Sheets fetch completed in ${fetchTime}ms`);
    
    // Apply year filter if specified
    const filteredData = year ? filterByYear(allData, year) : allData;
    
    // Apply pagination
    const result = paginateData(filteredData, page, pageSize);
    
    // Prepare response
    const response = {
      cached: false,
      data: result.data,
      pagination: result.pagination,
      filters: {
        year: year || 'all'
      },
      fetchedAt: new Date().toISOString(),
      fetchTime: `${fetchTime}ms`
    };

    // Cache the result
    cacheService.set(cacheKey, response);
    
    // Log request info
    console.log(`Data request completed: year=${year || 'all'}, page=${page}, pageSize=${pageSize}, results=${result.data.length}, fetchTime=${fetchTime}ms`);
    
    res.status(HTTP_STATUS.OK).json(response);
    
  } catch (error) {
    console.error('Error in /api/data:', error.message);
    
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: true,
      message: error.message || 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/refresh
 * Force refresh data from Google Sheets (bypasses cache)
 */
router.get('/refresh', requestTimeout(60000), async (req, res) => {
  try {
    console.log('Manual refresh requested');
    
    // Clear all cache entries
    cacheService.clear();
    
    // Fetch fresh data from Google Sheets
    const startTime = Date.now();
    const freshData = await googleSheetsService.fetchData();
    const fetchTime = Date.now() - startTime;
    
    const response = {
      message: 'Data refreshed successfully',
      data: freshData,
      totalRecords: freshData.length,
      refreshedAt: new Date().toISOString(),
      fetchTime: `${fetchTime}ms`
    };
    
    console.log(`Manual refresh completed: ${freshData.length} records fetched in ${fetchTime}ms`);
    
    res.status(HTTP_STATUS.OK).json(response);
    
  } catch (error) {
    console.error('Error in /api/refresh:', error.message);
    
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: true,
      message: error.message || 'Failed to refresh data',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/status
 * Get API and service status information
 */
router.get('/status', (req, res) => {
  try {
    const googleSheetsStatus = googleSheetsService.getStatus();
    const cacheStats = cacheService.getStats();
    
    const response = {
      api: {
        status: 'operational',
        version: '1.0.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      },
      googleSheets: googleSheetsStatus,
      cache: cacheStats,
      environment: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: process.memoryUsage()
      }
    };
    
    res.status(HTTP_STATUS.OK).json(response);
    
  } catch (error) {
    console.error('Error in /api/status:', error.message);
    
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: true,
      message: 'Failed to get status information',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/cache/clear
 * Clear all cache entries (admin endpoint)
 */
router.post('/cache/clear', (req, res) => {
  try {
    cacheService.clear();
    
    res.status(HTTP_STATUS.OK).json({
      message: 'Cache cleared successfully',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error clearing cache:', error.message);
    
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: true,
      message: 'Failed to clear cache',
      timestamp: new Date().toISOString()
    });
  }
});

export default router; 