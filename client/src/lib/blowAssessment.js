// Blow Your Power — เกณฑ์ประเมินการเป่า และข้อมูลอ้างอิงทางการแพทย์
//
// ข้อควรรู้: ไมโครโฟนวัดค่า FEV1/FVC ไม่ได้ เกมจึงประเมินจาก "ระยะเวลาเป่าต่อเนื่อง"
// และ "ความนิ่งของแรงเป่า" เท่านั้น ค่าใน CONFIG เป็นค่าออกแบบเกม ยังไม่ผ่านการรับรองทางคลินิก
// ควรให้ผู้เชี่ยวชาญด้านการแพทย์ทบทวนก่อนใช้จริง

export const GAME_TITLE = "Blow Your Power";

export const CONFIG = {
  blow: {
    gapTolerance: 0.5, // วินาที: ขาดช่วงสั้นกว่านี้ยังนับว่าเป่าต่อเนื่อง (เท่ากับ reset-delay ของ server)
    rampSkip: 0.5,     // วินาที: ตัดช่วงเริ่มเป่าออกตอนวัดความนิ่ง
    goalSeconds: 8,    // เท่ากับ --duration ของ server: เป่าถึงเท่านี้ได้คะแนนระยะเวลาเต็ม
    minAttempt: 1.5,   // เป่าน้อยกว่านี้ถือเป็นการทดลองไมค์ ไม่แสดงผลประเมิน
  },
  rate: { normalMin: 12, normalMax: 20 }, // ครั้ง/นาที ขณะพักของผู้ใหญ่ (ถ้ามีข้อมูลอัตราหายใจ)
  // คะแนน = (ระยะเวลาเป่า) x (0.4 + 0.6 x ความนิ่ง) x (0.8 + 0.2 x คะแนนอัตราหายใจ)
  // ไม่เป่าเลย = 0 คะแนนเสมอ
  steadinessInfluence: 0.6,
  rateInfluence: 0.2,
  tiers: [
    { id: "excellent", min: 80 },
    { id: "good", min: 55 },
    { id: "train", min: 0 },
  ],
  pm25Guideline: 15, // µg/m³ ค่าแนะนำ 24 ชม. ขององค์การอนามัยโลก (WHO 2021)
};

const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));

/**
 * วิเคราะห์การเป่า 1 รอบ
 * @param {number[]} levels ระดับเสียงที่สุ่มทุกๆ dt วินาที
 * @param {number} dt ช่วงเวลาระหว่างตัวอย่าง (วินาที)
 * @param {{minLevel?:number}} opts minLevel = ระดับที่นับว่ากำลังเป่า (ใช้ threshold ของเกม)
 */
export function analyzeBlow(levels, dt, { minLevel = 0.02 } = {}) {
  const { gapTolerance, rampSkip } = CONFIG.blow;
  const maxGap = Math.max(1, Math.round(gapTolerance / dt));

  let best = { start: 0, end: -1 };
  let start = -1;
  let lastLoud = -1;
  let loudCount = 0;
  for (let i = 0; i < levels.length; i++) {
    if (levels[i] > minLevel) {
      loudCount++;
      if (start === -1 || i - lastLoud > maxGap) start = i;
      lastLoud = i;
      if (lastLoud - start > best.end - best.start) best = { start, end: lastLoud };
    }
  }
  if (best.end < best.start) return { duration: 0, total: 0, steadiness: 0, peak: 0 };

  const run = levels.slice(best.start, best.end + 1);
  const duration = run.length * dt;
  const peak = Math.max(...run);

  // ความนิ่ง = 1 - สัมประสิทธิ์การแปรผัน (ไม่ขึ้นกับความไวของไมค์)
  // ใช้เฉพาะช่วงที่เป่าอยู่จริง ไม่นับช่วงขาดสั้นๆ
  const body = run.slice(Math.round(rampSkip / dt)).filter((v) => v > minLevel);
  let steadiness = 0;
  if (body.length >= 3) {
    const mean = body.reduce((a, b) => a + b, 0) / body.length;
    const sd = Math.sqrt(body.reduce((a, b) => a + (b - mean) ** 2, 0) / body.length);
    steadiness = clamp(1 - sd / mean);
  }
  return { duration, total: loudCount * dt, steadiness, peak };
}

/** คะแนนอัตราหายใจ 0..100 (ในช่วงปกติ = 100, นอกช่วงลดลงครั้งละ 10 คะแนน) */
export function scoreRate(bpm) {
  const { normalMin, normalMax } = CONFIG.rate;
  if (bpm == null || Number.isNaN(bpm)) return null;
  const off = bpm < normalMin ? normalMin - bpm : bpm > normalMax ? bpm - normalMax : 0;
  return clamp(100 - off * 10, 0, 100);
}

/** รวมผลเป็นคะแนน 0..100 พร้อมระดับ ข้อความ และหลักฐานอ้างอิง */
export function assess({ blow, bpm, pm25 }) {
  const parts = {
    duration: clamp(blow.duration / CONFIG.blow.goalSeconds) * 100,
    steadiness: clamp(blow.steadiness) * 100,
    rate: scoreRate(bpm),
  };
  const steadyMul = 1 - CONFIG.steadinessInfluence + CONFIG.steadinessInfluence * clamp(blow.steadiness);
  const rateMul = parts.rate == null ? 1 : 1 - CONFIG.rateInfluence + CONFIG.rateInfluence * (parts.rate / 100);
  const score = Math.round(parts.duration * steadyMul * rateMul);

  const tier = CONFIG.tiers.find((t) => score >= t.min).id;
  const message = MESSAGES.tiers[tier];
  const extra = pm25 != null && pm25 > CONFIG.pm25Guideline ? [MESSAGES.pollutionHigh(pm25)] : [];
  const evidence = message.evidence.map((id) => REFERENCES.find((r) => r.id === id));
  return { score, tier, parts, message, extra, evidence, disclaimer: MESSAGES.disclaimer };
}

