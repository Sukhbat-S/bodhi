import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
// Root package.json may not exist on Vercel (subdirectory deploy)
let appVersion = "0.9.0";
try {
  const rootPkg = await import("../../package.json");
  appVersion = rootPkg.version || appVersion;
} catch { /* Vercel subdirectory deploy — use fallback */ }

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: false, // we use our own public/manifest.json
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,png,svg}"],
      },
      devOptions: {
        enabled: false, // only active in production builds
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
