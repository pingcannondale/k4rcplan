import { getStore } from "@netlify/blobs";
// ไม่ import @cloudflare/workers-types เพื่อไม่ให้ Netlify/Vercel build พังถ้ายังไม่ได้ลงแพ็กเกจนี้
// (ใช้แค่ตอน K4RC_DATA_BACKEND=cloudflare-kv รันบน Cloudflare Pages เท่านั้น)
type KVNamespace = {
  get: (key: string, type?: "text" | "json") => Promise<any>;
  put: (key: string, value: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
};
import { scryptSync, randomBytes, timingSafeEqual, createHmac, randomUUID } from "node:crypto";
import * as StepsNs from "../../public/steps.js"; // ตัวคำนวณเวลา/ระยะจากเพซ ใช้ร่วมกับหน้าเว็บ
const Steps: any = (StepsNs as any).default ?? StepsNs;

/* ---------- ชนิดข้อมูล ---------- */
export type Workout = {
  id: string; sport: string; type: string; name: string; description: string; humanReadable: string;
  durationMinutes: number; distanceMeters: number; primaryZone: string; rpe: number;
  targetPace?: { low: string; high: string };
  steps?: any[]; // โครงสร้างการซ้อม (วอร์มอัพ / อินเทอร์วัล / คูลดาวน์) ดู public/steps.js
  exercises?: { n: string; s: number; r: string; w: string }[]; // รายการท่าสเตรงท์
};
export type Week = {
  weekNumber: number; startDate: string; endDate: string; phase: string; focus: string; isRecoveryWeek: boolean;
  days: { date: string; workouts: Workout[] }[];
};
export type Plan = { meta: { event: string; eventDate: string; planStartDate: string; planEndDate: string }; weeks: Week[] };
// ข้อมูลนักกีฬานอก (สมัครเองผ่านหน้า Join Us) ถ้ามีฟิลด์นี้แปลว่าเป็นนักกีฬานอก
export type ExtInfo = { pb5k: string; vdot: number; predictedHalf: string; predictedPace: string; planKey: string; planLabel: string; planStart: string; createdAt: string };
export type Athlete = { id: string; name: string; email: string; salt?: string; hash?: string; ext?: ExtInfo };

export const SPORT: Record<string, { label: string; color: string }> = {
  run: { label: "วิ่ง", color: "#f97316" },
  strength: { label: "สเตรงท์", color: "#a855f7" },
  rest: { label: "พัก", color: "#71717a" },
  race: { label: "แข่ง", color: "#eab308" },
  bike: { label: "จักรยาน", color: "#22c55e" },
  swim: { label: "ว่ายน้ำ", color: "#06b6d4" },
  brick: { label: "บริก", color: "#ec4899" },
};
const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const DAYS = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];

