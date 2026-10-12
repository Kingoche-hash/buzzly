import { z } from 'zod';

export const WALLPAPER_KEYS = [
  'default',
  'ocean',
  'sunset',
  'forest',
  'midnight',
  'rose',
  'dots',
  'grid',
  'autumn',
  'winter',
  'summer',
  'spring',
];

export const stateUpdateSchema = z
  .object({
    pinned: z.boolean().optional(),
    muted: z.enum(['off', '8h', '1w', 'forever']).optional(),
    spam: z.boolean().optional(),
    deleted: z.boolean().optional(),
    wallpaper: z.enum(WALLPAPER_KEYS).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update' });
