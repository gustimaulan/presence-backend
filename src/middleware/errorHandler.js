/**
 * Global error handling middleware
 * @param {Error} err - Error object
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {Function} next - Express next function
 */
export const errorHandler = (err, req, res, next) => {
  console.error('Global error handler:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Default error response
  let status = 500;
  let message = 'Internal server error';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    status = 400;
    message = err.message;
  } else if (err.name === 'CastError') {
    status = 400;
    message = 'Invalid data format';
  } else if (err.message.includes('Google Sheets')) {
    status = 503;
    message = 'External service unavailable - Google Sheets API issue';
  } else if (err.message.includes('timeout') || err.code === 'ETIMEDOUT') {
    status = 504;
    message = 'Request timeout - The operation took too long to complete';
  } else if (err.message.includes('Rate limit')) {
    status = 429;
    message = 'Rate limit exceeded - Please try again later';
  }

  res.status(status).json({
    error: true,
    message,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * 404 Not Found handler
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 */
export const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: true,
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: new Date().toISOString(),
    availableEndpoints: {
      data: '/api/data',
      refresh: '/api/refresh',
      status: '/api/status',
      health: '/health'
    }
  });
};

/**
 * Request logging middleware
 * @param {Request} req - Express request object
 * @param {Response} res - Express response object
 * @param {Function} next - Express next function
 */
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  const ip = req.ip || req.connection.remoteAddress;
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const size = res.get('Content-Length') || 0;
    
    console.log(`${req.method} ${req.url} - ${res.statusCode} - ${duration}ms - ${size} bytes - ${ip}`);
    
    // Log slow requests
    if (duration > 5000) {
      console.warn(`⚠️  Slow request detected: ${req.method} ${req.url} took ${duration}ms`);
    }
  });
  
  next();
};

/**
 * Request timeout middleware for different endpoints
 */
export const requestTimeout = (timeoutMs = 45000) => {
  return (req, res, next) => {
    // Set timeout for this request
    req.setTimeout(timeoutMs, () => {
      if (!res.headersSent) {
        res.status(504).json({
          error: true,
          message: 'Request timeout - The request took too long to process',
          timestamp: new Date().toISOString(),
          timeout: `${timeoutMs / 1000}s`
        });
      }
    });
    
    next();
  };
}; 