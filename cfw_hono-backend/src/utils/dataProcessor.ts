import { REQUIRED_FIELDS } from '../config/constants';

export interface SheetDataItem {
  'Nama Tentor'?: string;
  'Nama Siswa'?: string;
  'Hari dan Tanggal Les'?: string;
  'Jam Kegiatan Les'?: string;
  'Timestamp'?: string;
  'Durasi Les'?: string;
  'Year'?: string;
  _rowIndex?: number;
  [key: string]: any; // Allow other properties
}

/**
 * Check if a row has all required fields empty
 * @param {string[]} row - Row data array
 * @param {string[]} headers - Header names array
 * @returns {boolean} - True if row is completely empty
 */
export const isRowEmpty = (row: string[], headers: string[]): boolean => {
  return REQUIRED_FIELDS.every(field => {
    const colIndex = headers.indexOf(field);
    return colIndex === -1 || !row[colIndex] || !row[colIndex].trim();
  });
};

/**
 * Check if a data object has all required fields with values
 * @param {SheetDataItem} obj - Data object to validate
 * @returns {boolean} - True if all required fields have values
 */
export const isRowValid = (obj: SheetDataItem): boolean => {
  return REQUIRED_FIELDS.every(field => obj[field] && String(obj[field]).trim());
};

/**
 * Extract year from date string in DD/MM/YYYY format
 * @param {string | undefined} dateString - Date string to parse
 * @returns {string|null} - Year as string or null if invalid
 */
export const extractYear = (dateString: string | undefined): string | null => {
  if (!dateString) return null;
  const parts = dateString.split('/');
  if (parts.length === 3 && parts[2].length === 4) {
    return parts[2];
  }
  return null;
};

/**
 * Parse timestamp in DD/MM/YYYY HH:mm:ss format
 * @param {string | undefined} timestamp - Timestamp string to parse
 * @returns {Date} - Parsed date object
 */
