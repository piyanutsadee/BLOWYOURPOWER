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
      evidence: ["game", "spirometry"],
    },
  },
  pollutionHigh: (pm25) =>
    `ค่าฝุ่น PM2.5 ตอนนี้ ${pm25} µg/m³ สูงกว่าค่าแนะนำ ${CONFIG.pm25Guideline} µg/m³ ` +
    "แนะนำออกกำลังกายในร่มและสวมหน้ากากเมื่ออยู่กลางแจ้ง",
  disclaimer:
    "ผลนี้เป็นการประเมินเบื้องต้นจากเสียงลมหายใจเพื่อความสนุกและการเรียนรู้ ไม่ใช่การวินิจฉัยโรค " +
    "และวัดค่า FEV1/FVC ไม่ได้ (ต้องตรวจสไปโรเมทรีกับแพทย์) หากกังวลเรื่องสุขภาพ ควรปรึกษาแพทย์",
};

// แหล่งอ้างอิง (MEDICAL INTEGRATION)
// ตัวเลขทุกค่าอ่านจากแหล่งโดยตรง ยกเว้นรายการ "game" (บทคัดย่อ ERS PA354) ที่เปิดอ่านไม่ได้
// จึงใช้ตามสรุปในสไลด์ของทีม ควรตรวจกับบทคัดย่อฉบับเต็มอีกครั้ง
export const REFERENCES = [
  {
    id: "game",
    tab: "เกมฝึกหายใจ",
    topic: "เกมฝึกหายใจเทียบกับการฝึกแบบปกติในเด็กหลอดลมพอง",
    short: "ERS บทคัดย่อ PA354",
    why: "ทั้งการฝึกหายใจผ่านวิดีโอเกมและการฝึกแบบปกติช่วยพัฒนาสมรรถภาพการหายใจ",
    detail:
      "ศึกษาเปรียบเทียบการฝึกหายใจผ่านวิดีโอเกมกับการฝึกแบบปกติในเด็กและวัยรุ่นที่มีภาวะหลอดลมพอง เป็นเวลา 8 สัปดาห์ " +
      "พบว่าทั้งสองวิธีช่วยพัฒนาสมรรถภาพการหายใจ และกลุ่มที่ใช้เกมมีพัฒนาการด้านความแข็งแรงของกล้ามเนื้อหายใจเพิ่มเติม" +
      " [อ้างอิง: European Respiratory Journal 62 (Suppl 67), บทคัดย่อ PA354]",
    howUsed:
      "การเป่าต่อเนื่องในเกมเป็นการฝึกหายใจในรูปแบบเกม ผลประเมินจะแนะนำให้ฝึกต่อหรือออกกำลังกายตามระดับ " +
      "(งานวิจัยนี้ศึกษาในเด็กและวัยรุ่น ไม่ใช่ผลที่รับประกันกับทุกคน)",
    url: "https://publications.ersnet.org/content/erj/62/suppl67/pa354.abstract",
  },
  {
    id: "spirometry",
    tab: "สไปโรเมทรี",
    topic: "มาตรฐานการวัดสมรรถภาพปอด (สไปโรเมทรี) ATS/ERS 2019",
    short: "ATS/ERS 2019",
    why: "การตรวจสมรรถภาพปอดมาตรฐาน (สไปโรเมทรี) วัด FEV1 และ FVC ด้วยเครื่องวัดการไหลของลม ซึ่งไมโครโฟนทำแทนไม่ได้",
    detail:
      "FVC คือปริมาตรลมที่เป่าออกให้เต็มที่และสุดแรงหลังหายใจเข้าเต็มปอด ส่วน FEV1 คือปริมาตรใน 1 วินาทีแรก " +
      "มาตรฐานกำหนดให้เป่าต่อเนื่องจนจบ คือปริมาตรเปลี่ยนน้อยกว่า 0.025 ลิตรอย่างน้อย 1 วินาที หรือเป่าครบ 15 วินาที " +
      "การหยุดกลางคันหรือหายใจเข้าก่อนจบทำให้ผลใช้ไม่ได้ ต้องได้อย่างน้อย 3 รอบที่ผ่านเกณฑ์ " +
      "และค่า FVC กับ FEV1 ของสองรอบที่สูงสุดต้องต่างกันไม่เกิน 150 mL (อายุเกิน 6 ปี) ฉบับปี 2019 ไม่กำหนดเวลาเป่าขั้นต่ำ" +
      " [อ้างอิง: Graham BL และคณะ. Am J Respir Crit Care Med 2019;200(8):e70–e88]",
    howUsed:
      "เกมนี้ไม่ใช่สไปโรเมทรีและวัด FEV1/FVC ไม่ได้ แต่ยึดหลักคล้ายกัน คือต้องเป่าต่อเนื่องไม่หยุดกลางคัน " +
      "เป้าหมาย 8 วินาทีเป็นค่าที่เกมตั้งเอง ไม่ได้มาจากมาตรฐานนี้ หากต้องการทราบสมรรถภาพปอดจริง ควรตรวจสไปโรเมทรีกับแพทย์",
    url: "https://www.aarc.org/wp-content/uploads/2026/06/ers-ats-standardization-of-spirometry.pdf",
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
