import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@stargaze/shared"],
  ...(process.env.NODE_ENV === "development"
    ? { rewrites: async () => [{ source: "/api/:path*", destination: `${process.env.API_UPSTREAM ?? "http://127.0.0.1:4000"}/api/:path*` }] }
    : { output: "export" as const }),
};

export default nextConfig;
