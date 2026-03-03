import { Context, Next } from 'hono';
import GoogleSheetsService from '../services/googleSheetsService';
import CacheService, { CloudflareBindings } from '../services/cacheService';

// Define the service context type here to avoid import cycles
export type ServiceContext = {
  Variables: {
    googleSheetsService: GoogleSheetsService;
    cacheService: CacheService;
  };
  Bindings: CloudflareBindings;
};

/**
 * Middleware to initialize and attach services to the context
 * This ensures that all services are available throughout the request lifecycle
 */
export const servicesMiddleware = async (c: Context<ServiceContext>, next: Next) => {
  // Initialize services with environment bindings
  const googleSheetsService = new GoogleSheetsService(c.env);
  const cacheService = new CacheService(c.env);
  
  // Attach services to context for use in controllers
  c.set('googleSheetsService', googleSheetsService);
  c.set('cacheService', cacheService);
  
  // Continue to next middleware/route handler
  await next();
};

export default servicesMiddleware;