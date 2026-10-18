import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated or not app code:
    "lib/database.types.ts",
    "supabase/**",
    // Parallel agents' git worktrees (Claude Code) live here; each is linted in its own checkout.
    ".claude/**",
  ]),
]);

export default eslintConfig;
