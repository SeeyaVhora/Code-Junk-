import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath, URL } from "node:url";

/**
 * Reads API_PROXY_TARGET from the repository-root .env for the dev proxy.
 * Deliberately not Vite's loadEnv: that file also holds the API's NODE_ENV, and loadEnv
 * would apply it to this build and ship development builds of React.
 */
function apiProxyTarget() {
  if (process.env.API_PROXY_TARGET) return process.env.API_PROXY_TARGET;
  const file = fileURLToPath(new URL("../../.env", import.meta.url));
  const fromFile = existsSync(file) ? parseEnv(readFileSync(file, "utf8")).API_PROXY_TARGET : undefined;
  return fromFile || "http://localhost:4100";
}

export default defineConfig(() => {
  const proxy = { "/api": { target: apiProxyTarget(), changeOrigin: false, xfwd: true } };
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    // Same-origin /api: cookies stay first-party and no CORS is needed.
    server: { port: 5173, proxy },
    preview: { proxy },
  };
});
