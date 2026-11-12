/* K4RC Training Plan — service worker
   - หน้า HTML: ลองเน็ตก่อน (รอไม่เกิน 4 วิ) ถ้าช้า/ออฟไลน์ใช้ของที่แคชไว้
   - ไฟล์ของแอป (css/js/ฟอนต์/ไอคอน): ใช้ของในแคชทันที ไม่รอเน็ต → เปิดแอปเร็ว แล้วอัปเดตตัวใหม่เบื้องหลัง
   - /api/*: ไม่แคชเด็ดขาด (ข้อมูลส่วนตัว) */
const VER = "k4rc-v99";
const SHELL = ["/", "/index.html", "/admin.html", "/app.css", "/kotcha.css", "/athlete.css", "/ios27.css", "/k4rc-ui.css", "/night.css", "/refine.css", "/refine2.css", "/theme-mono.css", "/layout-v2.css", "/motion.css", "/login.css", "/motion.js", "/theme.js", "/common.js", "/steps.js", "/vdot.js", "/perf.js", "/manifest.webmanifest",
  "/fonts/plus-jakarta-sans-latin-400-normal.woff2", "/fonts/plus-jakarta-sans-latin-500-normal.woff2", "/fonts/plus-jakarta-sans-latin-600-normal.woff2", "/fonts/plus-jakarta-sans-latin-700-normal.woff2",
  "/fonts/prompt-thai-400-normal.woff2", "/fonts/prompt-thai-500-normal.woff2", "/fonts/prompt-thai-600-normal.woff2", "/fonts/prompt-thai-700-normal.woff2",
  "/fonts/k4-jakarta-var.woff2", "/fonts/k4-noto-sans-thai.woff2", "/fonts/orbitron-latin-900.woff2", "/fonts/roboto-mono-latin.ttf",
  "/icons/icon-192-v5.png", "/icons/apple-touch-icon-v5.png", "/icons/k4rc-splash-logo.png", "/icons/logo-mark-v2.png", "/icons/logo-white.png", "/icons/wordmark-v2.png", "/icons/start-logo.png", "/bg/login-runner.jpg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VER).then((c) => Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VER).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
const isPage = (req, url) => req.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith(".html");
self.addEventListener("fetch", (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (isPage(req, url)) {
    // หน้า HTML: เน็ตก่อน แต่ไม่รอนานเกิน 4 วิ (เน็ตช้าแล้วหน้าขาวค้างเป็นปัญหาที่พบบ่อยบนมือถือ)
    e.respondWith(new Promise((resolve) => {
      let done = false;
      const fromCache = () => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("/index.html"));
      const t = setTimeout(() => fromCache().then((r) => { if (r && !done) { done = true; resolve(r); } }), 4000);
      fetch(req).then((res) => {
        clearTimeout(t);
        if (res.ok) { const copy = res.clone(); caches.open(VER).then((c) => c.put(req, copy)); }
        if (!done) { done = true; resolve(res); }
      }).catch(() => { clearTimeout(t); if (!done) fromCache().then((r) => { done = true; resolve(r || Response.error()); }); });
    }));
    return;
  }
  // ไฟล์ของแอป: ใช้ของในแคชทันที (เปิดแอปเร็ว) แล้วโหลดตัวใหม่ทางเบื้องหลังไว้ใช้ครั้งถัดไป (ถึงลืมเปลี่ยน VER ก็ไม่ค้างของเก่าถาวร)
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((cached) => {
    const net = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VER).then((c) => c.put(req, copy)); } return res; }).catch(() => null);
    e.waitUntil(net);
    return cached || net.then((r) => r || Response.error());
  }));
});
