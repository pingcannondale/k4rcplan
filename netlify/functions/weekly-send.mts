import type { Config } from "@netlify/functions";
import { getAthletes, mondayOf, addDays, thaiToday, sendPlanEmail } from "../lib/shared.mts";

// ทุกวันอาทิตย์ 19:00 เวลาไทย ส่งตารางของ "สัปดาห์หน้า" ให้นักกีฬาทุกคนที่มีอีเมลและมีตาราง
export default async () => {
  const nextWeek = addDays(mondayOf(thaiToday()), 7);
  for (const a of await getAthletes()) {
    if (!a.email) continue;
    const r = await sendPlanEmail(a, nextWeek);
    console.log(a.name, nextWeek, r);
  }
};

// cron ใช้เวลา UTC: อาทิตย์ 12:00 UTC = 19:00 เวลาไทย
export const config: Config = { schedule: "0 12 * * 0" };
