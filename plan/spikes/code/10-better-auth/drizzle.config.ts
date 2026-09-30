import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  dialect: 'postgresql',
  schema: ['./auth-schema.ts', './app-schema.ts'],
  dbCredentials: { url: process.env.SPIKE_DATABASE_URL ?? 'postgres://kawase:kawase@localhost:5433/kawase_spike10' },
})
