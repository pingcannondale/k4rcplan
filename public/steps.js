/* คำนวณโครงสร้างการซ้อม (วอร์มอัพ / อินเทอร์วัล / คูลดาวน์) จากเพซ
   ไฟล์นี้ใช้ร่วมกันทั้งในเบราว์เซอร์ (ตัวแปร Steps) และฝั่งเซิร์ฟเวอร์ (import) */
const Steps = (() => {
  const REFS = ["e", "lt1", "lt2", "marathon", "k5", "vo2max", "r"];
  const REF_LABEL = { e: "Recovery", lt1: "LT1 (Easy)", lt2: "LT2 (Threshold)", marathon: "Marathon", k5: "5K Pace", vo2max: "VO2Max", r: "R Pace" };
  const U = { km: { by: "dist", f: 1000, label: "กม." }, m: { by: "dist", f: 1, label: "ม." }, min: { by: "time", f: 60, label: "นาที" }, s: { by: "time", f: 1, label: "วินาที" } };
  const T = { warmup: "วอร์มอัพ", steady: "วิ่งต่อเนื่อง", cooldown: "คูลดาวน์", repeat: "อินเทอร์วัล", work: "ช่วงเร็ว", rest: "พัก" };

  // "5:30" -> 330 วินาที/กม.  "5:15-5:45" -> ค่ากลาง 330  อย่างอื่น -> null
  function parsePace(t) {
    const m = String(t || "").replace(/[–—~]/g, "-").match(/(\d{1,2}):(\d{2})(?:\s*-\s*(\d{1,2}):(\d{2}))?/);
    if (!m) return null;
    const a = +m[1] * 60 + +m[2];
    return m[3] === undefined ? a : (a + +m[3] * 60 + +m[4]) / 2;
  }
  // p เป็นชื่อเพซ (e, lt1, ...) จะอ่านค่าจากเพซของนักกีฬา ถ้าไม่ใช่จะอ่านเป็นตัวเลขที่พิมพ์เอง เช่น "4:20"
  const paceSec = (p, paces) => parsePace(REFS.includes(p) ? paces?.values?.[p] : p);

  function seg(st, type, paces) {
    const u = U[st?.u] || U.km, x = Math.max(0, +st?.x || 0), ps = paceSec(st?.p, paces);
    let sec = null, m = null;
    if (u.by === "dist") { m = x * u.f; if (ps) sec = (m / 1000) * ps; }
    else { sec = x * u.f; if (ps) m = (sec / ps) * 1000; }
    return { type, sec, m, ps, ref: REFS.includes(st?.p) ? st.p : "", ok: x > 0 && !!ps };
  }
  function flatten(steps, paces) {
    const out = [];
    for (const it of steps || []) {
      if (it?.t === "repeat") {
        const n = Math.max(1, Math.min(50, Math.round(+it.n) || 1));
        for (let i = 0; i < n; i++) {
          out.push({ ...seg(it.work, "work", paces), rep: i + 1, of: n });
          if (it.rest && +it.rest.x > 0 && i < n - 1) out.push({ ...seg(it.rest, "rest", paces), rep: i + 1, of: n }); // พักระหว่างรอบ
        }
      } else out.push(seg(it, it?.t, paces));
    }
    return out;
  }
  function calc(steps, paces) {
    const segs = flatten(steps, paces);
    const sec = segs.reduce((a, s) => a + (s.sec || 0), 0), m = segs.reduce((a, s) => a + (s.m || 0), 0);
    const used = (steps || []).flatMap((it) => (it?.t === "repeat" ? [it.work?.p, it.rest?.p] : [it?.p]));
    const missing = [...new Set(used.filter((p) => REFS.includes(p) && !parsePace(paces?.values?.[p])))];
    return { segs, ok: segs.length > 0 && segs.every((s) => s.ok), sec, m, minutes: Math.round(sec / 60), meters: Math.round(m), missing };
  }

  const amount = (st) => `${+st?.x || 0} ${(U[st?.u] || U.km).label}`;
  const paceLabel = (p, paces) => (REFS.includes(p) ? REF_LABEL[p] + (paces?.values?.[p] ? ` ${paces.values[p]}` : "") : p ? `${p} /กม.` : "ยังไม่ระบุเพซ");
  const lineOf = (st, paces, name) => `${name ? name + " " : ""}${amount(st)} @ ${paceLabel(st?.p, paces)}`;
  // ข้อความสรุปทีละบรรทัด ใช้ในอีเมลและอ่านออกเสียงแทนกราฟ
  function text(steps, paces) {
    return (steps || []).map((it) =>
      it?.t === "repeat"
        ? `${it.n} × ${lineOf(it.work, paces)}${it.rest && +it.rest.x > 0 ? `, พัก ${lineOf(it.rest, paces)}` : ""}`
        : lineOf(it, paces, T[it?.t] || T.steady)).join("\n");
  }
  function clock(sec) {
    sec = Math.round(sec || 0);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60, p = (n) => String(n).padStart(2, "0");
    return h ? `${h}:${p(m)}:${p(s)}` : `${m}:${p(s)}`;
  }
  // รายการท่าสเตรงท์: { n: ชื่อท่า, s: เซต, r: จำนวนครั้ง/เวลา, w: น้ำหนักหรือหมายเหตุ }
  const exAmount = (e) => (e?.s && e?.r ? `${e.s} × ${e.r}` : e?.r ? String(e.r) : e?.s ? `${e.s} เซต` : "");
  const exText = (list) => (list || []).map((e) => `${e.n}${exAmount(e) ? " " + exAmount(e) : ""}${e.w ? ` (${e.w})` : ""}`).join("\n");
  return { REFS, REF_LABEL, U, T, exAmount, exText, parsePace, paceSec, calc, flatten, text, amount, paceLabel, lineOf, clock };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Steps;
