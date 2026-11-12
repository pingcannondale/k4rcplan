/* ลูกเล่นขยับ K4RC: เข้าหน้า · นับเลขขึ้น  (ปิดเองเมื่อเครื่องตั้ง "ลดการเคลื่อนไหว") */
const MO_RM = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
let moPrev = null, moT = 0, moFT = 0;
function moEnter(tabName) {
  if (tabName === moPrev) return; moPrev = tabName; if (MO_RM()) return;
  const v = document.getElementById("view"); v.classList.remove("mo-enter"); void v.offsetWidth; v.classList.add("mo-enter");
  clearTimeout(moT); moT = setTimeout(() => v.classList.remove("mo-enter"), 1600);
  moCount(v);
}
function moCount(root) { // ตัวเลขนับจาก 0 ขึ้นไป แล้วจบด้วยข้อความเดิมเป๊ะ
  root.querySelectorAll("[data-count],[data-time]").forEach((el) => {
    const orig = el.textContent, isT = el.hasAttribute("data-time"), to = +(el.dataset.count ?? el.dataset.time), suf = el.dataset.suf || "";
    if (!isFinite(to) || (isT && !/^\d+:\d{2}$/.test(orig))) return;
    const fmt = (n) => isT ? (() => { const t = Math.round(n); return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); })() : Math.round(n) + suf; /* ปัดทั้งก้อนก่อน ไม่งั้น n%60 ปัดเป็น 60 ได้ (เช่น 1:60) */
    const t0 = performance.now(), dur = 900 + Math.min(500, to * 2), delay = 220;
    el.textContent = fmt(0);
    const step = (t) => { const k = Math.min(1, (t - t0 - delay) / dur); if (k >= 1) { el.textContent = orig; return; } el.textContent = fmt(to * (k <= 0 ? 0 : 1 - Math.pow(1 - k, 4))); requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
function moFresh() { if (MO_RM()) return; document.body.classList.add("mo-fresh"); clearTimeout(moFT); moFT = setTimeout(() => document.body.classList.remove("mo-fresh"), 1500); }
