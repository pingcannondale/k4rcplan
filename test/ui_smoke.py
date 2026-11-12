"""ทดสอบหน้าจอแบบเร็ว (โหมดตัวอย่าง /?demo=1): เปิดทุกแท็บ/หน้าต่าง ฟอร์มหลังซ้อม ปุ่มแชร์หลังบันทึก และแถบเมนูล่าง
รัน: pip install playwright && playwright install chromium && python test/ui_smoke.py"""
import os, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public")
PORT = 8765
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "-d", ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
fails, ok = [], 0

def check(name, cond):
    global ok
    if cond: ok += 1; print("  ✓", name)
    else: fails.append(name); print("  ✗", name)

try:
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={"width": 390, "height": 844})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("dialog", lambda d: (errs.append("ALERT " + d.message), d.dismiss()))
        pg.goto(f"http://localhost:{PORT}/?demo=1"); pg.wait_for_selector(".tabbar"); pg.wait_for_timeout(600)

        check("แถบเมนูมี 4 แท็บ", pg.locator(".tbs .tb").count() == 4)
        check("หน้าแรกมีฟีดทีม", pg.locator(".fp").count() >= 1)
        check("หน้าแรกไม่มีการ์ดงานแข่งแล้ว", pg.locator(".ak-race").count() == 0)

        for t in ["plan", "stats", "me", "home"]:
            pg.click(f".tb[data-v={t}]"); pg.wait_for_timeout(350)
            check(f"แท็บ {t} เปิดได้และไม่ว่าง", pg.evaluate("document.getElementById('view').innerText.length") > 20)
        pg.click(".tb[data-v=me]"); pg.wait_for_timeout(300)
        for tab in ["prog", "acts", "info"]:
            pg.click(f"[data-act=ptab][data-v={tab}]"); pg.wait_for_timeout(200)
        check("แท็บข้อมูลไม่มีปุ่ม 'ข้อมูลของฉัน' ซ้ำกับแก้ไขโปรไฟล์", pg.locator("#view [data-act=m][data-m=profile]").count() == 1)

        # หน้าต่างต่าง ๆ เปิด/ปิดได้
        opened = 0
        for sel in ['[data-act=m][data-m=pace]', '[data-act=m][data-m=backup]', '[data-act=m][data-m=profile]']:
            if pg.locator(sel).count():
                pg.click(sel); pg.wait_for_timeout(350)
                if pg.evaluate("document.querySelector('dialog[open]')!==null"): opened += 1; pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        check("หน้าต่างเพซ/สำรอง/โปรไฟล์เปิดได้", opened == 3)

        # ฟอร์มหลังซ้อม + toast แชร์
        pg.click(".tb[data-v=home]"); pg.wait_for_timeout(300)
        pg.click("[data-act=done]"); pg.wait_for_selector(".fb-more", state="attached"); pg.wait_for_timeout(350)
        check("ฟอร์มหลังซ้อม: รายละเอียดเพิ่มเติมพับไว้", pg.evaluate("document.querySelector('.fb-more').open") is False)
        pg.click("[data-act=rpe][data-v='6']"); pg.click("[data-act=fbsave]"); pg.wait_for_timeout(600)
        check("หลังบันทึกมีปุ่มแชร์เวิร์คเอาต์", pg.locator(".toast button").count() == 1)
        pg.click(".toast button"); pg.wait_for_selector("#shc", timeout=4000)
        check("ปุ่มแชร์เปิดหน้าแชร์ได้", pg.locator("#shc").count() == 1)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

        # เวลา นาที:วินาที
        pg.click("[data-act=fb]"); pg.wait_for_selector("#fb-min", state="attached"); pg.wait_for_timeout(300)
        pg.evaluate("document.querySelector('.fb-more').open = true"); pg.click("#fb-min"); pg.keyboard.type("3909", delay=30)
        check("ช่องเวลาใส่ : ให้เอง (3909 → 39:09)", pg.input_value("#fb-min") == "39:09")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)

        # ธีมใหม่: ปุ่มความรู้สึก 5 ระดับ + ปุ่มอาการเจ็บ + Dock ไอคอนล้วนอยู่กึ่งกลาง และรูดข้ามแท็บได้
        pg.click(".tb[data-v=home]"); pg.wait_for_timeout(300)
        pg.click("[data-act=fb]"); pg.wait_for_selector(".ak-fp", state="attached"); pg.wait_for_timeout(350)
        check("ฟอร์มหลังซ้อมมีปุ่มความรู้สึก 5 ระดับ (ไม่มีแถบตัวเลข 1-10)", pg.locator(".ak-fp").count() == 5 and pg.locator(".ak-sc").count() == 0)
        pg.click(".ak-fp >> nth=3"); pg.wait_for_timeout(150)
        check("กดระดับ 'หนัก' แล้วปุ่มถูกเลือกและเก็บเป็น RPE 8", pg.evaluate("document.querySelector('.ak-fp.on [data-v], .ak-fp.on')?.dataset.v") == "8" and pg.locator(".ak-fp.on").count() == 1)
        check("ปุ่มอาการเจ็บเรียงเป็นตารางเต็มแถว (3 คอลัมน์)", pg.evaluate("getComputedStyle(document.querySelector('.ak-cxr.wrap')).gridTemplateColumns.split(' ').length") == 3)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        bar = pg.eval_on_selector(".tabbar", "e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height]}")
        check("Dock อยู่กึ่งกลางจอ และแคบกว่า 260px", abs(bar[0] + bar[2] / 2 - 195) < 1 and bar[2] < 260)
        pg.mouse.move(bar[0] + 20, bar[1] + bar[3] / 2); pg.mouse.down(); pg.wait_for_timeout(150)
        for k in range(10): pg.mouse.move(bar[0] + 20 + k * 20, bar[1] + bar[3] / 2); pg.wait_for_timeout(25)
        pg.mouse.up(); pg.wait_for_timeout(500)
        check("ลาก Dock จากแท็บแรกไปแท็บโปรไฟล์ได้ (เหมือนต้นแบบ HTML)", pg.evaluate("document.querySelector('.tb[aria-current=page]').dataset.v") == "me")
        check("ตัวชี้ Dock เลื่อนตามแท็บที่เลือก", pg.evaluate("getComputedStyle(document.querySelector('.tabbar .ind')).transform") != "none")

        check("ไม่มี error ในหน้าเว็บ", not errs)
        if errs: print("    ", errs[:3])
        b.close()
finally:
    srv.kill()

print(f"\nผ่าน {ok} ข้อ" + (f" · ไม่ผ่าน {len(fails)}: {fails}" if fails else ""))
sys.exit(1 if fails else 0)
