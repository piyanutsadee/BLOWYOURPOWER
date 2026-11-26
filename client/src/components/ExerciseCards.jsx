import Icon from "./Icons.jsx";
import { CardTitle } from "./DashboardCards.jsx";
import { PATTERNS } from "../hooks/useExercise.js";

export function ExercisePicker({ patternId, onSelect }) {
  return (
    <section className="glass-card breathing-card exercise-picker" aria-label="เลือกท่าฝึก">
      <CardTitle icon="lungs">เลือกท่าฝึก</CardTitle>
      <div className="exercise-options" role="group" aria-label="ท่าบริหารปอด">
        {PATTERNS.map(({ id, title, hint }) => (
          <button key={id} type="button" aria-pressed={id === patternId} onClick={() => onSelect(id)}>
            <b>{title}</b>
            <span>{hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function ExerciseProgress({ pattern, state }) {
  const steps = pattern.kind === "hold"
    ? pattern.goals.map((seconds) => `${seconds} วิ`)
    : Array.from({ length: pattern.target }, (_, index) => String(index + 1));
  return (
    <section className="glass-card status-card exercise-progress" aria-label="ความคืบหน้า">
      <CardTitle icon="heart">{pattern.kind === "hold" ? "เป้าหมาย" : "รอบที่ทำแล้ว"}</CardTitle>
      <ol className="step-chips">
        {steps.map((text, index) => (
          <li key={text} data-done={index < state.round || undefined} data-current={state.running && index === state.round || undefined}>
            {index < state.round ? <Icon name="check" /> : text}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ExercisePacer({ pattern, state, onStart, onStop, onHold }) {
  const isHold = pattern.kind === "hold";
  const scale = 0.42 + 0.58 * state.fill;
  const caption = state.done
    ? "ครบแล้ว เก่งมาก!"
    : state.running
      ? state.label
      : isHold ? "กดค้างปุ่มวงกลมเพื่อเริ่มเป่า" : "กดเริ่มฝึก แล้วหายใจตามวงกลม";
  const tone = state.done || state.running ? "live" : "ready";
  const center = state.running ? state.remaining : state.done ? "✓" : isHold ? state.goal : "พร้อม";

  const face = (
    <>
      <span className="pacer-disc" style={{ transform: `scale(${scale})` }} />
      <span className="pacer-count" data-small={center === "พร้อม" || undefined}>{center}</span>
    </>
  );

  return (
    <section className="glass-card microphone-card exercise-pacer" aria-label="ตัวนำจังหวะ" data-silent>
      <CardTitle icon="lungs">{pattern.title}</CardTitle>
      {isHold ? (
        <button
          className="mic-face pacer-face"
          type="button"
          aria-label="กดค้างเพื่อเป่า"
          aria-keyshortcuts="Space"
          aria-pressed={state.dir === "hold"}
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            onHold(true);
          }}
          onPointerUp={() => onHold(false)}
          onPointerCancel={() => onHold(false)}
          onLostPointerCapture={() => onHold(false)}
          onContextMenu={(event) => event.preventDefault()}
        >
          {face}
        </button>
      ) : (
        <div className="mic-face pacer-face" role="img" aria-label="วงกลมนำจังหวะการหายใจ">{face}</div>
      )}
      <p className="mic-status" role="status" data-tone={tone}>
        <span className="mic-status-dot" />
        {caption}
      </p>
      {!isHold && (
        <button type="button" className="pill-action" onClick={state.running ? onStop : onStart}>
          {state.running ? "หยุดฝึก" : state.done ? "ฝึกอีกรอบ" : "เริ่มฝึก"}
        </button>
      )}
    </section>
  );
}
