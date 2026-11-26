import { useCallback, useEffect, useRef, useState } from "react";
import Lungs from "./components/Lungs.jsx";
import Icon, { LungIcon } from "./components/Icons.jsx";
import {
  BreathingCard, LearningCard, MedicalPage, MicrophoneCard, ResultCard, ScoreCard, VIEWS,
} from "./components/DashboardCards.jsx";
import { ExercisePacer, ExercisePicker, ExerciseProgress } from "./components/ExerciseCards.jsx";
import { useAttemptResult, useServerBreathing } from "./hooks/useBreathing.js";
import { useExercise } from "./hooks/useExercise.js";
import * as sound from "./lib/sound.js";

const PAGES = [
  { value: "home", icon: "home", label: "หน้าแรก" },
  { value: "learn", icon: "book", label: "เรียนรู้" },
  { value: "exercise", icon: "lungs", label: "บริหารปอด" },
];

function OpeningControls({ page, onPage, settingsId }) {
  return (
    <header className="dashboard-header">
      <h1 className="brand">
        <span className="brand-cloud"><LungIcon colorful /></span>
        <span className="brand-wordmark" lang="en">Blow Your <b>Power</b></span>
      </h1>
      <nav className="main-navigation" aria-label="เมนูหลัก">
        {PAGES.map(({ value, icon, label }) => (
          <button
            key={value}
            type="button"
            aria-current={page === value ? "page" : undefined}
            onClick={() => onPage(value)}
          >
            {icon === "lungs" ? <LungIcon /> : <Icon name={icon} />}
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <button
        className="settings-button"
        type="button"
        popoverTarget={settingsId}
        aria-label="ตั้งค่า"
        title="ตั้งค่า"
      >
        <Icon name="gear" />
      </button>
    </header>
  );
}

function ViewSelector({ view, onView }) {
  return (
    <div className="view-controls">
      <nav className="view-selector" aria-label="มุมมอง 3 มิติ">
        {VIEWS.map(({ value, label }) => (
          <button key={value} type="button" aria-pressed={view === value} onClick={() => onView(value)}>
            {value === "lungs" ? <LungIcon /> : <Icon name={value} />}
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <p className="rotate-hint">ลากหุ่นเพื่อหมุนดูรอบด้าน</p>
    </div>
  );
}

function SoundControls() {
  const [settings, setSettings] = useState(sound.getSettings);
  return (
    <>
      <button
        type="button"
        aria-pressed={!settings.muted}
        onClick={() => {
          sound.setMuted(!settings.muted);
          setSettings(sound.getSettings());
        }}
      >
        {settings.muted ? "เสียง: ปิด" : "เสียง: เปิด"}
      </button>
      <label className="sensitivity sound-volume">
        <span>ความดัง</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={settings.volume}
          disabled={settings.muted}
          aria-label="ระดับเสียง"
          onChange={(event) => {
            sound.setVolume(Number(event.target.value));
            setSettings(sound.getSettings());
          }}
        />
      </label>
    </>
  );
}

function Settings({ settingsRef, connection, session, command, onResetView, onResetSession }) {
  const connected = connection === "connected";
  const connectionLabel = connected
    ? "เชื่อมต่อเซิร์ฟเวอร์แล้ว"
    : connection === "connecting" ? "กำลังเชื่อมต่อเซิร์ฟเวอร์" : "เซิร์ฟเวอร์ออฟไลน์ ใช้โหมดจำลองได้";
  return (
    <section className="settings-popover" popover="auto" id="settings-panel" ref={settingsRef} aria-labelledby="settings-title">
      <h2 id="settings-title">ตั้งค่า</h2>
      <p className="settings-connection">{connectionLabel}</p>
      <SoundControls />
      <button type="button" onClick={onResetView}><Icon name="reset" /> คืนมุมมองด้านหน้า</button>
      <button type="button" onClick={onResetSession}><Icon name="reset" /> เริ่มการเป่าใหม่</button>
      {connected && (
        <>
          <div className="sensitivity">
            <span>เกณฑ์รับเสียง</span>
            <button type="button" aria-label="ลดเกณฑ์รับเสียง" onClick={() => command({ cmd: "threshold_down" })}>−</button>
            <output aria-label="ค่าเกณฑ์รับเสียง">{session.threshold.toFixed(3)}</output>
            <button type="button" aria-label="เพิ่มเกณฑ์รับเสียง" onClick={() => command({ cmd: "threshold_up" })}>+</button>
          </div>
          <button type="button" aria-pressed={session.debug} onClick={() => command({ cmd: "toggle_debug" })}>แสดงข้อมูลสัญญาณ</button>
        </>
      )}
    </section>
  );
}

function SignalMeter({ session, fps }) {
  const scale = Math.max(session.threshold * 4, 0.05);
  const level = Math.min(100, session.level / scale * 100);
  const threshold = Math.min(100, session.threshold / scale * 100);

  return (
    <aside className="signal-meter" aria-label="ข้อมูลสัญญาณ">
      <div className="signal-track">
        <div style={{ width: `${level}%` }} />
        <span style={{ left: `${threshold}%` }} />
      </div>
      <p>{`lvl ${session.level.toFixed(4)} · thr ${session.threshold.toFixed(4)} · ${session.mode} · ${fps} fps`}</p>
    </aside>
  );
}

function microphoneCopy(session, connected, demo, progress) {
  const { screen, mode } = session;
  if (!connected) return ["ยังไม่ได้เชื่อมต่อไมค์", "wait", "ยังไม่พร้อมทดสอบ"];
  if (mode === "DONE") return ["ทดสอบสำเร็จ!", "live", "ทดสอบใหม่"];
  if (screen === "CALIB_QUIET" || screen === "CALIB_BLOW") {
    const seconds = Math.max(1, Math.ceil(session.calib_remaining));
    const instruction = screen === "CALIB_QUIET" ? "เงียบสักครู่" : "เป่าเบา ๆ";
    return [`${instruction} · ${seconds} วิ`, "wait", "หยุดปรับไมค์"];
  }
  if (demo) {
    const label = mode === "PLAY" ? `กำลังทดสอบ… ${progress}%` : "กดค้างเพื่อจำลองการเป่า";
    return [label, mode === "PLAY" ? "live" : "ready", "กดค้างเพื่อจำลองการเป่า"];
  }
  if (screen === "GAME") return ["กำลังรับเสียง… เป่าได้เลย", "live", "หยุดทดสอบ"];
  return ["พร้อมทดสอบ", "ready", "เริ่มทดสอบ"];
}

export default function App() {
  const [page, setPage] = useState("home");
  const [view, setView] = useState("lungs");
  const [resetViewKey, setResetViewKey] = useState(0);
  const [fps, setFps] = useState(60);
  const [holding, setHolding] = useState(false);
  const [medicalOpen, setMedicalOpen] = useState(false);
  const [scores, setScores] = useState({ last: null, best: null });
  const settingsRef = useRef(null);
  const heldInput = useRef(null);
  const { session, connection, command } = useServerBreathing();
  const exercise = useExercise();
  const { stop: stopExercise, setHolding: holdExercise } = exercise;
  const exerciseHold = exercise.pattern.kind === "hold";

  const isHome = page === "home";
  const isLearning = page === "learn";
  const isExercise = page === "exercise";
  const connected = connection === "connected";
  const { screen, mode, debug } = session;
  const isDemo = connected && session.demo;
  const complete = mode === "DONE";
  const calibrating = screen === "CALIB_QUIET" || screen === "CALIB_BLOW";
  const health = isHome && screen === "GAME" ? Math.max(0, Math.min(1, session.progress)) : 0;
  const percentage = Math.round(health * 100);
  const [micLabel, micTone, micButtonLabel] = microphoneCopy(session, connected, isDemo, percentage);
  const { result, dismiss: dismissResult } = useAttemptResult(session, isHome, connected);

  useEffect(() => {
    if (!result) return;
    setScores((previous) => ({ last: result.score, best: Math.max(previous.best ?? 0, result.score) }));
  }, [result]);

  const openMedical = useCallback(() => {
    sound.play("toggle");
    setMedicalOpen(true);
  }, []);

  const closeMedical = useCallback(() => {
    sound.play("toggle");
    setMedicalOpen(false);
  }, []);

  const releaseBlow = useCallback((source) => {
    const current = heldInput.current;
    if (!current || (source !== undefined && current.source !== source)) return;
    heldInput.current = null;
    current.stop();
    setHolding(false);
  }, []);

  const choosePage = useCallback((next) => {
    releaseBlow();
    stopExercise();
    sound.stopAll();
    setMedicalOpen(false);
    setPage(next);
  }, [releaseBlow, stopExercise]);

  const startOrStop = useCallback(() => {
    if (!connected) return;
    if (screen === "TITLE") command({ cmd: "start" });
    else if (!isDemo || complete) command({ cmd: "reset" });
  }, [connected, complete, screen, command, isDemo]);

  const holdBlow = useCallback((source) => {
    if (!isDemo || complete || heldInput.current) return;
    if (screen === "TITLE") command({ cmd: "start" });
    if (!command({ cmd: "demo_blow", active: true })) return;
    heldInput.current = { source, stop: () => command({ cmd: "demo_blow", active: false }) };
    setHolding(true);
  }, [isDemo, complete, screen, command]);

  const resetSession = useCallback(() => {
    releaseBlow();
    if (isExercise) stopExercise();
    else if (isHome) command({ cmd: "reset" });
  }, [releaseBlow, isExercise, isHome, stopExercise, command]);

  useEffect(() => {
    if (complete || !connected) releaseBlow();
  }, [complete, connected, releaseBlow]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.repeat ||
          settingsRef.current?.matches(":popover-open")) return;
      if (event.key === "Escape") {
        if (medicalOpen) closeMedical();
        else resetSession();
        return;
      }
      if (medicalOpen) return;
      if (isExercise) {
        if (exerciseHold && event.code === "Space") {
          event.preventDefault();
          holdExercise(true);
        }
        return;
      }
      if (!isHome) return;
      if (event.target instanceof Element && event.target.closest("button, input, select, textarea, a, [contenteditable]")) return;
      if (event.code === "Space" && isDemo && !complete) {
        event.preventDefault();
        holdBlow("space");
      } else if (screen === "TITLE" && (event.code === "Space" || event.code === "Enter")) {
        event.preventDefault();
        startOrStop();
      } else if (connected) {
        if (event.code === "KeyD") command({ cmd: "toggle_debug" });
        else if (["ArrowUp", "ArrowRight", "+", "="].includes(event.key)) command({ cmd: "threshold_up" });
        else if (["ArrowDown", "ArrowLeft", "-"].includes(event.key)) command({ cmd: "threshold_down" });
      }
    }

    function onKeyUp(event) {
      if (event.code === "Space") {
        releaseBlow("space");
        holdExercise(false);
      }
    }

    function onBlur() {
      releaseBlow();
      holdExercise(false);
    }

    function onVisibility() {
      if (document.hidden) onBlur();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [isHome, isExercise, exerciseHold, isDemo, complete, holdBlow, screen, startOrStop, connected, command, resetSession, releaseBlow, holdExercise, medicalOpen, closeMedical]);

  const exState = exercise.state;

  // เสียงคลิกปุ่มทั่วไป (ข้ามปุ่มในส่วนที่มี data-silent เช่นการ์ดไมค์ ตัวนำจังหวะ และผลทดสอบ)
  useEffect(() => {
    function onClick(event) {
      const button = event.target instanceof Element ? event.target.closest("button") : null;
      if (!button || button.disabled || button.closest("[data-silent]")) return;
      if (button.matches(".medical-open, .medical-close")) return; // สองปุ่มนี้มีเสียงเปิด/ปิดของตัวเอง
      sound.play("click");
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // เสียงคลื่นทะเลเบาๆ เฉพาะหน้าเรียนรู้
  useEffect(() => {
    if (isLearning) sound.startSea();
    else sound.stopSea();
  }, [isLearning]);

  // เริ่มปรับไมค์/ทดสอบ → ตัดเสียงทุกอย่างทิ้ง เพื่อไม่ให้ลำโพงเข้าไมค์
  useEffect(() => {
    if (isHome && screen !== "TITLE") sound.stopAll();
  }, [isHome, screen]);

  // เสียงผลทดสอบ เล่นหลังเป่าจบเท่านั้น และหยุดทันทีเมื่อปิดการ์ดผล
  useEffect(() => {
    if (!result) return;
    sound.play(result.tier === "good" ? (Math.random() < 0.5 ? "good1" : "good2") : result.tier);
    return () => sound.stopAll();
  }, [result]);

  // เสียงบริหารปอด: หายใจเข้า/ออกตามจังหวะ, ถึงเป้าหมายในท่าเป่ายาว, ครบทุกรอบ
  const prevExercise = useRef(exState);
  useEffect(() => {
    const prev = prevExercise.current;
    prevExercise.current = exState;
    if (!isExercise) return;
    if (exState.done && !prev.done) {
      sound.play("allDone");
    } else if (!exState.running) {
      if (prev.running && !exState.done) sound.stopAll();
    } else if (exerciseHold) {
      if (exState.round > prev.round) sound.play("roundDone");
    } else if (exState.dir !== prev.dir) {
      sound.play(exState.dir === "in" ? "inhale" : "exhale");
    }
  }, [exState, isExercise, exerciseHold]);
  const lungs = isExercise
    ? {
      health: exState.fill,
      level: exState.dir === "out" || exState.dir === "hold" ? 0.065 : 0,
      mode: exState.running ? "PLAY" : exState.done ? "DONE" : "IDLE",
    }
    : isHome
      ? { health, level: session.level, mode }
      : { health: 0, level: 0, mode: "IDLE" };

  return (
    <main className="lung-dashboard">
      <OpeningControls page={page} onPage={choosePage} settingsId="settings-panel" />

      <div className="model-stage">
        <Lungs
          health={lungs.health}
          level={lungs.level}
          threshold={session.threshold}
          mode={lungs.mode}
          view={view}
          resetViewKey={resetViewKey}
          onFps={debug ? setFps : undefined}
        />
      </div>

      {isLearning && <LearningCard view={view} onOpenMedical={openMedical} />}
      {isExercise && (
        <>
          <ExercisePicker patternId={exercise.patternId} onSelect={exercise.select} />
          <ExerciseProgress pattern={exercise.pattern} state={exState} />
          <ExercisePacer
            pattern={exercise.pattern}
            state={exState}
            onStart={exercise.start}
            onStop={stopExercise}
            onHold={holdExercise}
          />
        </>
      )}
      {isHome && (
        <>
          <BreathingCard progress={percentage} />
          <ScoreCard last={scores.last} best={scores.best} />
          <MicrophoneCard
            label={micLabel}
            tone={micTone}
            buttonLabel={micButtonLabel}
            isDemo={isDemo}
            holding={holding}
            complete={complete}
            disabled={!connected}
            onExercise={() => choosePage("exercise")}
            onPress={holdBlow}
            onRelease={releaseBlow}
            onClick={(event) => {
              if (!isDemo || complete || event.detail === 0) startOrStop();
            }}
          />
        </>
      )}

      <ViewSelector view={view} onView={setView} />
      <Settings
        settingsRef={settingsRef}
        connection={connection}
        session={session}
        command={command}
        onResetView={() => setResetViewKey((key) => key + 1)}
        onResetSession={resetSession}
      />
      {debug && <SignalMeter session={session} fps={fps} />}
      {result && isHome && (
        <ResultCard
          result={result}
          onClose={dismissResult}
          onOpenMedical={() => { dismissResult(); choosePage("learn"); openMedical(); }}
        />
      )}
      {medicalOpen && <MedicalPage onClose={closeMedical} />}
    </main>
  );
}
