#!/usr/bin/env python3
"""แปลงตารางซ้อมฮาล์ฟมาราธอน 6 แผน (PDF ของ Caffeine Bullet) เป็นข้อมูลโครงสร้าง

ใช้ครั้งเดียวตอนเตรียมข้อมูล แล้วได้ไฟล์ netlify/lib/half-plans-data.mts (ไฟล์นั้นถูก commit ไว้แล้ว ตอนรันแอปไม่ต้องใช้สคริปต์นี้)

    pip install pdfplumber
    python3 tools/extract_half_plans.py "<โฟลเดอร์ที่มี PDF>" netlify/lib/half-plans-data.mts

ข้อมูลที่เก็บเป็น "ชนิดเซสชัน + ตัวเลข" ล้วน ๆ ไม่เก็บเพซจาก PDF เลย
(เพซของนักกีฬาแต่ละคนคำนวณใหม่จาก PB 5K ตอนสร้างแผน ดู netlify/lib/external.mts)
"""
import glob, json, re, sys
import pdfplumber

PLANS = {
    # ชื่อไฟล์ (ส่วนที่ใช้จับคู่) -> (key, ระดับ, เวลาเป้าหมายเป็นนาที)
    "sub-2_30": ("half-2h30", "beginner", 150),
    "sub-2_15": ("half-2h15", "beginner", 135),
    "sub-2-hour": ("half-2h00", "beginner", 120),
    "sub-1_50": ("half-1h50", "intermediate", 110),
    "sub-1_40": ("half-1h40", "intermediate", 100),
    "sub-1_30": ("half-1h30", "advanced", 90),
}
LABEL = {"half-2h30": "Sub-2:30", "half-2h15": "Sub-2:15", "half-2h00": "Sub-2:00", "half-1h50": "Sub-1:50", "half-1h40": "Sub-1:40", "half-1h30": "Sub-1:30"}

# เซลล์ที่ข้อความถูกตัดตอนขึ้นหน้าใหม่ของ PDF (บรรทัดแรกอยู่ท้ายหน้า 1) เติมให้ครบตามที่เห็นในไฟล์ต้นฉบับ
# (plan key, สัปดาห์, ช่อง 0=จันทร์ ... 6=อาทิตย์) -> ข้อความเต็ม
OVERRIDES = {
    ("half-1h40", 13, 4): "4x3 min @ 3k pace (2 min easy recovery in between)",
    ("half-1h40", 13, 6): "120 mins Easy, 18 mins Tempo",
    ("half-2h30", 14, 3): "3x3 min @ 3k pace (2 min easy recovery in between)",
    ("half-2h30", 14, 6): "90 mins Easy, 9 mins Tempo",
}

# ชื่อเพซในตาราง -> ชื่อเพซของแอป (ดู PACE_KEYS ใน shared.mts)
PACE_OF = {"3k pace": "vo2max", "5k pace": "k5", "800m pace": "r", "1 mile pace": "r", "steady pace": "marathon"}


def norm(s):
    return re.sub(r"\s+", " ", (s or "").replace("\n", " ")).strip()


def parse_cell(text):
    """คืนรายการเซสชันของวันนั้น (ว่าง = ไม่มีซ้อม)"""
    s = norm(text)
    low = s.lower()
    if low == "rest":
        return [{"t": "rest"}]
    if low == "race":
        return [{"t": "race"}]
    m = re.match(r"^Parkrun \((\d+) mins Easy", s, re.I)
    if m:  # วันปาร์ครัน (มีวิ่งเบาก่อน/หลังรวมเป็นเวลาในวงเล็บ) = เซสชันปาร์ครันทั้งอัน
        return [{"t": "parkrun", "min": int(m.group(1))}]
    m = re.match(r"^(\d+) mins Easy - [\d:]+ mins/km or Parkrun", s, re.I)
    if m:  # วิ่งเบา หรือจะไปปาร์ครันแทนก็ได้
        return [{"t": "easy", "min": int(m.group(1)), "orParkrun": True}]
    m = re.match(r"^(\d+) mins Easy(?:, (\d+) mins Tempo)? \(am\) and (\d+) mins Easy \(pm\)", s, re.I)
    if m:  # วันซ้อมสองรอบ
        am = {"t": "tempo", "easy": int(m.group(1)), "tempo": int(m.group(2)), "slot": "am"} if m.group(2) else {"t": "easy", "min": int(m.group(1)), "slot": "am"}
        return [am, {"t": "easy", "min": int(m.group(3)), "slot": "pm"}]
    m = re.match(r"^(\d+) mins Easy, (\d+) mins Tempo", s, re.I)
    if m:
        return [{"t": "tempo", "easy": int(m.group(1)), "tempo": int(m.group(2))}]
    m = re.match(r"^(\d+) mins Easy -", s, re.I)
    if m:
        return [{"t": "easy", "min": int(m.group(1))}]
    m = re.match(r"^(\d+)x(\d+(?:\.\d+)?)(s| ?mins?)? @ (.+?) \((\d+(?:\.\d+)?)(s| ?mins?) (?:easy )?recovery in between\)?", s, re.I)
    if m:
        def secs(v, unit):
            return round(float(v) * (1 if (unit or "").strip().lower() == "s" else 60))
        pace = PACE_OF[m.group(4).strip().lower()]
        return [{"t": "intervals", "n": int(m.group(1)), "workSec": secs(m.group(2), m.group(3)), "restSec": secs(m.group(5), m.group(6)), "pace": pace}]
    raise ValueError("อ่านเซลล์ไม่ออก: " + s)


