/* ระบบนักกีฬานอก: PB 5K -> เพซซ้อม + เวลาฮาล์ฟคาดการณ์ -> เลือกแผน -> วางตารางย้อนจากวันแข่ง
   ฟังก์ชันในไฟล์นี้เป็น pure (ไม่แตะฐานข้อมูล) เพื่อให้เทสต์ง่าย ส่วนการบันทึกอยู่ใน api.mts */
import { randomUUID } from "node:crypto";
import * as VdotNs from "../../public/vdot.js";
import { addDays, cleanWeek, finishPlan, mondayOf, applyCalc, type Plan, type Week, type Workout, type Paces, type ExtInfo } from "./shared.mts";
import { HALF_PLANS, type Sess, type RawPlan } from "./half-plans-data.mts";

const Vdot: any = (VdotNs as any).default ?? VdotNs;

/* ---------- เป้าหมายตายตัวของนักกีฬานอกทุกคน ---------- */
export const EXT_GOAL = {
  event: "Buriram Marathon 2027 · Half-Marathon (21.1 km)",
  eventShort: "Buriram Marathon 2027",
  eventDate: "2027-01-23",
  meters: 21097,
};
export const WARM_COOL_MIN = 15; // เซสชัน Interval ทุกอันได้วอร์มอัพ/คูลดาวน์เท่านี้เสมอ
const TOTAL_DAYS = 15 * 7;       // ตารางต้นฉบับยาว 15 สัปดาห์

/* ---------- เวลา ---------- */
export const fmtHMS = (min: number) => {
  const s = Math.round(min * 60), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};
