import { useCallback, useEffect, useRef, useState } from "react";

// ท่าบริหารปอด: rhythm = ทำตามจังหวะที่หน้าจอนำ, hold = กดค้างเป่าให้ถึงเป้าหมายเวลา
// หมายเหตุ: จังหวะและเวลาเป็นค่าที่ออกแบบสำหรับเกม ควรให้ผู้เชี่ยวชาญด้านการแพทย์ทบทวนก่อนใช้จริง
export const PATTERNS = [
  {
    id: "pursed",
    kind: "rhythm",
    title: "เป่าลมแบบห่อปาก",
    hint: "เข้า 2 วินาที เป่าออกช้าๆ 4 วินาที",
    target: 6,
    phases: [
      { label: "หายใจเข้าทางจมูก", sec: 2, dir: "in" },
      { label: "ห่อปากแล้วเป่าออกช้าๆ", sec: 4, dir: "out" },
    ],
  },
  {
    id: "diaphragm",
    kind: "rhythm",
    title: "หายใจด้วยกะบังลม",
    hint: "เข้าให้ท้องป่อง 4 วินาที ปล่อยออก 6 วินาที",
    target: 5,
    phases: [
      { label: "หายใจเข้าช้าๆ ให้ท้องป่อง", sec: 4, dir: "in" },
      { label: "ปล่อยลมออก ท้องแฟบลง", sec: 6, dir: "out" },
    ],
  },
  {
    id: "long",
    kind: "hold",
    title: "เป่ายาว",
    hint: "กดค้างเป่าให้ถึง 5 → 8 → 10 วินาที",
    goals: [5, 8, 10],
  },
];

const ease = (x) => x * x * (3 - 2 * x);
const totalOf = (pattern) => (pattern.kind === "hold" ? pattern.goals.length : pattern.target);

function idleState(pattern) {
  return {
    running: false,
    done: false,
    fill: 0,
    dir: "idle",
    label: "",
    remaining: 0,
    round: 0,
    total: totalOf(pattern),
    goal: pattern.kind === "hold" ? pattern.goals[0] : 0,
  };
}

export function useExercise() {
  const [patternId, setPatternId] = useState(PATTERNS[0].id);
  const pattern = PATTERNS.find(({ id }) => id === patternId);
  const [state, setState] = useState(() => idleState(PATTERNS[0]));
  const run = useRef(null);
  const holding = useRef(false);

  const stop = useCallback(() => {
    run.current = null;
    holding.current = false;
    setState(idleState(pattern));
  }, [pattern]);

  useEffect(() => {
    stop();
  }, [stop]);

  const start = useCallback(() => {
    if (run.current) return;
    run.current = pattern.kind === "hold" ? { held: 0, step: 0 } : { t: 0, rounds: 0 };
    setState({ ...idleState(pattern), running: true });
  }, [pattern]);

  const setHolding = useCallback((active) => {
    holding.current = active;
    if (active && pattern.kind === "hold" && !run.current) start();
  }, [pattern, start]);

  useEffect(() => {
    if (!state.running) return;
    let last = performance.now();
    const finish = () => {
      run.current = null;
      holding.current = false;
      setState({ ...idleState(pattern), done: true, round: totalOf(pattern) });
    };

    const timer = setInterval(() => {
      const cur = run.current;
      if (!cur) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      if (pattern.kind === "hold") {
        cur.held = holding.current ? cur.held + dt : Math.max(0, cur.held - dt * 3);
        if (cur.held >= pattern.goals[cur.step]) {
          cur.step += 1;
          cur.held = 0;
          if (cur.step >= pattern.goals.length) return finish();
        }
        const goal = pattern.goals[cur.step];
        setState((s) => ({
          ...s,
          fill: cur.held / goal,
          dir: holding.current ? "hold" : "idle",
          label: holding.current ? "เป่าต่อไป อย่าเพิ่งหยุด" : "กดค้างเพื่อเป่า",
          remaining: Math.max(1, Math.ceil(goal - cur.held)),
          round: cur.step,
          goal,
        }));
        return;
      }

      cur.t += dt;
      const cycle = pattern.phases.reduce((sum, p) => sum + p.sec, 0);
      if (cur.t >= cycle) {
        cur.t -= cycle;
        cur.rounds += 1;
        if (cur.rounds >= pattern.target) return finish();
      }
      let acc = 0;
      let phase = pattern.phases[0];
      let within = cur.t;
      for (const p of pattern.phases) {
        if (cur.t < acc + p.sec) {
          phase = p;
          within = cur.t - acc;
          break;
        }
        acc += p.sec;
      }
      const progress = within / phase.sec;
      setState((s) => ({
        ...s,
        fill: phase.dir === "in" ? ease(progress) : 1 - ease(progress),
        dir: phase.dir,
        label: phase.label,
        remaining: Math.max(1, Math.ceil(phase.sec - within)),
        round: cur.rounds,
      }));
    }, 1000 / 30);
    return () => clearInterval(timer);
  }, [state.running, pattern]);

  return { pattern, patternId, state, select: setPatternId, start, stop, setHolding };
}
