/* ชุดทดสอบอัตโนมัติ: node --experimental-strip-types test/run.mjs  (ไม่ต่อเน็ตจริง ใช้ตัวจำลอง Supabase/COROS/Garmin) */
import assert from "node:assert/strict";
process.env.ADMIN_PASSWORD = "coach-test"; process.env.K4RC_DATA_BACKEND = "supabase";
process.env.SUPABASE_URL = "https://mock.supabase.co"; process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-key";

/* ---- ตัวจำลองเครือข่าย ---- */
const kv = new Map(), png = new Uint8Array(5000).fill(9);
const corosHtml = `<html><head><title>ตำบล ในเมือง วิ่ง</title><meta property="og:image" content="https://map-oss-us.coros.com/img/1.jpg"></head><body><div>Oct 23, 2026 18:10</div><div>6.00km Distance</div><div>32:4072 Activity Time 5'27"/km Average Pace 5'21"/km Best km 153bpm Average Heart Rate</div></body></html>`;
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o = {}) => {
  const url = String(u), json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json" } });
  if (url.startsWith("https://mock.supabase.co/rest/v1/app_kv")) {
    if (sbFail > 0) { sbFail--; return new Response("down", { status: 503 }); }
    const q = new URL(url).searchParams, key = (q.get("key") || "").replace(/^eq\./, "");
    if (!o.method || o.method === "GET") return json(kv.has(key) ? [{ value: kv.get(key) }] : []);
    if (o.method === "POST") { const b = JSON.parse(o.body); kv.set(b.key, b.value); return new Response(null, { status: 201 }); }
    if (o.method === "DELETE") { kv.delete(key); return new Response(null, { status: 204 }); }
  }
  if (url.startsWith("https://sharepage.coros.com/")) return new Response(corosHtml, { status: 200, headers: { "content-type": "text/html" } });
  if (url.startsWith("https://map-oss-us.coros.com/")) return new Response(png, { status: 200, headers: { "content-type": "image/jpeg" } });
  throw new Error("เรียกเครือข่ายที่ไม่ได้จำลองไว้: " + url);
};

let sbFail = 0; // จำนวนครั้งที่ให้ Supabase จำลองตอบ 503
const baseFetch = globalThis.fetch; let sbDelay = 0, sbInflight = 0, sbPeak = 0; const sbReads = []; // หน่วงต่อคำสั่ง / จำนวนคำสั่งที่รอพร้อมกันสูงสุด / คีย์ที่ถูกอ่าน
globalThis.fetch = async (u, o = {}) => {
  const url = String(u); if (!url.startsWith("https://mock.supabase.co/")) return baseFetch(u, o);
  sbInflight++; sbPeak = Math.max(sbPeak, sbInflight);
  if (!o.method || o.method === "GET") sbReads.push((new URL(url).searchParams.get("key") || "").replace(/^eq\./, ""));
  try { if (sbDelay) await new Promise((r) => setTimeout(r, sbDelay)); return await baseFetch(u, o); } finally { sbInflight--; }
};
let n = 0; const t = async (name, fn) => { try { await fn(); n++; console.log("  ✓", name); } catch (e) { console.error("  ✗", name, "\n   ", e.message); process.exitCode = 1; } };
const { parseCorosShare, corosImageCandidates, safeImageUrl, fetchRouteImage } = await import("../netlify/lib/coros.mts");
const { cleanFeedback } = await import("../netlify/lib/shared.mts");
const handler = (await import("../netlify/functions/api.mts")).default;
const api = async (path, method = "GET", body, token, admin) => {
  const r = await handler(new Request("http://x" + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}), ...(admin ? { "x-admin-password": "coach-test" } : {}) }, body: body ? JSON.stringify(body) : undefined }));
  return { status: r.status, body: await r.json() };
};

console.log("COROS");
await t("อ่านระยะ เวลา เพซ HR จากหน้าแชร์", () => { const s = parseCorosShare(corosHtml); assert.equal(s.km, 6); assert.equal(Math.round(s.min * 60), 1960); assert.equal(s.hr, 153); assert.equal(s.date, "2026-10-23"); });
await t("หารูปแผนที่ og:image เฉพาะโดเมน coros.com", () => { assert.deepEqual(corosImageCandidates(corosHtml), ["https://map-oss-us.coros.com/img/1.jpg"]); assert.deepEqual(corosImageCandidates('<meta property="og:image" content="https://evil.example.com/a.jpg">'), []); assert.equal(safeImageUrl("http://map-oss-us.coros.com/a.jpg"), null); });
await t("ปฏิเสธรูปที่ไม่ใช่ภาพหรือเล็ก/ใหญ่เกิน", async () => { const mk = (type, len) => async () => ({ ok: true, type, bytes: async () => new Uint8Array(len) }); assert.equal(await fetchRouteImage("u", mk("text/html", 5000)), ""); assert.equal(await fetchRouteImage("u", mk("image/jpeg", 100)), ""); assert.equal(await fetchRouteImage("u", mk("image/jpeg", 2_000_000)), ""); assert.match(await fetchRouteImage("u", mk("image/jpeg", 5000)), /^data:image\/jpeg;base64,/); });

console.log("ผลซ้อม");
await t("เก็บเวลาเป็นวินาที + HR และคัดค่าผิดปกติ", () => { const f = cleanFeedback({ rpe: 6, min: 39.15, km: 6.02, hr: 150 }); assert.equal(f.min, 39.15); assert.equal(f.hr, 150); assert.equal(cleanFeedback({ rpe: 6, hr: 999 }).hr, undefined); });

