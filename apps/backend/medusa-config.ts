import { loadEnv, defineConfig } from "@medusajs/framework/utils"
import { redactedLogger } from "./src/lib/log-redaction"

loadEnv(process.env.NODE_ENV || "development", process.cwd())

module.exports = defineConfig({
  logger: redactedLogger,
  modules: [
    { resolve: "@medusajs/medusa/file", options: { providers: [{ resolve: "./src/modules/secure-local-file", id: "local", options: {
      upload_dir: "static",
      private_upload_dir: process.env.PRIVATE_UPLOAD_DIR || "../private-files",
      backend_url: process.env.FILE_PUBLIC_URL || "http://localhost:9000/static",
    } }] } },
    { resolve: "@medusajs/medusa/locking", options: { providers: [{ resolve: "@medusajs/medusa/locking-redis", id: "redis", is_default: true, options: { redisUrl: process.env.REDIS_URL } }] } },
    { resolve: "./src/modules/navigation" },
    { resolve: "./src/modules/catalog-attributes" },
    { resolve: "./src/modules/content" },
    { resolve: "./src/modules/insales-import" },
  ],
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
        hmr: { port: Number(process.env.MEDUSA_ADMIN_HMR_PORT || 5173), clientPort: Number(process.env.MEDUSA_ADMIN_HMR_CLIENT_PORT || 5173) },
      },
    }),
  },
})
