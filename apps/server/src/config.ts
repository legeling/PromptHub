import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
import path from 'node:path';

loadEnv();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(604800),

  DATA_DIR: z.string().default('./data'),

  ALLOW_REGISTRATION: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

function loadConfig(): Config {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${formatted}`);
  }

  const env = parsed.data;

  return {
    port: env.PORT,
    host: env.HOST,

    jwt: {
      secret: env.JWT_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshTtl: env.JWT_REFRESH_TTL,
    },

    dataDir: path.resolve(env.DATA_DIR),

    allowRegistration: env.ALLOW_REGISTRATION,
    logLevel: env.LOG_LEVEL,
  };
}

export interface Config {
  port: number;
  host: string;

  jwt: {
    secret: string;
    accessTtl: number;
    refreshTtl: number;
  };

  dataDir: string;

  allowRegistration: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export const config = loadConfig();