/* ---------- วันที่ (สัปดาห์เริ่มวันจันทร์, เวลาไทย) ---------- */
export const thaiToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
export function addDays(date: string, n: number) {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const mondayOf = (date: string) => addDays(date, -((new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7));
export const validDate = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const dayNum = (s: string) => +s.slice(8, 10);
const monthName = (s: string) => MONTHS[+s.slice(5, 7) - 1];
export function rangeLabel(week: string) {
  const a = week, b = addDays(week, 6);
  return monthName(a) === monthName(b)
    ? `${dayNum(a)}–${dayNum(b)} ${monthName(b)}`
    : `${dayNum(a)} ${monthName(a)} – ${dayNum(b)} ${monthName(b)}`;
}

/* ---------- ที่เก็บข้อมูล (Supabase เป็นหลัก; Blobs สำหรับ local/legacy เท่านั้น) ---------- */
const supabaseConfig = () => {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new Error("Supabase backend is selected but SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing");
  return { url, key };
};
// เรียก Supabase พร้อมหมดเวลา 8 วินาที และลองซ้ำอีก 1 ครั้งเมื่อเน็ตหลุด/หมดเวลา/เซิร์ฟเวอร์ตอบ 5xx (ทุกคำสั่งที่ใช้ซ้ำได้ปลอดภัย)
async function sb(path: string, init: RequestInit & { headers: Record<string, string> }): Promise<Response> {
  const { url } = supabaseConfig();
  let last: unknown;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(`${url}/rest/v1/${path}`, { ...init, signal: AbortSignal.timeout(8000) });
      if (r.status < 500) return r;
      last = new Error(`Supabase ${r.status}`);
    } catch (e) { last = e; }
    if (i === 0) await new Promise((res) => setTimeout(res, 350));
  }
  throw new Error(`Supabase unavailable: ${(last as Error)?.message ?? last}`);
}
async function supabaseGet(key: string): Promise<any | null> {
  const { key: secret } = supabaseConfig();
  const qs = new URLSearchParams({ select: "value", key: `eq.${key}`, limit: "1" });
  const r = await sb(`app_kv?${qs.toString()}`, { headers: { apikey: secret, Authorization: `Bearer ${secret}`, Accept: "application/json" } });
  if (!r.ok) throw new Error(`Supabase read failed (${r.status})`);
  const rows = await r.json();
  return Array.isArray(rows) && rows.length ? rows[0].value ?? null : null;
}
async function supabaseSet(key: string, value: unknown): Promise<void> {
  const { key: secret } = supabaseConfig();
  const r = await sb("app_kv?on_conflict=key", {
    method: "POST",
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`Supabase write failed (${r.status})`);
}
async function supabaseDelete(key: string): Promise<void> {
  const { key: secret } = supabaseConfig();
  const qs = new URLSearchParams({ key: `eq.${key}` });
  const r = await sb(`app_kv?${qs.toString()}`, { method: "DELETE", headers: { apikey: secret, Authorization: `Bearer ${secret}`, Prefer: "return=minimal" } });
  if (!r.ok) throw new Error(`Supabase delete failed (${r.status})`);
}
const blobsStore = () => getStore("training");
// Cloudflare: context.env มี binding (เช่น KVNamespace) แต่ handler หลายตัวในไฟล์นี้ไม่ได้รับ env
// ผ่าน parameter เลยฝาก binding ไว้ที่ globalThis ชั่วคราวตอนต้น request (ดู functions/api/[[path]].ts)
const cloudflareKV = (): KVNamespace => {
  const kv = (globalThis as any).__K4RC_KV;
  if (!kv) throw new Error("Cloudflare KV binding ไม่พร้อม (เช็คชื่อ binding ใน wrangler.toml ว่าตรงกับ K4RC_KV)");
  return kv;
};
const backend = () => String(process.env.K4RC_DATA_BACKEND || "").trim().toLowerCase();
const store = () => {
  const b = backend();
  if (b === "cloudflare-kv" || b === "cloudflare" || b === "kv") {
    const kv = cloudflareKV();
    return {
      get: async (key: string, options?: { type?: string }) =>
        kv.get(key, (options?.type === "json" ? "json" : "text") as any),
      setJSON: async (key: string, value: unknown) => { await kv.put(key, JSON.stringify(value)); },
      delete: async (key: string) => { await kv.delete(key); },
    };
  }
  if (b === "supabase") {
    return {
      get: async (key: string, _options?: { type?: string }) => supabaseGet(key),
      setJSON: async (key: string, value: unknown) => supabaseSet(key, value),
      delete: async (key: string) => supabaseDelete(key),
    };
  }
  return blobsStore(); // legacy: Netlify Blobs (ใช้ตอน local dev หรือยังไม่ได้ตั้ง K4RC_DATA_BACKEND)
};

export async function getAthletes(): Promise<Athlete[]> {
  const list = ((await store().get("athletes", { type: "json" })) as Athlete[] | null) ?? [];
  return list.map((a) => ({ ...a, email: String(a.email || "").toLowerCase() }));
}
export const setAthletes = (list: Athlete[]) => store().setJSON("athletes", list);
export const getPlan = async (id: string) => ((await store().get(`plan:${id}`, { type: "json" })) as Plan | null) ?? null;
export const setPlan = (id: string, p: Plan) => store().setJSON(`plan:${id}`, p);
export const getDone = async (id: string) => ((await store().get(`done:${id}`, { type: "json" })) as Record<string, 1> | null) ?? {};
export const setDone = (id: string, d: Record<string, 1>) => store().setJSON(`done:${id}`, d);
// เวิร์คเอาต์ที่นักกีฬากด "ข้ามวันนี้" (ไม่นับเป็นทำแล้ว ไม่กระทบสถิติ แค่แสดงเป็นสีเทาแทน "ค้าง")
export const getSkip = async (id: string) => ((await store().get(`skip:${id}`, { type: "json" })) as Record<string, 1> | null) ?? {};
export const setSkip = (id: string, d: Record<string, 1>) => store().setJSON(`skip:${id}`, d);
export const deletePlan = async (id: string) => { await store().delete(`plan:${id}`); await store().delete(`done:${id}`); await store().delete(`skip:${id}`); await store().delete(`fb:${id}`); };

/* ---------- ความรู้สึกหลังซ้อม (นักกีฬากรอก) / ครั้งล่าสุดที่เข้าแอป / ล็อกอินผิดซ้ำ ---------- */
export type Feedback = { rpe: number; feel: number; pain: boolean; area?: string; km?: number; min?: number; hr?: number; note: string; at: string };
export type Message = { id: string; text: string; at: string };
export const getFeedback = async (id: string) => ((await store().get(`fb:${id}`, { type: "json" })) as Record<string, Feedback> | null) ?? {};
export const setFeedback = (id: string, m: Record<string, Feedback>) => store().setJSON(`fb:${id}`, m);
export function cleanFeedback(raw: any, keepAt = false): Feedback | null {
  const rpe = Math.max(0, Math.min(10, Math.round(Number(raw?.rpe)) || 0));
  const feel = Math.max(0, Math.min(5, Math.round(Number(raw?.feel)) || 0));
  const pain = !!raw?.pain, note = str(raw?.note, 300), area = pain ? str(raw?.area, 20) : "";
  const km = Math.max(0, Math.min(500, Math.round((Number(raw?.km) || 0) * 100) / 100)), min = Math.max(0, Math.min(2000, Math.round((Number(raw?.min) || 0) * 100) / 100));
  const hr = Math.round(Number(raw?.hr)) || 0, hrOk = hr >= 30 && hr <= 240;
  if (!rpe && !feel && !pain && !note && !km && !min) return null;
  const at = keepAt && typeof raw?.at === "string" && !isNaN(Date.parse(raw.at)) ? new Date(raw.at).toISOString() : new Date().toISOString();
  return { rpe, feel, pain, ...(area ? { area } : {}), ...(km ? { km } : {}), ...(min ? { min } : {}), ...(hrOk ? { hr } : {}), note, at };
}

/* ----- ข้อความจากโค้ชถึงนักกีฬา (เก็บล่าสุดไม่เกิน 30 ข้อความ) ----- */
export const getMessages = async (id: string) => ((await store().get(`msg:${id}`, { type: "json" })) as Message[] | null) ?? [];
export const setMessages = (id: string, m: Message[]) => store().setJSON(`msg:${id}`, m.slice(-30));
export const deleteMessages = (id: string) => store().delete(`msg:${id}`);
export function cleanMessages(raw: any): Message[] {
  return (Array.isArray(raw) ? raw : []).slice(-30).map((m: any) => {
    const text = str(m?.text, 500);
    const at = typeof m?.at === "string" && !isNaN(Date.parse(m.at)) ? new Date(m.at).toISOString() : new Date().toISOString();
    return text ? { id: str(m?.id, 40) || crypto.randomUUID(), text, at } : null;
  }).filter(Boolean) as Message[];
}
export const getSeen = async (id: string) => ((await store().get(`seen:${id}`, { type: "json" })) as { at: string } | null)?.at ?? "";
export async function touchSeen(id: string) {
  const prev = await getSeen(id);
  if (!prev || Date.now() - Date.parse(prev) > 10 * 60e3) await store().setJSON(`seen:${id}`, { at: new Date().toISOString() }); // เขียนไม่ถี่เกิน 10 นาที
}
export const deleteSeen = async (id: string) => { await store().delete(`seen:${id}`); await store().delete(`fail:${id}`); };
const LOCK_AFTER = 8, LOCK_MIN = 15;
export async function lockedMinutes(id: string): Promise<number> {
  const r = (await store().get(`fail:${id}`, { type: "json" })) as { n: number; until: number } | null;
  return r?.until && r.until > Date.now() ? Math.ceil((r.until - Date.now()) / 60000) : 0;
}
export async function addFail(id: string) {
  const r = (await store().get(`fail:${id}`, { type: "json" })) as { n: number; until: number } | null;
  const n = (r?.until && r.until < Date.now() ? 0 : r?.n ?? 0) + 1;
  await store().setJSON(`fail:${id}`, n >= LOCK_AFTER ? { n: 0, until: Date.now() + LOCK_MIN * 60e3 } : { n, until: 0 });
}
export const clearFail = (id: string) => store().delete(`fail:${id}`);

/* ---------- เพซส่วนตัวของนักกีฬา (โค้ชกรอกเอง) ---------- */
// ลำดับนี้คือลำดับที่แสดง: E, LT1, LT2, Marathon, 5K Pace, VO2Max, R Pace
export const PACE_KEYS = ["e", "lt1", "lt2", "marathon", "k5", "vo2max", "r"] as const;
export type Paces = { values: Record<string, string>; note: string; updatedAt: string };
export const getPaces = async (id: string) => ((await store().get(`paces:${id}`, { type: "json" })) as Paces | null) ?? null;
export const setPaces = (id: string, p: Paces) => store().setJSON(`paces:${id}`, p);
export const deletePaces = (id: string) => store().delete(`paces:${id}`);

/* ---------- ล็อกอิน ---------- */
export function hashPw(pw: string) {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: scryptSync(pw, salt, 32).toString("hex") };
}
export function checkPw(pw: string, a: Athlete) {
  if (!a.salt || !a.hash) return false;
  const h = scryptSync(pw, a.salt, 32), b = Buffer.from(a.hash, "hex");
  return b.length === h.length && timingSafeEqual(h, b);
}
const secret = () => process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");
export const hasSecret = () => secret().length > 0;
export function signToken(id: string) {
  const body = Buffer.from(JSON.stringify({ id, exp: Date.now() + 30 * 864e5 })).toString("base64url");
  return `${body}.${sign(body)}`;
}
export function readToken(header: string | null): string | null {
  const t = (header || "").replace(/^Bearer\s+/i, "");
  const [body, sig] = t.split(".");
  if (!body || !sig || !hasSecret()) return null;
  const exp = sign(body);
  if (sig.length !== exp.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(exp))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    return p.exp > Date.now() ? String(p.id) : null;
  } catch { return null; }
}

