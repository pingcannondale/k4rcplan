// อ่านตัวเลขจากหน้า "แชร์กิจกรรม" ของ COROS (sharepage.coros.com) ไม่มี dependency เพื่อให้ทดสอบแยกได้
export type CorosSport = { name: string; date: string; km: number; min: number; pace: number; hr: number };

const MON: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
// "38:00" = นาที:วินาที, "1:05:30" = ชม.:นาที:วินาที  -> คืนค่าเป็นนาที
export function clockToMin(s: string): number {
  const p = s.split(":").map(Number);
  if (p.some((n) => !Number.isFinite(n) || n < 0) || p.length < 2 || p.length > 3) return 0;
  const [h, m, sec] = p.length === 3 ? p : [0, p[0], p[1]];
  if (m > 59 && p.length === 3) return 0;
  if (sec > 59) return 0;
  return h * 60 + m + sec / 60;
}

/** ลิงก์ต้องเป็น https://sharepage.coros.com/app_link/share/sport?... เท่านั้น (กัน SSRF) คืน URL ที่สร้างใหม่ หรือ null */
export function safeCorosUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.hostname !== "sharepage.coros.com" || u.port || u.username || u.password) return null;
  if (!u.pathname.startsWith("/app_link/share/sport")) return null;
  const out = new URL("https://sharepage.coros.com/app_link/share/sport");
  for (const k of ["labelId", "regionId", "code", "appKey", "type"]) { const v = u.searchParams.get(k); if (v && v.length < 300) out.searchParams.set(k, v); }
  return out.searchParams.get("labelId") && out.searchParams.get("code") ? out.toString() : null;
}

