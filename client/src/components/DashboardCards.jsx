import { useState } from "react";
import Icon, { LungIcon, WaveIcon } from "./Icons.jsx";
import { CONFIG, MESSAGES, REFERENCES } from "../lib/blowAssessment.js";

export const VIEWS = [
  {
    value: "lungs",
    label: "มุมมองปอด",
    title: "ปอด",
    detail: "ปอดขยายเมื่อเราหายใจเข้า และยุบลงเมื่อเราหายใจออก ภายในปอดมีถุงลมเล็ก ๆ ที่ช่วยแลกเปลี่ยนก๊าซกับเลือด",
  },
  {
    value: "bronchi",
    label: "หลอดลม",
    title: "หลอดลม",
    detail: "หลอดลมนำอากาศเข้าปอดทั้งสองข้าง แล้วแตกแขนงเป็นทางเดินเล็กลงเพื่อส่งอากาศไปถึงถุงลม",
  },
  {
    value: "alveoli",
    label: "ถุงลม",
    title: "ถุงลม",
    detail: "ออกซิเจนจากอากาศผ่านผนังถุงลมเข้าสู่เลือด ส่วนคาร์บอนไดออกไซด์ผ่านกลับมาที่ถุงลมเพื่อให้เราหายใจออก",
  },
];

export function CardTitle({ icon, children }) {
  return (
    <h2 className="card-title">
      {icon === "lungs" ? <LungIcon colorful /> : <Icon name={icon} />}
      <span>{children}</span>
    </h2>
  );
}

export function BreathingCard({ progress }) {
  const seconds = (progress / 100) * CONFIG.blow.goalSeconds;
  return (
    <section className="glass-card breathing-card" aria-label="การหายใจ">
      <CardTitle icon="lungs">การหายใจ <small lang="en">(Breathing)</small></CardTitle>
      <div className="breathing-readout">
        <div className="readout-rate">
          <div className="readout-label">
            <span>เป่าต่อเนื่อง</span>
          </div>
          <div className="rate-row">
            <strong>{seconds.toFixed(1)}</strong>
            <span>วินาที</span>
            <WaveIcon />
          </div>
        </div>
        <div className="readout-expansion">
          <div className="readout-label">
            <span>การฟื้นฟูปอด</span>
          </div>
          <strong className="expansion-value">{progress}%</strong>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="การฟื้นฟูปอด"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
    </section>
  );
}

export function StatusCard({ label, complete, working }) {
  return (
    <section className="glass-card status-card" aria-label="สถานะ">
      <CardTitle icon="heart">สถานะ</CardTitle>
      <p className="status-line" role="status" data-working={working || undefined} data-complete={complete || undefined}>
        <span className="status-check"><Icon name="check" /></span>
        <span>{label}</span>
      </p>
    </section>
  );
}

export function ScoreCard({ last, best }) {
  return (
    <section className="glass-card status-card score-card" aria-label="ผลทดสอบ">
      <CardTitle icon="heart">ผลทดสอบ</CardTitle>
      <dl className="score-row">
        <div><dt>ล่าสุด</dt><dd>{last ?? "–"}</dd></div>
        <div><dt>ดีที่สุด</dt><dd>{best ?? "–"}</dd></div>
      </dl>
    </section>
  );
}

