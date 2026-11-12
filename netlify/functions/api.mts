import type { Config } from "@netlify/functions";
import {
  getAthletes, setAthletes, getPlan, setPlan, getDone, setDone, getSkip, setSkip, deletePlan,
  getPaces, setPaces, deletePaces, cleanPaces, applyCalc,
  getFeedback, setFeedback, cleanFeedback, getProfile, setProfile, deleteProfile, cleanProfile, getMessages, setMessages, deleteMessages, cleanMessages, touchSeen, getSeen, getFeed, putPost, dropPosts, FEED_MS, getAvatar, getAvatarHash, setAvatarHash, setAvatar, deleteAvatar, cleanAvatar, deleteSeen, lockedMinutes, addFail, clearFail,
  hashPw, checkPw, signToken, readToken, hasSecret,
  cleanPlan, cleanWeek, finishPlan, mondayOf, thaiToday, validDate, sendPlanEmail, cloneWeeks, daysBetween, addDays,
  type Athlete, type Week,
} from "../lib/shared.mts";
import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { generateForPb5k, cleanExt, EXT_GOAL } from "../lib/external.mts";
import { resolveCoros, parseCorosShare, corosImageCandidates, fetchRouteImage } from "../lib/coros.mts";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// เทียบรหัสโค้ชแบบเวลาคงที่ (กันเดาจากเวลาตอบ) + ผูกตัวนับรหัสผิดกับ IP ของคนเรียก
const samePw = (given: string, real: string) => timingSafeEqual(createHash("sha256").update(given).digest(), createHash("sha256").update(real).digest());
const adminKey = (req: Request) => "admin:" + String(req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "local").split(",")[0].trim().slice(0, 45).replace(/[^0-9a-zA-Z:.]/g, "_");
const hash32 = (str: string) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
const handle = async (req: Request) => {
  const { pathname: p } = new URL(req.url);
  const post = req.method === "POST";

  /* ----- นักกีฬา: ล็อกอิน ----- */
  if (p === "/api/login" && post) {
    if (!hasSecret()) return json({ error: "ระบบยังไม่พร้อม โค้ชต้องตั้ง ADMIN_PASSWORD ใน Netlify" }, 500);
    const b = await readJson(req);
    const email = String(b.email ?? "").trim().toLowerCase();
    const a = (await getAthletes()).find((x) => x.email === email);
    await sleep(400); // หน่วงเล็กน้อยกันการเดารหัส
    if (a) { const m = await lockedMinutes(a.id); if (m) return json({ error: `ใส่รหัสผิดหลายครั้ง กรุณารอ ${m} นาทีแล้วลองใหม่` }, 429); }
    if (!a || !checkPw(String(b.password ?? ""), a)) { if (a) await addFail(a.id); return json({ error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" }, 401); }
    await clearFail(a.id);
    return json({ token: signToken(a.id), name: a.name });
  }

  /* ----- นักกีฬานอก: สมัครเอง (หน้า Join Us) -> สร้างบัญชี เพซ และตารางซ้อมให้ทันที ----- */
  if (p === "/api/register" && post) {
    if (!hasSecret()) return json({ error: "ระบบยังไม่พร้อม โค้ชต้องตั้ง ADMIN_PASSWORD ใน Netlify" }, 500);
    if (process.env.EXTERNAL_SIGNUP === "off") return json({ error: "ขณะนี้ปิดรับสมัครนักกีฬานอก" }, 403);
    const rk = "reg" + adminKey(req).slice(5); // จำกัดจำนวนครั้งที่สมัครต่อ IP (ครบ 8 ครั้งพัก 15 นาที)
    const lock = await lockedMinutes(rk);
    if (lock) return json({ error: `สมัครถี่เกินไป กรุณารอ ${lock} นาทีแล้วลองใหม่` }, 429);
    const b = await readJson(req);
    const email = String(b.email ?? "").trim().toLowerCase().slice(0, 120);
    const password = String(b.password ?? "");
    const nickname = String(b.nickname ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
    const pb5k = String(b.pb5k ?? "").trim();
    if (!EMAIL_RE.test(email)) return json({ error: "อีเมลไม่ถูกต้อง" }, 400);
    if (password.length < 8 || password.length > 100) return json({ error: "รหัสผ่านต้องมีอย่างน้อย 8 ตัว" }, 400);
    if (!nickname) return json({ error: "กรอกชื่อเล่น" }, 400);
    if (!/^\d{1,2}(:\d{2}){1,2}$/.test(pb5k)) return json({ error: "กรอกเวลา PB 5K เป็น นาที:วินาที เช่น 25:30" }, 400);
    const secs = pb5k.split(":").map(Number); if (secs.length === 2 && secs[1] > 59 || secs.length === 3 && (secs[1] > 59 || secs[2] > 59)) return json({ error: "วินาทีและนาทีต้องไม่เกิน 59" }, 400);
    await addFail(rk); // นับเฉพาะครั้งที่กรอกข้อมูลถูกรูปแบบแล้ว (พิมพ์ผิดแก้ซ้ำได้ไม่โดนพัก)
    const list = await getAthletes();
    if (list.some((x) => x.email === email)) return json({ error: "อีเมลนี้สมัครไว้แล้ว ลองเข้าสู่ระบบแทน" }, 409);
    const g = generateForPb5k(pb5k, thaiToday());
    if ("error" in g) return json({ error: g.error }, 400);
    const id = randomUUID();
    await setPlan(id, g.plan);
    await setPaces(id, g.paces);
    const pf = cleanProfile({ pr: { k5: pb5k }, goal: g.ext.predictedHalf });
    if (pf) await setProfile(id, pf);
    list.push({ id, name: nickname, email, ...hashPw(password), ext: g.ext });
    await setAthletes(list); // บันทึกบัญชีเป็นขั้นสุดท้าย ถ้าขั้นก่อนหน้าพังจะไม่เหลือบัญชีที่ไม่มีแผน
    return json({ token: signToken(id), name: nickname, goal: EXT_GOAL.event, eventDate: EXT_GOAL.eventDate, predictedHalf: g.ext.predictedHalf, predictedPace: g.ext.predictedPace, planLabel: g.ext.planLabel });
  }

  /* ----- นักกีฬา: ดูแผนและติ๊กทำแล้ว ----- */
  if (p === "/api/plan" || p === "/api/done" || p === "/api/profile" || p === "/api/link" || p === "/api/feed" || p === "/api/avatar") {
    const id = readToken(req.headers.get("authorization"));
    const a = id ? (await getAthletes()).find((x) => x.id === id) : null;
    if (!a) return json({ error: "เซสชันหมดอายุ" }, 401);

    // ดึงตัวเลขจากลิงก์แชร์ COROS (ใช้แล้วทิ้ง ไม่เก็บลิงก์ ไม่เก็บชื่อ/รูปในหน้านั้น)
    if (p === "/api/link" && post) {
      const b = await readJson(req);
      try {
        const res = await resolveCoros(String(b.url ?? ""), async (u) => {
          const r = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { accept: "text/html", "accept-language": "en", "user-agent": "Mozilla/5.0 (compatible; K4RC-Training/1.0)" } });
          return { status: r.status, location: r.headers.get("location"), text: () => r.text() };
        });
        if (!res.html) return json({ error: res.error || "เปิดลิงก์ไม่ได้" }, res.error?.startsWith("ลิงก์ต้องเป็น") ? 400 : 502);
        const s = parseCorosShare(res.html);
        if (!s) return json({ error: "อ่านตัวเลขจากลิงก์นี้ไม่ได้ ลองกรอกเอง" }, 422);
        let img = "";
        for (const u of corosImageCandidates(res.html)) {
          img = await fetchRouteImage(u, async (url) => { const r = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(6000), headers: { accept: "image/*" } }); return { ok: r.ok, type: r.headers.get("content-type") || "", bytes: async () => new Uint8Array(await r.arrayBuffer()) }; });
          if (img) break;
        }
        return json({ ...s, img });
      } catch {
        return json({ error: "เชื่อมต่อ COROS ไม่สำเร็จ ลองใหม่หรือกรอกเอง" }, 502);
      }
    }

    if (p === "/api/plan" && req.method === "GET") {
      // อ่านทุกก้อนพร้อมกัน (เดิมรอทีละก้อน ~10 รอบ) เวลาที่ฟังก์ชันรอฐานข้อมูลคือเวลาที่ Netlify คิดเครดิตคอมพิวต์
      const [plan, done, skip, paces, feedback, messages, profile, avatar] = await Promise.all([getPlan(a.id), getDone(a.id), getSkip(a.id), getPaces(a.id), getFeedback(a.id), getMessages(a.id), getProfile(a.id), getAvatar(a.id), touchSeen(a.id)]);
      return json({ name: a.name, plan, done, skip, paces, feedback, messages, profile, avatar });
    }

    /* ----- ฟีดทีม: ผลซ้อมของทุกคนใน 24 ชม. ล่าสุด ----- */
    if (p === "/api/feed" && req.method === "GET") {
      const now = Date.now();
      const posts = (await getFeed()).filter((x) => now - Date.parse(x.at) < FEED_MS).sort((x, y) => y.at.localeCompare(x.at));
      const have = new Map<string, string>(); for (const part of String(new URL(req.url).searchParams.get("av") ?? "").split(",")) { const [k, v] = part.split(":"); if (k && v) have.set(k, v); }
      const avatars: Record<string, string> = {}, avh: Record<string, string> = {};
      await Promise.all([...new Set(posts.map((x) => x.aid))].map(async (id) => { let h = await getAvatarHash(id), img = ""; if (!h) { img = await getAvatar(id); if (!img) return; h = hash32(img); await setAvatarHash(id, h); /* ข้อมูลเก่าก่อนมีแฮช: ซ่อมครั้งเดียว */ } avh[id] = h; if (have.get(id) !== h) { img = img || await getAvatar(id); if (img) avatars[id] = img; } })); // ส่งเฉพาะรูปที่เครื่องยังไม่มี/เปลี่ยนแล้ว
      return json({ posts: posts.map((x) => ({ ...x, me: x.aid === a.id })), avatars, avh });
    }
    if (p === "/api/avatar" && post) {
      const b = await readJson(req);
      const img = cleanAvatar(b.img);
      if (b.img && !img) return json({ error: "รูปไม่ถูกต้องหรือใหญ่เกินไป" }, 400);
      if (img) { await setAvatar(a.id, img); await setAvatarHash(a.id, hash32(img)); } else await deleteAvatar(a.id);
      return json({ ok: true });
    }
    if (p === "/api/profile" && post) {
      const b = await readJson(req);
      const pr = cleanProfile(b);
      pr ? await setProfile(a.id, pr) : await deleteProfile(a.id);
      if (pr?.feedOff) await dropPosts((x) => x.aid === a.id); // ปิดการแสดงในฟีด: เอาโพสต์ที่ค้างอยู่ออกด้วย
      return json({ ok: true, profile: pr });
    }
    if (p === "/api/done" && post) {
      const b = await readJson(req);
      const wid = String(b.workoutId ?? "").slice(0, 60);
      const plan = await getPlan(a.id);
      if (!plan?.weeks.some((w) => w.days.some((d) => d.workouts.some((x) => x.id === wid)))) return json({ error: "ไม่พบเวิร์คเอาต์" }, 404);
      // ข้ามวันนี้: body = { workoutId, skip: true|false } (ไม่มีคีย์ done) ถ้าเวิร์คเอาต์นั้นทำแล้ว จะไม่ตั้งข้าม
      if ("skip" in b && !("done" in b)) {
        const sk = await getSkip(a.id);
        if (b.skip === true && !(await getDone(a.id))[wid]) sk[wid] = 1; else delete sk[wid];
        await setSkip(a.id, sk);
        return json({ ok: true, skip: !!sk[wid] });
      }
      const done = await getDone(a.id), fb = await getFeedback(a.id);
      if (b.done) {
        done[wid] = 1;
        const sk = await getSkip(a.id); if (sk[wid]) { delete sk[wid]; await setSkip(a.id, sk); } // ทำเสร็จแล้ว = เลิกข้าม
        if ("fb" in b) { const old = fb[wid], f = cleanFeedback(b.fb); if (f && old?.at) f.at = old.at; /* แก้ทีหลังไม่ต่ออายุโพสต์ */ f ? (fb[wid] = f) : delete fb[wid]; }
      } else { delete done[wid]; delete fb[wid]; }
      await setDone(a.id, done); await setFeedback(a.id, fb);

      // ฟีดทีม: มี RPE = ขึ้นโพสต์ (อายุ 24 ชม. นับจากตอนบันทึก) ยกเลิก/ไม่มี RPE/ปิดการแสดง = เอาออก
      const f = fb[wid], pid = `${a.id}:${wid}`;
      if (b.done && f && f.rpe > 0 && !(await getProfile(a.id))?.feedOff) {
        const day = plan.weeks.flatMap((w) => w.days).find((d) => d.workouts.some((x) => x.id === wid))!, x = day.workouts.find((y) => y.id === wid)!;
        const r2 = (v: number) => Math.round(v * 100) / 100;
        await putPost({ id: pid, aid: a.id, name: a.name, sport: x.sport, title: x.name, km: r2(f.km || x.distanceMeters / 1000), min: r2(f.min || x.durationMinutes), rpe: f.rpe, feel: f.feel, at: f.at, date: day.date });
      } else await dropPosts((x) => x.id === pid);
      return json({ ok: true, feedback: fb[wid] ?? null });
    }
  }

  /* ----- โค้ช ----- */
  if (p === "/api/admin" && post) {
    const pw = process.env.ADMIN_PASSWORD, ak = adminKey(req);
    if (pw) { const m = await lockedMinutes(ak); if (m) return json({ error: `ใส่รหัสผิดหลายครั้ง กรุณารอ ${m} นาทีแล้วลองใหม่` }, 429); }
    if (!pw || !samePw(req.headers.get("x-admin-password") ?? "", pw)) { await sleep(400); if (pw) await addFail(ak); return json({ error: "รหัสผ่านไม่ถูกต้อง" }, 401); }

    const b = await readJson(req);
    const list = await getAthletes();
    const target = list.find((x) => x.id === b.id);
    const need = () => (target ? null : json({ error: "ไม่พบนักกีฬา" }, 404));

    switch (b.action) {
      case "athletes": {
        const out = await Promise.all(list.map(async (a) => {
          const plan = await getPlan(a.id), done = await getDone(a.id), paces = await getPaces(a.id);
          const ids = (plan?.weeks ?? []).flatMap((w) => w.days.flatMap((d) => d.workouts)).filter((x) => x.sport !== "rest").map((x) => x.id);
          return { id: a.id, name: a.name, email: a.email, external: !!a.ext, ext: a.ext ?? null, hasPassword: !!a.hash, event: plan?.meta.event ?? "", total: ids.length, done: ids.filter((i) => done[i]).length, paces, messages: (await getMessages(a.id)).slice(-5).reverse(), profile: await getProfile(a.id) };
        }));
        return json({ athletes: out });
      }

      /* ----- ภาพรวมของโค้ช: ความคืบหน้าสัปดาห์นี้ ความรู้สึกล่าสุด ใครไม่เข้าแอป ----- */
      case "dashboard": {
        const today = thaiToday(), wk0 = mondayOf(today), prev0 = addDays(wk0, -7);
        const thaiDay = (iso: string) => new Date(Date.parse(iso) + 7 * 3600e3).toISOString().slice(0, 10);
        const train = (w?: Week) => (w?.days ?? []).flatMap((d) => d.workouts.filter((x) => x.sport !== "rest").map((x) => ({ x, date: d.date })));
        const feed: any[] = [];
        const rows = await Promise.all(list.map(async (a) => {
          const [plan, done, fb, seen] = await Promise.all([getPlan(a.id), getDone(a.id), getFeedback(a.id), getSeen(a.id)]);
          const wk = plan?.weeks.find((w) => w.startDate === wk0), pw = plan?.weeks.find((w) => w.startDate === prev0);
          const cur = train(wk), prv = train(pw), km = (l: { x: { distanceMeters: number } }[]) => l.reduce((s, o) => s + o.x.distanceMeters, 0) / 1000;
          const idx = new Map<string, { x: any; date: string }>();
          plan?.weeks.forEach((w) => w.days.forEach((d) => d.workouts.forEach((x) => idx.set(x.id, { x, date: d.date }))));
          const recent = Object.entries(fb).map(([id, f]) => ({ ...f, o: idx.get(id) })).filter((r) => r.o)
            .map((r) => ({ workout: r.o!.x.name, sport: r.o!.x.sport, date: r.o!.date, rpe: r.rpe, feel: r.feel, pain: r.pain, note: r.note, at: r.at, athlete: a.name, athleteId: a.id }))
            .sort((p, q) => q.at.localeCompare(p.at));
          const week7 = recent.filter((r) => Date.now() - Date.parse(r.at) < 7 * 864e5);
          feed.push(...recent.slice(0, 15));
          return {
            id: a.id, name: a.name, external: !!a.ext, ext: a.ext ?? null, hasPlan: !!plan, hasWeek: !!wk, weekNumber: wk?.weekNumber ?? 0, weeks: plan?.weeks.length ?? 0, phase: wk?.phase ?? "",
            n: cur.length, doneN: cur.filter((o) => done[o.x.id]).length, planKm: km(cur), doneKm: km(cur.filter((o) => done[o.x.id])),
            missed: cur.filter((o) => o.date < today && !done[o.x.id]).length, prevN: prv.length, prevDone: prv.filter((o) => done[o.x.id]).length,
            dueN: cur.filter((o) => o.date <= today).length, dueDone: cur.filter((o) => o.date <= today && done[o.x.id]).length,
            days: Array.from({ length: 7 }, (_, i) => {
              const date = addDays(wk0, i), ws = wk?.days[i]?.workouts ?? [], tr = ws.filter((x) => x.sport !== "rest");
              if (!wk) return "none";
              if (!tr.length) return ws.length ? "rest" : "none";
              if (tr.every((x) => done[x.id])) return "done";
              return date < today ? "missed" : date === today ? "today" : "planned";
            }),
            history: Array.from({ length: 8 }, (_, k) => {
              const ws = addDays(wk0, -7 * (7 - k)), t = train(plan?.weeks.find((w) => w.startDate === ws));
              return { week: ws, n: t.length, done: t.filter((o) => done[o.x.id]).length };
            }),
            lastSeen: seen || null, daysSince: seen ? Math.round((Date.parse(today + "T00:00:00Z") - Date.parse(thaiDay(seen) + "T00:00:00Z")) / 864e5) : null,
            pain: week7.some((r) => r.pain), lowFeel: week7.some((r) => r.feel > 0 && r.feel <= 2), highRpe: week7.some((r) => r.rpe >= 9), latest: recent[0] ?? null,
          };
        }));
        feed.sort((p, q) => q.at.localeCompare(p.at));
        return json({ today, week: wk0, athletes: rows, feed: feed.slice(0, 25) });
      }

      case "saveAthlete": {
        const name = String(b.name ?? "").trim().slice(0, 60);
        const email = String(b.email ?? "").trim().toLowerCase().slice(0, 120);
        const password = String(b.password ?? "");
        if (!name) return json({ error: "กรอกชื่อนักกีฬา" }, 400);
        if (!EMAIL_RE.test(email)) return json({ error: "อีเมลไม่ถูกต้อง" }, 400);
        if (list.some((x) => x.email === email && x.id !== b.id)) return json({ error: "อีเมลนี้มีอยู่แล้ว" }, 400);
        if (password && password.length < 6) return json({ error: "รหัสผ่านต้องมีอย่างน้อย 6 ตัว" }, 400);
        if (target) {
          Object.assign(target, { name, email }, password ? hashPw(password) : {});
        } else {
          if (!password) return json({ error: "ตั้งรหัสผ่านให้นักกีฬา (อย่างน้อย 6 ตัว)" }, 400);
          list.push({ id: crypto.randomUUID(), name, email, ...hashPw(password) } as Athlete);
        }
        await setAthletes(list);
        return json({ ok: true });
      }

      case "deleteAthlete": {
        const bad = need(); if (bad) return bad;
        await setAthletes(list.filter((x) => x.id !== b.id));
        await deletePlan(b.id);
        await deletePaces(b.id);
        await deleteSeen(b.id);
        await deleteMessages(b.id);
        await deleteProfile(b.id);
        await deleteAvatar(b.id);
        await dropPosts((x) => x.aid === b.id);
        return json({ ok: true });
      }

      case "getPlan": {
        const bad = need(); if (bad) return bad;
        return json({ plan: await getPlan(b.id), done: await getDone(b.id), feedback: await getFeedback(b.id) });
      }

      case "importPlan": {
        const bad = need(); if (bad) return bad;
        const plan = cleanPlan(b.plan);
        if (!plan) return json({ error: "ไม่พบข้อมูลสัปดาห์ในไฟล์" }, 400);
        await setPlan(b.id, plan);
        return json({ plan });
      }

      case "savePlanMeta": {
        const bad = need(); if (bad) return bad;
        const plan = await getPlan(b.id);
        if (!plan) return json({ error: "ยังไม่มีแผน เพิ่มสัปดาห์แรกก่อน" }, 400);
        const next = finishPlan(plan.weeks, b.event, b.eventDate)!;
        await setPlan(b.id, next);
        return json({ plan: next });
      }

      case "saveWeek": {
        const bad = need(); if (bad) return bad;
        const wk = cleanWeek({ ...b.week, startDate: mondayOf(validDate(b.week?.startDate) ? b.week.startDate : thaiToday()) });
        if (!wk) return json({ error: "ข้อมูลสัปดาห์ไม่ถูกต้อง" }, 400);
        const old = await getPlan(b.id);
        const weeks = (old?.weeks ?? []).filter((w) => w.startDate !== wk.startDate).concat(wk);
        const next = applyCalc(finishPlan(weeks, old?.meta.event ?? "", old?.meta.eventDate ?? "")!, await getPaces(b.id));
        await setPlan(b.id, next);
        return json({ plan: next });
      }

      /* ----- เพซของนักกีฬา (E, LT1, LT2, Marathon, 5K, VO2Max, R) ----- */
      case "savePaces": {
        const bad = need(); if (bad) return bad;
        const paces = cleanPaces(b);
        if (paces) await setPaces(b.id, paces); else await deletePaces(b.id);
        const pl = await getPlan(b.id); // เพซเปลี่ยน: คำนวณเวลา/ระยะของเวิร์คเอาต์แบบมีโครงสร้างใหม่
        if (pl) await setPlan(b.id, applyCalc(pl, paces));
        return json({ paces });
      }

      case "deletePlan": {
        const bad = need(); if (bad) return bad;
        await deletePlan(b.id);
        return json({ ok: true });
      }


      /* ----- ข้อความจากโค้ชถึงนักกีฬา (แสดงที่ปุ่มข้อความบนหน้าแรกของนักกีฬา) ----- */
      case "sendMessage": {
        const bad = need(); if (bad) return bad;
        const text = String(b.text ?? "").trim().slice(0, 500);
        if (!text) return json({ error: "พิมพ์ข้อความก่อนส่ง" }, 400);
        const msgs = await getMessages(b.id);
        msgs.push({ id: crypto.randomUUID(), text, at: new Date().toISOString() });
        await setMessages(b.id, msgs);
        return json({ ok: true, messages: (await getMessages(b.id)).slice(-5).reverse() });
      }
      case "deleteMessage": {
        const bad = need(); if (bad) return bad;
        const msgs = (await getMessages(b.id)).filter((m) => m.id !== b.mid);
        await setMessages(b.id, msgs);
        return json({ ok: true, messages: msgs.slice(-5).reverse() });
      }

      /* ----- ส่งแผนของคนหนึ่งให้นักกีฬาคนอื่น ----- */
      case "sharePlan": {
        const bad = need(); if (bad) return bad; // b.id = ต้นทาง
        const src = await getPlan(b.id);
        if (!src) return json({ error: "คนนี้ยังไม่มีแผนให้ส่งต่อ" }, 400);
        const ids: string[] = (Array.isArray(b.targets) ? b.targets : []).map(String).filter((t: string) => t !== b.id);
        const targets = list.filter((x) => ids.includes(x.id));
        if (!targets.length) return json({ error: "เลือกนักกีฬาที่จะส่งแผนให้อย่างน้อย 1 คน" }, 400);

        let toCopy = src.weeks, offset = 0, event = src.meta.event, eventDate = src.meta.eventDate;
        if (b.scope === "week") {
          const wk = src.weeks.find((w) => w.startDate === b.week);
          if (!wk) return json({ error: "สัปดาห์ที่เลือกยังไม่มีตาราง" }, 400);
          toCopy = [wk];
          if (validDate(b.toWeek)) offset = daysBetween(wk.startDate, mondayOf(b.toWeek));
        } else if (validDate(b.startDate)) {
          offset = daysBetween(src.weeks[0].startDate, mondayOf(b.startDate));
          if (validDate(eventDate)) eventDate = addDays(eventDate, offset);
        }

        for (const t of targets) {
          const copy = cloneWeeks(toCopy, offset);
          if (b.scope === "week") {
            // แทนที่เฉพาะสัปดาห์นั้นในแผนของปลายทาง ที่เหลือคงเดิม
            const old = await getPlan(t.id);
            const keep = (old?.weeks ?? []).filter((w) => !copy.some((c) => c.startDate === w.startDate));
            await setPlan(t.id, applyCalc(finishPlan([...keep, ...copy], old?.meta.event ?? event, old?.meta.eventDate ?? eventDate)!, await getPaces(t.id)));
          } else {
            await setPlan(t.id, applyCalc(finishPlan(copy, event, eventDate)!, await getPaces(t.id)));
            await setDone(t.id, {}); await setSkip(t.id, {}); // แผนใหม่ทั้งชุด ล้างประวัติติ๊ก/ข้ามเดิมของคนนั้น
          }
        }
        return json({ ok: true, count: targets.length, names: targets.map((x) => x.name) });
      }

      /* ----- Backup: ส่งออกข้อมูลทั้งระบบ ----- */
      case "exportAll": {
        const withLogins = b.withLogins !== false;
        const athletes = await Promise.all(list.map(async (a) => ({
          id: a.id, name: a.name, email: a.email, ...(a.ext ? { ext: a.ext } : {}),
          ...(withLogins && a.salt && a.hash ? { salt: a.salt, hash: a.hash } : {}),
          plan: await getPlan(a.id), done: await getDone(a.id), skip: await getSkip(a.id), paces: await getPaces(a.id), feedback: await getFeedback(a.id), messages: await getMessages(a.id),
        })));
        return json({ backup: { app: "k4rc-training-plan", kind: "full-backup", version: 1, exportedAt: new Date().toISOString(), withLogins, athletes } });
      }

      /* ----- Backup: กู้คืน (เพิ่ม/อัปเดตตามรหัสนักกีฬา ไม่ลบคนที่ไม่อยู่ในไฟล์) ----- */
      case "restoreAll": {
        const bk = b.backup;
        if (bk?.app !== "k4rc-training-plan" || !Array.isArray(bk.athletes)) return json({ error: "ไม่ใช่ไฟล์ backup ของ K4RC Training Plan" }, 400);
        const hex = /^[0-9a-f]{16,200}$/;
        let added = 0, updated = 0, skipped = 0, plans = 0;
        for (const r of bk.athletes.slice(0, 200)) {
          const id = String(r?.id ?? "").slice(0, 60), name = String(r?.name ?? "").trim().slice(0, 60);
          const email = String(r?.email ?? "").trim().toLowerCase().slice(0, 120);
          if (!id || !name || !EMAIL_RE.test(email)) { skipped++; continue; }
          if (list.some((x) => x.email === email && x.id !== id)) { skipped++; continue; } // อีเมลชนกับคนอื่น
          const login = hex.test(String(r.salt)) && hex.test(String(r.hash)) ? { salt: String(r.salt), hash: String(r.hash) } : {};
          const exist = list.find((x) => x.id === id);
          const ext = cleanExt(r.ext);
          if (exist) { Object.assign(exist, { name, email }, login, ext ? { ext } : {}); updated++; }
          else { list.push({ id, name, email, ...login, ...(ext ? { ext } : {}) } as Athlete); added++; }
          const pc = cleanPaces(r.paces);
          if (pc) await setPaces(id, pc);
          const plan = cleanPlan(r.plan);
          if (plan) {
            await setPlan(id, plan); plans++;
            const done: Record<string, 1> = {};
            for (const k of Object.keys(r.done ?? {})) if (r.done[k]) done[k.slice(0, 60)] = 1;
            await setDone(id, done);
            const sk: Record<string, 1> = {};
            for (const k of Object.keys(r.skip ?? {})) if (r.skip[k] && !done[k.slice(0, 60)]) sk[k.slice(0, 60)] = 1;
            await setSkip(id, sk);
            const fb: Record<string, any> = {};
            for (const k of Object.keys(r.feedback ?? {}).slice(0, 2000)) { const f = cleanFeedback(r.feedback[k], true); if (f) fb[k.slice(0, 60)] = f; }
            await setFeedback(id, fb);
          }
          const ms = cleanMessages(r.messages);
          if (ms.length) await setMessages(id, ms);
        }
        await setAthletes(list);
        return json({ ok: true, added, updated, skipped, plans });
      }

      case "send": {
        const bad = need(); if (bad) return bad;
        const r = await sendPlanEmail(target!, mondayOf(validDate(b.week) ? b.week : thaiToday()));
        return r.ok ? json({ ok: true }) : json({ error: r.error }, 400);
      }
    }
    return json({ error: "คำสั่งไม่ถูกต้อง" }, 400);
  }

  return json({ error: "not found" }, 404);
};

// ครอบทั้งหมด: ฐานข้อมูลล่ม/หมดเวลา → ตอบ 503 พร้อมข้อความที่อ่านรู้เรื่อง แทนหน้า error ดิบ
// อ่าน body JSON ให้ได้ object เสมอ (JSON พัง, null, ตัวเลข, สตริง, อาร์เรย์ = {}) กันโค้ดข้างล่างอ่าน b.xxx แล้ว error เป็น 5xx
const readJson = async (req: Request): Promise<any> => { const b = await req.json().catch(() => null); return b && typeof b === "object" && !Array.isArray(b) ? b : {}; };

export default async (req: Request) => {
  try { return await handle(req); }
  catch (e) {
    console.error("api error", e);
    const m = String((e as Error)?.message ?? "");
    return json({ error: /Supabase/i.test(m) ? "ฐานข้อมูลไม่ตอบสนอง ลองใหม่อีกครั้งในอีกสักครู่" : "เกิดข้อผิดพลาดที่เซิร์ฟเวอร์ ลองใหม่อีกครั้ง" }, 503);
  }
};

export const config: Config = { path: ["/api/login", "/api/register", "/api/plan", "/api/done", "/api/link", "/api/feed", "/api/avatar", "/api/admin"] };
