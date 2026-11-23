import { useCallback, useEffect, useRef, useState } from "react";

export const INITIAL_SESSION = {
  screen: "TITLE",
  mode: "IDLE",
  progress: 0,
  level: 0,
  threshold: 0.02,
  remaining: 0,
  calib_remaining: 0,
  demo: false,
  debug: false,
};

export function useServerBreathing() {
  const [session, setSession] = useState(INITIAL_SESSION);
  const [connection, setConnection] = useState("connecting");
  const socketRef = useRef(null);
  const serverDemoHeld = useRef(false);

  const command = useCallback((message) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    if (message.cmd === "demo_blow") serverDemoHeld.current = message.active;
    return true;
  }, []);

  useEffect(() => {
    let stopped = false;
    let retry;
    let socket;

    function connect() {
      if (stopped) return;
      const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${scheme}//${window.location.host}/ws`);
      socketRef.current = socket;
      socket.onopen = () => {
        if (serverDemoHeld.current) {
          socket.send(JSON.stringify({ cmd: "demo_blow", active: false }));
          serverDemoHeld.current = false;
        }
      };
      socket.onmessage = ({ data }) => {
        if (stopped) return;
        try {
          const message = JSON.parse(data);
          if (message && typeof message.screen === "string") {
            setConnection("connected");
            setSession((previous) => ({ ...previous, ...message }));
          }
        } catch {
          // Keep the last complete snapshot when a frame is malformed.
        }
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (stopped) return;
        setConnection("offline");
        setSession(INITIAL_SESSION);
        retry = setTimeout(connect, 1500);
      };
    }

    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      if (socket?.readyState === WebSocket.CONNECTING) {
        socket.onopen = () => socket.close();
        return;
      }
      if (socket?.readyState === WebSocket.OPEN && serverDemoHeld.current) {
        socket.send(JSON.stringify({ cmd: "demo_blow", active: false }));
        serverDemoHeld.current = false;
      }
      socket?.close();
    };
  }, []);

  return { session, connection, command };
}

const SIMULATION_IDLE = { ...INITIAL_SESSION, demo: true };
const FILL_SECONDS = 8;
const REWIND_DELAY = 0.5;
const FINISH_SECONDS = 5;

export function useSimulation() {
  const [session, setSession] = useState(SIMULATION_IDLE);
  const run = useRef(null);
  const blowing = useRef(false);

  const setBlowing = useCallback((active) => {
    blowing.current = active;
  }, []);

  const start = useCallback(() => {
    if (run.current) return;
    run.current = { progress: 0, quiet: 0, finishedAt: null };
    setSession({ ...SIMULATION_IDLE, screen: "GAME" });
  }, []);

  const reset = useCallback(() => {
    run.current = null;
    blowing.current = false;
    setSession(SIMULATION_IDLE);
  }, []);

  useEffect(() => {
    if (session.screen !== "GAME") return;
    let last = performance.now();
    const timer = setInterval(() => {
      const current = run.current;
      if (!current) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      let mode = "IDLE";

      if (current.finishedAt !== null) {
        if (now >= current.finishedAt) {
          reset();
          return;
        }
        mode = "DONE";
      } else if (blowing.current) {
        current.quiet = 0;
        current.progress = Math.min(1, current.progress + dt / FILL_SECONDS);
        if (current.progress === 1) {
          current.finishedAt = now + FINISH_SECONDS * 1000;
          mode = "DONE";
        } else {
          mode = "PLAY";
        }
      } else if (current.progress > 0) {
        current.quiet += dt;
        mode = "PAUSE";
        if (current.quiet >= REWIND_DELAY) {
          mode = "REWIND";
          current.progress = Math.max(0, current.progress - dt * 4 / FILL_SECONDS);
        }
      }

      const { progress } = current;
      const level = mode === "PLAY" ? 0.065 : 0;
      const remaining = current.finishedAt === null ? 0 : (current.finishedAt - now) / 1000;
      setSession((previous) => {
        if (previous.mode === mode && previous.progress === progress && previous.remaining === remaining) {
          return previous;
        }
        return { ...SIMULATION_IDLE, screen: "GAME", mode, progress, level, remaining };
      });
    }, 1000 / 30);
    return () => clearInterval(timer);
  }, [session.screen, reset]);

  return { session, start, reset, setBlowing };
}
