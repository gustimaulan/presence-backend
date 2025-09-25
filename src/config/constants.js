export const REQUIRED_FIELDS = [
  "Nama Tentor",           // Teacher/tutor name (string)
  "Nama Siswa",            // Student name (string)
  "Hari dan Tanggal Les",  // Lesson date (DD/MM/YYYY format)
  "Jam Kegiatan Les",      // Lesson time (HH:mm format)
  "Timestamp"              // Entry timestamp (datetime in Asia/Jakarta timezone)
];

export const DEFAULT_PAGE_SIZE = 15;
export const MAX_PAGE_SIZE = 1000;
export const DEFAULT_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const API_ENDPOINTS = {
  DATA: '/api/data',
  REFRESH: '/api/refresh'
};

export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  INTERNAL_SERVER_ERROR: 500
};

export const TIMEZONE = 'Asia/Jakarta'; 