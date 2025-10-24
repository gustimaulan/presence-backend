import { z } from 'zod';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../config/constants';

export const getDataQuerySchema = z.object({
  year: z.string().optional(),
  page: z.string().transform(Number).default(1),
  pageSize: z.string().transform(Number).default(DEFAULT_PAGE_SIZE),
  search: z.string().optional(),
  teacher: z.string().optional(),
  student: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const postDataQuerySchema = z.object({
  year: z.string().optional(),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  search: z.object({
    search: z.string().optional(),
    teacher: z.string().optional(),
    student: z.string().optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
  }).optional().default({}),
});

export const getSearchQuerySchema = z.object({
  q: z.string().optional(),
  search: z.string().optional(),
  page: z.string().transform(Number).default(1),
  pageSize: z.string().transform(Number).default(DEFAULT_PAGE_SIZE),
});