export function parseCorosShare(html: string): CorosSport | null {
  const meta = (k: string) => {
    const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`, "i")) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, "i"));
    return a ? decode(a[1]) : "";
  };
  const text = decode(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " "));
  const desc = meta("og:description") || meta("description"), all = desc + " " + text;
  const name = meta("og:title") || (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "");
  // ระยะ (รองรับ mi ถ้าบัญชีตั้งหน่วยไมล์)
  const dm = desc.match(/Distance\s*:?\s*([\d.,]+)\s*(km|mi)/i) || text.match(/([\d.,]+)\s*(km|mi)\s*Distance/i);
  let km = dm ? parseFloat(dm[1].replace(/,/g, "")) : 0;
  if (dm && dm[2].toLowerCase() === "mi") km *= 1.609344;
  // เวลา: โทเค็นแรกที่เป็น mm:ss หรือ h:mm:ss (ท้ายสตริงมีเลข 00 เศษวินาทีติดมา ตัดทิ้ง)
  const tm = desc.match(/Total Time\s*:?\s*(\d{1,3}(?::\d{2}){1,2})/i) || text.match(/(\d{1,3}(?::\d{2}){1,2})\s*(?:\d{2})?\s*Activity Time/i);
  const min = tm ? clockToMin(tm[1]) : 0;
  if (!(km > 0 && km < 1000) || !(min > 0 && min < 3000)) return null;
  const pm = all.match(/(\d+)'(\d{2})"\s*\/\s*(km|mi)\s*Average Pace/i);
  const pace = pm ? (+pm[1] + +pm[2] / 60) / (pm[3].toLowerCase() === "mi" ? 1.609344 : 1) : min / km;
  const hm = all.match(/(\d{2,3})\s*bpm\s*Average Heart Rate/i);
  const dt = text.match(/\b([A-Z][a-z]{2}) (\d{1,2}), (\d{4}) \d{1,2}:\d{2}/);
  const date = dt && MON[dt[1].toLowerCase()] ? `${dt[3]}-${MON[dt[1].toLowerCase()]}-${dt[2].padStart(2, "0")}` : "";
  return { name: name.slice(0, 80), date, km: +km.toFixed(2), min: +min.toFixed(3), pace: +pace.toFixed(3), hr: hm ? +hm[1] : 0 };
}

/** ดึงลิงก์ตัวแรกออกจากข้อความที่วาง (แอปมักแชร์เป็น "ชื่อกิจกรรม + ลิงก์") */
export const extractUrl = (s: string): string => s.match(/https?:\/\/[^\s<>"']+/i)?.[0] ?? s.trim();

/** ลิงก์สั้นของแอป COROS: https://s.coros.com/<รหัส> */
export function safeCorosShort(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.hostname !== "s.coros.com" || u.port || u.username || u.password) return null;
  return /^\/[A-Za-z0-9_-]{4,32}\/?$/.test(u.pathname) ? `https://s.coros.com${u.pathname.replace(/\/$/, "")}` : null;
}
export const corosEntry = (raw: string) => safeCorosUrl(extractUrl(raw)) ?? safeCorosShort(extractUrl(raw));

/** เปิดลิงก์ (ตามการ redirect ได้ไม่เกิน 4 ครั้ง ทุกปลายทางต้องเป็นโดเมน COROS ที่อนุญาต) แล้วคืน HTML ของหน้า sharepage */
export async function resolveCoros(raw: string, get: (url: string) => Promise<{ status: number; location: string | null; text: () => Promise<string> }>): Promise<{ html?: string; error?: string }> {
  let cur = corosEntry(raw);
  if (!cur) return { error: "ลิงก์ต้องเป็นลิงก์แชร์กิจกรรมจากแอป COROS (s.coros.com หรือ sharepage.coros.com)" };
  for (let hop = 0; hop < 5; hop++) {
    const r = await get(cur);
    if (r.status >= 300 && r.status < 400) {
      if (!r.location) return { error: "เปิดลิงก์ไม่ได้" };
      let next: string; try { next = new URL(r.location, cur).toString(); } catch { return { error: "เปิดลิงก์ไม่ได้" }; }
      const safe = safeCorosUrl(next) ?? safeCorosShort(next);
      if (!safe) return { error: "ลิงก์ถูกส่งต่อไปยังที่อื่น ไม่ใช่หน้าแชร์ของ COROS" };
      cur = safe; continue;
    }
    if (r.status < 200 || r.status >= 300) return { error: "เปิดลิงก์ไม่ได้ ลิงก์อาจหมดอายุหรือยกเลิกการแชร์แล้ว" };
    const html = (await r.text()).slice(0, 600_000);
    if (new URL(cur).hostname === "sharepage.coros.com") return { html };
    // หน้าลิงก์สั้นตอบ 200 (redirect ด้วย JS): หาลิงก์ sharepage ในหน้านั้น
    const m = html.match(/https:\/\/sharepage\.coros\.com\/app_link\/share\/sport\?[^"'\s<>\\]+/i);
    const safe = m ? safeCorosUrl(m[0].replace(/&amp;/g, "&")) : null;
    if (!safe) return { error: "อ่านลิงก์สั้นนี้ไม่ได้ ลองคัดลอกลิงก์แบบเต็มจากแอป" };
    cur = safe;
  }
  return { error: "ลิงก์ส่งต่อหลายทอดเกินไป" };
}

/* ---------- รูปเส้นทาง: หน้าแชร์ของ COROS มีรูปแผนที่เส้นทางใน og:image (เช่น https://map-oss-us.coros.com/img/....jpg) ---------- */
export function safeImageUrl(raw: string, base = "https://sharepage.coros.com/"): string | null {
  let u: URL;
  try { u = new URL(raw.replace(/&amp;/g, "&").trim(), base); } catch { return null; }
  const h = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || u.port || u.username || u.password) return null;
  return h === "coros.com" || h.endsWith(".coros.com") ? u.toString() : null; // เฉพาะโดเมน COROS กัน SSRF
}
export function corosImageCandidates(html: string): string[] {
  const meta = (k: string) => {
    const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`, "i")) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, "i"));
    return a ? a[1] : "";
  };
  const out: string[] = [];
  for (const r of [meta("og:image"), meta("og:image:url"), meta("twitter:image")]) { const u = r && safeImageUrl(r); if (u && !out.includes(u)) out.push(u); }
  return out;
}
/** ดึงรูปเป็น data URL (ไม่ตามการ redirect, ชนิด png/jpeg/webp, ขนาด 2KB–900KB) ไม่ได้คืนค่าว่าง */
export async function fetchRouteImage(u: string, get: (url: string) => Promise<{ ok: boolean; type: string; bytes: () => Promise<Uint8Array> }>): Promise<string> {
  try {
    const r = await get(u); if (!r.ok) return "";
    const type = r.type.split(";")[0].trim().toLowerCase(); if (!/^image\/(png|jpeg|webp)$/.test(type)) return "";
    const buf = await r.bytes(); if (buf.length < 2000 || buf.length > 900_000) return "";
    let bin = ""; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return `data:${type};base64,${btoa(bin)}`;
  } catch { return ""; }
}
