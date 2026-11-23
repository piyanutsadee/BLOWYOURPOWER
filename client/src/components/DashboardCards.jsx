import Icon, { LungIcon, WaveIcon } from "./Icons.jsx";

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

function CardTitle({ icon, children }) {
  return (
    <h2 className="card-title">
      {icon === "lungs" ? <LungIcon colorful /> : <Icon name={icon} />}
      <span>{children}</span>
    </h2>
  );
}

export function BreathingCard({ isExample, progress }) {
  const percentage = isExample ? 72 : progress;
  const progressLabel = isExample ? "การขยายตัวของปอด" : "การฟื้นฟูปอด";
  return (
    <section className="glass-card breathing-card" aria-label="การหายใจ">
      <CardTitle icon="lungs">การหายใจ <small lang="en">(Breathing)</small></CardTitle>
      <div className="breathing-readout">
        <div className="readout-rate">
          <div className="readout-label">
            <span>อัตราการหายใจ</span>
            <span className="example-label">ตัวอย่าง</span>
          </div>
          <div className="rate-row">
            <strong>16</strong>
            <span>ครั้ง/นาที</span>
            <WaveIcon />
          </div>
        </div>
        <div className="readout-expansion">
          <div className="readout-label">
            <span>{progressLabel}</span>
            {isExample && <span className="example-label">ตัวอย่าง</span>}
          </div>
          <strong className="expansion-value">{percentage}%</strong>
          <div
            className="progress-track"
            role="progressbar"
            aria-label={isExample ? `ตัวอย่าง${progressLabel}` : progressLabel}
            aria-valuenow={percentage}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="progress-fill" style={{ width: `${percentage}%` }} />
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

export function MicrophoneCard({ label, tone, buttonLabel, isDemo, holding, complete, onPress, onRelease, onClick }) {
  return (
    <section className="glass-card microphone-card" aria-label="เป่าลมเพื่อควบคุมปอด">
      <CardTitle icon="mic">เป่าลมเพื่อควบคุมปอด</CardTitle>
      <div className="mic-face">
        <button
          className="mic-button"
          type="button"
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
    </section>
  );
}

export function LearningCard({ view }) {
  const active = VIEWS.find(({ value }) => value === view);
  return (
    <section className="glass-card microphone-card learning-card" aria-label="เรียนรู้เรื่องปอด">
      <CardTitle icon="book">เรียนรู้เรื่องปอด</CardTitle>
      <div className="learning-content">
        <h3>{active.title}</h3>
        <p>{active.detail}</p>
      </div>
      <p className="learning-hint">เลือกส่วนที่อยากดูจากแถบด้านล่าง</p>
    </section>
  );
}
