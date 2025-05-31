# Presence Data Backend API

A RESTful API backend for fetching and serving presence/attendance data from Google Sheets with built-in caching, pagination, and year filtering capabilities.

## 🚀 Features

- **Google Sheets Integration**: Direct integration with Google Sheets API v4
- **Year-based Filtering**: Efficient server-side filtering by year
- **Intelligent Caching**: 5-minute TTL in-memory caching system
- **Pagination Support**: Configurable page sizes with metadata
- **Data Validation**: Comprehensive validation and processing
- **Error Handling**: Robust error handling with detailed logging
- **Security**: Helmet.js security headers and CORS configuration
- **Performance**: Compression and optimized data processing

## 📋 Requirements

- Node.js 18.0.0 or higher
- Google Sheets API v4 access
- Google API Key with Sheets API permissions

## 🛠 Installation

1. **Clone and navigate to backend directory:**
   ```bash
   cd backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp env.example .env
   ```

4. **Configure your `.env` file:**
   ```env
   # Server Configuration
   PORT=3000
   NODE_ENV=development

   # Google Sheets API Configuration
   GOOGLE_SHEET_ID=your_actual_google_sheet_id
   GOOGLE_API_KEY=your_actual_google_api_key
   GOOGLE_SHEET_RANGE=Sheet1!A:E

   # Cache Configuration (optional)
   CACHE_DURATION=300000

   # CORS Configuration (optional)
   ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
   ```

5. **Start the server:**
   ```bash
   # Development mode with auto-restart
   npm run dev

   # Production mode
   npm start
   ```

## 📚 API Endpoints

### 🔍 GET `/api/data`
Retrieve paginated attendance data with optional year filtering.

**Query Parameters:**
- `year` (optional): Filter data by year (e.g., `2025`)
- `page` (optional): Page number (default: 1)
- `pageSize` (optional): Items per page (default: 100, max: 1000)

**Examples:**
```bash
# Get all data (first 100 items)
GET /api/data

# Get data for year 2025
GET /api/data?year=2025

# Get page 2 with 50 items per page
GET /api/data?page=2&pageSize=50

# Get 2025 data, page 2, 50 items
GET /api/data?year=2025&page=2&pageSize=50
```

**Response:**
```json
{
  "cached": false,
  "data": [...],
  "pagination": {
    "currentPage": 1,
    "pageSize": 100,
    "totalItems": 1250,
    "totalPages": 13,
    "hasNextPage": true,
    "hasPreviousPage": false
  },
  "filters": {
    "year": "2025"
  },
  "fetchedAt": "2025-01-08T10:30:00.000Z"
}
```

### 🔄 GET `/api/refresh`
Force refresh data from Google Sheets, bypassing cache.

**Response:**
```json
{
  "message": "Data refreshed successfully",
  "data": [...],
  "totalRecords": 1250,
  "refreshedAt": "2025-01-08T10:30:00.000Z"
}
```

### 📊 GET `/api/status`
Get comprehensive API and service status information.

**Response:**
```json
{
  "api": {
    "status": "operational",
    "version": "1.0.0",
    "uptime": 3600,
    "timestamp": "2025-01-08T10:30:00.000Z"
  },
  "googleSheets": {
    "configured": true,
    "sheetId": "1BxiMVs0XR...",
    "range": "Sheet1!A:E",
    "apiUrl": "https://sheets.googleapis.com/v4/..."
  },
  "cache": {
    "totalEntries": 5,
    "activeEntries": 5,
    "expiredEntries": 0,
    "approximateMemoryBytes": 125000,
    "cacheDuration": 300000
  },
  "environment": {
    "nodeVersion": "v18.19.0",
    "platform": "darwin",
    "memory": {...}
  }
}
```

