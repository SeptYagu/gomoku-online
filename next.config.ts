import { execSync } from "node:child_process";
import type { NextConfig } from "next";

function getAppVersion(): string {
  const explicitVersion =
    process.env.NEXT_PUBLIC_APP_VERSION ??
    process.env.APP_VERSION ??
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ??
    process.env.GITHUB_SHA?.slice(0, 7);

  if (explicitVersion) {
    return explicitVersion;
  }

  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  env: {
    NEXT_PUBLIC_APP_VERSION: getAppVersion()
  }
};

export default nextConfig;