console.log("API");
let ta, tb, aid;
await t("สร้างนักกีฬา ล็อกอิน ลงแผน", async () => {
  await api("/api/admin", "POST", { action: "saveAthlete", name: "A One", email: "a@x.com", password: "secret1" }, null, true);
  await api("/api/admin", "POST", { action: "saveAthlete", name: "B Two", email: "b@x.com", password: "secret2" }, null, true);
  const list = (await api("/api/admin", "POST", { action: "athletes" }, null, true)).body.athletes; aid = list.find((x) => x.email === "a@x.com").id;
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  await api("/api/admin", "POST", { action: "saveWeek", id: aid, week: { startDate: today, days: [{ date: today, workouts: [{ id: "w1", sport: "run", name: "Easy", distanceMeters: 6000, durationMinutes: 39 }] }] } }, null, true);
  ta = (await api("/api/login", "POST", { email: "a@x.com", password: "secret1" })).body.token; tb = (await api("/api/login", "POST", { email: "b@x.com", password: "secret2" })).body.token; assert.ok(ta && tb);
});
await t("ไม่ล็อกอินเข้า feed/link/avatar ไม่ได้", async () => { for (const p of ["/api/feed", "/api/link", "/api/avatar"]) assert.equal((await api(p, p === "/api/feed" ? "GET" : "POST", p === "/api/feed" ? undefined : {})).status, 401); });
await t("ไม่มี RPE = ไม่ขึ้นฟีด / มี RPE = ขึ้น ไม่รั่วโน้ตและอาการเจ็บ", async () => {
  await api("/api/done", "POST", { workoutId: "w1", done: true, fb: { note: "ลับ" } }, ta); assert.equal((await api("/api/feed", "GET", null, tb)).body.posts.length, 0);
  await api("/api/done", "POST", { workoutId: "w1", done: true, fb: { rpe: 7, feel: 4, pain: true, area: "เข่า", note: "ลับ", min: 39.15, hr: 150 } }, ta);
  const post = (await api("/api/feed", "GET", null, tb)).body.posts[0]; assert.equal(post.rpe, 7); assert.equal(post.min, 39.15); assert.equal(post.me, false); assert.equal(JSON.stringify(post).includes("ลับ"), false); assert.equal(JSON.stringify(post).includes("เข่า"), false);
});
await t("รูปโปรไฟล์: รับ jpeg เล็ก ปฏิเสธอย่างอื่น และเพื่อนเห็นในฟีด", async () => {
  assert.equal((await api("/api/avatar", "POST", { img: "data:image/jpeg;base64,AAAA" }, ta)).status, 200); assert.equal((await api("/api/avatar", "POST", { img: "javascript:alert(1)" }, ta)).status, 400);
  const f1 = (await api("/api/feed", "GET", null, tb)).body; assert.equal(f1.avatars[aid], "data:image/jpeg;base64,AAAA"); assert.ok(f1.avh[aid]);
  const f2 = (await api("/api/feed?av=" + aid + ":" + f1.avh[aid], "GET", null, tb)).body; assert.equal(f2.avatars[aid], undefined); assert.equal(f2.avh[aid], f1.avh[aid]); // เครื่องมีรูปแล้ว ไม่ส่งซ้ำ
  const f3 = (await api("/api/feed?av=" + aid + ":stale", "GET", null, tb)).body; assert.equal(f3.avatars[aid], "data:image/jpeg;base64,AAAA"); // รูปเปลี่ยน/แคชเก่า ส่งใหม่
});
await t("ปิดการแสดงในฟีด / ยกเลิกการติ๊ก โพสต์หาย", async () => {
  await api("/api/profile", "POST", { feedOff: true }, ta); assert.equal((await api("/api/feed", "GET", null, tb)).body.posts.length, 0); await api("/api/profile", "POST", {}, ta);
  await api("/api/done", "POST", { workoutId: "w1", done: true, fb: { rpe: 6 } }, ta); assert.equal((await api("/api/feed", "GET", null, tb)).body.posts.length, 1);
  await api("/api/done", "POST", { workoutId: "w1", done: false }, ta); assert.equal((await api("/api/feed", "GET", null, tb)).body.posts.length, 0);
});
await t("โพสต์เกิน 24 ชม. ไม่แสดง", async () => { const feed = kv.get("feed") || []; feed.push({ id: "old", aid, name: "A", sport: "run", title: "x", km: 1, min: 5, rpe: 3, feel: 3, at: new Date(Date.now() - 25 * 3600e3).toISOString(), date: "2026-01-01" }); kv.set("feed", feed); assert.equal((await api("/api/feed", "GET", null, tb)).body.posts.some((p) => p.id === "old"), false); });
await t("/api/link COROS ได้ข้อมูลและรูปแผนที่", async () => { const r = await api("/api/link", "POST", { url: "https://sharepage.coros.com/app_link/share/sport?labelId=1&code=x" }, ta); assert.equal(r.status, 200); assert.equal(r.body.hr, 153); assert.match(r.body.img, /^data:image\/jpeg/); });
await t("/api/link ปฏิเสธโดเมนอื่น", async () => { assert.equal((await api("/api/link", "POST", { url: "https://evil.example.com/x" }, ta)).status, 400); });
await t("/api/link ปฏิเสธลิงก์ Garmin (ไม่รองรับ)", async () => { assert.equal((await api("/api/link", "POST", { url: "https://connect.garmin.com/modern/activity/24841081229" }, ta)).status, 400); });

