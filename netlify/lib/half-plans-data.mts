// สร้างโดย tools/extract_half_plans.py จากตารางซ้อมฮาล์ฟมาราธอน 6 แผน (ไฟล์ PDF) อย่าแก้มือ
// เก็บเฉพาะชนิดเซสชันและตัวเลข (นาที/รอบ/วินาที) ไม่มีเพซจากไฟล์ต้นฉบับ
// แต่ละแผน 15 สัปดาห์ x 7 วัน (จันทร์ถึงอาทิตย์) สัปดาห์ที่ 15 คือสัปดาห์แข่ง วันอาทิตย์ = วันแข่ง
// หมายเหตุ 2026-11-11: โค้ชแก้มือ 3 แผน beginner (half-2h30, half-2h15, half-2h00) ตามคำขอ
//   - half-2h30: เพิ่มวันซ้อมเสาร์ (เบา) จาก 3 เป็น 4 วัน/สัปดาห์ และเลื่อน interval หนัก (vo2max) ของสัปดาห์ 1-3 ไปเป็นวิ่งเบาแทน เริ่ม interval จริงสัปดาห์ 4
//   - half-2h15, half-2h00: เลื่อน interval หนัก (vo2max) ของสัปดาห์ 1-3 ไปเป็นวิ่งเบาแทน เริ่ม interval จริงสัปดาห์ 4 (ความถี่/วันเดิมไม่เปลี่ยน)
//   ถ้ารันสคริปต์ extract ใหม่จาก PDF ต้นฉบับ การแก้ตรงนี้จะหายไป ต้องแก้ซ้ำ หรือย้ายไปแก้ที่ PDF ต้นทางแทน

export type PaceKey = "e" | "lt1" | "lt2" | "marathon" | "k5" | "vo2max" | "r";
export type Sess =
  | { t: "rest" }
  | { t: "race" }
  | { t: "easy"; min: number; slot?: "am" | "pm"; orParkrun?: boolean }
  | { t: "tempo"; easy: number; tempo: number; slot?: "am" | "pm" }
  | { t: "intervals"; n: number; workSec: number; restSec: number; pace: PaceKey }
  | { t: "parkrun"; min: number };
export type RawPlan = { key: string; level: "beginner" | "intermediate" | "advanced"; label: string; targetMin: number; weeks: Sess[][][] };

