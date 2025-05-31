import express from 'express';
import GoogleSheetsService from '../services/googleSheetsService.js';
import CacheService from '../services/cacheService.js';
import { filterByYear, paginateData, searchData, advancedSearch } from '../utils/dataProcessor.js';
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
 * Retrieve paginated attendance data with optional filtering and search
 * 
 * Query Parameters:
 * - year: Filter by year (e.g., 2025)
 * - page: Page number (default: 1)
 * - pageSize: Items per page (default: 100, max: 1000)
 * - search: General search term (searches across all fields)
 * - teacher: Filter by teacher name
 * - student: Filter by student name
 * - dateFrom: Filter from date (YYYY-MM-DD)
 * - dateTo: Filter to date (YYYY-MM-DD)
 */
router.get('/data', requestTimeout(45000), async (req, res) => {
  try {
    // Parse and validate query parameters
    const year = req.query.year || null;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.pageSize) || DEFAULT_PAGE_SIZE));
    
    // Parse search parameters
    const searchParams = {
      search: req.query.search || null,
      teacher: req.query.teacher || null,
      student: req.query.student || null,
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null
    };

    // Remove null/empty values
    Object.keys(searchParams).forEach(key => {
      if (!searchParams[key] || searchParams[key].trim() === '') {
        delete searchParams[key];
      }
    });

    // Generate cache key including search parameters
    const cacheKey = cacheService.generateKey(year, page, pageSize, searchParams);
    
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
    
    // Apply filters in order: year -> search -> pagination
    let filteredData = allData;
    
    // Apply year filter if specified
    if (year) {
      filteredData = filterByYear(filteredData, year);
      console.log(`Year filter applied: ${filteredData.length} records after filtering by year ${year}`);
    }
    
    // Apply search filters
    const hasSearchParams = Object.keys(searchParams).length > 0;
    if (hasSearchParams) {
      const searchStartTime = Date.now();
      
      if (searchParams.search && Object.keys(searchParams).length === 1) {
        // Simple search
        filteredData = searchData(filteredData, searchParams.search);
      } else {
        // Advanced search with multiple criteria
        filteredData = advancedSearch(filteredData, searchParams);
      }
      
      const searchTime = Date.now() - searchStartTime;
      console.log(`Search applied in ${searchTime}ms: ${filteredData.length} records after search`);
    }
    
    // Apply pagination
    const result = paginateData(filteredData, page, pageSize);
    
    // Prepare response
    const response = {
      cached: false,
      data: result.data,
      pagination: result.pagination,
      filters: {
        year: year || 'all',
        ...(hasSearchParams && { search: searchParams })
      },
      fetchedAt: new Date().toISOString(),
      fetchTime: `${fetchTime}ms`,
      totalRecordsBeforeFilter: allData.length,
      totalRecordsAfterFilter: filteredData.length
    };

    // Cache the result
    cacheService.set(cacheKey, response);
    
    // Log request info
    const searchInfo = hasSearchParams ? JSON.stringify(searchParams) : 'none';
    console.log(`Data request completed: year=${year || 'all'}, search=${searchInfo}, page=${page}, pageSize=${pageSize}, results=${result.data.length}, fetchTime=${fetchTime}ms`);
    
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
 * GET /api/search
 * Dedicated search endpoint for advanced search functionality
 */
router.get('/search', requestTimeout(45000), async (req, res) => {
  try {
    const searchTerm = req.query.q || req.query.search;
    
    if (!searchTerm || searchTerm.trim() === '') {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        error: true,
        message: 'Search term is required. Use ?q=your_search_term or ?search=your_search_term',
        timestamp: new Date().toISOString()
      });
    }

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.pageSize) || DEFAULT_PAGE_SIZE));
    
    // Use simple search key for this endpoint
    const cacheKey = cacheService.generateSearchKey(null, page, pageSize, searchTerm);
    
    // Check cache first
    const cachedResult = cacheService.get(cacheKey);
    if (cachedResult) {
      console.log(`Search cache hit for: ${searchTerm}`);
      return res.status(HTTP_STATUS.OK).json(cachedResult);
    }

    console.log(`Search cache miss for: ${searchTerm} - Fetching from Google Sheets...`);
    
    // Fetch fresh data from Google Sheets
    const startTime = Date.now();
    const allData = await googleSheetsService.fetchData();
    const fetchTime = Date.now() - startTime;
    
    // Apply search
    const searchStartTime = Date.now();
    const searchResults = searchData(allData, searchTerm);
    const searchTime = Date.now() - searchStartTime;
    
    // Apply pagination
    const result = paginateData(searchResults, page, pageSize);
    
    // Prepare response
    const response = {
      cached: false,
      data: result.data,
      pagination: result.pagination,
      search: {
        term: searchTerm,
        totalMatches: searchResults.length,
        searchTime: `${searchTime}ms`
      },
      fetchedAt: new Date().toISOString(),
      fetchTime: `${fetchTime}ms`
    };

    // Cache the result
    cacheService.set(cacheKey, response);
    
    console.log(`Search completed: term="${searchTerm}", matches=${searchResults.length}, page=${page}, results=${result.data.length}, searchTime=${searchTime}ms`);
    
    res.status(HTTP_STATUS.OK).json(response);
    
  } catch (error) {
    console.error('Error in /api/search:', error.message);
    
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      error: true,
      message: error.message || 'Search failed',
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