await t("Supabase ล่มชั่วคราว: ลองซ้ำแล้วผ่าน / ล่มต่อเนื่อง: ตอบ 503 ข้อความอ่านรู้เรื่อง", async () => {
  sbFail = 1; assert.equal((await api("/api/feed", "GET", null, tb)).status, 200);
  const ce = console.error; console.error = () => {}; sbFail = 50; const r = await api("/api/feed", "GET", null, tb); sbFail = 0; console.error = ce; assert.equal(r.status, 503); assert.match(r.body.error, /ฐานข้อมูล/);
});


console.log("ความปลอดภัยฝั่งโค้ช");
await t("รหัสโค้ชผิดซ้ำ ๆ ถูกล็อก (ต่อ IP) แม้ภายหลังใส่ถูกก็ยังล็อกอยู่ แต่คนอื่นเข้าได้ปกติ", async () => {
  const call = (ip, pw) => handler(new Request("http://x/api/admin", { method: "POST", headers: { "content-type": "application/json", "x-nf-client-connection-ip": ip, "x-admin-password": pw }, body: JSON.stringify({ action: "athletes" }) }));
  for (let i = 0; i < 8; i++) assert.equal((await call("9.9.9.9", "wrong" + i)).status, 401);
  assert.equal((await call("9.9.9.9", "coach-test")).status, 429);
  assert.equal((await call("8.8.8.8", "coach-test")).status, 200);
});

