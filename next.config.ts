import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (cacheComponents) is intentionally OFF.
  // Almost every page reads live data from Supabase, and the dynamic-by-default
  // model avoids "blocking route" prerender errors during a 24h build.
  // See docs/DECISIONS.md (D-005) before turning it on.

  // Binary packages stay outside the server bundle.
  serverExternalPackages: ["ffmpeg-static", "sharp"],

  // Agent prompts live in agents/prompts/*.md and are read with fs at runtime.
  // Make sure they ship with every API route on Vercel.
  outputFileTracingIncludes: {
    "/api/**/*": ["./agents/prompts/**/*"],
  },

  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
