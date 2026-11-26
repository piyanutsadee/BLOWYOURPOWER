// เสียงประกอบเกม (เล่นในเบราว์เซอร์ผ่าน Web Audio ไม่เกี่ยวกับ Pi)
// กฎสำคัญ: ห้ามเล่นเสียงระหว่างปรับไมค์/ทดสอบเป่า ไม่งั้นเสียงจากลำโพงจะเข้าไมค์ทำให้คะแนนเพี้ยน
// (App.jsx สั่ง stopAll() ตอนเริ่มทดสอบ และเล่นเสียงผลลัพธ์หลังเป่าจบเท่านั้น)

const BASE = `${import.meta.env.BASE_URL}sounds/`;

// [ไฟล์, ความดังสัมพัทธ์] ปรับตามระดับเสียงจริงของแต่ละไฟล์ให้ดังใกล้เคียงกัน
const FILES = {
  click: ["click.ogg", 1.2],
  toggle: ["open-close.ogg", 1.5],
  inhale: ["inhale.ogg", 0.55],
  exhale: ["exhale.ogg", 0.5],
  roundDone: ["round-done.ogg", 0.8],
  allDone: ["all-done.ogg", 0.55],
  excellent: ["result-excellent.ogg", 0.55],
  good1: ["result-good-1.ogg", 0.55],
  good2: ["result-good-2.ogg", 0.8],
  train: ["result-train.ogg", 0.5],
  sea: ["sea-loop.ogg", 1],
};

const STORE_KEY = "byp-sound";
const stored = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) ?? {};
  } catch {
    return {};
  }
})();

let muted = stored.muted === true;
let volume = typeof stored.volume === "number" ? Math.min(1, Math.max(0, stored.volume)) : 0.8;
let ctx = null;
let master = null;
const buffers = new Map();
const voices = new Set();
let seaWanted = false;
let seaVoice = null;
let seaPending = false;

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ muted, volume }));
  } catch {
    /* ไม่มีที่เก็บค่า ก็ใช้ค่าในหน่วยความจำต่อไป */
  }
}

function ensure() {
  if (ctx) return ctx;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  ctx = new AudioContextClass();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : volume;
  master.connect(ctx.destination);
  return ctx;
}

function load(name) {
  if (!buffers.has(name)) {
    const promise = fetch(BASE + FILES[name][0])
      .then((response) => response.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .catch(() => null); // เบราว์เซอร์ถอดรหัสไม่ได้ → เงียบ ไม่ให้เกมพัง
    buffers.set(name, promise);
  }
  return buffers.get(name);
}

function fade(voice, seconds) {
  const now = ctx.currentTime;
  voice.gain.gain.cancelScheduledValues(now);
  voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
  voice.gain.gain.linearRampToValueAtTime(0, now + seconds);
  try {
    voice.src.stop(now + seconds + 0.02);
  } catch {
    /* หยุดไปแล้ว */
  }
}

function createVoice(buffer, level, { loop = false, fadeIn = 0 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = loop;
  const gain = ctx.createGain();
  if (fadeIn > 0) {
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(level, ctx.currentTime + fadeIn);
  } else {
    gain.gain.value = level;
  }
  src.connect(gain).connect(master);
  src.start();
  return { src, gain };
}

export async function play(name) {
  if (muted || !FILES[name] || !ensure()) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  const buffer = await load(name);
  if (!buffer || muted) return;
  const voice = createVoice(buffer, FILES[name][1]);
  voices.add(voice);
  voice.src.onended = () => voices.delete(voice);
}

// หยุดเสียงเอฟเฟกต์ทั้งหมดที่กำลังเล่น (ไม่รวมเสียงคลื่นทะเลพื้นหลัง)
export function stopAll() {
  if (!ctx) return;
  for (const voice of voices) fade(voice, 0.08);
  voices.clear();
}

async function syncSea() {
  if (seaWanted && !muted && !seaVoice && !seaPending && ensure()) {
    seaPending = true;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const buffer = await load("sea");
    seaPending = false;
    if (!buffer || !seaWanted || muted || seaVoice) return;
    seaVoice = createVoice(buffer, FILES.sea[1], { loop: true, fadeIn: 1.5 });
  } else if ((!seaWanted || muted) && seaVoice) {
    fade(seaVoice, 0.8);
    seaVoice = null;
  }
}

export function startSea() {
  seaWanted = true;
  syncSea();
}

export function stopSea() {
  seaWanted = false;
  syncSea();
}

export function getSettings() {
  return { muted, volume };
}

export function setMuted(value) {
  muted = value;
  save();
  if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02);
  if (muted) stopAll();
  syncSea();
}

export function setVolume(value) {
  volume = Math.min(1, Math.max(0, value));
  save();
  if (master && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
}

// เบราว์เซอร์ห้ามเล่นเสียงก่อนผู้ใช้แตะหน้าจอ → ปลดล็อกตอนแตะครั้งแรก แล้วโหลดไฟล์รอไว้เลย
function unlock() {
  if (!ensure()) return;
  ctx.resume().catch(() => {});
  Object.keys(FILES).forEach(load);
  syncSea();
}

for (const type of ["pointerdown", "keydown"]) {
  window.addEventListener(type, unlock, { once: true, capture: true });
}