### ❤️ GET `/health`
Simple health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-08T10:30:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "environment": "development"
}
```

### 🧹 POST `/api/cache/clear`
Clear all cache entries (admin endpoint).

**Response:**
```json
{
  "message": "Cache cleared successfully",
  "timestamp": "2025-01-08T10:30:00.000Z"
}
```

## 🗄️ Data Structure

### Required Google Sheets Columns:
- **Timestamp**: Entry timestamp (DD/MM/YYYY HH:mm:ss format)
- **Nama Tentor**: Teacher/tutor name
- **Nama Siswa**: Student name  
- **Hari dan Tanggal Les**: Lesson date (DD/MM/YYYY format)
- **Jam Kegiatan Les**: Lesson time (HH:mm format)

### Data Processing:
1. **Fetches** raw data from Google Sheets API
2. **Validates** and filters out empty/invalid rows
3. **Sorts** by timestamp (newest first)
4. **Filters** by year if specified
5. **Paginates** results
6. **Caches** for 5 minutes

## ⚡ Caching System

- **Type**: In-memory caching with TTL
- **Duration**: 5 minutes (configurable)
- **Key Strategy**: `data|year:2025|page:1|size:100`
- **Auto-cleanup**: Expired entries cleaned every 10 minutes
- **Cache Status**: Indicated in API responses

## 🔧 Configuration

### Environment Variables:
```env
PORT=3000                    # Server port
NODE_ENV=development         # Environment (development/production)
GOOGLE_SHEET_ID=your_id     # Google Sheets document ID
GOOGLE_API_KEY=your_key     # Google API key
GOOGLE_SHEET_RANGE=Sheet1!A:E # Data range to fetch
CACHE_DURATION=300000       # Cache TTL in milliseconds
ALLOWED_ORIGINS=http://...  # CORS allowed origins
```

### Constants:
```javascript
DEFAULT_PAGE_SIZE = 100     # Default pagination size
MAX_PAGE_SIZE = 1000       # Maximum pagination size
DEFAULT_CACHE_DURATION = 300000  # 5 minutes in ms
```

## 🚦 Error Handling

### Error Response Format:
```json
{
  "error": true,
  "message": "Error description",
  "timestamp": "2025-01-08T10:30:00.000Z"
}
```

### HTTP Status Codes:
- `200` - Success
- `400` - Bad Request (invalid parameters)
- `404` - Not Found (invalid route)
- `500` - Internal Server Error
- `503` - Service Unavailable (Google Sheets issues)
- `504` - Gateway Timeout

## 🔍 Logging

The API provides comprehensive logging:
- **Request Logging**: Method, URL, status, duration, IP
- **Error Logging**: Detailed error information with stack traces
- **Cache Logging**: Cache hits, misses, and cleanup operations
- **Google Sheets Logging**: API calls and response details

## 🧪 Testing the API

### Using curl:
```bash
# Test health endpoint
curl http://localhost:3000/health

# Get data for 2025
curl "http://localhost:3000/api/data?year=2025"

# Force refresh
curl http://localhost:3000/api/refresh

# Get status
curl http://localhost:3000/api/status
```

### Using your frontend:
Update your frontend `.env`:
```env
VITE_API_BASE_URL=http://localhost:3000/api
```

## 🔒 Security Features

- **Helmet.js**: Security headers
- **CORS**: Configurable cross-origin requests
- **Rate Limiting**: Prevents abuse (can be extended)
- **Input Validation**: Query parameter validation
- **Error Sanitization**: No sensitive data in error responses

## 📈 Performance Optimizations

- **Compression**: Response compression middleware
- **Caching**: Intelligent caching with TTL
- **Efficient Filtering**: Server-side year filtering
- **Pagination**: Reduces payload sizes
- **Connection Reuse**: HTTP keep-alive
- **Memory Management**: Automatic cache cleanup

## 🔧 Development

### Scripts:
```bash
npm start        # Start production server
npm run dev      # Start development server with nodemon
```

### Project Structure:
```
backend/
├── src/
│   ├── config/
│   │   └── constants.js
│   ├── middleware/
│   │   └── errorHandler.js
│   ├── routes/
│   │   └── dataRoutes.js
│   ├── services/
│   │   ├── googleSheetsService.js
│   │   └── cacheService.js
│   └── utils/
│       └── dataProcessor.js
├── public/
├── package.json
├── server.js
├── env.example
└── README.md
```

## 🚀 Deployment

### Production Checklist:
1. Set `NODE_ENV=production`
2. Configure proper CORS origins
3. Set up proper logging solution
4. Configure reverse proxy (nginx)
5. Set up process manager (PM2)
6. Configure SSL/TLS termination
7. Set up monitoring and alerts

### Example PM2 Configuration:
```json
{
  "name": "presence-api",
  "script": "server.js",
  "instances": "max",
  "exec_mode": "cluster",
  "env": {
    "NODE_ENV": "production",
    "PORT": 3000
  }
}
```

## 📞 Support

For issues or questions:
1. Check the `/api/status` endpoint for service health
2. Review server logs for detailed error information
3. Verify Google Sheets API configuration
4. Test connectivity to Google Sheets API

## 📄 License

MIT License 