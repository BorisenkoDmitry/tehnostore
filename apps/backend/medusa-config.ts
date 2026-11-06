import { loadEnv, defineConfig } from "@medusajs/framework/utils"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

module.exports = defineConfig({
  modules: [{ resolve: "./src/modules/navigation" }],
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
    databaseDriverOptions: process.env.NODE_ENV === "development"
      ? { ssl: false, sslmode: "disable" }
      : {},
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET,
      cookieSecret: process.env.COOKIE_SECRET,
    }
  },
  admin: {
    vite: () => ({
      server: {
        host: "0.0.0.0",
        allowedHosts: ["localhost", ".localhost", "127.0.0.1"],
        watch: { usePolling: true, interval: 700 },
        hmr: { port: 5173, clientPort: 5173 },
      },
    }),
  },
})
