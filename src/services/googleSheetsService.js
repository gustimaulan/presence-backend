import axios from 'axios';
import { processSheetData, sortByTimestamp } from '../utils/dataProcessor.js';

class GoogleSheetsService {
  constructor() {
    this.baseURL = 'https://sheets.googleapis.com/v4/spreadsheets';
    // Don't check environment variables in constructor, check them when first used
    this._initialized = false;
  }

  /**
   * Initialize the service with environment variables
   * @private
   */
  _init() {
    if (this._initialized) return;
    
    this.sheetId = process.env.GOOGLE_SHEET_ID;
    this.apiKey = process.env.GOOGLE_API_KEY;
    this.range = process.env.GOOGLE_SHEET_RANGE || 'Presensi!A1:E';
    
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
   * Fetch data from Google Sheets
   * @returns {Promise<Array>} - Processed data array
   */
  async fetchData() {
    this._init(); // Initialize when first used
    
    const url = `${this.baseURL}/${this.sheetId}/values/${this.range}`;
    
    const requestFn = async () => {
      console.log('Fetching data from Google Sheets...');
      return await axios.get(url, {
        params: {
          key: this.apiKey
        },
        timeout: 30000, // Increased to 30 seconds
        headers: {
          'User-Agent': 'Presence-API/1.0.0'
        }
      });
    };

    try {
      const response = await this._retryRequest(requestFn);

      const processedData = processSheetData(response.data);
      const sortedData = sortByTimestamp(processedData);
      
      console.log(`Successfully fetched ${sortedData.length} records from Google Sheets`);
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
          throw new Error(`Google Sheet not found. Please check GOOGLE_SHEET_ID: ${message}`);
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
        range: this.range,
        apiUrl: `${this.baseURL}/${this.sheetId}/values/${this.range}`
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