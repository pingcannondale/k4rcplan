/* ตัวช่วยคำนวณเพซแนะนำจากเวลาแข่ง (ใช้ในหน้าโค้ชเท่านั้น)
   ใช้สมการ VDOT ของ Jack Daniels แล้วแปลงเป็น 7 เพซของแอปนี้ ผลลัพธ์เป็นค่าประมาณให้โค้ชปรับต่อเอง */
const Vdot = (() => {
  const vo2 = (v) => -4.6 + 0.182258 * v + 0.000104 * v * v;                                   // v = เมตร/นาที
  const frac = (t) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t); // t = นาที
  const fromRace = (meters, min) => vo2(meters / min) / frac(min);
  const velAt = (vo) => (-0.182258 + Math.sqrt(0.182258 ** 2 + 4 * 0.000104 * (4.6 + vo))) / (2 * 0.000104);
  const secPerKm = (v) => 60000 / v;
  function raceMin(V, meters) { // เวลาแข่ง (นาที) ที่ให้ VDOT เท่ากับ V (bisection)
    let lo = meters / 700, hi = meters / 40;
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; fromRace(meters, mid) > V ? (lo = mid) : (hi = mid); }
    return (lo + hi) / 2;
  }
  const mmss = (sec) => { sec = Math.round(sec); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };
  const range = (a, b) => `${mmss(a)}-${mmss(b)}`;
  // "23:20" หรือ "1:35:10" -> นาที  (ไม่ถูกต้อง -> null)
  function parseTime(t) {
    const p = String(t || "").trim().split(":").map(Number);
    if (p.some((n) => !Number.isFinite(n) || n < 0) || p.length < 2 || p.length > 3) return null;
    const min = p.length === 3 ? p[0] * 60 + p[1] + p[2] / 60 : p[0] + p[1] / 60;
    return min > 0 ? min : null;
  }
  const DIST = { "5k": 5000, "10k": 10000, half: 21097.5, full: 42195 };
  // ช่วงเปอร์เซ็นต์ของ VO2max ที่ใช้กำหนดแต่ละเพซ (ปรับให้ใกล้กับชุดเพซที่โค้ชใช้อยู่)
  const PCT = { eLow: 0.52, eHigh: 0.62, easyHigh: 0.70, lt2: 0.88, vo2max: 0.975, r: 1.045 };
  function suggest(distKey, timeStr) {
    const meters = DIST[distKey], min = parseTime(timeStr);
    if (!meters || !min) return { error: "กรอกเวลาเป็น นาที:วินาที เช่น 23:20 หรือ ชั่วโมง:นาที:วินาที เช่น 1:35:10" };
    const V = fromRace(meters, min);
    if (V < 20 || V > 85) return { error: "เวลานี้อยู่นอกช่วงที่สูตรรองรับ ตรวจสอบเวลาและระยะอีกครั้ง" };
    const at = (p) => secPerKm(velAt(V * p));
    return {
      vdot: V,
      values: {
        e: range(at(PCT.eHigh), at(PCT.eLow)),                         // Recovery (เขียนเร็ว-ช้า เหมือนที่โค้ชกรอก)
        lt1: range(at(PCT.easyHigh), at(PCT.eHigh)),                   // LT1 (Easy)
        lt2: mmss(at(PCT.lt2)),                                         // LT2 (Threshold)
        marathon: mmss((raceMin(V, 42195) * 60) / 42.195),
        k5: mmss((raceMin(V, 5000) * 60) / 5),
        vo2max: mmss(at(PCT.vo2max)),
        r: mmss(at(PCT.r)),
      },
    };
  }
  // ทำนายเวลาแข่งระยะอื่นจากเวลาที่ทำได้จริง (ใช้กับหน้าสมัครนักกีฬานอก: PB 5K -> ฮาล์ฟมาราธอน)
  function predict(distKey, timeStr, targetKey) {
    const meters = DIST[distKey], min = parseTime(timeStr), tm = DIST[targetKey];
    if (!meters || !min || !tm) return null;
    const V = fromRace(meters, min);
    if (V < 20 || V > 85) return null;
    const tmin = raceMin(V, tm);
    return { vdot: V, min: tmin, secPerKm: (tmin * 60) / (tm / 1000) };
  }
  return { fromRace, suggest, predict, parseTime, DIST };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Vdot;