/* ---------- ตรวจและทำความสะอาดแผน ---------- */
const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const num = (v: unknown, max: number) => Math.max(0, Math.min(max, Number(v) || 0));

const UNIT_MAX: Record<string, number> = { km: 200, m: 200000, min: 600, s: 36000 };
const cleanStep = (x: any) => {
  const u = typeof x?.u === "string" && x.u in UNIT_MAX ? x.u : "km";
  return { u, x: Math.max(0, Math.min(UNIT_MAX[u], Number(x?.x) || 0)), p: str(x?.p, 24) };
};
export function cleanSteps(raw: any): any[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.slice(0, 30).map((it: any) => {
    if (it?.t === "repeat") {
      const rest = it.rest && Number(it.rest.x) > 0 ? cleanStep(it.rest) : null;
      return { t: "repeat", n: Math.max(1, Math.min(50, Math.round(Number(it.n)) || 1)), work: cleanStep(it.work), rest };
    }
    return { t: ["warmup", "steady", "cooldown"].includes(it?.t) ? it.t : "steady", ...cleanStep(it) };
  });
}
// คำนวณเวลา/ระยะของเวิร์คเอาต์ที่มี steps ใหม่ตามเพซปัจจุบันของนักกีฬา (เรียกตอนบันทึกสัปดาห์ แก้เพซ และส่งแผนต่อ)
export function applyCalc(plan: Plan, paces: Paces | null): Plan {
  for (const w of plan.weeks) for (const d of w.days) for (const x of d.workouts) {
    if (!x.steps?.length) continue;
    const c = Steps.calc(x.steps, paces);
    if (c.ok) { x.durationMinutes = Math.min(600, c.minutes); x.distanceMeters = Math.min(200000, c.meters); }
  }
  return plan;
}

