/* สถิติฝั่งนักกีฬา: โหลดการซ้อม, Fitness / Fatigue / Form และกราฟ SVG (ไม่ใช้ไลบรารีภายนอก)
   โหลดต่อเวิร์คเอาต์ = เวลา(นาที) x ความเหนื่อย(RPE) / 4  (วิธี session-RPE ปรับสเกลให้ใกล้ TSS) เป็นค่าประมาณ ไม่ใช่ TSS จริง */
const Perf = (() => {
  const LOAD_SCALE = 4, CTL_DAYS = 42, ATL_DAYS = 7;
  const ymd = (d) => d.toISOString().slice(0, 10);
  const add = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };

  // minutes: เวลาของเวิร์คเอาต์, rpe: ความเหนื่อยที่นักกีฬาให้ (ถ้าไม่ให้ ใช้ค่าในแผน ถ้าไม่มีอีก ใช้ 5)
  const workoutLoad = (minutes, rpe) => ((+minutes || 0) * (rpe || 5)) / LOAD_SCALE;

  // dayLoads: { "YYYY-MM-DD": โหลดรวมของวัน }  ->  อาเรย์รายวันตั้งแต่ start ถึง end
  function series(dayLoads, start, end) {
    const out = [], kc = 1 - Math.exp(-1 / CTL_DAYS), ka = 1 - Math.exp(-1 / ATL_DAYS);
    let ctl = 0, atl = 0;
    for (let d = start, n = 0; d <= end && n < 800; d = add(d, 1), n++) {
      const L = dayLoads[d] || 0;
      ctl += (L - ctl) * kc; atl += (L - atl) * ka;
      out.push({ date: d, load: L, ctl, atl, tsb: ctl - atl });
    }
    return out;
  }
  function formLabel(tsb) {
    if (tsb > 15) return { t: "สดมาก", d: "พักมาก ฟิตเนสอาจเริ่มลดถ้านานเกินไป", c: "ice" };
    if (tsb > 5) return { t: "สด พร้อมลุย", d: "เหมาะกับวันซ้อมหนักหรือวันแข่ง", c: "ok" };
    if (tsb > -10) return { t: "สมดุล", d: "โหลดกับการพักพอดีกัน", c: "ok" };
    if (tsb > -30) return { t: "กำลังสะสมโหลด", d: "ปกติของช่วงซ้อมหนัก อย่าลืมนอนและกินให้พอ", c: "warn" };
    return { t: "ล้าสะสมสูง", d: "ควรคุยกับโค้ช อาจต้องลดโหลดหรือพักเพิ่ม", c: "bad" };
  }

  // กราฟเส้น SVG: rows = series(), keys = [{ k: "ctl", cls: "l-ctl" }, ...]
  function lineChart(rows, keys, { w = 440, h = 190, label = "กราฟ" } = {}) {
    if (rows.length < 2) return "";
    const padL = 34, padR = 8, padT = 10, padB = 22;
    const vals = rows.flatMap((r) => keys.map((k) => r[k.k]));
    let lo = Math.min(0, ...vals), hi = Math.max(10, ...vals);
    const span = hi - lo || 1; lo -= span * 0.05; hi += span * 0.08;
    const x = (i) => padL + (i / (rows.length - 1)) * (w - padL - padR), y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (h - padT - padB);
    const ticks = [lo, (lo + hi) / 2, hi].map((v) => Math.round(v / 5) * 5);
    const grid = [...new Set(ticks)].map((v) => `<line class="gl" x1="${padL}" x2="${w - padR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="gt" x="${padL - 5}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${v}</text>`).join("");
    const zero = lo < 0 && hi > 0 ? `<line class="zl" x1="${padL}" x2="${w - padR}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>` : "";
    const path = (k) => rows.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(r[k]).toFixed(1)}`).join("");
    const first = rows[0].date, last = rows[rows.length - 1].date, mid = rows[Math.floor(rows.length / 2)].date;
    const xl = (d, a, anchor) => `<text class="gt" x="${a}" y="${h - 5}" text-anchor="${anchor}">${d.slice(8)}/${d.slice(5, 7)}</text>`;
    const lastX = x(rows.length - 1).toFixed(1);
    return `<svg class="pchart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}" preserveAspectRatio="xMidYMid meet">${grid}${zero}
      ${keys.map((k) => `<path class="${k.cls}" d="${path(k.k)}" fill="none"/>`).join("")}
      <line class="nowl" x1="${lastX}" x2="${lastX}" y1="${padT}" y2="${h - padB}"/>${keys.map((k) => `<circle class="${k.cls} dotc" cx="${lastX}" cy="${y(rows[rows.length - 1][k.k]).toFixed(1)}" r="3.5"/>`).join("")}
      ${xl(first, padL, "start")}${rows.length > 20 ? xl(mid, (padL + w - padR) / 2, "middle") : ""}${xl(last, w - padR, "end")}</svg>`;
  }
  return { workoutLoad, series, formLabel, lineChart, LOAD_SCALE };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Perf;
