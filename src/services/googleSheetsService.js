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
   * Fetch data from Google Sheets
   * @returns {Promise<Array>} - Processed data array
   */
  async fetchData() {
    this._init(); // Initialize when first used
    
    try {
      const url = `${this.baseURL}/${this.sheetId}/values/${this.range}`;
      
      console.log('Fetching data from Google Sheets...');
      const response = await axios.get(url, {
        params: {
          key: this.apiKey
        },
        timeout: 10000 // 10 second timeout
      });

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
        } else {
          throw new Error(`Google Sheets API error (${status}): ${message}`);
        }
      } else if (error.code === 'ECONNABORTED') {
        throw new Error('Request timeout while fetching data from Google Sheets');
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