export const MESSAGES = {
  tiers: {
    excellent: {
      title: "สุขภาพปอดของคุณดีมาก!",
      body: "คุณเป่าลมได้ยาวและสม่ำเสมอ รักษาระดับนี้ไว้ด้วยการออกกำลังกายสม่ำเสมอ และหลีกเลี่ยงควันและฝุ่น",
      evidence: ["pollution"],
    },
    good: {
      title: "ปอดของคุณอยู่ในเกณฑ์ดี",
      body: "ฝึกหายใจช้าและลึกวันละ 5 นาที จะช่วยให้เป่าได้นานและนิ่งขึ้น",
      evidence: ["game"],
    },
    train: {
      title: "ถึงเวลาออกกำลังกายปอดแล้ว",
      body:
        "ลองฝึกหายใจด้วยกะบังลมและเป่าลมแบบห่อปาก วันละ 5–10 นาที และออกกำลังกายแบบแอโรบิก เช่น เดินเร็ว " +
        "ถ้าไอเรื้อรังหรือหายใจเหนื่อยผิดปกติ ควรปรึกษาแพทย์",
      evidence: ["game", "pollution"],
    },
  },
  pollutionHigh: (pm25) =>
    `ค่าฝุ่น PM2.5 ตอนนี้ ${pm25} µg/m³ สูงกว่าค่าแนะนำ ${CONFIG.pm25Guideline} µg/m³ ` +
    "แนะนำออกกำลังกายในร่มและสวมหน้ากากเมื่ออยู่กลางแจ้ง",
  disclaimer:
    "ผลนี้เป็นการประเมินเบื้องต้นจากเสียงลมหายใจเพื่อความสนุกและการเรียนรู้ ไม่ใช่การวินิจฉัยโรค " +
    "และวัดค่า FEV1/FVC ไม่ได้ หากกังวลเรื่องสุขภาพ ควรตรวจสมรรถภาพปอดกับแพทย์",
};

// แหล่งอ้างอิง (MEDICAL INTEGRATION)
export const REFERENCES = [
  {
    id: "breeze",
    tab: "Breeze 2",
    topic: "ใช้เสียงลมหายใจควบคุมเกมฝึกหายใจ",
    short: "Breeze 2 (2022)",
    why: "แอปฝึกหายใจใช้ไมโครโฟนสมาร์ตโฟนจำแนกเสียงหายใจเข้า ออก และไม่ใช่การหายใจ แล้วนำมาควบคุมเกม",
    detail:
      "ทดลองกับผู้ใหญ่ 30 คน ผู้ใช้ 93% (28 จาก 30 คน) รู้สึกว่าน่าสนใจและได้ผล " +
      "และการตรวจจับแม่นกว่าเมื่อใช้ไมค์สมาร์ตโฟนเทียบกับหูฟัง",
    howUsed: "เกมนี้ใช้ไมโครโฟนตรวจจับการเป่าและนำมาควบคุมการฟื้นฟูปอดบนหน้าจอ ตามแนวคิดเดียวกัน",
    url: "https://games.jmir.org/2022/3/e39186/",
  },
  {
    id: "game",
    tab: "เกมฝึกหายใจ",
    topic: "เกมฝึกหายใจเทียบกับการฝึกแบบปกติในเด็กหลอดลมพอง",
    short: "ฝึกหายใจผ่านวิดีโอเกม 8 สัปดาห์",
    why: "ทั้งการฝึกหายใจผ่านวิดีโอเกมและการฝึกแบบปกติช่วยพัฒนาสมรรถภาพการหายใจ",
    detail:
      "ศึกษาในเด็กและวัยรุ่น 8 สัปดาห์ พบว่าทั้งสองวิธีช่วยพัฒนาสมรรถภาพการหายใจ " +
      "และกลุ่มที่ใช้เกมมีพัฒนาการด้านความแข็งแรงของกล้ามเนื้อหายใจเพิ่มเติม",
    howUsed: "การเป่าต่อเนื่องเป็นการฝึกหายใจในรูปแบบเกม ผลประเมินจะแนะนำให้ฝึกต่อหรือออกกำลังกายตามระดับ",
    url: "https://shorturl.asia/wiymmt",
  },
  {
    id: "pollution",
    tab: "มลพิษทางอากาศ",
    topic: "ผลกระทบของมลพิษทางอากาศต่อการทำงานของปอด",
    short: "ทบทวนวรรณกรรมเชิงระบบ 27 งานวิจัย",
    why: "การสัมผัสมลพิษระยะยาว รวมถึงฝุ่น PM2.5 สัมพันธ์กับสมรรถภาพปอดผู้ใหญ่ที่ลดลง",
    detail:
      "รวบรวมงานวิจัย 27 เรื่อง พบว่ามลพิษทางอากาศ (NO₂, O₃, PM2.5, PM10) สัมพันธ์กับค่า FEV1 และ FVC ที่ลดลง " +
      "ตัวอย่าง: NO₂ ที่เพิ่มขึ้นทุก 10 µg/m³ สัมพันธ์กับ FVC ลดลงเฉลี่ย 25.3 mL",
    howUsed: "ปอดที่ฟื้นตัวเมื่อเป่าต่อเนื่อง สื่อว่าการลดมลพิษและการฝึกหายใจช่วยปกป้องปอดได้",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12152583/",
  },
];
