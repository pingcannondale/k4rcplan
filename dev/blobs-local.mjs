// ตัวแทน @netlify/blobs สำหรับรันในเครื่อง: เก็บข้อมูลเป็นไฟล์ในโฟลเดอร์ .devdata/
import fs from "node:fs";
import path from "node:path";
const dir = path.resolve(".devdata");
const file = (k) => path.join(dir, encodeURIComponent(k) + ".json");
export const getStore = () => ({
  async get(k) { try { return JSON.parse(fs.readFileSync(file(k), "utf8")); } catch { return null; } },
  async setJSON(k, v) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file(k), JSON.stringify(v)); },
  async delete(k) { try { fs.unlinkSync(file(k)); } catch {} },
});