export function cleanExercises(raw: any) {
  if (!Array.isArray(raw)) return undefined;
  return raw.slice(0, 20).map((e: any) => ({ n: str(e?.n, 60), s: Math.max(0, Math.min(20, Math.round(Number(e?.s)) || 0)), r: str(e?.r, 16), w: str(e?.w, 60) })).filter((e) => e.n);
}

export function cleanWorkout(x: any): Workout {
  const sport = typeof x?.sport === "string" && x.sport in SPORT ? x.sport : "run";
  const w: Workout = {
    id: str(x?.id, 60) || randomUUID().slice(0, 12),
    sport,
    type: str(x?.type, 30),
    name: str(x?.name, 120) || SPORT[sport].label,
    description: str(x?.description, 600),
    humanReadable: str(x?.humanReadable, 1500),
    durationMinutes: num(x?.durationMinutes, 600),
    distanceMeters: num(x?.distanceMeters, 200000),
    primaryZone: str(x?.primaryZone, 40),
    rpe: num(x?.rpe, 10),
  };
  if (x?.targetPace?.low) w.targetPace = { low: str(x.targetPace.low, 10), high: str(x.targetPace.high, 10) };
  const steps = cleanSteps(x?.steps);
  if (steps?.length) w.steps = steps;
  const ex = cleanExercises(x?.exercises);
  if (ex?.length) w.exercises = ex;
  return w;
}
export function cleanWeek(w: any): Week | null {
  if (!validDate(w?.startDate)) return null;
  const start = mondayOf(w.startDate);
  const byDate = new Map<string, any[]>();
  for (const d of Array.isArray(w.days) ? w.days : []) if (validDate(d?.date)) byDate.set(d.date, Array.isArray(d.workouts) ? d.workouts : []);
  return {
    weekNumber: 0, startDate: start, endDate: addDays(start, 6),
    phase: str(w.phase, 30), focus: str(w.focus, 200), isRecoveryWeek: !!w.isRecoveryWeek,
    days: Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, i);
      return { date, workouts: (byDate.get(date) ?? []).slice(0, 6).map(cleanWorkout) };
    }),
  };
}
export function finishPlan(weeks: Week[], event: string, eventDate: string): Plan | null {
  weeks.sort((a, b) => a.startDate.localeCompare(b.startDate));
  weeks.forEach((w, i) => (w.weekNumber = i + 1));
  if (!weeks.length) return null;
  return {
    meta: { event: str(event, 120) || "แผนซ้อมวิ่ง", eventDate: validDate(eventDate) ? eventDate : "", planStartDate: weeks[0].startDate, planEndDate: addDays(weeks[weeks.length - 1].startDate, 6) },
    weeks,
  };
}
export function cleanPlan(raw: any): Plan | null {
  const weeks = (Array.isArray(raw?.weeks) ? raw.weeks.slice(0, 60) : []).map(cleanWeek).filter(Boolean) as Week[];
  return finishPlan(weeks, raw?.meta?.event, raw?.meta?.eventDate);
}