export const HALF_PLANS: RawPlan[] = [
  { key: "half-2h30", level: "beginner", label: "Beginner · Sub-2:30", targetMin: 150, weeks: [
    [[{"t":"rest"}],[{"t":"easy","min":20}],[{"t":"rest"}],[{"t":"easy","min":20}],[{"t":"rest"}],[{"t":"easy","min":20}],[{"t":"easy","min":60}]],
    [[{"t":"rest"}],[{"t":"easy","min":20}],[{"t":"rest"}],[{"t":"easy","min":20}],[{"t":"rest"}],[{"t":"easy","min":20}],[{"t":"easy","min":72}]],
    [[{"t":"rest"}],[{"t":"easy","min":20}],[{"t":"rest"}],[{"t":"easy","min":20}],[{"t":"rest"}],[{"t":"easy","min":20}],[{"t":"easy","min":60}]],
    [[{"t":"rest"}],[{"t":"easy","min":20}],[{"t":"rest"}],[{"t":"intervals","n":6,"workSec":30,"restSec":90,"pace":"r"}],[{"t":"rest"}],[{"t":"easy","min":25}],[{"t":"easy","min":84}]],
    [[{"t":"rest"}],[{"t":"easy","min":20}],[{"t":"rest"}],[{"t":"intervals","n":8,"workSec":30,"restSec":90,"pace":"r"}],[{"t":"rest"}],[{"t":"easy","min":25}],[{"t":"easy","min":96}]],
    [[{"t":"rest"}],[{"t":"easy","min":25}],[{"t":"rest"}],[{"t":"intervals","n":6,"workSec":60,"restSec":120,"pace":"r"}],[{"t":"rest"}],[{"t":"easy","min":25}],[{"t":"easy","min":72}]],
    [[{"t":"rest"}],[{"t":"easy","min":20}],[{"t":"rest"}],[{"t":"intervals","n":8,"workSec":60,"restSec":120,"pace":"r"}],[{"t":"rest"}],[{"t":"easy","min":25}],[{"t":"tempo","easy":90,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"easy","min":20}],[{"t":"rest"}],[{"t":"intervals","n":6,"workSec":90,"restSec":150,"pace":"r"}],[{"t":"rest"}],[{"t":"easy","min":30}],[{"t":"tempo","easy":100,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"easy","min":25}],[{"t":"rest"}],[{"t":"intervals","n":8,"workSec":60,"restSec":120,"pace":"r"}],[{"t":"rest"}],[{"t":"easy","min":30}],[{"t":"easy","min":84}]],
    [[{"t":"rest"}],[{"t":"easy","min":30}],[{"t":"rest"}],[{"t":"intervals","n":4,"workSec":180,"restSec":120,"pace":"vo2max"}],[{"t":"rest"}],[{"t":"easy","min":30}],[{"t":"tempo","easy":90,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"easy","min":35}],[{"t":"rest"}],[{"t":"intervals","n":5,"workSec":180,"restSec":120,"pace":"vo2max"}],[{"t":"rest"}],[{"t":"easy","min":30}],[{"t":"tempo","easy":90,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"easy","min":30}],[{"t":"rest"}],[{"t":"intervals","n":3,"workSec":300,"restSec":180,"pace":"k5"}],[{"t":"rest"}],[{"t":"easy","min":30}],[{"t":"easy","min":96}]],
    [[{"t":"rest"}],[{"t":"easy","min":35}],[{"t":"rest"}],[{"t":"intervals","n":3,"workSec":180,"restSec":120,"pace":"vo2max"}],[{"t":"rest"}],[{"t":"easy","min":25}],[{"t":"tempo","easy":100,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"easy","min":35}],[{"t":"rest"}],[{"t":"intervals","n":3,"workSec":180,"restSec":120,"pace":"vo2max"}],[{"t":"rest"}],[{"t":"easy","min":20}],[{"t":"tempo","easy":90,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"easy","min":20}],[{"t":"rest"}],[{"t":"intervals","n":3,"workSec":180,"restSec":120,"pace":"vo2max"}],[{"t":"rest"}],[{"t":"rest"}],[{"t":"race"}]],
  ] },
  { key: "half-2h15", level: "beginner", label: "Beginner · Sub-2:15", targetMin: 135, weeks: [
    [[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":5}],[{"t":"rest"}],[{"t":"easy","min":20}],[{"t":"easy","min":20}],[{"t":"rest"}],[{"t":"easy","min":72}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":25,"tempo":5}],[{"t":"rest"}],[{"t":"easy","min":20}],[{"t":"easy","min":20}],[{"t":"rest"}],[{"t":"easy","min":84}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":5}],[{"t":"rest"}],[{"t":"easy","min":20}],[{"t":"easy","min":20}],[{"t":"rest"}],[{"t":"easy","min":72}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":25,"tempo":10}],[{"t":"rest"}],[{"t":"easy","min":20}],[{"t":"intervals","n":6,"workSec":30,"restSec":90,"pace":"r"}],[{"t":"rest"}],[{"t":"easy","min":96}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":25,"tempo":10}],[{"t":"rest"}],[{"t":"easy","min":20}],[{"t":"intervals","n":8,"workSec":30,"restSec":90,"pace":"r"}],[{"t":"rest"}],[{"t":"easy","min":108}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":25,"tempo":5}],[{"t":"rest"}],[{"t":"easy","min":25}],[{"t":"intervals","n":6,"workSec":60,"restSec":120,"pace":"r"}],[{"t":"rest"}],[{"t":"easy","min":84}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":15}],[{"t":"rest"}],[{"t":"easy","min":20}],[{"t":"intervals","n":8,"workSec":60,"restSec":120,"pace":"r"}],[{"t":"rest"}],[{"t":"tempo","easy":108,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":20}],[{"t":"rest"}],[{"t":"easy","min":20}],[{"t":"intervals","n":6,"workSec":90,"restSec":150,"pace":"r"}],[{"t":"rest"}],[{"t":"tempo","easy":120,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":15}],[{"t":"rest"}],[{"t":"easy","min":25}],[{"t":"intervals","n":8,"workSec":60,"restSec":120,"pace":"r"}],[{"t":"rest"}],[{"t":"easy","min":96}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":15}],[{"t":"rest"}],[{"t":"easy","min":30}],[{"t":"intervals","n":3,"workSec":180,"restSec":120,"pace":"vo2max"}],[{"t":"rest"}],[{"t":"tempo","easy":90,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":15}],[{"t":"rest"}],[{"t":"easy","min":35}],[{"t":"intervals","n":4,"workSec":180,"restSec":120,"pace":"vo2max"}],[{"t":"rest"}],[{"t":"tempo","easy":90,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":18}],[{"t":"rest"}],[{"t":"easy","min":30}],[{"t":"intervals","n":3,"workSec":300,"restSec":180,"pace":"k5"}],[{"t":"rest"}],[{"t":"easy","min":96}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":20}],[{"t":"rest"}],[{"t":"easy","min":35}],[{"t":"intervals","n":3,"workSec":180,"restSec":120,"pace":"vo2max"}],[{"t":"rest"}],[{"t":"tempo","easy":110,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"easy","min":45}],[{"t":"rest"}],[{"t":"easy","min":35}],[{"t":"intervals","n":3,"workSec":180,"restSec":120,"pace":"vo2max"}],[{"t":"rest"}],[{"t":"tempo","easy":90,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":25,"tempo":10}],[{"t":"rest"}],[{"t":"easy","min":20}],[{"t":"intervals","n":3,"workSec":180,"restSec":120,"pace":"vo2max"}],[{"t":"rest"}],[{"t":"race"}]],
  ] },
  { key: "half-2h00", level: "beginner", label: "Beginner · Sub-2:00", targetMin: 120, weeks: [
    [[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":5}],[{"t":"easy","min":25}],[{"t":"easy","min":25}],[{"t":"rest"}],[{"t":"easy","min":20,"orParkrun":true}],[{"t":"easy","min":72}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":25,"tempo":5}],[{"t":"easy","min":30}],[{"t":"easy","min":30}],[{"t":"rest"}],[{"t":"easy","min":20,"orParkrun":true}],[{"t":"easy","min":84}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":5}],[{"t":"easy","min":25}],[{"t":"easy","min":25}],[{"t":"rest"}],[{"t":"easy","min":20,"orParkrun":true}],[{"t":"easy","min":72}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":25,"tempo":10}],[{"t":"easy","min":30}],[{"t":"intervals","n":8,"workSec":30,"restSec":90,"pace":"r"}],[{"t":"rest"}],[{"t":"easy","min":20,"orParkrun":true}],[{"t":"easy","min":96}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":25,"tempo":10}],[{"t":"easy","min":30}],[{"t":"intervals","n":10,"workSec":30,"restSec":90,"pace":"r"}],[{"t":"rest"}],[{"t":"easy","min":20,"orParkrun":true}],[{"t":"easy","min":108}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":25,"tempo":5}],[{"t":"easy","min":25}],[{"t":"intervals","n":6,"workSec":60,"restSec":120,"pace":"r"}],[{"t":"rest"}],[{"t":"easy","min":25,"orParkrun":true}],[{"t":"easy","min":84}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":15}],[{"t":"easy","min":30}],[{"t":"intervals","n":8,"workSec":60,"restSec":120,"pace":"r"}],[{"t":"rest"}],[{"t":"easy","min":20,"orParkrun":true}],[{"t":"tempo","easy":108,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"intervals","n":4,"workSec":300,"restSec":180,"pace":"marathon"}],[{"t":"easy","min":35}],[{"t":"intervals","n":6,"workSec":90,"restSec":150,"pace":"r"}],[{"t":"rest"}],[{"t":"easy","min":20,"orParkrun":true}],[{"t":"tempo","easy":120,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":15}],[{"t":"easy","min":30}],[{"t":"intervals","n":8,"workSec":60,"restSec":120,"pace":"r"}],[{"t":"rest"}],[{"t":"easy","min":25,"orParkrun":true}],[{"t":"easy","min":96}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":20}],[{"t":"easy","min":35}],[{"t":"intervals","n":4,"workSec":180,"restSec":120,"pace":"vo2max"}],[{"t":"rest"}],[{"t":"easy","min":30,"orParkrun":true}],[{"t":"tempo","easy":90,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":20}],[{"t":"easy","min":35}],[{"t":"intervals","n":5,"workSec":180,"restSec":120,"pace":"vo2max"}],[{"t":"rest"}],[{"t":"easy","min":35,"orParkrun":true}],[{"t":"tempo","easy":90,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":18}],[{"t":"easy","min":35}],[{"t":"intervals","n":3,"workSec":300,"restSec":180,"pace":"k5"}],[{"t":"rest"}],[{"t":"easy","min":30,"orParkrun":true}],[{"t":"easy","min":96}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":28}],[{"t":"easy","min":35}],[{"t":"intervals","n":4,"workSec":180,"restSec":120,"pace":"vo2max"}],[{"t":"rest"}],[{"t":"easy","min":35,"orParkrun":true}],[{"t":"tempo","easy":110,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":3}],[{"t":"easy","min":40}],[{"t":"intervals","n":3,"workSec":180,"restSec":120,"pace":"vo2max"}],[{"t":"rest"}],[{"t":"easy","min":35,"orParkrun":true}],[{"t":"tempo","easy":90,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":25,"tempo":10}],[{"t":"easy","min":30}],[{"t":"intervals","n":3,"workSec":180,"restSec":120,"pace":"vo2max"}],[{"t":"rest"}],[{"t":"easy","min":20,"orParkrun":true}],[{"t":"race"}]],
  ] },
  { key: "half-1h50", level: "intermediate", label: "Intermediate · Sub-1:50", targetMin: 110, weeks: [
    [[{"t":"easy","min":30}],[{"t":"tempo","easy":25,"tempo":10}],[{"t":"easy","min":40}],[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":15}],[{"t":"easy","min":40,"orParkrun":true}],[{"t":"easy","min":80}]],
    [[{"t":"easy","min":30}],[{"t":"tempo","easy":30,"tempo":10}],[{"t":"easy","min":45}],[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":18}],[{"t":"easy","min":40,"orParkrun":true}],[{"t":"easy","min":90}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":25,"tempo":10}],[{"t":"easy","min":40}],[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":15}],[{"t":"easy","min":40,"orParkrun":true}],[{"t":"easy","min":80}]],
    [[{"t":"easy","min":30}],[{"t":"tempo","easy":30,"tempo":10}],[{"t":"easy","min":45}],[{"t":"rest"}],[{"t":"intervals","n":8,"workSec":30,"restSec":90,"pace":"r"}],[{"t":"easy","min":40,"orParkrun":true}],[{"t":"tempo","easy":100,"tempo":9}]],
    [[{"t":"easy","min":30}],[{"t":"tempo","easy":30,"tempo":12}],[{"t":"easy","min":45}],[{"t":"rest"}],[{"t":"intervals","n":6,"workSec":60,"restSec":120,"pace":"r"}],[{"t":"easy","min":45,"orParkrun":true}],[{"t":"tempo","easy":110,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":30,"tempo":10}],[{"t":"easy","min":40}],[{"t":"rest"}],[{"t":"intervals","n":8,"workSec":30,"restSec":90,"pace":"r"}],[{"t":"easy","min":40,"orParkrun":true}],[{"t":"easy","min":90}]],
    [[{"t":"easy","min":30}],[{"t":"tempo","easy":30,"tempo":12}],[{"t":"easy","min":45}],[{"t":"rest"}],[{"t":"intervals","n":8,"workSec":60,"restSec":120,"pace":"r"}],[{"t":"easy","min":45,"orParkrun":true}],[{"t":"tempo","easy":90,"tempo":9}]],
    [[{"t":"easy","min":30}],[{"t":"tempo","easy":25,"tempo":24}],[{"t":"easy","min":45}],[{"t":"rest"}],[{"t":"intervals","n":8,"workSec":90,"restSec":150,"pace":"r"}],[{"t":"easy","min":45,"orParkrun":true}],[{"t":"tempo","easy":100,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":24}],[{"t":"easy","min":40}],[{"t":"rest"}],[{"t":"intervals","n":6,"workSec":90,"restSec":150,"pace":"r"}],[{"t":"easy","min":40,"orParkrun":true}],[{"t":"tempo","easy":90,"tempo":9}]],
    [[{"t":"easy","min":30}],[{"t":"tempo","easy":20,"tempo":28}],[{"t":"easy","min":45}],[{"t":"rest"}],[{"t":"intervals","n":3,"workSec":300,"restSec":180,"pace":"k5"}],[{"t":"easy","min":45,"orParkrun":true}],[{"t":"tempo","easy":100,"tempo":9}]],
    [[{"t":"easy","min":30}],[{"t":"intervals","n":3,"workSec":480,"restSec":180,"pace":"marathon"}],[{"t":"easy","min":45}],[{"t":"rest"}],[{"t":"intervals","n":4,"workSec":300,"restSec":180,"pace":"k5"}],[{"t":"easy","min":45,"orParkrun":true}],[{"t":"tempo","easy":100,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":24}],[{"t":"easy","min":40}],[{"t":"rest"}],[{"t":"intervals","n":3,"workSec":300,"restSec":180,"pace":"k5"}],[{"t":"easy","min":40,"orParkrun":true}],[{"t":"tempo","easy":100,"tempo":9}]],
    [[{"t":"easy","min":30}],[{"t":"tempo","easy":30,"tempo":16}],[{"t":"easy","min":45}],[{"t":"rest"}],[{"t":"intervals","n":4,"workSec":180,"restSec":120,"pace":"vo2max"}],[{"t":"easy","min":45,"orParkrun":true}],[{"t":"tempo","easy":90,"tempo":9}]],
    [[{"t":"easy","min":30}],[{"t":"tempo","easy":20,"tempo":28}],[{"t":"easy","min":40}],[{"t":"rest"}],[{"t":"intervals","n":3,"workSec":180,"restSec":120,"pace":"vo2max"}],[{"t":"easy","min":35,"orParkrun":true}],[{"t":"tempo","easy":80,"tempo":9}]],
    [[{"t":"easy","min":30}],[{"t":"tempo","easy":30,"tempo":12}],[{"t":"easy","min":35}],[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":15}],[{"t":"easy","min":25}],[{"t":"race"}]],
  ] },
  { key: "half-1h40", level: "intermediate", label: "Intermediate · Sub-1:40", targetMin: 100, weeks: [
    [[{"t":"easy","min":30}],[{"t":"tempo","easy":30,"tempo":10}],[{"t":"easy","min":45}],[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":15}],[{"t":"easy","min":40,"orParkrun":true}],[{"t":"easy","min":90}]],
    [[{"t":"easy","min":30}],[{"t":"tempo","easy":30,"tempo":12}],[{"t":"easy","min":45}],[{"t":"rest"}],[{"t":"intervals","n":8,"workSec":30,"restSec":90,"pace":"r"}],[{"t":"easy","min":40,"orParkrun":true}],[{"t":"easy","min":110}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":30,"tempo":10}],[{"t":"easy","min":40}],[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":15}],[{"t":"easy","min":40,"orParkrun":true}],[{"t":"easy","min":90}]],
    [[{"t":"easy","min":30}],[{"t":"tempo","easy":30,"tempo":12}],[{"t":"easy","min":45}],[{"t":"rest"}],[{"t":"intervals","n":8,"workSec":30,"restSec":90,"pace":"r"}],[{"t":"easy","min":40,"orParkrun":true}],[{"t":"easy","min":120}]],
    [[{"t":"easy","min":30}],[{"t":"tempo","easy":30,"tempo":12}],[{"t":"easy","min":45}],[{"t":"rest"}],[{"t":"intervals","n":6,"workSec":60,"restSec":120,"pace":"r"}],[{"t":"easy","min":40,"orParkrun":true}],[{"t":"easy","min":130}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":30,"tempo":12}],[{"t":"easy","min":45}],[{"t":"rest"}],[{"t":"intervals","n":8,"workSec":30,"restSec":90,"pace":"r"}],[{"t":"easy","min":40,"orParkrun":true}],[{"t":"easy","min":100}]],
    [[{"t":"easy","min":30}],[{"t":"tempo","easy":30,"tempo":12}],[{"t":"easy","min":45}],[{"t":"rest"}],[{"t":"intervals","n":8,"workSec":60,"restSec":120,"pace":"r"}],[{"t":"easy","min":40,"orParkrun":true}],[{"t":"tempo","easy":90,"tempo":9}]],
    [[{"t":"easy","min":30}],[{"t":"tempo","easy":20,"tempo":24}],[{"t":"easy","min":45}],[{"t":"rest"}],[{"t":"intervals","n":8,"workSec":90,"restSec":150,"pace":"r"}],[{"t":"easy","min":40,"orParkrun":true}],[{"t":"tempo","easy":100,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":24}],[{"t":"easy","min":40}],[{"t":"rest"}],[{"t":"intervals","n":6,"workSec":90,"restSec":150,"pace":"r"}],[{"t":"easy","min":40,"orParkrun":true}],[{"t":"tempo","easy":90,"tempo":9}]],
    [[{"t":"easy","min":30}],[{"t":"tempo","easy":20,"tempo":28}],[{"t":"easy","min":45}],[{"t":"rest"}],[{"t":"intervals","n":3,"workSec":300,"restSec":180,"pace":"k5"}],[{"t":"easy","min":40,"orParkrun":true}],[{"t":"tempo","easy":110,"tempo":18}]],
    [[{"t":"easy","min":30}],[{"t":"intervals","n":3,"workSec":480,"restSec":180,"pace":"marathon"}],[{"t":"easy","min":45}],[{"t":"rest"}],[{"t":"intervals","n":4,"workSec":300,"restSec":180,"pace":"k5"}],[{"t":"easy","min":40,"orParkrun":true}],[{"t":"tempo","easy":110,"tempo":18}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":24}],[{"t":"easy","min":40}],[{"t":"rest"}],[{"t":"intervals","n":3,"workSec":300,"restSec":180,"pace":"k5"}],[{"t":"easy","min":40,"orParkrun":true}],[{"t":"tempo","easy":90,"tempo":9}]],
    [[{"t":"easy","min":30}],[{"t":"tempo","easy":30,"tempo":16}],[{"t":"easy","min":45}],[{"t":"rest"}],[{"t":"intervals","n":4,"workSec":180,"restSec":120,"pace":"vo2max"}],[{"t":"easy","min":40,"orParkrun":true}],[{"t":"tempo","easy":120,"tempo":18}]],
    [[{"t":"easy","min":30}],[{"t":"tempo","easy":20,"tempo":28}],[{"t":"easy","min":40}],[{"t":"rest"}],[{"t":"intervals","n":3,"workSec":180,"restSec":120,"pace":"vo2max"}],[{"t":"easy","min":35,"orParkrun":true}],[{"t":"tempo","easy":90,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":30,"tempo":12}],[{"t":"easy","min":35}],[{"t":"rest"}],[{"t":"tempo","easy":20,"tempo":15}],[{"t":"easy","min":25}],[{"t":"race"}]],
  ] },
  { key: "half-1h30", level: "advanced", label: "Advanced · Sub-1:30", targetMin: 90, weeks: [
    [[{"t":"easy","min":45}],[{"t":"tempo","easy":35,"tempo":12,"slot":"am"},{"t":"easy","min":30,"slot":"pm"}],[{"t":"easy","min":45}],[{"t":"easy","min":45}],[{"t":"tempo","easy":20,"tempo":24}],[{"t":"parkrun","min":25}],[{"t":"easy","min":90}]],
    [[{"t":"easy","min":45}],[{"t":"tempo","easy":40,"tempo":12,"slot":"am"},{"t":"easy","min":30,"slot":"pm"}],[{"t":"easy","min":50}],[{"t":"easy","min":45,"slot":"am"},{"t":"easy","min":30,"slot":"pm"}],[{"t":"tempo","easy":20,"tempo":30}],[{"t":"parkrun","min":20}],[{"t":"easy","min":110}]],
    [[{"t":"rest"}],[{"t":"easy","min":45}],[{"t":"easy","min":45}],[{"t":"easy","min":45}],[{"t":"tempo","easy":20,"tempo":24}],[{"t":"parkrun","min":20}],[{"t":"easy","min":90}]],
    [[{"t":"easy","min":45}],[{"t":"tempo","easy":40,"tempo":15,"slot":"am"},{"t":"easy","min":35,"slot":"pm"}],[{"t":"easy","min":55}],[{"t":"easy","min":45,"slot":"am"},{"t":"easy","min":35,"slot":"pm"}],[{"t":"intervals","n":6,"workSec":90,"restSec":150,"pace":"r"}],[{"t":"parkrun","min":20}],[{"t":"easy","min":120}]],
    [[{"t":"easy","min":45}],[{"t":"tempo","easy":45,"tempo":15,"slot":"am"},{"t":"easy","min":40,"slot":"pm"}],[{"t":"easy","min":55}],[{"t":"easy","min":45,"slot":"am"},{"t":"easy","min":35,"slot":"pm"}],[{"t":"intervals","n":10,"workSec":60,"restSec":120,"pace":"r"}],[{"t":"parkrun","min":20}],[{"t":"easy","min":130}]],
    [[{"t":"rest"}],[{"t":"easy","min":45}],[{"t":"easy","min":45}],[{"t":"easy","min":45,"slot":"am"},{"t":"easy","min":35,"slot":"pm"}],[{"t":"intervals","n":8,"workSec":60,"restSec":120,"pace":"r"}],[{"t":"parkrun","min":20}],[{"t":"easy","min":100}]],
    [[{"t":"easy","min":45}],[{"t":"intervals","n":3,"workSec":480,"restSec":180,"pace":"marathon"}],[{"t":"easy","min":60}],[{"t":"easy","min":45,"slot":"am"},{"t":"easy","min":40,"slot":"pm"}],[{"t":"intervals","n":12,"workSec":60,"restSec":120,"pace":"r"}],[{"t":"parkrun","min":20}],[{"t":"tempo","easy":90,"tempo":9}]],
    [[{"t":"easy","min":45}],[{"t":"tempo","easy":20,"tempo":30,"slot":"am"},{"t":"easy","min":45,"slot":"pm"}],[{"t":"easy","min":60}],[{"t":"easy","min":45,"slot":"am"},{"t":"easy","min":45,"slot":"pm"}],[{"t":"intervals","n":10,"workSec":90,"restSec":150,"pace":"r"}],[{"t":"parkrun","min":20}],[{"t":"tempo","easy":100,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"intervals","n":4,"workSec":300,"restSec":180,"pace":"marathon"}],[{"t":"easy","min":45}],[{"t":"easy","min":40,"slot":"am"},{"t":"easy","min":40,"slot":"pm"}],[{"t":"intervals","n":10,"workSec":60,"restSec":120,"pace":"r"}],[{"t":"parkrun","min":20}],[{"t":"tempo","easy":90,"tempo":9}]],
    [[{"t":"easy","min":45}],[{"t":"tempo","easy":20,"tempo":36,"slot":"am"},{"t":"easy","min":45,"slot":"pm"}],[{"t":"easy","min":60}],[{"t":"easy","min":45,"slot":"am"},{"t":"easy","min":45,"slot":"pm"}],[{"t":"intervals","n":5,"workSec":300,"restSec":180,"pace":"k5"}],[{"t":"parkrun","min":20}],[{"t":"tempo","easy":110,"tempo":18}]],
    [[{"t":"easy","min":45}],[{"t":"intervals","n":4,"workSec":600,"restSec":180,"pace":"marathon"}],[{"t":"easy","min":60}],[{"t":"easy","min":45,"slot":"am"},{"t":"easy","min":45,"slot":"pm"}],[{"t":"intervals","n":6,"workSec":300,"restSec":180,"pace":"k5"}],[{"t":"parkrun","min":20}],[{"t":"tempo","easy":110,"tempo":18}]],
    [[{"t":"rest"}],[{"t":"intervals","n":4,"workSec":480,"restSec":180,"pace":"marathon"}],[{"t":"easy","min":45}],[{"t":"easy","min":40,"slot":"am"},{"t":"easy","min":40,"slot":"pm"}],[{"t":"intervals","n":3,"workSec":300,"restSec":180,"pace":"k5"}],[{"t":"parkrun","min":20}],[{"t":"tempo","easy":90,"tempo":9}]],
    [[{"t":"easy","min":45}],[{"t":"tempo","easy":20,"tempo":40,"slot":"am"},{"t":"easy","min":45,"slot":"pm"}],[{"t":"easy","min":60}],[{"t":"easy","min":45,"slot":"am"},{"t":"easy","min":45,"slot":"pm"}],[{"t":"intervals","n":5,"workSec":300,"restSec":180,"pace":"k5"}],[{"t":"parkrun","min":20}],[{"t":"tempo","easy":120,"tempo":18}]],
    [[{"t":"easy","min":40}],[{"t":"tempo","easy":20,"tempo":30,"slot":"am"},{"t":"easy","min":40,"slot":"pm"}],[{"t":"easy","min":40}],[{"t":"easy","min":45,"slot":"am"},{"t":"easy","min":35,"slot":"pm"}],[{"t":"intervals","n":6,"workSec":180,"restSec":120,"pace":"vo2max"}],[{"t":"parkrun","min":20}],[{"t":"tempo","easy":90,"tempo":9}]],
    [[{"t":"rest"}],[{"t":"tempo","easy":35,"tempo":12}],[{"t":"easy","min":40}],[{"t":"easy","min":35}],[{"t":"tempo","easy":20,"tempo":18}],[{"t":"easy","min":25}],[{"t":"race"}]],
  ] },
];