export function MicrophoneCard({ label, tone, buttonLabel, isDemo, holding, complete, disabled, onExercise, onPress, onRelease, onClick }) {
  return (
    <section className="glass-card microphone-card" aria-label="เป่าลมทดสอบปอด" data-silent>
      <CardTitle icon="mic">เป่าลมทดสอบปอด</CardTitle>
      <div className="mic-face">
        <button
          className="mic-button"
          type="button"
          disabled={disabled}
          aria-label={buttonLabel}
          aria-describedby="mic-status"
          aria-keyshortcuts={isDemo ? "Space" : undefined}
          aria-pressed={isDemo && !complete ? holding : undefined}
          data-holding={holding || undefined}
          onPointerDown={(event) => {
            if (!isDemo || complete || !event.isPrimary || event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            onPress(event.pointerId);
          }}
          onPointerUp={(event) => onRelease(event.pointerId)}
          onPointerCancel={(event) => onRelease(event.pointerId)}
          onLostPointerCapture={(event) => onRelease(event.pointerId)}
          onContextMenu={(event) => { if (isDemo) event.preventDefault(); }}
          onKeyDown={(event) => {
            if (!isDemo || complete || event.code !== "Space") return;
            event.preventDefault();
            if (!event.repeat) onPress("space");
          }}
          onClick={onClick}
        >
          <Icon name={complete ? "check" : "mic"} />
        </button>
      </div>
      <p className="mic-status" id="mic-status" role="status" data-tone={tone}>
        <span className="mic-status-dot" />
        {label}
      </p>
      {disabled && (
        <button type="button" className="pill-action quiet" onClick={onExercise}>ลองฝึกในโหมดบริหารปอด</button>
      )}
    </section>
  );
}

export function ResultCard({ result, onClose, onOpenMedical }) {
  const { score, tier, message, blow, completed, evidence, extra, disclaimer } = result;
  return (
    <section className="glass-card result-card" data-tier={tier} data-silent role="dialog" aria-labelledby="result-title">
      <CardTitle icon="heart">ผลประเมินการเป่า</CardTitle>
      <p className="result-score" aria-label={`คะแนน ${score} จาก 100`}>
        <strong>{score}</strong><span>/ 100</span>
      </p>
      <h3 id="result-title">{message.title}</h3>
      <p>{message.body}</p>
      <ul className="result-metrics">
        <li><span>เป่าต่อเนื่องนานสุด</span><b>{blow.duration.toFixed(1)} วิ</b></li>
        <li><span>ความนิ่งของแรงเป่า</span><b>{Math.round(blow.steadiness * 100)}%</b></li>
        <li><span>{completed ? "ฟื้นฟูปอดสำเร็จ" : `เป้าหมาย ${CONFIG.blow.goalSeconds} วิ`}</span><b>{completed ? "✓" : "–"}</b></li>
      </ul>
      {extra.map((text) => <p key={text} className="result-evidence">{text}</p>)}
      <p className="result-evidence">
        อ้างอิง:{" "}
        {evidence.map((ref, index) => (
          <span key={ref.id}>
            {index > 0 && " · "}
            <a href={ref.url} target="_blank" rel="noopener noreferrer">{ref.short}</a>
          </span>
        ))}
        <br />
        {evidence.map((ref) => ref.why).join(" ")}
      </p>
      <p className="result-disclaimer">{disclaimer}</p>
      <div className="result-actions">
        <button type="button" onClick={onClose}>เป่าอีกครั้ง</button>
        <button type="button" className="secondary" onClick={onOpenMedical}>ดูข้อมูลการแพทย์</button>
      </div>
    </section>
  );
}

export function MedicalPage({ onClose }) {
  const [selected, setSelected] = useState(REFERENCES[0].id);
  const ref = REFERENCES.find(({ id }) => id === selected);
  const [excellent, good] = CONFIG.tiers;
  const tiers = [
    { id: "excellent", range: `${excellent.min} ขึ้นไป`, ...MESSAGES.tiers.excellent },
    { id: "good", range: `${good.min}–${excellent.min - 1}`, ...MESSAGES.tiers.good },
    { id: "train", range: `ต่ำกว่า ${good.min}`, ...MESSAGES.tiers.train },
  ];
  return (
    <div className="medical-overlay" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="medical-modal" role="dialog" aria-modal="true" aria-labelledby="medical-title">
        <header className="medical-modal-bar">
          <Icon name="medical" />
          <h2 id="medical-title">ข้อมูลการแพทย์ <small lang="en">Medical Integration</small></h2>
          <button type="button" className="medical-close" onClick={onClose} autoFocus>
            <span aria-hidden="true">×</span> ปิด
          </button>
        </header>

        <div className="medical-modal-body">
          <div className="medical-layout">
            <nav className="medical-list" aria-label="เลือกงานวิจัย">
              {REFERENCES.map(({ id, tab, short }) => (
                <button key={id} type="button" aria-pressed={id === selected} onClick={() => setSelected(id)}>
                  <b>{tab}</b>
                  <span>{short}</span>
                </button>
              ))}
            </nav>

            <article className="medical-article">
              <h3>{ref.topic}</h3>
              <p className="medical-why">{ref.why}</p>
              <p>{ref.detail}</p>
              <div className="medical-how">
                <b>ใช้ในเกมนี้อย่างไร</b>
                <p>{ref.howUsed}</p>
              </div>
              <a className="medical-source" href={ref.url} target="_blank" rel="noopener noreferrer">เปิดแหล่งอ้างอิง ↗</a>
            </article>
          </div>

          <section className="medical-criteria" aria-labelledby="criteria-title">
            <h3 id="criteria-title">เกณฑ์ประเมินการเป่าในเกม</h3>
            <p>คิดจากเวลาที่เป่าต่อเนื่อง (เป้าหมาย {CONFIG.blow.goalSeconds} วินาที) และความนิ่งของแรงเป่า ได้คะแนนเต็ม 100</p>
            <div className="tier-grid">
              {tiers.map(({ id, range, title, body }) => (
                <article key={id} className="tier-card" data-tier={id}>
                  <h4>{range}</h4>
                  <b>{title}</b>
                  <p>{body}</p>
                </article>
              ))}
            </div>
            <p className="medical-note">{MESSAGES.disclaimer}</p>
          </section>
        </div>
      </section>
    </div>
  );
}

export function LearningCard({ view, onOpenMedical }) {
  const active = VIEWS.find(({ value }) => value === view);
  return (
    <section className="glass-card microphone-card learning-card" aria-label="เรียนรู้เรื่องปอด">
      <CardTitle icon="book">เรียนรู้เรื่องปอด</CardTitle>
      <div className="learning-content">
        <h3>{active.title}</h3>
        <p>{active.detail}</p>
      </div>
      <p className="learning-hint">เลือกส่วนที่อยากดูจากแถบด้านล่าง</p>
      <button type="button" className="medical-open" onClick={onOpenMedical}>
        <Icon name="medical" />
        <span>การแพทย์</span>
      </button>
    </section>
  );
}
