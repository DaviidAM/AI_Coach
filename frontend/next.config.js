/** @type {import('next').NextConfig} */
const backendUrl = process.env.BACKEND_URL || "http://backend:8091";

const nextConfig = {
  // Note: this project previously used `output: 'standalone'`. That setting
  // requires running `node .next/standalone/server.js` (not `npm start`) to
  // serve static chunks correctly on localhost. For VPS dev we run
  // `next start` directly, so the standalone setting was removed.

  // Proxy /api/* and /ws/* to the FastAPI backend so the browser can use
  // relative URLs (same-origin) and we don't need to expose the backend
  // publicly. This also fixes the case where the frontend bundle was built
  // with NEXT_PUBLIC_API_URL pointing at the wrong host (e.g. localhost
  // from the browser's perspective).
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backendUrl}/api/:path*` },
      { source: "/ws/:path*", destination: `${backendUrl}/ws/:path*` },
      // The backend mounts its static dir at /static; audio files live
      // under /static/audio/. The frontend (lib/api.ts audioUrl) builds
      // URLs like "/audio/", so rewrite /audio/* → /static/audio/*.
      { source: "/audio/:path*", destination: `${backendUrl}/static/audio/:path*` },
    ];
  },
};
module.exports = nextConfig;