export const fmtPace = (secPerKm: number) => { const s = Math.round(secPerKm); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/* ---------- 1) PB 5K -> เพซซ้อม + ฮาล์ฟคาดการณ์ ---------- */
export type Calc = { vdot: number; values: Record<string, string>; halfMin: number; halfTime: string; halfPace: string };
export function calcFromPb5k(pb5k: string): Calc | { error: string } {
  const s = Vdot.suggest("5k", pb5k);
  if (s.error) return { error: s.error };
  const p = Vdot.predict("5k", pb5k, "half");
  if (!p) return { error: "คำนวณเวลาฮาล์ฟมาราธอนจากเวลานี้ไม่ได้" };
  return { vdot: Math.round(s.vdot * 10) / 10, values: s.values, halfMin: p.min, halfTime: fmtHMS(p.min), halfPace: fmtPace(p.secPerKm) };
}

/* ---------- 2) จับคู่แผนที่เวลาเป้าหมายใกล้เวลาคาดการณ์ที่สุด (เท่ากันเลือกแผนที่ช้ากว่า = ปลอดภัยกว่า) ---------- */
export function matchPlan(halfMin: number): RawPlan {
  return [...HALF_PLANS].sort((a, b) => Math.abs(a.targetMin - halfMin) - Math.abs(b.targetMin - halfMin) || b.targetMin - a.targetMin)[0];
}

/* ---------- 3) แปลงเซสชันเป็นเวิร์คเอาต์ (เพซอ้างชื่อเพซของแอป ค่าจริงมาจาก paces ของนักกีฬา) ---------- */
// easy -> LT1(Easy)  tempo -> LT2  steady -> Marathon  3k -> VO2max  5k -> 5K  800m/1ไมล์ -> R  พัก/วอร์ม/คูล -> Recovery
const fmtDur = (sec: number) => (sec % 60 === 0 ? `${sec / 60} นาที` : sec < 60 ? `${sec} วินาที` : `${Math.round((sec / 60) * 10) / 10} นาที`);
const PACE_TH: Record<string, string> = { vo2max: "เพซ 3K", k5: "เพซ 5K", r: "เพซเร็ว (R)", marathon: "Steady" };
const blank = { description: "", humanReadable: "", durationMinutes: 0, distanceMeters: 0, primaryZone: "", rpe: 0 };

function toWorkout(s: Sess, dayIdx: number, predicted: { time: string; pace: string; min: number }): Workout | null {
  const id = randomUUID().slice(0, 12);
  const slot = "slot" in s && s.slot ? (s.slot === "am" ? " (เช้า)" : " (เย็น)") : "";
  switch (s.t) {
    case "rest":
      return { id, sport: "rest", type: "rest", name: "พัก", ...blank, humanReadable: "พักเต็มวัน" };
    case "race":
      return { id, sport: "race", type: "race", name: EXT_GOAL.event, ...blank, durationMinutes: Math.round(predicted.min), distanceMeters: EXT_GOAL.meters, rpe: 10,
        humanReadable: `วันแข่งจริง! เวลาคาดการณ์ ${predicted.time} · เพซเฉลี่ย ${predicted.pace}/กม.` };
    case "parkrun":
      return null; // ตัดทิ้งตามเงื่อนไข (เรียกใช้ที่ customize ก่อนแล้ว กันไว้เฉย ๆ)
    case "easy": {
      const long = dayIdx === 6 && s.min >= 60;
      return { id, sport: "run", type: long ? "long" : "easy", name: (long ? "Long run" : "Easy run") + slot, ...blank, rpe: long ? 5 : 3,
        steps: [{ t: "steady", u: "min", x: s.min, p: "lt1" }] };
    }
    case "tempo": {
      const long = dayIdx === 6 && s.easy >= 60;
      return { id, sport: "run", type: "tempo", name: (long ? `Long run + Tempo ${s.tempo} นาที` : `Easy + Tempo ${s.tempo} นาที`) + slot, ...blank, rpe: long ? 6 : 7,
        steps: [{ t: "steady", u: "min", x: s.easy, p: "lt1" }, { t: "steady", u: "min", x: s.tempo, p: "lt2" }] };
    }
    case "intervals": {
      const unit = (sec: number) => (sec % 60 === 0 ? { u: "min", x: sec / 60 } : sec < 60 ? { u: "s", x: sec } : { u: "min", x: Math.round((sec / 60) * 100) / 100 });
      return { id, sport: "run", type: "interval", name: `Intervals ${s.n}×${fmtDur(s.workSec)} @ ${PACE_TH[s.pace]}`, ...blank, rpe: s.pace === "marathon" ? 6 : 8,
        steps: [
          { t: "warmup", u: "min", x: WARM_COOL_MIN, p: "lt1" },
          { t: "repeat", n: s.n, work: { ...unit(s.workSec), p: s.pace }, rest: { ...unit(s.restSec), p: "e" } },
          { t: "cooldown", u: "min", x: WARM_COOL_MIN, p: "e" },
        ] };
    }
  }
}

// เงื่อนไขปรับแผน (ใช้กับทุกตารางสำเร็จรูป)
//  1) ตัด Park Run ออก ("วิ่งเบา หรือ Parkrun" ยังเก็บส่วนวิ่งเบาไว้ ตัดเฉพาะตัวเลือก Parkrun)
//  2) Easy ล้วน 20/25/30 นาที -> 40 นาที (ไม่แตะส่วน Easy ในวัน Easy + Tempo)
//  3) วันที่ว่าง (ไม่มีเซสชันเลย เช่น วัน Parkrun ที่ถูกตัดออก) -> Easy 40 นาที  ส่วนวันพัก (rest) คือพักตามปกติ
export const EASY_MIN_FROM = [20, 25, 30], EASY_MIN_TO = 40, EMPTY_DAY_EASY_MIN = 40;
export function customize(day: Sess[]): Sess[] {
  const out = day.filter((s) => s.t !== "parkrun").map((s): Sess => (s.t === "easy" && (EASY_MIN_FROM as number[]).includes(s.min) ? { ...s, min: EASY_MIN_TO } : s));
  return out.length ? out : [{ t: "easy", min: EMPTY_DAY_EASY_MIN }];
}

/* ---------- 4) วางตารางย้อนจากวันแข่ง แล้วตัดวันที่ผ่านไปแล้วทิ้ง ---------- */
export type Built = { plan: Plan; planKey: string; planLabel: string; startDate: string };
export function buildPlan(raw: RawPlan, halfMin: number, today: string, eventDate = EXT_GOAL.eventDate): Built | null {
  const predicted = { min: halfMin, time: fmtHMS(halfMin), pace: fmtPace((halfMin * 60) / 21.0975) };
  const byDate = new Map<string, Workout[]>();
  const planWeekOf = new Map<string, number>();
  for (let w = 0; w < 15; w++) for (let d = 0; d < 7; d++) {
    const idx = w * 7 + d;
    const date = addDays(eventDate, idx - (TOTAL_DAYS - 1)); // วันสุดท้ายของตาราง (วันแข่ง) = eventDate พอดี
    planWeekOf.set(date, w + 1);
    if (date < today) continue;
    const day = customize(raw.weeks[w][d]);
    const list = day.map((s) => toWorkout(s, d, predicted)).filter(Boolean) as Workout[];
    if (list.length) byDate.set(date, list);
  }
  if (!byDate.size) return null;
  // จัดเป็นสัปดาห์ จันทร์-อาทิตย์ ตามที่แอปใช้
  const weekStarts = [...new Set([...byDate.keys()].map(mondayOf))].sort();
  const weeks: Week[] = [];
  for (const start of weekStarts) {
    const thu = addDays(start, 3);
    const keys = [...planWeekOf.keys()].sort();
    const pw = planWeekOf.get(thu) ?? planWeekOf.get(thu < keys[0] ? keys[0] : keys[keys.length - 1])!;
    const recovery = [3, 6, 9, 12].includes(pw);
    const phase = pw <= 4 ? "Base" : pw <= 8 ? "Build" : pw <= 13 ? "Peak" : pw === 14 ? "Taper" : "Race";
    const wk = cleanWeek({
      startDate: start, phase, isRecoveryWeek: recovery,
      focus: `สัปดาห์ซ้อมที่ ${pw} จาก 15${recovery ? " · สัปดาห์พักฟื้น" : ""}${pw === 15 ? " · สัปดาห์แข่ง" : ""}`,
      days: Array.from({ length: 7 }, (_, i) => { const date = addDays(start, i); return { date, workouts: byDate.get(date) ?? [] }; }),
    });
    if (wk) weeks.push(wk);
  }
  const plan = finishPlan(weeks, EXT_GOAL.event, eventDate);
  if (!plan) return null;
  plan.meta.planEndDate = eventDate; // แผนจบที่วันแข่งพอดี (ไม่ใช่วันอาทิตย์ท้ายสัปดาห์)
  return { plan, planKey: raw.key, planLabel: raw.label, startDate: [...byDate.keys()].sort()[0] };
}

/* ---------- ทั้งกระบวนการ: PB 5K -> ทุกอย่างที่ต้องบันทึก ---------- */
export function generateForPb5k(pb5k: string, today: string): { error: string } | { ext: ExtInfo; plan: Plan; paces: Paces } {
  if (today > EXT_GOAL.eventDate) return { error: `${EXT_GOAL.eventShort} จัดไปแล้ว ขณะนี้ปิดรับสมัคร` };
  const c = calcFromPb5k(pb5k);
  if ("error" in c) return c;
  const raw = matchPlan(c.halfMin);
  const built = buildPlan(raw, c.halfMin, today);
  if (!built) return { error: "สร้างตารางซ้อมไม่ได้ในช่วงเวลานี้" };
  const paces: Paces = { values: c.values, note: `คำนวณอัตโนมัติจาก PB 5K ${pb5k} (VDOT ${c.vdot}) · ฮาล์ฟคาดการณ์ ${c.halfTime} (${c.halfPace}/กม.)`, updatedAt: new Date().toISOString() };
  const plan = applyCalc(built.plan, paces);
  return {
    ext: { pb5k, vdot: c.vdot, predictedHalf: c.halfTime, predictedPace: c.halfPace, planKey: built.planKey, planLabel: built.planLabel, planStart: built.startDate, createdAt: new Date().toISOString() },
    plan, paces,
  };
}

// ล้างข้อมูล ext ที่มาจากไฟล์ backup (ไม่เชื่อค่าจากภายนอก)
export function cleanExt(raw: any): ExtInfo | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const t = (v: any, n: number) => String(v ?? "").slice(0, n);
  const pb5k = t(raw.pb5k, 10);
  if (!/^\d{1,2}(:\d{2}){1,2}$/.test(pb5k)) return undefined;
  return { pb5k, vdot: Math.max(0, Math.min(100, Number(raw.vdot) || 0)), predictedHalf: t(raw.predictedHalf, 10), predictedPace: t(raw.predictedPace, 10), planKey: t(raw.planKey, 20), planLabel: t(raw.planLabel, 40), planStart: t(raw.planStart, 10), createdAt: t(raw.createdAt, 30) };
}