/* ---------- คัดลอกแผนให้คนอื่น ---------- */
// ทำสำเนาสัปดาห์ เลื่อนวันที่ไป offsetDays วัน (ต้องเป็นผลคูณของ 7 เพื่อให้ยังเริ่มวันจันทร์)
// และออกรหัสเวิร์คเอาต์ใหม่ทุกอัน เพื่อไม่ให้ประวัติติ๊กทำแล้วของคนอื่นมาปนกัน
export function cloneWeeks(weeks: Week[], offsetDays = 0): Week[] {
  return weeks.map((w) => ({
    ...w,
    startDate: addDays(w.startDate, offsetDays),
    endDate: addDays(w.endDate, offsetDays),
    days: w.days.map((d) => ({
      date: addDays(d.date, offsetDays),
      workouts: d.workouts.map((x) => ({ ...x, id: randomUUID().slice(0, 12) })),
    })),
  }));
}
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);

export function cleanPaces(raw: any): Paces | null {
  const values: Record<string, string> = {};
  for (const k of PACE_KEYS) values[k] = str(raw?.values?.[k], 24);
  const note = str(raw?.note, 200);
  if (!note && PACE_KEYS.every((k) => !values[k])) return null; // ว่างทั้งหมด = ลบ
  return { values, note, updatedAt: new Date().toISOString() };
}

