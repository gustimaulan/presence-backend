import axios from 'axios';
import { processSheetData, sortByTimestamp, extractYear } from '../utils/dataProcessor.js';
import qs from 'qs';
import CacheService from './cacheService.js';

const BATCH_SIZE = 5000; // Fetch 5000 rows at a time

class GoogleSheetsService {
  constructor() {
    this.baseURL = 'https://sheets.googleapis.com/v4/spreadsheets';
    this.cache = new CacheService();
    // Don't check environment variables in constructor, check them when first used
    this._initialized = false;
    this.lastKnownRowCount = 0; // Store the last known row count
  }

  /**
   * Initialize the service with environment variables
   * @private
   */
  _init() {
    if (this._initialized) return;
    
    this.sheetId = process.env.GOOGLE_SHEET_ID;
    this.apiKey = process.env.GOOGLE_API_KEY;
    this.defaultRange = process.env.GOOGLE_SHEET_RANGE || 'Sheet1!A:E'; // Store as defaultRange
    
    if (!this.sheetId || !this.apiKey) {
      throw new Error('Missing Google Sheets configuration. Please check GOOGLE_SHEET_ID and GOOGLE_API_KEY environment variables.');
    }
    
    this._initialized = true;
  }

  /**
   * Retry logic for API calls
   * @private
   */
  async _retryRequest(requestFn, maxRetries = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
        
        // Don't retry on client errors (4xx)
        if (error.response && error.response.status >= 400 && error.response.status < 500) {
          throw error;
        }
        
        console.log(`Google Sheets API attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
  }

  /**
   * Get the total number of rows in the sheet.
   * @private
   */
  async _getTotalRows(currentRange) {
    const sheetName = currentRange.split('!')[0];
    const url = `${this.baseURL}/${this.sheetId}`;
    const requestFn = () => axios.get(url, {
      params: { key: this.apiKey, fields: 'sheets.properties' },
      timeout: 15000,
    });

    const response = await this._retryRequest(requestFn, 2, 500);
    const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
    if (sheet) {
      this.lastKnownRowCount = sheet.properties.gridProperties.rowCount;
      return this.lastKnownRowCount;
    }
    return this.lastKnownRowCount || 20000; // Fallback to a large number
  }

  /**
   * Fetch the header row from the sheet.
   * @private
   */
  async _fetchHeaders(currentRange) {
    const sheetName = currentRange.split('!')[0];
    const columnRange = currentRange.split('!')[1] || 'A:E';
    const headerRange = `${sheetName}!A1:${columnRange.split(':')[1]}1`;

    const url = `${this.baseURL}/${this.sheetId}/values/${headerRange}`;
    const requestFn = () => axios.get(url, {
      params: { key: this.apiKey },
      timeout: 15000,
    });

    console.log(`Fetching headers from: ${headerRange}`);
    const response = await this._retryRequest(requestFn);
    return response.data.values ? response.data.values[0] : null;
  }

  /**
   * Fetch data from Google Sheets with caching, batching, and reverse order fetching.
   * @param {Object} options - Fetching options.
   * @param {string|null} options.year - Optional year to filter.
   * @param {number} options.page - Page number for dynamic fetching.
   * @param {number} options.pageSize - Page size for dynamic fetching.
   * @returns {Promise<Array>} - Processed and sorted data array.
   */
  async fetchData(options = {}) {
    this._init(); // Initialize when first used

    const { year = null, page = 1, pageSize = 100, fetchAll = false } = options;

    // Determine the range to fetch from based on the year parameter
    const currentRange = year ? `${year}!A:E` : this.defaultRange; // Assuming A:E is the column range for all sheets
    console.log(`Fetching data from range: ${currentRange}`);

    let rowsToFetch;
    if (fetchAll) {
      // If fetchAll is true, we want to fetch all rows for the specified year.
      // We'll set rowsToFetch after getting totalRows.
      rowsToFetch = -1; // Placeholder, will be updated
    } else {
      // Calculate how many records we need to fetch from the bottom.
      const recordsToFetch = page * pageSize;
      // Add a buffer (e.g., 50% more, with a minimum) to account for invalid/filtered rows.
      const buffer = Math.max(recordsToFetch * 0.5, 200);
      rowsToFetch = Math.ceil(recordsToFetch + buffer);
    }
    console.log(`Calculated rows to fetch: ${rowsToFetch === -1 ? 'all' : rowsToFetch}`);

    try {
      let headers;
      let totalRows;

      try {
        headers = await this._fetchHeaders(currentRange);
        if (!headers) {
          console.error('No headers found in the sheet. Cannot process data.');
          return [];
        }
        totalRows = await this._getTotalRows(currentRange);
        if (fetchAll) {
          rowsToFetch = totalRows - 1; // Fetch all data rows (excluding header)
        }
      } catch (error) {
        console.error('Failed during initial sheet setup (fetching headers or row count).', error.message);
        // Re-throw the error to be caught by the main catch block which has better reporting
        throw error;
      }

      // --- START: BATCHGET IMPLEMENTATION ---
      const sheetName = currentRange.split('!')[0];
      const columnRange = currentRange.split('!')[1] || 'A:E';
      const columns = columnRange.split(':')[0];
      const endColumn = columnRange.split(':')[1];

      let allData = [];

      // Construct all range strings for a single batchGet call
      const ranges = [];
      let rowsCollected = 0;
      for (let topRow = totalRows; topRow > 1 && rowsCollected < rowsToFetch; topRow -= BATCH_SIZE) {
        const startRow = Math.max(2, topRow - BATCH_SIZE + 1);
        ranges.push(`${sheetName}!${columns}${startRow}:${endColumn}${topRow}`);
        rowsCollected += BATCH_SIZE;
      }

      if (ranges.length > 0) {
        console.log(`Fetching ${ranges.length} batches in a single API call (batchGet).`);

        const url = `${this.baseURL}/${this.sheetId}/values:batchGet`;
        const requestFn = () => axios.get(url, {
          params: { 
            key: this.apiKey, 
            ranges: ranges,
            majorDimension: 'ROWS'
          },
          paramsSerializer: params => {
            return qs.stringify(params, { arrayFormat: 'repeat' });
          },
          timeout: 45000, // Increased timeout for potentially large response
          headers: { 'User-Agent': 'Presence-API/1.0.0' },
        });

        const response = await this._retryRequest(requestFn);
        const valueRanges = response.data.valueRanges || [];

        for (const valueRange of valueRanges) {
          const batchValues = valueRange.values || [];
          if (batchValues.length === 0) continue;

          // Data is fetched bottom-up, but inside a batch it's top-down. Reverse it.
          const reversedBatchValues = batchValues.reverse();
          const batchData = processSheetData({ values: [headers, ...reversedBatchValues] });
          allData.push(...batchData);


        }
      }

      const sortedData = sortByTimestamp(allData);
      console.log(`Successfully fetched ${sortedData.length} total records from Google Sheets.`);

      return sortedData;

    } catch (error) {
      console.error('Error fetching data from Google Sheets:', error.message);

      if (error.response) {
        // Google Sheets API error
        const status = error.response.status;
        const message = error.response.data?.error?.message || error.message;

        if (status === 400) {
          throw new Error(`Invalid request to Google Sheets API: ${message}`);
        } else if (status === 403) {
          throw new Error(`Access denied to Google Sheets. Please check API key permissions: ${message}`);
        } else if (status === 404) {
          throw new Error(`Google Sheet not found. Please check GOOGLE_SHEET_ID or sheet name: ${message}`);
        } else if (status === 408 || status >= 500) {
          throw new Error(`Google Sheets API is unavailable (status ${status}): ${message}`);
        } else if (status === 429) {
          throw new Error(`Rate limit exceeded. Please try again later: ${message}`);
        } else {
          throw new Error(`Google Sheets API error (${status}): ${message}`);
        }
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Request timeout while fetching data from Google Sheets. The dataset might be too large.');
      } else if (error.code === 'ENOTFOUND') {
        throw new Error('Network error: Could not connect to Google Sheets API');
      } else {
        throw new Error(`Failed to fetch data from Google Sheets: ${error.message}`);
      }
    }
  }

  /**
   * Clear the cache.
   */
  clearCache() {
    // This service no longer holds its own cache, but we can keep the method for compatibility.
    console.log('GoogleSheetsService.clearCache() called. Caching is handled by dataRoutes.');
  }

  /**
   * Get service status and configuration
   * @returns {Object} - Service status information
   */
  getStatus() {
    // Initialize if not already done
    try {
      this._init();
      return {
        configured: true,
        sheetId: this.sheetId ? `${this.sheetId.substring(0, 10)}...` : 'Not configured',
        range: this.defaultRange,
        apiUrl: `${this.baseURL}/${this.sheetId}`,
        cacheStats: this.cache.getStats()
      };
    } catch (error) {
      return {
        configured: false,
        error: error.message,
        sheetId: 'Not configured',
        range: 'Not configured',
        apiUrl: 'Not configured'
      };
    }
  }
}

export default GoogleSheetsService; 