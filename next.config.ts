import type { NextConfig } from "next";
// The runtime image installs only production dependencies and runs `next start`.
// Avoid standalone tracing, which can stall while Docker BuildKit snapshots files.
const nextConfig: NextConfig = {};
export default nextConfig;
