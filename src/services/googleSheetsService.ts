import { processSheetData, sortByTimestamp, SheetDataItem } from '../utils/dataProcessor';
import { CloudflareBindings } from './cacheService'; // Import CloudflareBindings

const BATCH_SIZE = 10000; // Fetch 5000 rows at a time

interface FetchOptions {
  year?: string | null;
  page?: number;
  pageSize?: number;
  fetchAll?: boolean;
}

interface GoogleSheetProperties {
  properties: {
    title: string;
    gridProperties: {
      rowCount: number;
    };
  };
}

class GoogleSheetsService {
  private baseURL: string;
  private sheetId: string;
  private apiKey: string;
  private defaultRange: string;
  private lastKnownRowCount: number;
  private headerCache: Map<string, string[]> = new Map();

  constructor(env: CloudflareBindings) {
    this.baseURL = 'https://sheets.googleapis.com/v4/spreadsheets';
    this.sheetId = env.GOOGLE_SHEET_ID;
    this.apiKey = env.GOOGLE_API_KEY;
    this.defaultRange = env.GOOGLE_SHEET_RANGE || 'Sheet1!A:J';
    this.lastKnownRowCount = 0;

    if (!this.sheetId || !this.apiKey) {
      throw new Error('Missing Google Sheets configuration. Please check GOOGLE_SHEET_ID and GOOGLE_API_KEY environment variables.');
    }
  }

