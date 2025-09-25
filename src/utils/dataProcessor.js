import { REQUIRED_FIELDS } from '../config/constants.js';

/**
 * Check if a row has all required fields empty
 * @param {Array} row - Row data array
 * @param {Array} headers - Header names array
 * @returns {boolean} - True if row is completely empty
 */
export const isRowEmpty = (row, headers) => {
  return REQUIRED_FIELDS.every(field => {
    const colIndex = headers.indexOf(field);
    return colIndex === -1 || !row[colIndex] || !row[colIndex].trim();
  });
};

/**
 * Check if a data object has all required fields with values
 * @param {Object} obj - Data object to validate
 * @returns {boolean} - True if all required fields have values
 */
export const isRowValid = (obj) => {
  return REQUIRED_FIELDS.every(field => obj[field] && obj[field].trim());
};

/**
 * Extract year from date string in DD/MM/YYYY format
 * @param {string} dateString - Date string to parse
 * @returns {string|null} - Year as string or null if invalid
 */
export const extractYear = (dateString) => {
  if (!dateString) return null;
  const parts = dateString.split('/');
  if (parts.length === 3 && parts[2].length === 4) {
    return parts[2];
  }
  return null;
};

/**
 * Parse timestamp in DD/MM/YYYY HH:mm:ss format
 * @param {string} timestamp - Timestamp string to parse
 * @returns {Date} - Parsed date object
 */
export const parseTimestamp = (timestamp) => {
  if (!timestamp) return new Date(0);
  
  try {
    // Handle DD/MM/YYYY HH:mm:ss format
    const [datePart, timePart] = timestamp.split(' ');
    if (!datePart) return new Date(0);
    
    const [day, month, year] = datePart.split('/');
    if (!day || !month || !year) return new Date(0);
    
    const time = timePart || '00:00:00';
    
    // Ensure time components are zero-padded for valid ISO format
    const timeParts = time.split(':');
    const paddedTime = timeParts.map(part => part.padStart(2, '0')).join(':');
    
    // Create ISO date string for parsing: YYYY-MM-DDTHH:mm:ss
    const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${paddedTime}`;
    const date = new Date(isoString);
    
    // Return epoch time if invalid date
    return isNaN(date.getTime()) ? new Date(0) : date;
  } catch (error) {
    console.warn('Error parsing timestamp:', timestamp, error);
    return new Date(0);
  }
};

/**
 * Sort data by timestamp (newest first)
 * @param {Array} data - Array of data objects
 * @returns {Array} - Sorted array
 */
export const sortByTimestamp = (data) => {
  return [...data].sort((a, b) => {
    const dateA = parseTimestamp(a.Timestamp);
    const dateB = parseTimestamp(b.Timestamp);
    
    // Sort descending (newest first): dateB - dateA
    return dateB.getTime() - dateA.getTime();
  });
};

/**
 * Process raw Google Sheets data
 * @param {Object} response - Google Sheets API response
 * @returns {Array} - Processed and validated data array
 */
export const processSheetData = (response) => {
  const values = response.values || [];
  
  if (values.length === 0) {
    return [];
  }

  // First row contains headers
  const headers = values[0];
  const rows = values.slice(1);

  // Convert rows to objects
  const data = rows
    .filter(row => {
      // Filter out completely empty rows
      return row.some(cell => cell && cell.trim()) && !isRowEmpty(row, headers);
    })
    .map((row, index) => {
      const item = {};
      headers.forEach((header, colIndex) => {
        item[header] = row[colIndex] || '';
      });
      item._rowIndex = index + 2; // +2 because we start from row 1 and skip header
      return item;
    })
    .filter(item => {
      // Filter out rows missing required fields
      return isRowValid(item);
    });

  return data;
};

/**
 * Filter data by year
 * @param {Array} data - Array of data objects
 * @param {string} year - Year to filter by
 * @returns {Array} - Filtered data array
 */
export const filterByYear = (data, year) => {
  if (!year) return data;
  
  const filtered = data.filter(item => {
    const itemYear = extractYear(item['Hari dan Tanggal Les']);
    return itemYear === year;
  });
  return filtered;
};

/**
 * Paginate data array
 * @param {Array} data - Data array to paginate
 * @param {number} page - Current page number (1-based)
 * @param {number} pageSize - Number of items per page
 * @returns {Object} - Paginated data with metadata
 */
export const paginateData = (data, page = 1, pageSize = 100) => {
  const totalItems = data.length;
  const totalPages = Math.max(Math.ceil(totalItems / pageSize), 1);
  const currentPage = Math.max(1, Math.min(page, totalPages));
  
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;
  const paginatedData = data.slice(start, end);
  
  return {
    data: paginatedData,
    pagination: {
      currentPage,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: currentPage < totalPages,
      hasPreviousPage: currentPage > 1
    }
  };
};

/**
 * Filter data by search term across multiple fields
 * @param {Array} data - Data array to search
 * @param {string} searchTerm - Search term to filter by
 * @returns {Array} - Filtered data array
 */
export const searchData = (data, searchTerm) => {
  if (!searchTerm || !Array.isArray(data)) {
    return data;
  }

  const term = searchTerm.toLowerCase().trim();
  
  if (!term) {
    return data;
  }

  return data.filter(item => {
    // Search across multiple fields
    const searchableFields = [
      item['Nama Tentor'] || '',           // Teacher name
      item['Nama Siswa'] || '',            // Student name
      item['Hari dan Tanggal Les'] || '',  // Lesson date
      item['Jam Kegiatan Les'] || '',      // Lesson time
      item['Timestamp'] || ''              // Timestamp
    ];

    // Check if any field contains the search term
    return searchableFields.some(field => 
      field.toString().toLowerCase().includes(term)
    );
  });
};

/**
 * Filter data by multiple search criteria
 * @param {Array} data - Data array to search
 * @param {Object} searchCriteria - Search criteria object
 * @returns {Array} - Filtered data array
 */
export const advancedSearch = (data, searchCriteria) => {
  if (!searchCriteria || !Array.isArray(data)) {
    return data;
  }

  let filteredData = data;

  // General search term
  if (searchCriteria.search) {
    filteredData = searchData(filteredData, searchCriteria.search);
  }

  // Teacher name filter
  if (searchCriteria.teacher) {
    const teacherTerm = searchCriteria.teacher.toLowerCase().trim();
    filteredData = filteredData.filter(item => 
      (item['Nama Tentor'] || '').toLowerCase().includes(teacherTerm)
    );
  }

  // Student name filter
  if (searchCriteria.student) {
    const studentTerm = searchCriteria.student.toLowerCase().trim();
    filteredData = filteredData.filter(item => 
      (item['Nama Siswa'] || '').toLowerCase().includes(studentTerm)
    );
  }

  // Date range filter
  if (searchCriteria.dateFrom || searchCriteria.dateTo) {
    const fromDate = searchCriteria.dateFrom ? new Date(searchCriteria.dateFrom) : new Date('1900-01-01');
    const toDate = searchCriteria.dateTo ? new Date(searchCriteria.dateTo) : new Date('2100-12-31');
    
    filteredData = filteredData.filter(item => {
      const itemDate = parseTimestamp(item['Timestamp'] || '');
      return itemDate >= fromDate && itemDate <= toDate;
    });
  }

  return filteredData;
};