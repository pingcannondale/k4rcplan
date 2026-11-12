// Vercel Cron replacement for netlify/functions/weekly-send.mts
// (Netlify's `config.schedule` cron syntax isn't read by Vercel — the
// schedule now lives in vercel.json's "crons" array, which hits this
// URL with a GET request on that schedule).
//
// ทุกวันอาทิตย์ 19:00 เวลาไทย (ตั้งไว้ใน vercel.json เป็น "0 12 * * 0" ซึ่งคือ
// 12:00 UTC) ส่งตารางของ "สัปดาห์หน้า" ให้นักกีฬาทุกคนที่มีอีเมลและมีตาราง
import { getAthletes, mondayOf, addDays, thaiToday, sendPlanEmail } from "../../netlify/lib/shared.mts";

export default async function handler(req: Request) {
  // Vercel signs cron requests with this header; also allow a manual
  // trigger if you set CRON_SECRET and pass it as a Bearer token.
  if (process.env.CRON_SECRET) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const nextWeek = addDays(mondayOf(thaiToday()), 7);
  const results: { name: string; week: string; ok: boolean; error?: string }[] = [];
  for (const a of await getAthletes()) {
    if (!a.email) continue;
    const r = await sendPlanEmail(a, nextWeek);
    results.push({ name: a.name, week: nextWeek, ok: r.ok, error: r.error });
  }
  return new Response(JSON.stringify({ ok: true, sent: results.length, results }), {
    headers: { "content-type": "application/json" },
  });
}
