import { Context } from 'hono';
import { z } from 'zod';

import GoogleSheetsService from '../services/googleSheetsService';
import CacheService, { CloudflareBindings } from '../services/cacheService';
import { filterByYear, paginateData, searchData, advancedSearch, getUniqueTutorNames, getUniqueStudentNames, SearchCriteria, SheetDataItem } from '../utils/dataProcessor';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, HTTP_STATUS } from '../config/constants';
import { getDataQuerySchema, postDataQuerySchema, getSearchQuerySchema } from '../validators/dataValidator';

// Import DataContext from routes to avoid duplication
import type { DataContext } from '../routes/dataRoute';

// Helper to get services from context
const getServices = (c: Context<DataContext>) => ({
  googleSheetsService: c.get('googleSheetsService') as GoogleSheetsService,
  cacheService: c.get('cacheService') as CacheService,
});

async function getData(env: CloudflareBindings, initialYear: string | null, page: number, pageSize: number, searchParams: SearchCriteria) {
  // Determine the effective year for data fetching.
  // If a year is not provided, try to infer it from the dateFrom or dateTo search parameter.
  let effectiveYear = initialYear;
  if (!effectiveYear) {
    const dateFilter = searchParams.dateFrom || searchParams.dateTo;
    if (dateFilter) {
      // Extracts YYYY from YYYY-MM-DD or the last part of DD/MM/YYYY
      if (dateFilter.includes('-')) {
        // YYYY-MM-DD format
        effectiveYear = dateFilter.split('-')[0];
      } else if (dateFilter.includes('/')) {
        // DD/MM/YYYY format
        const parts = dateFilter.split('/');
        effectiveYear = parts.length === 3 ? parts[2] : null;
      }
    }
  }

  const cacheService = new CacheService(env);
  const googleSheetsService = new GoogleSheetsService(env);

  const cacheKey = cacheService.generateKey(initialYear, page, pageSize, searchParams);
  const cachedResult = await cacheService.get(cacheKey);

  if (cachedResult) {
    console.log(`Full response cache hit for key: ${cacheKey}`);
    return cachedResult;
  }

  console.log(`Cache miss for key: ${cacheKey}. Fetching data...`);

  const startTime = Date.now();
  const allData = await googleSheetsService.fetchData({
    year: effectiveYear,
    page: page,
    pageSize: pageSize,
    fetchAll: false
  });
  const fetchTime = Date.now() - startTime;

  console.log(`Data fetch/load completed in ${fetchTime}ms. Total records: ${allData.length}`);

  let filteredData = allData;

  // The year filter is now implicitly handled by fetchData, but we can keep this for safety with other scenarios.
  if (initialYear) {
    filteredData = filterByYear(filteredData, initialYear);
    console.log(`Year filter applied: ${filteredData.length} records after filtering by year ${initialYear}`);
  }
  
  const hasSearchParams = Object.keys(searchParams).length > 0;
  if (hasSearchParams) {
    const searchStartTime = Date.now();
    
    if (searchParams.search && Object.keys(searchParams).length === 1) {
      filteredData = searchData(filteredData, searchParams.search);
    } else {
      filteredData = advancedSearch(filteredData, searchParams);
    }
    
    const searchTime = Date.now() - searchStartTime;
    console.log(`Search applied in ${searchTime}ms: ${filteredData.length} records after search`);
  }
  
  const result = paginateData(filteredData, page, pageSize);
  
  const response = {
    data: result.data,
    pagination: result.pagination,
    filters: {
      year: initialYear || 'all',
      ...(hasSearchParams && { search: searchParams })
    },
    fetchedAt: new Date().toISOString(),
    fetchTime: `${fetchTime}ms`,
    totalRecordsBeforeFilter: allData.length,
    totalRecordsAfterFilter: filteredData.length
  };

  const searchInfo = hasSearchParams ? JSON.stringify(searchParams) : 'none';
  console.log(`Data request completed: year=${initialYear || 'all'} (fetched from ${effectiveYear || 'all'}), search=${searchInfo}, page=${page}, pageSize=${pageSize}, results=${result.data.length}, fetchTime=${fetchTime}ms`);

  return { ...response, cached: false };
}

export async function warmupCacheForYear(env: CloudflareBindings, year: string = '2025') {
  try {
    console.log(`Warming up cache for year: ${year}`);
    await getData(env, year, 1, 200, {});
    console.log(`Cache warmed up for year: ${year}`);
  } catch (error: any) {
    console.error(`Error warming up cache for year ${year}:`, error.message);
  }
}