def read_plan(path, key):
    weeks = {}
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for table in page.extract_tables():
                for row in table:
                    cells = [(c or "").strip() for c in row]
                    cells = [c for c in cells if c != ""]  # ตัดช่องว่างที่ตารางหน้า 2 เพิ่มมา
                    if not cells or not re.fullmatch(r"Week \d+", cells[0]):
                        continue
                    wk = int(cells[0].split()[1])
                    days = cells[1:8]
                    if len(days) != 7:
                        raise ValueError(f"{key} week {wk}: พบ {len(days)} ช่องวัน (ต้อง 7)")
                    weeks[wk] = days
    out = []
    for wk in range(1, 16):
        if wk not in weeks:
            raise ValueError(f"{key}: ไม่พบสัปดาห์ {wk}")
        row = []
        for d, cell in enumerate(weeks[wk]):
            cell = OVERRIDES.get((key, wk, d), cell)
            row.append(parse_cell(cell))
        out.append(row)
    return out


def ts_value(v, indent=0):
    return json.dumps(v, ensure_ascii=False, separators=(",", ":"))


def main(src_dir, out_path):
    plans = []
    for f in sorted(glob.glob(src_dir + "/*.pdf")):
        hit = [k for k in PLANS if k in f]
        if len(hit) != 1:
            raise SystemExit("จับคู่ชื่อไฟล์ไม่ได้: " + f)
        key, level, target = PLANS[hit[0]]
        plans.append((target, key, level, read_plan(f, key)))
    plans.sort(key=lambda p: -p[0])  # ช้า -> เร็ว
    lines = [
        "// สร้างโดย tools/extract_half_plans.py จากตารางซ้อมฮาล์ฟมาราธอน 6 แผน (ไฟล์ PDF) อย่าแก้มือ",
        "// เก็บเฉพาะชนิดเซสชันและตัวเลข (นาที/รอบ/วินาที) ไม่มีเพซจากไฟล์ต้นฉบับ",
        "// แต่ละแผน 15 สัปดาห์ x 7 วัน (จันทร์ถึงอาทิตย์) สัปดาห์ที่ 15 คือสัปดาห์แข่ง วันอาทิตย์ = วันแข่ง",
        "",
        "export type PaceKey = \"e\" | \"lt1\" | \"lt2\" | \"marathon\" | \"k5\" | \"vo2max\" | \"r\";",
        "export type Sess =",
        "  | { t: \"rest\" }",
        "  | { t: \"race\" }",
        "  | { t: \"easy\"; min: number; slot?: \"am\" | \"pm\"; orParkrun?: boolean }",
        "  | { t: \"tempo\"; easy: number; tempo: number; slot?: \"am\" | \"pm\" }",
        "  | { t: \"intervals\"; n: number; workSec: number; restSec: number; pace: PaceKey }",
        "  | { t: \"parkrun\"; min: number };",
        "export type RawPlan = { key: string; level: \"beginner\" | \"intermediate\" | \"advanced\"; label: string; targetMin: number; weeks: Sess[][][] };",
        "",
        "export const HALF_PLANS: RawPlan[] = [",
    ]
    for target, key, level, weeks in plans:
        lines.append(f'  {{ key: "{key}", level: "{level}", label: "{level.capitalize()} · {LABEL[key]}", targetMin: {target}, weeks: [')
        for wk in weeks:
            lines.append("    " + ts_value(wk) + ",")
        lines.append("  ] },")
    lines.append("];")
    open(out_path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print("เขียน", out_path, "แผน", len(plans))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
