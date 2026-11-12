// Worker แยกต่างหากตัวเล็กๆ ที่มีหน้าที่เดียวคือ "ตื่นมาตามเวลา cron แล้วยิง
// POST ไปที่หน้าเว็บหลัก" เพราะ Cloudflare Pages เองไม่รองรับ Cron Triggers
// (ฟีเจอร์นี้มีเฉพาะ Workers ธรรมดา) ตัวนี้ deploy แยกจาก Pages โปรเจกต์หลัก
export interface Env {
  TARGET_URL: string;
  CRON_SECRET?: string;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      fetch(env.TARGET_URL, {
        method: "POST",
        headers: env.CRON_SECRET ? { authorization: `Bearer ${env.CRON_SECRET}` } : {},
      }).then(async (r) => {
        console.log("weekly-send:", r.status, await r.text().catch(() => ""));
      })
    );
  },
};
