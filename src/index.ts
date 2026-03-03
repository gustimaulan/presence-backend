import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import dataRoute, { warmupCacheForYear } from './routes/dataRoute';
import { CloudflareBindings } from './services/cacheService';
import { HTTP_STATUS } from './config/constants';

const app = new Hono<{ Bindings: CloudflareBindings }>();

// CORS Middleware
app.use('*', (c, next) => {
  const allowedOrigins = c.env.ALLOWED_ORIGINS ? c.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()) : ['http://localhost:5173', 'http://localhost:3000'];
  return cors({
    origin: (origin) => allowedOrigins.includes(origin) ? origin : '',
    allowHeaders: ['X-Custom-Header', 'Upgrade-Insecure-Requests', 'Content-Type'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
  })(c, next);
});

// Health check endpoint
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: 'Cloudflare Workers'
  }, HTTP_STATUS.OK as any);
});

// API routes
app.route('/api', dataRoute);

// Root endpoint
app.get('/', (c) => {
  return c.json({
    name: 'Presence Data API',
    version: '1.0.0',
    description: 'RESTful API backend for presence/attendance data from Google Sheets',
    endpoints: {
      data: '/api/data',
      refresh: '/api/refresh',
      status: '/api/status',
      health: '/health'
    },
    documentation: '/api/status',
    timestamp: new Date().toISOString()
  }, HTTP_STATUS.OK as any);
});

// 404 Not Found handler
app.notFound((c) => {
  return c.json({
    error: true,
    message: `Route ${c.req.method} ${c.req.url} not found`,
    timestamp: new Date().toISOString(),
    availableEndpoints: {
      data: '/api/data',
      refresh: '/api/refresh',
      status: '/api/status',
      health: '/health'
    }
  }, HTTP_STATUS.BAD_REQUEST as any);
});

// Global error handler
app.onError((err, c) => {
  console.error('Global error handler:', {
    message: err.message,
    stack: err.stack,
    url: c.req.url,
    method: c.req.method,
    timestamp: new Date().toISOString()
  });

  if (err instanceof HTTPException) {
    return c.json({
      error: true,
      message: err.message,
      timestamp: new Date().toISOString(),
      // Removed: ...(c.env.NODE_ENV === 'development' && { stack: err.stack })
    }, err.status);
  }

  let status = HTTP_STATUS.INTERNAL_SERVER_ERROR;
  let message = 'Internal server error';

  if (err.message.includes('Google Sheets')) {
    status = 503;
    message = 'External service unavailable - Google Sheets API issue';
  } else if (err.message.includes('timeout')) {
    status = 504;
    message = 'Request timeout - The operation took too long to complete';
  } else if (err.message.includes('Rate limit')) {
    status = 429;
    message = 'Rate limit exceeded - Please try again later';
  }

  return c.json({
    error: true,
    message,
    timestamp: new Date().toISOString(),
    // Removed: ...(c.env.NODE_ENV === 'development' && { stack: err.stack })
  }, status as any);
});

// Warm up the cache for the year 2025 (example, can be triggered by a cron job or external event)
// This needs to be called after the app is initialized and env is available.
// For Cloudflare Workers, this might be better handled by a separate Worker or a scheduled trigger.
// For now, we'll just log a message.
console.log('Cloudflare Workers setup complete. Cache warmup can be triggered via /api/refresh or a scheduled Worker.');

export default app;
