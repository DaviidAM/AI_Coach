/** @type {import('next').NextConfig} */
const nextConfig = {
  // Note: this project previously used `output: 'standalone'`. That setting
  // requires running `node .next/standalone/server.js` (not `npm start`) to
  // serve static chunks correctly on localhost. For VPS dev we run
  // `next start` directly, so the standalone setting was removed.
};
module.exports = nextConfig;
