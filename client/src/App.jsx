import { useCallback, useEffect, useRef, useState } from "react";
import Lungs from "./components/Lungs.jsx";
import Icon, { LungIcon } from "./components/Icons.jsx";
import { BreathingCard, LearningCard, MicrophoneCard, StatusCard, VIEWS } from "./components/DashboardCards.jsx";
import { useServerBreathing, useSimulation } from "./hooks/useBreathing.js";

const PAGES = [
  { value: "home", icon: "home", label: "หน้าแรก" },
  { value: "learn", icon: "book", label: "เรียนรู้" },
  { value: "simulation", icon: "game", label: "โหมดจำลอง" },
];

const GAME_STATUS = {
  PLAY: "กำลังฟื้นฟูปอด",
  PAUSE: "เป่าลมต่อได้เลย",
  REWIND: "ลองเป่าลมอีกครั้ง",
  DONE: "ฟื้นฟูสำเร็จ",
};

function OpeningControls({ page, onPage, settingsId }) {
  return (
    <header className="dashboard-header">
      <h1 className="brand">
        <span className="brand-cloud"><LungIcon colorful /></span>
        <span className="brand-wordmark" lang="en">Lungs <b>3D</b></span>
      </h1>
      <nav className="main-navigation" aria-label="เมนูหลัก">
        {PAGES.map(({ value, icon, label }) => (
          <button
            key={value}
            type="button"
            aria-current={page === value ? "page" : undefined}
            onClick={() => onPage(value)}
          >
            <Icon name={icon} />
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

function Settings({ settingsRef, connection, session, command, onResetView, onResetSession }) {
  const connected = connection === "connected";
  const connectionLabel = connected
    ? "เชื่อมต่อเซิร์ฟเวอร์แล้ว"
    : connection === "connecting" ? "กำลังเชื่อมต่อเซิร์ฟเวอร์" : "เซิร์ฟเวอร์ออฟไลน์ ใช้โหมดจำลองได้";
  return (
    <section className="settings-popover" popover="auto" id="settings-panel" ref={settingsRef} aria-labelledby="settings-title">
      <h2 id="settings-title">ตั้งค่า</h2>
      <p className="settings-connection">{connectionLabel}</p>
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
  if (mode === "DONE") return ["ฟื้นฟูสำเร็จ!", "live", "เริ่มการเป่าใหม่"];
  if (screen === "CALIB_QUIET" || screen === "CALIB_BLOW") {
    const seconds = Math.max(1, Math.ceil(session.calib_remaining));
    const instruction = screen === "CALIB_QUIET" ? "เงียบสักครู่" : "เป่าเบา ๆ";
    return [`${instruction} · ${seconds} วิ`, "wait", "หยุดปรับไมค์"];
  }
  if (demo) {
    const label = mode === "PLAY" ? `กำลังฟื้นฟู… ${progress}%` : "กดค้างเพื่อจำลองการเป่า";
    return [label, mode === "PLAY" ? "live" : "ready", "กดค้างเพื่อจำลองการเป่า"];
  }
  if (!connected) return ["ทดลองใช้โหมดจำลอง", "ready", "เปิดโหมดจำลอง"];
  if (screen === "GAME") return ["กำลังรับเสียง…", "live", "หยุดรับเสียง"];
  return ["พร้อมรับเสียง", "ready", "เริ่มรับเสียง"];
}

export default function App() {
  const [page, setPage] = useState("home");
  const [view, setView] = useState("lungs");
  const [resetViewKey, setResetViewKey] = useState(0);
  const [fps, setFps] = useState(60);
  const [holding, setHolding] = useState(false);
  const settingsRef = useRef(null);
  const heldInput = useRef(null);
  const { session: serverSession, connection, command } = useServerBreathing();
  const { session: simulated, start: startSimulation, reset: resetSimulation, setBlowing } = useSimulation();

  const isLocal = page === "simulation";
  const isLearning = page === "learn";
  const connected = connection === "connected";
  const session = isLocal ? simulated : serverSession;
  const { screen, mode, debug } = session;
  const isDemo = isLocal || (connected && session.demo);
  const complete = mode === "DONE";
  const calibrating = screen === "CALIB_QUIET" || screen === "CALIB_BLOW";
  const health = isLearning || screen !== "GAME" ? 0 : Math.max(0, Math.min(1, session.progress));
  const percentage = Math.round(health * 100);
  const [micLabel, micTone, micButtonLabel] = microphoneCopy(session, connected, isDemo, percentage);

  const releaseBlow = useCallback((source) => {
    const current = heldInput.current;
    if (!current || (source !== undefined && current.source !== source)) return;
    heldInput.current = null;
    current.stop();
    setHolding(false);
  }, []);

  const choosePage = useCallback((next) => {
    releaseBlow();
    if (next !== "simulation") resetSimulation();
    setPage(next);
  }, [releaseBlow, resetSimulation]);

  const startOrStop = useCallback(() => {
    if (isLocal) {
      if (complete) resetSimulation();
      else startSimulation();
      return;
    }
    if (!connected) {
      choosePage("simulation");
      startSimulation();
      return;
    }
    if (screen === "TITLE") command({ cmd: "start" });
    else if (!isDemo || complete) command({ cmd: "reset" });
  }, [isLocal, complete, resetSimulation, startSimulation, connected, choosePage, screen, command, isDemo]);

  const holdBlow = useCallback((source) => {
    if (!isDemo || complete || heldInput.current) return;

    if (isLocal) {
      startSimulation();
      setBlowing(true);
      heldInput.current = { source, stop: () => setBlowing(false) };
    } else {
      if (screen === "TITLE") command({ cmd: "start" });
      if (!command({ cmd: "demo_blow", active: true })) return;
      heldInput.current = { source, stop: () => command({ cmd: "demo_blow", active: false }) };
    }

    setHolding(true);
  }, [isDemo, complete, isLocal, startSimulation, setBlowing, screen, command]);

  const resetSession = useCallback(() => {
    releaseBlow();
    if (isLocal) resetSimulation();
    else command({ cmd: "reset" });
  }, [releaseBlow, isLocal, resetSimulation, command]);

  useEffect(() => {
    if (complete || (!isLocal && !connected)) releaseBlow();
  }, [complete, isLocal, connected, releaseBlow]);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.repeat ||
          settingsRef.current?.matches(":popover-open")) return;
      if (event.key === "Escape") {
        resetSession();
        return;
      }
      if (event.target instanceof Element && event.target.closest("button, input, select, textarea, a, [contenteditable]")) return;
      if (!isLearning && event.code === "Space" && isDemo && !complete) {
        event.preventDefault();
        holdBlow("space");
      } else if (!isLearning && screen === "TITLE" && (event.code === "Space" || event.code === "Enter")) {
        event.preventDefault();
        startOrStop();
      } else if (connected && !isLocal) {
        if (event.code === "KeyD") command({ cmd: "toggle_debug" });
        else if (["ArrowUp", "ArrowRight", "+", "="].includes(event.key)) command({ cmd: "threshold_up" });
        else if (["ArrowDown", "ArrowLeft", "-"].includes(event.key)) command({ cmd: "threshold_down" });
      }
    }

    function onKeyUp(event) {
      if (event.code === "Space") releaseBlow("space");
    }

    function onBlur() {
      releaseBlow();
    }

    function onVisibility() {
      if (document.hidden) releaseBlow();
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
  }, [isLearning, isDemo, complete, holdBlow, screen, startOrStop, connected, isLocal, command, resetSession, releaseBlow]);

  const statusLabel = isLearning ? "พร้อมเรียนรู้" : calibrating ? "กำลังปรับไมค์" : GAME_STATUS[mode] ?? "พร้อมใช้งาน";

  return (
    <main className="lung-dashboard">
      <OpeningControls page={page} onPage={choosePage} settingsId="settings-panel" />

      <div className="model-stage">
        <Lungs
          health={health}
          level={isLearning ? 0 : session.level}
          threshold={session.threshold}
          mode={isLearning ? "IDLE" : mode}
          view={view}
          resetViewKey={resetViewKey}
          onFps={debug ? setFps : undefined}
        />
      </div>

      <BreathingCard isExample={screen === "TITLE" || isLearning} progress={percentage} />
      <StatusCard label={statusLabel} complete={!isLearning && complete} working={!isLearning && (calibrating || mode === "PLAY")} />
      {isLearning ? <LearningCard view={view} /> : (
        <MicrophoneCard
          label={micLabel}
          tone={micTone}
          buttonLabel={micButtonLabel}
          isDemo={isDemo}
          holding={holding}
          complete={complete}
          onPress={holdBlow}
          onRelease={releaseBlow}
          onClick={(event) => {
            if (!isDemo || complete || event.detail === 0) startOrStop();
          }}
        />
      )}

      <ViewSelector view={view} onView={setView} />
      <Settings
        settingsRef={settingsRef}
        connection={connection}
        session={serverSession}
        command={command}
        onResetView={() => setResetViewKey((key) => key + 1)}
        onResetSession={resetSession}
      />
      {debug && <SignalMeter session={session} fps={fps} />}
    </main>
  );
}
