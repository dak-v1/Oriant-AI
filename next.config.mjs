/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `npm run dev` uses .next; `npm run build` / `npm start` use .next-build
  // (see scripts/next-prod.mjs). Separate directories mean a production build
  // can never overwrite the running dev server's chunks — the cause of
  // "__webpack_modules__[moduleId] is not a function".
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
