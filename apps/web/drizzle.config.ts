import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'drizzle-kit';

// Use Next.js' .env.local/.env loading conventions when running Drizzle CLI locally.
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  ...(process.env.DATABASE_URL ? { dbCredentials: { url: process.env.DATABASE_URL } } : {}),
  strict: true,
});
