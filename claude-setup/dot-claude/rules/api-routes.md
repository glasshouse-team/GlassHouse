---
paths:
  - "app/api/**"
---

# API route rules

- Next.js 16: read node_modules/next/dist/docs/01-app before using routing APIs. Dynamic params: `ctx: RouteContext<"/api/deals/[id]/run">`, then `await ctx.params`.
- Validate every body with Zod (`parseJson` from lib/http.ts) and return errors through `errorResponse`.
- Database writes use `supabaseAdmin()` (service role) on the server only. Never return host policies or deal secrets.
- Log the action with `logEvent` (or it is logged by createAgent if an agent tool does it).
- In `isDemoMode()`: never call World Labs; return saved data.
- Routes that use ffmpeg or sharp run on the Node.js runtime (the default). Do not set `runtime = "edge"`.
