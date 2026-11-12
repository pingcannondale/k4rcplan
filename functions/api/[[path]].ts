// Cloudflare Pages Functions adapter.
// File path "api/[[path]].ts" is Pages' catch-all route syntax: it matches
// every request under /api/* (equivalent to Netlify's config.path list and
// Vercel's api/[...path].ts), and calls the exact same handler used on
// Netlify/Vercel — it's already a Web-standard (req: Request) => Response
// function, so no rewrite was needed, just this thin adapter.
import handler from "../../netlify/functions/api.mts";

interface Env {
  K4RC_KV: KVNamespace;
  [key: string]: unknown;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  // shared.mts can't receive `env` as a parameter (it's called from many
  // places without one), so the KV binding is handed over via a global for
  // the lifetime of this one request.
  (globalThis as any).__K4RC_KV = context.env.K4RC_KV;
  return handler(context.request);
};
