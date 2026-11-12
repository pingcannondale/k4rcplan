// Vercel adapter: reuses the exact same request handler used on Netlify
// (netlify/functions/api.mts already exports a Web-standard
// `(req: Request) => Response` default export, which Vercel's Node.js
// runtime also accepts directly). The catch-all route "[...path]"
// makes every /api/* request land here, matching the original Netlify
// `config.path` list.
export { default } from "../netlify/functions/api.mts";