/* ---------- อีเมล (Resend) ---------- */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendPlanEmail(a: Athlete, weekStart: string): Promise<{ ok: boolean; error?: string }> {
  const plan = await getPlan(a.id), paces = await getPaces(a.id);
  const wk = plan?.weeks.find((w) => w.startDate === weekStart);
  if (!wk) return { ok: false, error: "ยังไม่มีตารางของสัปดาห์นี้" };
  if (!a.email) return { ok: false, error: "นักกีฬาคนนี้ยังไม่มีอีเมล" };
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM;
  if (!key || !from) return { ok: false, error: "ยังไม่ได้ตั้งค่า RESEND_API_KEY และ EMAIL_FROM ใน Netlify" };

  const site = (process.env.SITE_URL || process.env.URL || "").replace(/\/$/, "");
  const km = wk.days.flatMap((d) => d.workouts).reduce((s, w) => s + w.distanceMeters, 0) / 1000;
  const rows = wk.days.map((d, i) => {
    const items = d.workouts.length
      ? d.workouts.map((w) => {
          const s = SPORT[w.sport];
          const meta = [w.durationMinutes ? `${w.durationMinutes} นาที` : "", w.distanceMeters ? `${+(w.distanceMeters / 1000).toFixed(1)} กม.` : ""].filter(Boolean).join(" · ");
          return `<div style="margin-bottom:8px"><b style="color:${s.color}">${s.label}</b> ${esc(w.name)}${meta ? ` <span style="color:#71717a">· ${meta}</span>` : ""}${w.steps?.length ? `<br><span style="color:#52525b">${esc(Steps.text(w.steps, paces)).replace(/\n/g, "<br>")}</span>` : ""}${w.exercises?.length ? `<br><span style="color:#52525b">${esc(Steps.exText(w.exercises)).replace(/\n/g, "<br>")}</span>` : ""}${w.humanReadable ? `<br><span style="color:#52525b">${esc(w.humanReadable).replace(/\n/g, "<br>")}</span>` : ""}</div>`;
        }).join("")
      : `<span style="color:#71717a">ว่าง</span>`;
    return `<tr><td style="padding:12px;border-top:1px solid #e4e4e7;vertical-align:top;white-space:nowrap"><b>${DAYS[i]}</b> ${dayNum(d.date)}</td><td style="padding:12px;border-top:1px solid #e4e4e7">${items}</td></tr>`;
  }).join("");
  const html = `<div style="font-family:Tahoma,sans-serif;max-width:560px;margin:auto;color:#18181b">
<h2 style="margin:0 0 4px">สวัสดี ${esc(a.name)}</h2>
<p style="margin:0 0 16px;color:#52525b">สัปดาห์ที่ ${wk.weekNumber} · ${rangeLabel(weekStart)}${wk.focus ? ` · ${esc(wk.focus)}` : ""} · รวม ${+km.toFixed(1)} กม.</p>
<table style="width:100%;border-collapse:collapse;font-size:15px;line-height:1.5">${rows}</table>
${site ? `<p style="margin:20px 0"><a href="${site}" style="background:#f97316;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;display:inline-block">เปิดแอปตารางซ้อม</a></p>` : ""}
</div>`;

  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [a.email], subject: `ตารางซ้อมวิ่ง ${rangeLabel(weekStart)} · ${+km.toFixed(1)} กม.`, html }),
  });
  return r.ok ? { ok: true } : { ok: false, error: (await r.text()).slice(0, 300) };
}