  /**
   * Retry logic for API calls using native fetch
   * @private
   */
  private async _retryRequest<T>(requestFn: () => Promise<Response>, maxRetries = 3, delay = 1000): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await requestFn();
        if (!response.ok) {
          // Don't retry on client errors (4xx)
          if (response.status >= 400 && response.status < 500) {
            throw new Error(`Google Sheets API error (${response.status}): ${response.statusText}`);
          }
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json() as T;
      } catch (error: any) {
        if (attempt === maxRetries) {
          throw error;
        }
        // Don't retry if the request was aborted
        if (error.name === 'AbortError') {
          throw new Error('Request timeout while fetching data from Google Sheets. The dataset might be too large.');
        }
        console.log(`Google Sheets API attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
    throw new Error('Max retries reached for Google Sheets API request.');
  }

  /**
   * Get the total number of rows in the sheet.
   * @private
   */
  private async _getTotalRows(currentRange: string): Promise<number> {
    const sheetName = currentRange.split('!')[0];
    const url = `${this.baseURL}/${this.sheetId}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    const requestFn = () => fetch(`${url}?key=${this.apiKey}&fields=sheets.properties`, {
      headers: { 'User-Agent': 'Presence-API/1.0.0' },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    const responseData = await this._retryRequest<{ sheets: GoogleSheetProperties[] }>(requestFn, 2, 500);
    const sheet = responseData.sheets.find(s => s.properties.title === sheetName);
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
  private async _fetchHeaders(currentRange: string): Promise<string[] | null> {
    const sheetName = currentRange.split('!')[0];
    const columnRange = currentRange.split('!')[1] || 'A:I';
    const endColumn = columnRange.split(':')[1];
    const headerRange = `${sheetName}!A1:${endColumn}1`;

    const url = `${this.baseURL}/${this.sheetId}/values/${headerRange}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    const requestFn = () => fetch(`${url}?key=${this.apiKey}`, {
      headers: { 'User-Agent': 'Presence-API/1.0.0' },
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));

    console.log(`Fetching headers from: ${headerRange}`);
    const responseData = await this._retryRequest<{ values: string[][] }>(requestFn);
    const headers = responseData.values ? responseData.values[0] : null;
    
    if (headers) {
      this.headerCache.set(sheetName, headers);
    }
    
    return headers;
  }

  /**
   * Convert a 0-based column index to a spreadsheet column letter (0 -> A, 1 -> B, ..., 25 -> Z, 26 -> AA).
   * @private
   */
  private _columnIndexToLetter(index: number): string {
    let letter = '';
    let i = index;
    while (i >= 0) {
      letter = String.fromCharCode((i % 26) + 65) + letter;
      i = Math.floor(i / 26) - 1;
    }
    return letter;
  }

  /**
   * Fetch unique values for a specific column (by header name) from one or more sheets.
   * Dynamically resolves the column letter by reading the header row first.
   * @param {string[]} sheets - Array of sheet names (e.g., ['2025', '2024'])
   * @param {string} headerName - The header name to look for (e.g., 'Nama Tentor')
   * @returns {Promise<string[]>} - Array of unique, sorted values from that column
   */
  async fetchUniqueColumnValues(sheets: string[], headerName: string): Promise<string[]> {
    try {
      if (sheets.length === 0) return [];

      // 1. Check cache first for headers
      let headers = this.headerCache.get(sheets[0]);
      
      if (!headers) {
        const headerRange = `${sheets[0]}!1:1`;
        const headerUrl = `${this.baseURL}/${this.sheetId}/values/${encodeURIComponent(headerRange)}`;
        const headerController = new AbortController();
        const headerTimeoutId = setTimeout(() => headerController.abort(), 15000);

        const headerRequestFn = () => fetch(`${headerUrl}?key=${this.apiKey}`, {
          headers: { 'User-Agent': 'Presence-API/1.0.0' },
          signal: headerController.signal,
        }).finally(() => clearTimeout(headerTimeoutId));

        const headerResponse = await this._retryRequest<{ values: string[][] }>(headerRequestFn, 2, 500);
        headers = headerResponse.values?.[0];
        
        if (headers) {
          this.headerCache.set(sheets[0], headers);
        }
      }

      if (!headers) {
        console.error(`No headers found in sheet ${sheets[0]}`);
        return [];
      }

      const colIndex = headers.findIndex(h => h.trim() === headerName);
      if (colIndex === -1) {
        console.error(`Header "${headerName}" not found in sheet ${sheets[0]}. Available headers: ${headers.join(', ')}`);
        return [];
      }

      const colLetter = this._columnIndexToLetter(colIndex);
      console.log(`Resolved header "${headerName}" to column ${colLetter} (index ${colIndex})`);

      // 2. Fetch only that column from all requested sheets via batchGet
      const ranges = sheets.map(sheet => `${sheet}!${colLetter}:${colLetter}`);

      const url = `${this.baseURL}/${this.sheetId}/values:batchGet`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const queryParams = new URLSearchParams();
      queryParams.append('key', this.apiKey);
      queryParams.append('majorDimension', 'ROWS');
      ranges.forEach(range => queryParams.append('ranges', range));

      const requestFn = () => fetch(`${url}?${queryParams.toString()}`, {
        headers: { 'User-Agent': 'Presence-API/1.0.0' },
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      const responseData = await this._retryRequest<{ valueRanges: { values: string[][] }[] }>(requestFn);
      const valueRanges = responseData.valueRanges || [];

      // 3. Extract unique values, skipping the header row itself
      const uniqueValues = new Set<string>();
      for (const valueRange of valueRanges) {
        if (!valueRange.values) continue;
        for (const row of valueRange.values) {
          const val = row[0];
          if (val && val.trim() && val.trim() !== headerName) {
            uniqueValues.add(val.trim());
          }
        }
      }

      return Array.from(uniqueValues).sort();
    } catch (error: any) {
      console.error(`Error in fetchUniqueColumnValues for "${headerName}":`, error.message);
      throw error;
    }
  }

  /**
   * Fetch data from Google Sheets with batching and reverse order fetching.
   * @param {FetchOptions} options - Fetching options.
   * @returns {Promise<SheetDataItem[]>} - Processed and sorted data array.
   */
  async fetchData(options: FetchOptions = {}): Promise<SheetDataItem[]> {
    const { year = null, page = 1, pageSize = 100, fetchAll = false } = options;

    const currentRange = year ? `${year}!A:J` : this.defaultRange;
    console.log(`Fetching data from range: ${currentRange}`);

    let rowsToFetch: number;
    if (fetchAll) {
      rowsToFetch = -1; // Placeholder, will be updated
    } else {
      const recordsToFetch = page * pageSize;
      const buffer = Math.max(recordsToFetch * 0.5, 200);
      rowsToFetch = Math.ceil(recordsToFetch + buffer);
    }
    console.log(`Calculated rows to fetch: ${rowsToFetch === -1 ? 'all' : rowsToFetch}`);

    try {
      let headers: string[] | null;
      let totalRows: number;

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
      } catch (error: any) {
        console.error('Failed during initial sheet setup (fetching headers or row count).', error.message);
        throw error;
      }

      const sheetName = currentRange.split('!')[0];
      const columnRange = currentRange.split('!')[1] || 'A:I';
      const columns = columnRange.split(':')[0];
      const endColumn = columnRange.split(':')[1];

      let allData: SheetDataItem[] = [];

      const ranges: string[] = [];
      let rowsCollected = 0;
      for (let topRow = totalRows; topRow > 1 && rowsCollected < rowsToFetch; topRow -= BATCH_SIZE) {
        const startRow = Math.max(2, topRow - BATCH_SIZE + 1);
        ranges.push(`${sheetName}!${columns}${startRow}:${endColumn}${topRow}`);
        rowsCollected += BATCH_SIZE;
      }

      if (ranges.length > 0) {
        console.log(`Fetching ${ranges.length} batches in a single API call (batchGet).`);

        const url = `${this.baseURL}/${this.sheetId}/values:batchGet`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 second timeout for large batch requests
        
        // Build query string with multiple ranges parameter (like Node.js version)
        const queryParams = new URLSearchParams();
        queryParams.append('key', this.apiKey);
        queryParams.append('majorDimension', 'ROWS');
        ranges.forEach(range => queryParams.append('ranges', range));

        const requestFn = () => fetch(`${url}?${queryParams.toString()}`, {
          headers: { 'User-Agent': 'Presence-API/1.0.0' },
          signal: controller.signal,
        }).finally(() => clearTimeout(timeoutId));

        const responseData = await this._retryRequest<{ valueRanges: { values: string[][] }[] }>(requestFn);
        const valueRanges = responseData.valueRanges || [];

        for (const valueRange of valueRanges) {
          const batchValues = valueRange.values || [];
          if (batchValues.length === 0) continue;

          const reversedBatchValues = batchValues.reverse();
          const batchData = processSheetData({ values: [headers, ...reversedBatchValues] });
          allData.push(...batchData);
        }
      }

      const sortedData = sortByTimestamp(allData);
      console.log(`Successfully fetched ${sortedData.length} total records from Google Sheets.`);

      return sortedData;

    } catch (error: any) {
      console.error('Error fetching data from Google Sheets:', error.message);

      if (error instanceof Error) {
        // Handle timeout/abort errors
        if (error.name === 'AbortError' || error.message.includes('Request timeout')) {
          throw new Error('Request timeout while fetching data from Google Sheets. The dataset might be too large.');
        }
        
        if (error.message.includes('HTTP error!')) {
          const statusMatch = error.message.match(/status: (\d+)/);
          const status = statusMatch ? parseInt(statusMatch[1]) : 500;
          const message = error.message;

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
        } else if (error.message.includes('Network error')) {
          throw new Error('Network error: Could not connect to Google Sheets API');
        } else {
          throw new Error(`Failed to fetch data from Google Sheets: ${error.message}`);
        }
      } else {
        throw new Error(`An unknown error occurred while fetching data from Google Sheets: ${JSON.stringify(error)}`);
      }
    }
  }

  /**
   * Get service status and configuration
   * @returns {Object} - Service status information
   */
  getStatus() {
    return {
      configured: true,
      sheetId: this.sheetId ? `${this.sheetId.substring(0, 10)}...` : 'Not configured',
      range: this.defaultRange,
      apiUrl: `${this.baseURL}/${this.sheetId}`,
    };
  }
}

export default GoogleSheetsService;