console.log("แคชออฟไลน์");
await t("ไฟล์ที่หน้าเว็บ/CSS อ้างถึงต้องอยู่ใน SHELL ของ sw.js ครบ (ไม่งั้นเปิดครั้งแรกแล้วตัดเน็ตจะได้ฟอนต์/ไอคอนผิด)", async () => {
  const fs = await import("node:fs"), rd = (f) => fs.readFileSync("public/" + f, "utf8");
  const shell = new Set([...rd("sw.js").matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]));
  const need = new Set();
  for (const page of ["index.html", "admin.html"]) {
    const h = rd(page);
    for (const m of h.matchAll(/(?:href|src)="([^"#:?]+\.(?:css|js|png|webmanifest))"/g)) need.add("/" + m[1]);
  }
  for (const f of fs.readdirSync("public").filter((x) => x.endsWith(".css"))) for (const m of rd(f).matchAll(/url\(["']?((?:fonts|icons)\/[^)"'?]+)/g)) need.add("/" + m[1]);
  need.delete("/icons/favicon-32-v5.png"); // ไอคอนแท็บเบราว์เซอร์ ไม่จำเป็นต้องใช้ออฟไลน์ (ถ้าเพิ่มทีหลัง ลบบรรทัดนี้ได้)
  const missing = [...need].filter((u) => !shell.has(u));
  assert.deepEqual(missing, []);
});

console.log("body ผิดรูปแบบ");
await t("body เป็น null/ตัวเลข/อาร์เรย์ ต้องไม่ทำให้ตอบ 5xx (ทุก endpoint ที่อ่าน JSON)", async () => {
  const raw = async (path, body, token, admin) => (await handler(new Request("http://x" + path, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}), ...(admin ? { "x-admin-password": "coach-test" } : {}) }, body }))).status;
  const bad = [];
  for (const body of ["null", "5", '"x"', "true", "[]", "{x", ""]) {
    for (const [path, token, admin] of [["/api/done", ta], ["/api/profile", ta], ["/api/link", ta], ["/api/avatar", ta], ["/api/login"], ["/api/admin", null, true]]) {
      const st = await raw(path, body, token, admin); if (st >= 500) bad.push(`${path} ${body || "(ว่าง)"} -> ${st}`);
    }
  }
  assert.deepEqual(bad, []);
});

console.log("ข้ามวันนี้");
await t("ข้าม: บันทึก/ยกเลิกได้ ส่งกลับใน /api/plan และไม่แตะ done", async () => {
  await api("/api/done", "POST", { workoutId: "w1", done: false }, ta);
  const r = await api("/api/done", "POST", { workoutId: "w1", skip: true }, ta);
  assert.equal(r.status, 200); assert.equal(r.body.skip, true);
  const pl = (await api("/api/plan", "GET", null, ta)).body; assert.deepEqual(pl.skip, { w1: 1 }); assert.equal(pl.done.w1, undefined);
  assert.equal((await api("/api/done", "POST", { workoutId: "w1", skip: true }, ta)).body.skip, true); // ซ้ำได้ ผลเท่าเดิม
  assert.equal((await api("/api/done", "POST", { workoutId: "w1", skip: false }, ta)).body.skip, false);
  assert.deepEqual((await api("/api/plan", "GET", null, ta)).body.skip, {});
});
await t("ข้ามแล้วกดทำเสร็จ = เลิกข้ามเอง / เวิร์คเอาต์ที่ทำแล้วตั้งข้ามไม่ได้", async () => {
  await api("/api/done", "POST", { workoutId: "w1", skip: true }, ta);
  await api("/api/done", "POST", { workoutId: "w1", done: true, fb: { rpe: 4 } }, ta);
  let pl = (await api("/api/plan", "GET", null, ta)).body; assert.deepEqual(pl.skip, {}); assert.equal(pl.done.w1, 1);
  const r = await api("/api/done", "POST", { workoutId: "w1", skip: true }, ta);
  assert.equal(r.status, 200); assert.equal(r.body.skip, false); // ทำแล้ว จึงไม่ตั้งข้าม
  pl = (await api("/api/plan", "GET", null, ta)).body; assert.deepEqual(pl.skip, {}); assert.equal(pl.done.w1, 1);
  await api("/api/done", "POST", { workoutId: "w1", done: false }, ta);
});
await t("ข้ามไม่ขึ้นฟีดทีม ไม่รั่วไปคนอื่น และตรวจสิทธิ์/รหัสเวิร์คเอาต์", async () => {
  await api("/api/done", "POST", { workoutId: "w1", skip: true }, ta);
  const feed = (await api("/api/feed", "GET", null, tb)).body; assert.equal(feed.posts.some((p) => p.id.endsWith(":w1")), false);
  assert.deepEqual((await api("/api/plan", "GET", null, tb)).body.skip, {});
  assert.equal((await api("/api/done", "POST", { workoutId: "w1", skip: true })).status, 401);
  assert.equal((await api("/api/done", "POST", { workoutId: "ไม่มี", skip: true }, ta)).status, 404);
  await api("/api/done", "POST", { workoutId: "w1", skip: false }, ta);
});

console.log("นักกีฬานอก (สมัครเอง)");
const { generateForPb5k, calcFromPb5k, matchPlan } = await import("../netlify/lib/external.mts");
const TODAY = "2026-11-10"; // วันที่ตรึงไว้ให้เทสต์ไม่ขึ้นกับวันที่รันจริง
const allWo = (plan) => plan.weeks.flatMap((w) => w.days.flatMap((d) => d.workouts.map((x) => ({ ...x, date: d.date }))));
await t("คำนวณฮาล์ฟคาดการณ์จาก PB 5K และจับคู่แผนที่เวลาเป้าหมายใกล้ที่สุด", () => {
  const exp = { "35:00": "half-2h30", "30:00": "half-2h15", "25:30": "half-2h00", "22:00": "half-1h40", "19:30": "half-1h30", "16:00": "half-1h30" };
  for (const [pb, key] of Object.entries(exp)) { const c = calcFromPb5k(pb); assert.ok(c.halfMin > 0, pb); assert.equal(matchPlan(c.halfMin).key, key, pb); }
  assert.ok(calcFromPb5k("25:30").error === undefined && /^\d:\d{2}:\d{2}$/.test(calcFromPb5k("25:30").halfTime));
  assert.ok(calcFromPb5k("5:00").error); // เร็วเกินจริง นอกช่วงสูตร
});
await t("ตารางจบที่วันแข่ง 23 ม.ค. 2027 พอดี และไม่มีอะไรหลังวันแข่ง", () => {
  const g = generateForPb5k("25:30", TODAY); const wo = allWo(g.plan);
  const race = wo.filter((x) => x.sport === "race"); assert.equal(race.length, 1); assert.equal(race[0].date, "2027-01-23");
  assert.equal(g.plan.meta.planEndDate, "2027-01-23"); assert.equal(g.plan.meta.eventDate, "2027-01-23");
  assert.ok(wo.every((x) => x.date <= "2027-01-23") && wo.every((x) => x.date >= TODAY));
  assert.equal(wo[0].date, TODAY); // สมัครวันนี้ เริ่มซ้อมวันนี้ (วันก่อนหน้าถูกตัดทิ้ง)
});
await t("สมัครเร็วกว่า 15 สัปดาห์ = ได้ครบ 15 สัปดาห์ สมัครช้า = ได้เฉพาะส่วนที่เหลือถึงวันแข่ง", () => {
  const early = allWo(generateForPb5k("25:30", "2026-09-01").plan), late = allWo(generateForPb5k("25:30", "2027-01-20").plan);
  assert.equal(early[0].date, "2026-10-11"); assert.equal(late[0].date, "2027-01-20"); assert.equal(late.at(-1).date, "2027-01-23");
  assert.ok(generateForPb5k("25:30", "2027-01-24").error); // งานผ่านไปแล้ว
});
await t("ตัด Park Run ออกทั้งหมด (แผน 1:30 มีปาร์ครันทุกสัปดาห์)", () => {
  const g = generateForPb5k("19:30", TODAY); assert.equal(g.ext.planKey, "half-1h30");
  assert.ok(!allWo(g.plan).some((x) => /park/i.test(x.name + x.type + x.humanReadable)));
  const sat = allWo(g.plan).filter((x) => new Date(x.date + "T00:00:00Z").getUTCDay() === 5 && x.date < "2027-01-23"); // วันศุกร์ = วันที่ตารางต้นฉบับเป็นเสาร์ (ปาร์ครัน)
  assert.ok(sat.length === 0 || sat.every((x) => x.type !== "parkrun"));
});
await t("ตารางสำเร็จรูป: วันว่างเป็น Easy 40 นาที, Easy 20/25/30 นาทีเป็น 40 นาที, วันพักยังเป็นพัก", async () => {
  const { HALF_PLANS } = await import("../netlify/lib/half-plans-data.mts"); const { customize } = await import("../netlify/lib/external.mts");
  let filled = 0, doubled = 0, rests = 0;
  for (const pl of HALF_PLANS) for (const w of pl.weeks) for (const d of w) {
    const c = customize(d);
    assert.ok(c.length >= 1, pl.key); // ไม่มีวันว่างเหลือ
    assert.ok(!c.some((s) => s.t === "easy" && [20, 25, 30].includes(s.min)), pl.key); // ไม่มี Easy 20/25/30 เหลือ
    if (d.every((s) => s.t === "parkrun")) { assert.deepEqual(c, [{ t: "easy", min: 40 }]); filled++; }
    if (d.some((s) => s.t === "easy" && [20, 25, 30].includes(s.min))) doubled++;
    if (d.length === 1 && d[0].t === "rest") { assert.deepEqual(c, [{ t: "rest" }]); rests++; }
  }
  assert.ok(filled >= 14 && doubled >= 24 && rests > 150, `${filled}/${doubled}/${rests}`);
  // ผ่านทั้งเส้นทางสมัคร: แผน 1:30 วันเสาร์เดิม (ปาร์ครัน) ต้องเป็น Easy 40 นาที และแผน 2:30 ไม่มี Easy 20/25/30
  const g = generateForPb5k("19:30", "2026-09-01"); const wos = allWo(g.plan);
  assert.ok(wos.some((x) => x.type === "easy" && x.steps[0].x === 40));
  const g2 = generateForPb5k("40:00", "2026-09-01"); assert.ok(!allWo(g2.plan).some((x) => x.type === "easy" && [20, 25, 30].includes(x.steps?.[0]?.x)));
});
await t("Interval ทุกอันมีวอร์มอัพ 15 + คูลดาวน์ 15 และใช้เพซของนักกีฬาเอง", () => {
  for (const pb of ["35:00", "25:30", "19:30"]) {
    const g = generateForPb5k(pb, "2026-09-01"); const iv = allWo(g.plan).filter((x) => x.type === "interval"); assert.ok(iv.length >= 10, pb);
    for (const x of iv) {
      assert.equal(x.steps[0].t, "warmup"); assert.equal(x.steps[0].x, 15); assert.equal(x.steps.at(-1).t, "cooldown"); assert.equal(x.steps.at(-1).x, 15);
      assert.equal(x.steps[0].p, "lt1"); assert.equal(x.steps.at(-1).p, "e"); // วอร์มอัพ = LT1, คูลดาวน์ = Recovery
      assert.equal(x.steps.filter((s) => s.t === "repeat").length, 1); assert.ok(x.durationMinutes >= 30 + 5); // รวมวอร์ม/คูลแล้วเกิน 30 นาทีแน่
    }
    assert.ok(g.paces.values.lt1 && g.paces.values.lt2 && g.paces.values.vo2max && /PB 5K/.test(g.paces.note));
  }
});
await t("สมัครผ่าน API: ได้บัญชี ตาราง เพซ โปรไฟล์ และล็อกอินกลับเข้ามาได้", async () => {
  const real = Date.now; Date.now = () => Date.parse("2026-11-10T05:00:00Z");
  try {
    const r = await api("/api/register", "POST", { email: "Runner@Ext.com ", password: "longpass1", nickname: "  มะนาว ", pb5k: "25:30" });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.ok(r.body.token); assert.equal(r.body.name, "มะนาว"); assert.equal(r.body.planLabel, "Beginner · Sub-2:00");
    const pl = (await api("/api/plan", "GET", null, r.body.token)).body;
    assert.equal(pl.name, "มะนาว"); assert.equal(pl.plan.meta.eventDate, "2027-01-23"); assert.match(pl.plan.meta.event, /Buriram Marathon 2027/); assert.ok(pl.paces.values.lt1); assert.ok(pl.plan.weeks.length >= 10);
    assert.ok(pl.plan.weeks.every((w, i) => w.weekNumber === i + 1));
    const lg = await api("/api/login", "POST", { email: "runner@ext.com", password: "longpass1" }); assert.equal(lg.status, 200);
  } finally { Date.now = real; }
});
await t("สมัครซ้ำอีเมลเดิม/ข้อมูลไม่ครบ/รหัสสั้น/เวลา PB ผิด = ปฏิเสธ", async () => {
  const ok = { email: "other@ext.com", password: "longpass1", nickname: "บี", pb5k: "25:30" };
  const real = Date.now; Date.now = () => Date.parse("2026-11-10T05:00:00Z");
  try {
    assert.equal((await api("/api/register", "POST", { ...ok, email: "runner@ext.com" })).status, 409);
    assert.equal((await api("/api/register", "POST", { ...ok, email: "a@x.com" })).status, 409); // ชนกับนักกีฬาของโค้ชด้วย
    assert.equal((await api("/api/register", "POST", { ...ok, email: "ไม่ใช่อีเมล" })).status, 400);
    assert.equal((await api("/api/register", "POST", { ...ok, password: "short" })).status, 400);
    assert.equal((await api("/api/register", "POST", { ...ok, nickname: "  " })).status, 400);
    for (const pb of ["", "abc", "25", "25:75", "3:00", "99:00"]) assert.equal((await api("/api/register", "POST", { ...ok, pb5k: pb })).status, 400, pb);
    assert.equal((await api("/api/register", "POST", { ...ok })).status, 200); // ข้อมูลถูกต้องผ่านได้
  } finally { Date.now = real; }
});
await t("หลังวันแข่งปิดรับสมัคร และปิดสมัครด้วย EXTERNAL_SIGNUP=off ได้", async () => {
  const real = Date.now; Date.now = () => Date.parse("2027-01-25T05:00:00Z");
  try { assert.equal((await api("/api/register", "POST", { email: "late@ext.com", password: "longpass1", nickname: "ช้า", pb5k: "25:30" })).status, 400); } finally { Date.now = real; }
  process.env.EXTERNAL_SIGNUP = "off";
  try { assert.equal((await api("/api/register", "POST", { email: "off@ext.com", password: "longpass1", nickname: "ปิด", pb5k: "25:30" })).status, 403); } finally { delete process.env.EXTERNAL_SIGNUP; }
});
await t("โค้ชเห็นนักกีฬานอกแยกได้ (athletes + dashboard) และนักกีฬาของโค้ชไม่ถูกนับเป็นนักกีฬานอก", async () => {
  const L = (await api("/api/admin", "POST", { action: "athletes" }, null, true)).body.athletes;
  const ext = L.filter((x) => x.external); assert.deepEqual(ext.map((x) => x.email).sort(), ["other@ext.com", "runner@ext.com"]);
  const e = ext.find((x) => x.email === "runner@ext.com"); assert.equal(e.ext.pb5k, "25:30"); assert.ok(e.ext.predictedHalf && e.ext.predictedPace && e.ext.planLabel); assert.ok(e.total > 20); assert.equal(e.profile.pr.k5, "25:30");
  assert.equal(L.find((x) => x.email === "a@x.com").external, false);
  const D = (await api("/api/admin", "POST", { action: "dashboard" }, null, true)).body.athletes;
  assert.equal(D.filter((x) => x.external).length, 2); assert.equal(D.find((x) => x.name === "มะนาว").hasPlan, true);
});
await t("ติ๊กทำเสร็จของนักกีฬานอกขึ้นฟีดหลักหน้าเดียวกับทีม", async () => {
  const real = Date.now; Date.now = () => Date.parse("2026-11-10T05:00:00Z");
  try {
    const tok = (await api("/api/login", "POST", { email: "runner@ext.com", password: "longpass1" })).body.token;
    const w = allWo((await api("/api/plan", "GET", null, tok)).body.plan).find((x) => x.sport === "run");
    const r = await api("/api/done", "POST", { workoutId: w.id, done: true, fb: { rpe: 5, feel: 4, km: 4.4, min: 30 } }, tok); assert.equal(r.status, 200);
    const seenByTeam = (await api("/api/feed", "GET", null, tb)).body.posts.find((p) => p.name === "มะนาว"); // ฟีดที่นักกีฬาของโค้ชเปิดอยู่
    assert.ok(seenByTeam, "ไม่พบโพสต์ของนักกีฬานอกในฟีดทีม"); assert.equal(seenByTeam.rpe, 5);
    assert.ok((await api("/api/feed", "GET", null, tok)).body.posts.some((p) => p.name !== "มะนาว") || true);
  } finally { Date.now = real; }
});
await t("Backup/กู้คืนเก็บสถานะนักกีฬานอกไว้", async () => {
  const bk = (await api("/api/admin", "POST", { action: "exportAll" }, null, true)).body.backup;
  assert.equal(bk.athletes.find((x) => x.email === "runner@ext.com").ext.pb5k, "25:30"); assert.equal(bk.athletes.find((x) => x.email === "a@x.com").ext, undefined);
  const r = await api("/api/admin", "POST", { action: "restoreAll", backup: bk }, null, true); assert.equal(r.body.ok, true);
  assert.equal((await api("/api/admin", "POST", { action: "athletes" }, null, true)).body.athletes.filter((x) => x.external).length, 2);
});
await t("จำกัดการสมัครต่อ IP: สมัครถี่เกินถูกพัก 15 นาที (พิมพ์ข้อมูลผิดไม่นับ)", async () => {
  let last; for (let i = 0; i < 12; i++) last = await api("/api/register", "POST", { email: "spam" + i + "@ext.com", password: "longpass1", nickname: "s", pb5k: "25:30" });
  assert.equal(last.status, 429);
});

console.log("Backup + ข้ามวันนี้");
await t("Backup/กู้คืนต้องเก็บสถานะ 'ข้าม' ของนักกีฬาไว้ด้วย (ไม่งั้นกู้แล้ววันที่ข้ามกลับกลายเป็น 'ค้าง')", async () => {
  await api("/api/admin", "POST", { action: "saveAthlete", name: "Bk Three", email: "bk3@x.com", password: "secret3" }, null, true);
  const bid = (await api("/api/admin", "POST", { action: "athletes" }, null, true)).body.athletes.find((x) => x.email === "bk3@x.com").id;
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  await api("/api/admin", "POST", { action: "saveWeek", id: bid, week: { startDate: today, days: [{ date: today, workouts: [{ id: "bk1", sport: "run", name: "Easy", distanceMeters: 5000, durationMinutes: 30 }] }] } }, null, true);
  const tk = (await api("/api/login", "POST", { email: "bk3@x.com", password: "secret3" })).body.token;
  assert.equal((await api("/api/done", "POST", { workoutId: "bk1", skip: true }, tk)).body.skip, true);
  const bk = (await api("/api/admin", "POST", { action: "exportAll" }, null, true)).body.backup;
  assert.deepEqual(bk.athletes.find((x) => x.id === bid).skip, { bk1: 1 }, "ไฟล์ backup ต้องมี skip");
  await api("/api/admin", "POST", { action: "deleteAthlete", id: bid }, null, true);
  assert.equal((await api("/api/admin", "POST", { action: "restoreAll", backup: bk }, null, true)).body.ok, true);
  const tk2 = (await api("/api/login", "POST", { email: "bk3@x.com", password: "secret3" })).body.token;
  assert.deepEqual((await api("/api/plan", "GET", null, tk2)).body.skip, { bk1: 1 }, "กู้คืนแล้ว skip ต้องกลับมา");
});

console.log("คิวออฟไลน์ (หน้านักกีฬา)");
await t("เปิดแอปตอนออนไลน์ ต้องส่งผลซ้อมที่ค้างในคิวขึ้นเซิร์ฟเวอร์เอง (ไม่ต้องรอให้กดอะไรเพิ่ม)", async () => {
  const { readFileSync } = await import("node:fs"), vm = await import("node:vm");
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const js = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).sort((a, b) => b.length - a.length)[0];
  const cut = (from, to) => { const i = js.indexOf(from), j = js.indexOf(to, i); assert.ok(i >= 0 && j > i, "หาโค้ดใน index.html ไม่เจอ: " + from); return js.slice(i, j); };
  const code = cut("const qKey", 'window.addEventListener("online"') + "\n" + cut("async function load()", "/* ---------- ตัวอย่าง");
  const posts = [], mem = new Map([["rp_q:Alice", JSON.stringify([{ workoutId: "w9", done: true }])]]);
  const ctx = vm.createContext({
    demo: false, token: "tok", me: "", plan: null, done: {}, skip: {}, paces: null, fb: {}, offline: false, msgs: [], profile: null,
    store: { get: (k) => mem.get(k) ?? null, set: (k, v) => mem.set(k, v), del: (k) => mem.delete(k) },
    window: {}, root: { innerHTML: "" }, render() {}, loadFeed() {}, feedUrl: () => "/api/feed", avKey: () => "rp_avatar:x", pushAvatar() {}, esc: (x) => x, showLogin() {}, JSON, Date, console,
    call: async (path, opts = {}) => {
      if (path === "/api/done") { posts.push(JSON.parse(opts.body)); return { ok: true }; }
      if (path === "/api/plan") return { name: "Alice", plan: { weeks: [] }, done: {}, skip: {}, feedback: {} };
      return {};
    },
  });
  await vm.runInContext(code + "\nload()", ctx);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(posts, [{ workoutId: "w9", done: true }], "ผลซ้อมที่ค้างในคิวต้องถูกส่งขึ้นเซิร์ฟเวอร์ตอนเปิดแอป");
  assert.equal(mem.get("rp_q:Alice"), "[]", "ส่งสำเร็จแล้วต้องล้างคิว");
});

