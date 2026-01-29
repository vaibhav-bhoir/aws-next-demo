import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    LAMBDA_URL: process.env.LAMBDA_URL,
    API_KEY: process.env.API_KEY,
  },
};

export default nextConfig;
