import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 상위 폴더(claude2)에도 package-lock.json이 있어서 루트를 이 폴더로 고정한다
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