export const parseTimestamp = (timestamp: string | undefined): Date => {
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
 * @param {SheetDataItem[]} data - Array of data objects
 * @returns {SheetDataItem[]} - Sorted array
 */
export const sortByTimestamp = (data: SheetDataItem[]): SheetDataItem[] => {
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
 * @returns {SheetDataItem[]} - Processed and validated data array
 */
export const processSheetData = (response: { values: string[][] }): SheetDataItem[] => {
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
      const item: SheetDataItem = {};
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
 * @param {SheetDataItem[]} data - Array of data objects
 * @param {string | null} year - Year to filter by
 * @returns {SheetDataItem[]} - Filtered data array
 */
export const filterByYear = (data: SheetDataItem[], year: string | null): SheetDataItem[] => {
  if (!year) return data;
  
  const filtered = data.filter(item => {
    const itemYear = extractYear(item['Hari dan Tanggal Les']);
    return itemYear === year;
  });
  return filtered;
};

export interface PaginationResult {
  data: SheetDataItem[];
  pagination: {
    currentPage: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

/**
 * Paginate data array
 * @param {SheetDataItem[]} data - Data array to paginate
 * @param {number} page - Current page number (1-based)
 * @param {number} pageSize - Number of items per page
 * @returns {PaginationResult} - Paginated data with metadata
 */
export const paginateData = (data: SheetDataItem[], page: number = 1, pageSize: number = 100): PaginationResult => {
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
 * @param {SheetDataItem[]} data - Data array to search
 * @param {string} searchTerm - Search term to filter by
 * @returns {SheetDataItem[]} - Filtered data array
 */
export const searchData = (data: SheetDataItem[], searchTerm: string): SheetDataItem[] => {
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
      item['Timestamp'] || '',             // Timestamp
      item['Durasi Les'] || ''             // Duration of lesson
    ];

    // Check if any field contains the search term
    return searchableFields.some(field => 
      String(field).toLowerCase().includes(term)
    );
  });
};

export interface SearchCriteria {
  search?: string | null;
  teacher?: string | null;
  student?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

/**
 * Filter data by multiple search criteria
 * @param {SheetDataItem[]} data - Data array to search
 * @param {SearchCriteria} searchCriteria - Search criteria object
 * @returns {SheetDataItem[]} - Filtered data array
 */
export const advancedSearch = (data: SheetDataItem[], searchCriteria: SearchCriteria): SheetDataItem[] => {
  if (!searchCriteria || !Array.isArray(data)) {
    return data;
  }

  let filteredData = data;

  // General search term
  if (searchCriteria.search) {
    filteredData = searchData(filteredData, searchCriteria.search);
  }

  // Handle teacher and student search.
  // If only 'teacher' is provided, search in both teacher and student fields.
  // If 'student' is also provided, treat them as separate AND conditions.
  if (searchCriteria.teacher && !searchCriteria.student) {
    const term = searchCriteria.teacher.toLowerCase().trim();
    filteredData = filteredData.filter(item =>
      (item['Nama Tentor'] || '').toLowerCase().includes(term) ||
      (item['Nama Siswa'] || '').toLowerCase().includes(term)
    );
  } else if (searchCriteria.teacher) {
    const teacherTerm = searchCriteria.teacher.toLowerCase().trim();
    filteredData = filteredData.filter(item =>
      (item['Nama Tentor'] || '').toLowerCase().includes(teacherTerm)
    );
  } else if (searchCriteria.student) {
    const studentTerm = searchCriteria.student.toLowerCase().trim();
    filteredData = filteredData.filter(item =>
      (item['Nama Siswa'] || '').toLowerCase().includes(studentTerm)
    );
  }

  // Date range filter
  if (searchCriteria.dateFrom || searchCriteria.dateTo) {
    // Handle both DD/MM/YYYY and YYYY-MM-DD formats for dateFrom
    let fromDate: Date;
    if (searchCriteria.dateFrom) {
      if (searchCriteria.dateFrom.includes('/')) {
        fromDate = parseTimestamp(searchCriteria.dateFrom + ' 00:00:00');
      } else {
        // Convert YYYY-MM-DD to DD/MM/YYYY for parseTimestamp
        const [year, month, day] = searchCriteria.dateFrom.split('-');
        fromDate = parseTimestamp(`${day}/${month}/${year} 00:00:00`);
      }
    } else {
      fromDate = new Date('1900-01-01');
    }
    
    // Handle both DD/MM/YYYY and YYYY-MM-DD formats for dateTo
    let toDate: Date;
    if (searchCriteria.dateTo) {
      if (searchCriteria.dateTo.includes('/')) {
        toDate = parseTimestamp(searchCriteria.dateTo + ' 23:59:59');
      } else {
        // Convert YYYY-MM-DD to DD/MM/YYYY for parseTimestamp
        const [year, month, day] = searchCriteria.dateTo.split('-');
        toDate = parseTimestamp(`${day}/${month}/${year} 23:59:59`);
      }
    } else {
      toDate = new Date('2100-12-31');
    }
    
    filteredData = filteredData.filter(item => {
      const itemDate = parseTimestamp(item['Timestamp'] || '');
      return itemDate.getTime() >= fromDate.getTime() && itemDate.getTime() <= toDate.getTime();
    });
  }

  return filteredData;
};

/**
 * Extracts unique tentor (teacher) names from the data.
 * @param {SheetDataItem[]} data - Array of data objects.
 * @returns {string[]} - Sorted array of unique tutor names.
 */
export const getUniqueTutorNames = (data: SheetDataItem[]): string[] => {
  const tutorNames = new Set<string>();
  data.forEach(item => {
    if (item['Nama Tentor']) {
      tutorNames.add(item['Nama Tentor'].trim());
    }
  });
  return Array.from(tutorNames).sort();
};

/**
 * Extracts unique siswa (student) names from the data.
 * @param {SheetDataItem[]} data - Array of data objects.
 * @returns {string[]} - Sorted array of unique siswa names.
 */
export const getUniqueStudentNames = (data: SheetDataItem[]): string[] => {
  const studentNames = new Set<string>();
  data.forEach(item => {
    if (item['Nama Siswa']) {
      studentNames.add(item['Nama Siswa'].trim());
    }
  });
  return Array.from(studentNames).sort();
};
