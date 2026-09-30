import { defineConfig } from "drizzle-kit";

// Migrations are generated from the schema and committed; the api applies them at startup (src/migrate.ts).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  casing: "snake_case",
});
