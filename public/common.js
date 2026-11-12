const SPORT = {
  run: "วิ่ง", strength: "สเตรงท์", rest: "พัก", race: "แข่ง", bike: "จักรยาน", swim: "ว่ายน้ำ", brick: "บริก",
};
const DAYS = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];
const DAYS_FULL = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];
const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pad = (n) => String(n).padStart(2, "0");
const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addDays(s, n) {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dowIdx = (s) => (new Date(s + "T00:00:00Z").getUTCDay() + 6) % 7;
const mondayOf = (s) => addDays(s, -dowIdx(s));
const dayNum = (s) => +s.slice(8, 10);
const monthName = (s) => MONTHS[+s.slice(5, 7) - 1];
const shortDate = (s) => `${dayNum(s)} ${monthName(s)}`;
const longDate = (s) => `${DAYS_FULL[dowIdx(s)]} ${shortDate(s)}`;
function rangeLabel(week) {
  const a = week, b = addDays(week, 6);
  return monthName(a) === monthName(b) ? `${dayNum(a)}–${dayNum(b)} ${monthName(b)}` : `${shortDate(a)} – ${shortDate(b)}`;
}
function fmtDur(min) {
  min = Math.round(+min || 0);
  if (!min) return "";
  return min < 60 ? `${min} น.` : `${Math.floor(min / 60)} ชม. ${pad(min % 60)} น.`;
}
const fmtKm = (m) => (m ? `${+(m / 1000).toFixed(1)} กม.` : "");
const uid = () => "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

/* ---------- PWA: ลงทะเบียน service worker + ปุ่มติดตั้งแอป ---------- */
if ("serviceWorker" in navigator) {
  /* มีเวอร์ชันใหม่ → โหลดหน้าใหม่ 1 ครั้งอัตโนมัติ (ไม่งั้น css/js ที่แคชไว้จะค้างเป็นของเก่าจนกว่าจะรีเฟรชซ้ำ) */
  const had = !!navigator.serviceWorker.controller; let rl = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (had && !rl) { rl = true; location.reload(); } });
  addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
let _installEv = null;
addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); _installEv = e; document.querySelectorAll("[data-install]").forEach((b) => (b.hidden = false)); });
addEventListener("appinstalled", () => { _installEv = null; document.querySelectorAll("[data-install]").forEach((b) => (b.hidden = true)); });
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
async function installApp() {
  if (_installEv) { _installEv.prompt(); await _installEv.userChoice.catch(() => {}); _installEv = null; return; }
  if (isIOS()) alert("วิธีติดตั้งบน iPhone / iPad\n\n1. เปิดหน้านี้ใน Safari\n2. กดปุ่มแชร์ (สี่เหลี่ยมมีลูกศรขึ้น)\n3. เลื่อนหาและกด \"เพิ่มลงในหน้าจอโฮม\"\n4. กด \"เพิ่ม\"");
  else alert("วิธีติดตั้งบน Android\n\nเปิดใน Chrome → กดเมนู ⋮ มุมขวาบน → \"ติดตั้งแอป\" หรือ \"เพิ่มลงในหน้าจอหลัก\"");
}
/* ปุ่มติดตั้ง: ซ่อนถ้าเปิดจากแอปที่ติดตั้งแล้ว; iOS ไม่มี prompt จึงโชว์ปุ่มที่บอกวิธีให้ */
const installBtn = (cls = "btn") => (isStandalone() ? "" : `<button class="${cls}" data-act="install" data-install${isIOS() ? "" : " hidden"}>ติดตั้งเป็นแอป</button>`);

/* ---------- ดาวน์โหลดไฟล์ JSON (ใช้ export / backup) ---------- */
function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// ชื่อไฟล์ใช้อังกฤษ/ตัวเลขล้วน กันบางเครื่อง (โดยเฉพาะ iOS) ตัดชื่อภาษาไทยทิ้ง
const fileSafe = (s) => String(s || "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "athlete";

/* เพซส่วนตัว (โค้ชกรอกเอง) ตามลำดับที่แสดง */
const PACES = [
  { k: "e", label: "Recovery" }, { k: "lt1", label: "LT1 (Easy)" }, { k: "lt2", label: "LT2 (Threshold)" },
  { k: "marathon", label: "Marathon" }, { k: "k5", label: "5K Pace" }, { k: "vo2max", label: "VO2Max" }, { k: "r", label: "R Pace" },
];
// พิมพ์แต่ตัวเลข เช่น 5:30 หรือ 5:15-5:45 จะต่อท้ายด้วย /กม. ให้เอง ถ้าพิมพ์ข้อความอื่นจะแสดงตามที่พิมพ์
const paceText = (v) => (/^[\d:.\s–\-~]+$/.test(v) ? `${v} /กม.` : v);

/* ---------- กราฟโครงสร้างการซ้อม (ใช้ Steps จาก steps.js) ---------- */
// ระดับสี: 0 เบา (Recovery, LT1 Easy, วอร์มอัพ, คูลดาวน์) · 1 กลาง (Marathon) · 2 หนัก (LT2 ขึ้นไป)
function segClass(s) {
  if (s.type === "rest") return "rest";
  if (!s.ps) return "unk"; // ยังไม่รู้เพซ (โค้ชยังไม่ได้ตั้ง) แสดงเป็นแท่งลายเฉียง
  if (s.type === "warmup" || s.type === "cooldown") return "lv0";
  const lv = { e: 0, lt1: 0, marathon: 1 }[s.ref] ?? (s.ref ? 2 : s.ps > 330 ? 0 : s.ps > 270 ? 1 : 2);
  return "lv" + lv;
}
// ความสูงแท่งตามความเร็ว: ช้ากว่า 7:30/กม. = เตี้ยสุด เร็วกว่า 3:00/กม. = สูงสุด
function segHeight(s) {
  if (!s.ps) return 40;
  const h = Math.round(18 + (82 * (3600 / s.ps - 8)) / 12);
  return Math.max(14, Math.min(s.type === "rest" ? 30 : 100, h));
}
function stepGraph(segs, label) {
  if (!segs.length) return "";
  return `<div class="graph" role="img" aria-label="${esc(label || "กราฟโครงสร้างการซ้อม")}">${segs.map((s) =>
    `<i class="gb ${segClass(s)}" style="flex:${Math.max(1, s.sec ?? (s.m ? (s.m / 1000) * 360 : 60)).toFixed(0)};height:${segHeight(s)}%"></i>`).join("")}</div>`;
}
// รายการทีละขั้น พร้อมเวลาที่คำนวณได้
function stepRows(steps, paces) {
  return `<div class="srows">${(steps || []).map((it) => {
    const c = Steps.calc([it], paces);
    const right = c.sec ? `${Steps.clock(c.sec)}${c.m ? `<br>${+(c.m / 1000).toFixed(1)} กม.` : ""}` : "";
    const main = it.t === "repeat" ? `${+it.n} × ${Steps.amount(it.work)}` : `${Steps.T[it.t] || ""} ${Steps.amount(it)}`;
    const sub = it.t === "repeat"
      ? `เร็ว @ ${Steps.paceLabel(it.work?.p, paces)}${it.rest && +it.rest.x > 0 ? `, พัก ${Steps.amount(it.rest)} @ ${Steps.paceLabel(it.rest.p, paces)}` : ""}`
      : `@ ${Steps.paceLabel(it.p, paces)}`;
    return `<div class="srow"><div><b>${esc(main)}</b><div class="sub">${esc(sub)}</div></div><span class="sv">${right}</span></div>`;
  }).join("")}</div>`;
}
