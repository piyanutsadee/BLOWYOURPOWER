import { CONFIG, analyzeBlow, assess } from "./blowAssessment.js";

export const SAMPLE_DT = 0.05; // วินาที

/**
 * ติดตามการเป่า 1 รอบ (attempt) จาก session ของเกม
 * รอบเริ่มเมื่อ mode เป็น PLAY และจบเมื่อ DONE (ฟื้นฟูสำเร็จ) หรือเมื่อปอดย้อนกลับถึง 0 (IDLE)
 * เรียก push() ทุก SAMPLE_DT วินาที จะคืนผลประเมินเมื่อรอบจบ (หรือ null)
 */
export class AttemptTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.active = false;
    this.levels = [];
    this.threshold = 0.02;
  }

  push({ screen, mode, level, threshold }) {
    if (!this.active) {
      if (screen === "GAME" && mode === "PLAY") {
        this.active = true;
        this.levels = [];
      } else {
        return null;
      }
    }

    this.threshold = threshold;
    this.levels.push(level);

    if (mode === "DONE") return this.#finish(true);
    if (mode === "IDLE" || screen !== "GAME") return this.#finish(false);
    return null;
  }

  #finish(completed) {
    const blow = analyzeBlow(this.levels, SAMPLE_DT, { minLevel: this.threshold });
    this.reset();
    if (blow.total < CONFIG.blow.minAttempt) return null;
    return { completed, blow, ...assess({ blow }) };
  }
}