/* ----- ข้อมูลส่วนตัวของนักกีฬา (กรอกเองได้ ไม่บังคับ): ร่างกาย เป้าเวลา และสถิติส่วนตัว ----- */
export type Profile = { feedOff?: boolean; age?: number; weight?: number; hrMax?: number; hrRest?: number; goal?: string; pr?: { k5?: string; k10?: string; k21?: string; k42?: string } };
export const getProfile = async (id: string) => ((await store().get(`profile:${id}`, { type: "json" })) as Profile | null) ?? null;
export const setProfile = (id: string, p: Profile) => store().setJSON(`profile:${id}`, p);
export const deleteProfile = (id: string) => store().delete(`profile:${id}`);
export function cleanProfile(raw: any): Profile | null {
  const n = (v: any, lo: number, hi: number) => { const x = Number(v); return Number.isFinite(x) && x >= lo && x <= hi ? Math.round(x * 10) / 10 : undefined; };
  const t = (v: any) => { const x = str(v, 10); return /^\d{1,2}(:\d{2}){1,2}$/.test(x) ? x : ""; };
  const out: Profile = {};
  const age = n(raw?.age, 5, 100), weight = n(raw?.weight, 20, 250), hrMax = n(raw?.hrMax, 100, 250), hrRest = n(raw?.hrRest, 25, 120), goal = t(raw?.goal);
  if (raw?.feedOff) out.feedOff = true;
  if (age) out.age = age; if (weight) out.weight = weight; if (hrMax) out.hrMax = hrMax; if (hrRest) out.hrRest = hrRest; if (goal) out.goal = goal;
  const pr: any = {}; for (const k of ["k5", "k10", "k21", "k42"]) { const v = t(raw?.pr?.[k]); if (v) pr[k] = v; }
  if (Object.keys(pr).length) out.pr = pr;
  return Object.keys(out).length ? out : null;
}

/* ---------- ฟีดทีม: ผลซ้อมที่นักกีฬาให้ RPE แล้ว แสดงให้ทุกคนเห็น 24 ชม. (เก็บในไฟล์เดียว) ---------- */
export type Post = { id: string; aid: string; name: string; sport: string; title: string; km: number; min: number; rpe: number; feel: number; at: string; date: string };
export const FEED_MS = 24 * 3600e3;
export const getFeed = async () => ((await store().get("feed", { type: "json" })) as Post[] | null) ?? [];
export async function putPost(p: Post) {
  const now = Date.now(); // เก็บโพสต์เกิน 24 ชม. ไว้อีกนิดแล้วล้างตอนเขียน ฝั่งอ่านกรองเองด้วย
  const list = (await getFeed()).filter((x) => x.id !== p.id && now - Date.parse(x.at) < FEED_MS * 2);
  list.push(p);
  await store().setJSON("feed", list.slice(-300));
}
export async function dropPosts(match: (p: Post) => boolean) {
  const list = await getFeed(), keep = list.filter((x) => !match(x));
  if (keep.length !== list.length) await store().setJSON("feed", keep);
}

/* ---------- รูปโปรไฟล์ (ย่อเป็นสี่เหลี่ยมเล็ก เก็บเป็น data URL เพื่อให้เพื่อนร่วมทีมเห็นในฟีด) ---------- */
export const getAvatar = async (id: string) => ((await store().get(`avatar:${id}`, { type: "json" })) as { img: string } | null)?.img ?? "";
export const setAvatar = (id: string, img: string) => store().setJSON(`avatar:${id}`, { img });
export const deleteAvatar = async (id: string) => { await store().delete(`avatar:${id}`); await store().delete(`avh:${id}`); };
/* แฮชของรูป เก็บแยกเป็นก้อนเล็ก (ไม่กี่ไบต์) ฟีดจะได้เทียบกับของที่เครื่องมีโดยไม่ต้องอ่านรูปทั้งก้อน (สูงสุด 60KB ต่อคน ต่อทุกรอบโพล) */
export const getAvatarHash = async (id: string) => ((await store().get(`avh:${id}`, { type: "json" })) as { h: string } | null)?.h ?? "";
export const setAvatarHash = (id: string, h: string) => store().setJSON(`avh:${id}`, { h });
export const cleanAvatar = (v: unknown) => (typeof v === "string" && v.length <= 60000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v) ? v : "");