export const getDataController = async (c: Context<DataContext>) => {
  try {
    // Get query parameters from URL
    const { year, page: pageStr = '1', pageSize: pageSizeStr = DEFAULT_PAGE_SIZE.toString(), search, teacher, student, dateFrom, dateTo } = c.req.query();
    const page = parseInt(pageStr);
    const pageSize = parseInt(pageSizeStr);
    
    const searchParams: SearchCriteria = {};
    
    // Only add non-empty search parameters
    if (search?.trim()) searchParams.search = search.trim();
    if (teacher?.trim()) searchParams.teacher = teacher.trim();
    if (student?.trim()) searchParams.student = student.trim();
    if (dateFrom?.trim()) searchParams.dateFrom = dateFrom.trim();
    if (dateTo?.trim()) searchParams.dateTo = dateTo.trim();

    const result = await getData(c.env, year || null, Math.max(1, page), Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize)), searchParams);
    return c.json(result, HTTP_STATUS.OK as any);
  } catch (error: any) {
    console.error('Error in /api/data:', error.message);
    return c.json({
      error: true,
      message: error.message || 'Internal server error',
      timestamp: new Date().toISOString()
    }, HTTP_STATUS.INTERNAL_SERVER_ERROR as any);
  }
};

export const postDataQueryController = async (c: Context<DataContext>) => {
  try {
    // Get validated JSON body
    const json = await c.req.json() as z.infer<typeof postDataQuerySchema>;
    const { year, page, pageSize, search: rawSearchParams } = json;
    
    // Clean up search parameters to remove empty values
    const searchParams: SearchCriteria = {};
    if (rawSearchParams.search && rawSearchParams.search.trim()) {
      searchParams.search = rawSearchParams.search.trim();
    }
    if (rawSearchParams.teacher && rawSearchParams.teacher.trim()) {
      searchParams.teacher = rawSearchParams.teacher.trim();
    }
    if (rawSearchParams.student && rawSearchParams.student.trim()) {
      searchParams.student = rawSearchParams.student.trim();
    }
    if (rawSearchParams.dateFrom && rawSearchParams.dateFrom.trim()) {
      searchParams.dateFrom = rawSearchParams.dateFrom.trim();
    }
    if (rawSearchParams.dateTo && rawSearchParams.dateTo.trim()) {
      searchParams.dateTo = rawSearchParams.dateTo.trim();
    }
    
    const result = await getData(c.env, year || null, Math.max(1, page), Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize)), searchParams);
    return c.json(result, HTTP_STATUS.OK as any);
  } catch (error: any) {
    console.error('Error in /api/data/query:', error.message);
    return c.json({ error: true, message: error.message, timestamp: new Date().toISOString() }, HTTP_STATUS.INTERNAL_SERVER_ERROR as any);
  }
};