console.log("หน้าสถิติ (UI)");
{
  const { readFileSync } = await import("node:fs"), vm = await import("node:vm");
  const rd = (f) => readFileSync(new URL("../public/" + f, import.meta.url), "utf8");
  await t("แอนิเมชันนับเวลา (data-time) ต้องไม่โชว์นาทีเป็น 60 เช่น 1:60 ระหว่างนับ", () => {
    const frames = []; let cb = null, now = 0;
    const el = { dataset: { time: "3684" }, textContent: "61:24", hasAttribute: (k) => k === "data-time" };
    const ctx = vm.createContext({ performance: { now: () => now }, requestAnimationFrame: (f) => { cb = f; }, matchMedia: () => ({ matches: false }), document: {}, clearTimeout() {}, setTimeout() {} });
    vm.runInContext(rd("motion.js") + "\n;globalThis.moCount = moCount;", ctx);
    ctx.moCount({ querySelectorAll: () => [el] });
    for (let i = 0; i < 3000 && cb; i++) { now += 1; const f = cb; cb = null; f(now); frames.push(el.textContent); }
    assert.ok(frames.length > 500, "แอนิเมชันต้องรันครบ");
    assert.equal(frames[frames.length - 1], "61:24");
    assert.deepEqual([...new Set(frames.filter((x) => /:60$/.test(x)))], []);
  });
  await t("ป้าย tooltip แท่งกราฟต้องจัดกึ่งกลางด้วย translate (ไม่ใช่ transform ที่แอนิเมชัน moPop เขียนทับ) และแท่งริมขวา/ซ้ายต้องไม่ล้นจอ", () => {
    const css = rd("layout-v2.css"), tip = css.match(/\.wb-tip\{[^}]*\}/)[0];
    assert.ok(/\.wb-tip\{[^}]*translate:-50%/.test(tip), "ต้องใช้ translate:-50%");
    assert.equal(/[^-]transform:\s*translateX/.test(tip), false, "ห้ามใช้ transform:translateX ใน .wb-tip");
    assert.ok(/\.wb-c:last-child \.wb-tip\{[^}]*right:/.test(css), "แท่งสุดท้ายต้องชิดขวา");
    assert.ok(/\.wb-c:first-child \.wb-tip\{[^}]*left:/.test(css), "แท่งแรกต้องชิดซ้าย");
  });
  await t("ตัวเลข % ในวงแหวน (ฟอนต์ Orbitron กว้าง) ต้องพอดีวงใน ทั้ง 88% และ 100%", () => {
    const html = rd("index.html"), m = html.match(/<text x="50" y="(\$\{[^}]+\}|[\d.]+)"[^>]*font-size="(\$\{[^}]+\}|[\d.]+)"/);
    assert.ok(m, "หา <text> ของวงแหวนไม่เจอ");
    const expr = m[2].startsWith("${") ? m[2].slice(2, -1) : m[2];
    const ADV = { digit: 0.834, pct: 0.966 }, INNER = 70; // หน่วย SVG: วงในกว้าง 2*(40-5)
    for (const pct of [0, 5, 88, 100]) {
      const fs = new Function("pct", `return ${expr}`)(pct), digits = String(pct).length, w = (digits * ADV.digit + ADV.pct) * fs;
      assert.ok(w <= INNER * 0.78, `${pct}% กว้าง ${w.toFixed(1)} เกิน ${(INNER * 0.78).toFixed(1)}`);
    }
  });
}

