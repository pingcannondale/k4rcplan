// Endpoint ที่ cron worker (worker-cron/) จะยิงเข้ามาทุกอาทิตย์
// ป้องกันด้วย CRON_SECRET กัน request จากที่อื่น (ตั้งใน Pages env var เหมือนกับที่
// worker-cron/wrangler.toml ตั้ง ต้องเป็นค่าเดียวกันทั้งสองฝั่ง)
import { getAthletes, mondayOf, addDays, thaiToday, sendPlanEmail } from "../../../netlify/lib/shared.mts";

interface Env {
  K4RC_KV: KVNamespace;
  CRON_SECRET?: string;
  [key: string]: unknown;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  if (context.env.CRON_SECRET) {
    const auth = context.request.headers.get("authorization");
    if (auth !== `Bearer ${context.env.CRON_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }
  (globalThis as any).__K4RC_KV = context.env.K4RC_KV;

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
};
