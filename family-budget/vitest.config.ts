import { defineConfig } from "vitest/config";
export default defineConfig({
  define: {
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(""),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(""),
  },
  test: {
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 60000,
    maxWorkers: 2,
  },
});