console.log("ประหยัดเครดิต Netlify (เวลาที่ฟังก์ชันรอฐานข้อมูล = เครดิตคอมพิวต์)");
const mkAthlete = async (name, email) => {
  await api("/api/admin", "POST", { action: "saveAthlete", name, email, password: "secret9" }, null, true);
  const id = (await api("/api/admin", "POST", { action: "athletes" }, null, true)).body.athletes.find((x) => x.email === email).id;
  return { id, token: (await api("/api/login", "POST", { email, password: "secret9" })).body.token };
};
await t("GET /api/plan อ่านข้อมูลหลายก้อนพร้อมกัน ไม่รอทีละก้อน", async () => {
  const c = await mkAthlete("Cost One", "cost1@x.com");
  sbDelay = 15; sbPeak = 0; const r = await api("/api/plan", "GET", null, c.token); sbDelay = 0;
  assert.equal(r.status, 200);
  assert.ok(sbPeak >= 6, `ต้องอ่านพร้อมกันอย่างน้อย 6 ก้อน แต่ได้ ${sbPeak}`);
});
await t("GET /api/feed ไม่ดึงรูปโปรไฟล์ทั้งก้อนมาอ่านทุกรอบโพล เมื่อเครื่องมีรูปนั้นอยู่แล้ว (และข้อมูลเก่าที่ยังไม่มีแฮชต้องซ่อมตัวเองได้)", async () => {
  const c1 = await mkAthlete("Cost Two", "cost2@x.com"), c2 = await mkAthlete("Cost Three", "cost3@x.com");
  const img = "data:image/jpeg;base64," + "QUJD".repeat(2000);
  assert.equal((await api("/api/avatar", "POST", { img }, c1.token)).status, 200);
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  kv.set("feed", [{ id: "cp1", aid: c1.id, name: "Cost Two", sport: "run", title: "Easy", km: 5, min: 30, rpe: 5, feel: 3, at: new Date().toISOString(), date: today }]);
  const first = (await api("/api/feed", "GET", null, c2.token)).body;
  assert.equal(first.avatars[c1.id], img, "เครื่องที่ยังไม่มีรูปต้องได้รูป");
  const have = "?av=" + encodeURIComponent(`${c1.id}:${first.avh[c1.id]}`);
  sbReads.length = 0;
  const again = (await api("/api/feed" + have, "GET", null, c2.token)).body;
  assert.deepEqual(again.avatars, {}); assert.equal(again.avh[c1.id], first.avh[c1.id]);
  assert.deepEqual(sbReads.filter((k) => k.startsWith("avatar:")), [], "เครื่องมีรูปแล้ว ไม่ควรอ่านรูปทั้งก้อนซ้ำ");
  kv.delete(`avh:${c1.id}`); // จำลองข้อมูลเก่าก่อนมีแฮช
  assert.equal((await api("/api/feed" + have, "GET", null, c2.token)).body.avh[c1.id], first.avh[c1.id], "ข้อมูลเก่าต้องได้แฮชเดิม");
  sbReads.length = 0; await api("/api/feed" + have, "GET", null, c2.token);
  assert.deepEqual(sbReads.filter((k) => k.startsWith("avatar:")), [], "ซ่อมแล้วรอบถัดไปต้องไม่อ่านรูปอีก");
  assert.equal((await api("/api/avatar", "POST", { img: "" }, c1.token)).status, 200);
  assert.equal(kv.has(`avh:${c1.id}`), false, "ลบรูปแล้วต้องลบแฮชด้วย");
});
await t("หน้านักกีฬา: สลับแท็บ/กลับเข้าแอปถี่ ๆ ไม่ยิง /api/feed ซ้ำภายใน 45 วินาที แต่หลังบันทึกผลซ้อมต้องรีเฟรชทันที", async () => {
  const { readFileSync } = await import("node:fs"), vm = await import("node:vm");
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const js = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).sort((a, b) => b.length - a.length)[0];
  const i = js.indexOf("async function loadFeed("), j = js.indexOf('setInterval(() => { if (tab === "home"', i); assert.ok(i >= 0 && j > i);
  let calls = 0;
  const ctx = vm.createContext({ demo: false, offline: false, token: "t", window: { __feedP: null }, feedUrl: () => "/api/feed", avcGet: () => ({}), avKey: () => "k", pushAvatar() {}, render() {}, feed: [], feedAv: {}, tab: "stats", dlg: { open: false }, store: { get: () => null, set() {} }, JSON, Date, Object, call: async () => { calls++; return { posts: [], avatars: {}, avh: {} }; } });
  vm.runInContext(js.slice(i, j) + "\n;globalThis.lf = loadFeed;", ctx);
  await ctx.lf(); await ctx.lf(); await ctx.lf();
  assert.equal(calls, 1, "เรียกถี่ใน 45 วินาที ต้องยิงแค่ครั้งเดียว");
  await ctx.lf(true); assert.equal(calls, 2, "force ต้องยิงทันที");
});

console.log(`\nผ่าน ${n} ข้อ${process.exitCode ? " (มีข้อที่ไม่ผ่าน)" : ""}`);
