import { Hono, Context } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

import { CloudflareBindings } from '../services/cacheService';
import {
  getDataController,
  postDataQueryController,
  getSearchController,
  getRefreshController,
  getStatusController,
  getTutorsController,
  getStudentsController,
  postCacheClearController,
  warmupCacheForYear,
} from '../controllers/dataController';
import { servicesMiddleware, ServiceContext } from '../middleware/servicesMiddleware';
import { getDataQuerySchema, postDataQuerySchema, getSearchQuerySchema } from '../validators/dataValidator';
import GoogleSheetsService from '../services/googleSheetsService';
import CacheService from '../services/cacheService';

// Define the full DataContext here, including validated data types
export type DataContext = ServiceContext & {
  Req: {
    Valid: {
      query: z.infer<typeof getDataQuerySchema & typeof getSearchQuerySchema>;
      json: z.infer<typeof postDataQuerySchema>;
    };
  };
};

const dataRoutes = new Hono<DataContext>();

// Middleware to initialize services and attach to context
dataRoutes.use('*', servicesMiddleware);

// GET /api/data
dataRoutes.get('/data',
  zValidator('query', getDataQuerySchema),
  getDataController
);

// POST /api/data/query
dataRoutes.post('/data/query',
  zValidator('json', postDataQuerySchema),
  postDataQueryController
);

// GET /api/search
dataRoutes.get('/search',
  zValidator('query', getSearchQuerySchema),
  getSearchController
);

// GET /api/refresh
dataRoutes.get('/refresh', getRefreshController);

// GET /api/status
dataRoutes.get('/status', getStatusController);

// GET /api/tutors
dataRoutes.get('/tutors', getTutorsController);

// GET /api/students
dataRoutes.get('/students', getStudentsController);

// POST /api/cache/clear
dataRoutes.post('/cache/clear', postCacheClearController);

export { warmupCacheForYear };
export default dataRoutes;