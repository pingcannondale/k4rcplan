// เซิร์ฟเวอร์ทดสอบในเครื่อง: เสิร์ฟโฟลเดอร์ public/ และเรียก netlify/functions/api.mts เหมือนบน Netlify
// รัน: npm run dev  แล้วเปิด http://localhost:8888
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

// อ่านค่าจากไฟล์ .env (ถ้ามี)
try {
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#") && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}
if (!process.env.ADMIN_PASSWORD) { process.env.ADMIN_PASSWORD = "coach"; console.log('ยังไม่มีไฟล์ .env ใช้รหัสโค้ชชั่วคราวคือ "coach"'); }

const PORT = +process.env.PORT || 8888;
const PUB = path.resolve("public");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2" };

let handler = null, builtAt = 0;
async function getHandler() {
  const srcTime = Math.max(...["netlify/functions/api.mts", "netlify/lib/shared.mts", "public/steps.js"].map((f) => fs.statSync(f).mtimeMs));
  if (!handler || srcTime > builtAt) {
    await build({ entryPoints: ["netlify/functions/api.mts"], bundle: true, platform: "node", format: "esm", outfile: ".dev/api.mjs", alias: { "@netlify/blobs": "./dev/blobs-local.mjs" }, logLevel: "error" });
    handler = (await import(pathToFileURL(path.resolve(".dev/api.mjs")).href + "?v=" + Date.now())).default;
    builtAt = Date.now();
  }
  return handler;
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      const r = await (await getHandler())(new Request(url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body }));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    let p = decodeURIComponent(url.pathname); if (p.endsWith("/")) p += "index.html";
    const f = path.join(PUB, p);
    if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "cache-control": "no-store" });
    fs.createReadStream(f).pipe(res);
  } catch (e) { console.error(e); res.writeHead(500); res.end("error: " + e.message); }
}).listen(PORT, () => console.log(`\nเปิดในเบราว์เซอร์:\n  หน้านักกีฬา   http://localhost:${PORT}\n  ตัวอย่างหน้าตา http://localhost:${PORT}/?demo=1\n  หน้าโค้ช      http://localhost:${PORT}/admin.html\n\nข้อมูลที่ทดลองเก็บในโฟลเดอร์ .devdata (ลบทิ้งได้ถ้าอยากเริ่มใหม่)\nหยุดเซิร์ฟเวอร์: กด Ctrl+C\n`));