export const getSearchController = async (c: Context<DataContext>) => {
  try {
    // Get query parameters from URL
    const query = c.req.query();
    const q = query.q || undefined;
    const search = query.search || undefined;
    const page = parseInt(query.page || '1');
    const pageSize = parseInt(query.pageSize || DEFAULT_PAGE_SIZE.toString());
    const searchTerm = q || search;

    if (!searchTerm || searchTerm.trim() === '') {
      return c.json({
        error: true,
        message: 'Search term is required. Use ?q=your_search_term or ?search=your_search_term',
        timestamp: new Date().toISOString()
      }, HTTP_STATUS.BAD_REQUEST as any);
    }

    const { cacheService, googleSheetsService } = getServices(c);

    const cacheKey = cacheService.generateSearchKey(null, page, pageSize, searchTerm);
    const cachedResult = await cacheService.get(cacheKey);

    if (cachedResult) {
      console.log(`Search response cache hit for key: ${cacheKey}`);
      return c.json(cachedResult, HTTP_STATUS.OK as any);
    }

    console.log(`Searching for: ${searchTerm} - Cache miss, fetching data...`);

    const startTime = Date.now();
    const allData = await googleSheetsService.fetchData({
      year: null,
      page: page,
      pageSize: MAX_PAGE_SIZE,
      fetchAll: false // Fetch all data for search, then paginate
    });
    const fetchTime = Date.now() - startTime;

    const searchStartTime = Date.now();
    const searchResults = searchData(allData, searchTerm);
    const searchTime = Date.now() - searchStartTime;

    const result = paginateData(searchResults, page, pageSize);

    const response = {
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

    console.log(`Search completed: term="${searchTerm}", matches=${searchResults.length}, page=${page}, results=${result.data.length}, searchTime=${searchTime}ms`);

    return c.json({ ...response, cached: false }, HTTP_STATUS.OK as any);

  } catch (error: any) {
    console.error('Error in /api/search:', error.message);
    return c.json({
      error: true,
      message: error.message || 'Search failed',
      timestamp: new Date().toISOString()
    }, HTTP_STATUS.INTERNAL_SERVER_ERROR as any);
  }
};

export const getRefreshController = async (c: Context<DataContext>) => {
  try {
    console.log('Manual refresh requested');
    const { cacheService } = getServices(c);
    await cacheService.clear();
    
    const response = {
      message: 'Cache cleared successfully. Data will be refreshed on the next request.',
      refreshedAt: new Date().toISOString(),
    };
    
    console.log('Manual refresh completed: cache cleared.');
    
    return c.json(response, HTTP_STATUS.OK as any);
    
  } catch (error: any) {
    console.error('Error in /api/refresh:', error.message);
    return c.json({
      error: true,
      message: error.message || 'Failed to refresh data',
      timestamp: new Date().toISOString()
    }, HTTP_STATUS.INTERNAL_SERVER_ERROR as any);
  }
};

export const getStatusController = async (c: Context<DataContext>) => {
  try {
    const { googleSheetsService, cacheService } = getServices(c);
    const googleSheetsStatus = googleSheetsService.getStatus();
    const cacheStatus = await cacheService.getStats();
    
    const response = {
      api: {
        status: 'operational',
        version: '1.0.0',
        uptime: 0, // Uptime is not directly available in CF Workers like Node.js process.uptime()
        timestamp: new Date().toISOString()
      },
      googleSheets: googleSheetsStatus,
      cache: cacheStatus,
      environment: {
        // Node.js specific info not available
        platform: 'Cloudflare Workers',
      }
    };
    
    return c.json(response, HTTP_STATUS.OK as any);
    
  } catch (error: any) {
    console.error('Error in /api/status:', error.message);
    return c.json({
      error: true,
      message: 'Failed to get status information',
      timestamp: new Date().toISOString()
    }, HTTP_STATUS.INTERNAL_SERVER_ERROR as any);
  }
};

export const getTutorsController = async (c: Context<DataContext>) => {
  try {
    const currentYear = new Date().getFullYear().toString();
    const cacheKey = `unique_tutor_names_${currentYear}`;
    const { cacheService, googleSheetsService } = getServices(c);
    const cachedResult = await cacheService.get(cacheKey);

    if (cachedResult) {
      console.log(`Cache hit for unique tutor names for ${currentYear}: ${cacheKey}`);
      return c.json({ names: cachedResult, cached: true }, HTTP_STATUS.OK as any);
    }

    console.log(`Cache miss for unique tutor names for ${currentYear}. Fetching all data for ${currentYear}...`);
    const allData = await googleSheetsService.fetchData({ year: currentYear, fetchAll: true });
    const uniqueNames = getUniqueTutorNames(allData);
    await cacheService.set(cacheKey, uniqueNames); // Cache for 1 hour (default TTL)

    return c.json({ names: uniqueNames, cached: false }, HTTP_STATUS.OK as any);
  } catch (error: any) {
    console.error('Error in /api/tutors:', error.message);
    return c.json({
      error: true,
      message: error.message || 'Failed to retrieve tutor names',
      timestamp: new Date().toISOString()
    }, HTTP_STATUS.INTERNAL_SERVER_ERROR as any);
  }
};

export const getStudentsController = async (c: Context<DataContext>) => {
  try {
    const cacheKey = 'unique_student_names';
    const { cacheService, googleSheetsService } = getServices(c);
    const cachedResult = await cacheService.get(cacheKey);

    if (cachedResult) {
      console.log(`Cache hit for unique student names: ${cacheKey}`);
      return c.json({ names: cachedResult, cached: true }, HTTP_STATUS.OK as any);
    }

    console.log(`Cache miss for unique student names. Fetching all data...`);
    const allData = await googleSheetsService.fetchData({ year: null, fetchAll: true });
    const uniqueNames = getUniqueStudentNames(allData);
    await cacheService.set(cacheKey, uniqueNames); // Cache for 1 hour (default TTL)

    return c.json({ names: uniqueNames, cached: false }, HTTP_STATUS.OK as any);
  } catch (error: any) {
    console.error('Error in /api/students:', error.message);
    return c.json({
      error: true,
      message: error.message || 'Failed to retrieve student names',
      timestamp: new Date().toISOString()
    }, HTTP_STATUS.INTERNAL_SERVER_ERROR as any);
  }
};

export const postCacheClearController = async (c: Context<DataContext>) => {
  try {
    const { cacheService } = getServices(c);
    await cacheService.clear();
    return c.json({ message: 'Cache cleared successfully' }, HTTP_STATUS.OK as any);
  } catch (error: any) {
    console.error('Error clearing cache:', error);
    return c.json({ error: true, message: 'Failed to clear cache' }, HTTP_STATUS.INTERNAL_SERVER_ERROR as any);
  }
};