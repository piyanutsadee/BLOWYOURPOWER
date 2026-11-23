import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createLungModel } from "./lungModel.js";

const FULL_TURN = Math.PI * 2;
const TILT_LIMIT = 0.32;

function resetRotation(rotation) {
  rotation.pitch = 0;
  rotation.yaw = Math.round(rotation.yaw / FULL_TURN) * FULL_TURN;
}

export default function Lungs({
  health = 0,
  level = 0,
  threshold = 0.02,
  mode = "IDLE",
  view = "lungs",
  resetViewKey = 0,
  onFps,
}) {
  const containerRef = useRef(null);
  const inputs = useRef({ health, level, threshold, mode, view, onFps });
  const rotation = useRef({ pitch: 0, yaw: 0 });
  const drag = useRef(null);
  const [renderFailed, setRenderFailed] = useState(false);

  useLayoutEffect(() => {
    inputs.current = { health, level, threshold, mode, view, onFps };
  }, [health, level, threshold, mode, view, onFps]);

  useLayoutEffect(() => {
    resetRotation(rotation.current);
  }, [resetViewKey]);

  useEffect(() => {
    const container = containerRef.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, stencil: true });
    } catch {
      setRenderFailed(true);
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 60);
    camera.position.set(0, 0, 17);
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
    renderer.domElement.setAttribute("aria-hidden", "true");
    container.append(renderer.domElement);

    const lungs = createLungModel();
    lungs.figure.rotation.order = "YXZ";
    scene.add(lungs.figure);
    scene.add(new THREE.HemisphereLight(0xfff1e8, 0x7289af, 1.80));
    const key = new THREE.DirectionalLight(0xfff2dd, 2.0);
    key.position.set(-4, 7, 8);
    const rim = new THREE.DirectionalLight(0xa6f5ff, 1.35);
    rim.position.set(5, 3, -6);
    scene.add(key, rim);

    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      const aspect = width / height;
      const halfHeight = Math.max(4, 3.68 / aspect);
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let contextLost = false;
    const onContextLost = () => {
      contextLost = true;
      setRenderFailed(true);
    };
    const onContextRestored = () => {
      contextLost = false;
      setRenderFailed(false);
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    renderer.domElement.addEventListener("webglcontextrestored", onContextRestored);

    let frame = 0;
    let smoothHealth = Number.isFinite(inputs.current.health)
      ? THREE.MathUtils.clamp(inputs.current.health, 0, 1)
      : 0;
    let expansion = 0;
    let smoothFps = 60;
    let lastReport = 0;
    let lastTime = performance.now();
    const start = lastTime;

    const draw = (time) => {
      frame = requestAnimationFrame(draw);
      const rawStep = Math.max(0, (time - lastTime) / 1000);
      const dt = Math.min(0.05, rawStep);
      lastTime = time;
      if (contextLost) return;

      const current = inputs.current;
      const targetHealth = Number.isFinite(current.health)
        ? THREE.MathUtils.clamp(current.health, 0, 1)
        : 0;
      smoothHealth = THREE.MathUtils.damp(smoothHealth, targetHealth, 6, dt);

      const breath = THREE.MathUtils.clamp(current.level / Math.max(current.threshold * 2.4, 0.015), 0, 1);
      const idle = motion.matches ? 0 : Math.sin((time - start) * 0.00165) * 0.013;
      const active = current.mode === "PLAY" ? breath * 0.085 : breath * 0.025;
      expansion = THREE.MathUtils.damp(expansion, idle + active, 8, dt);

      const { figure } = lungs;
      const { pitch, yaw } = rotation.current;
      figure.rotation.y = motion.matches ? yaw : THREE.MathUtils.damp(figure.rotation.y, yaw, 17, dt);
      figure.rotation.x = motion.matches ? pitch : THREE.MathUtils.damp(figure.rotation.x, pitch, 17, dt);
      lungs.update(smoothHealth, expansion, current.view);
      renderer.render(scene, camera);

      if (current.onFps && rawStep > 0) {
        smoothFps = THREE.MathUtils.lerp(smoothFps, 1 / rawStep, 0.12);
        if (time - lastReport > 450) {
          current.onFps(Math.round(smoothFps));
          lastReport = time;
        }
      }
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      renderer.domElement.removeEventListener("webglcontextrestored", onContextRestored);
      const resources = new Set();
      scene.traverse((object) => {
        const { geometry, material } = object;
        if (object.isInstancedMesh) object.dispose();
        if (geometry) resources.add(geometry);
        if (material) resources.add(material);
      });
      resources.forEach((resource) => resource.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  function startDrag(event) {
    if (!event.isPrimary || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function moveDrag(event) {
    const last = drag.current;
    if (last?.id !== event.pointerId) return;
    const target = rotation.current;
    target.yaw += (event.clientX - last.x) * 0.011;
    target.pitch = THREE.MathUtils.clamp(target.pitch + (event.clientY - last.y) * 0.006, -TILT_LIMIT, TILT_LIMIT);
    last.x = event.clientX;
    last.y = event.clientY;
  }

  function stopDrag(event) {
    if (drag.current?.id === event.pointerId) drag.current = null;
  }

  function rotateWithKeys(event) {
    const target = rotation.current;
    switch (event.key) {
      case "ArrowLeft": target.yaw -= 0.21; break;
      case "ArrowRight": target.yaw += 0.21; break;
      case "ArrowUp": target.pitch = Math.max(-TILT_LIMIT, target.pitch - 0.13); break;
      case "ArrowDown": target.pitch = Math.min(TILT_LIMIT, target.pitch + 0.13); break;
      case "Home": resetRotation(target); break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div
      className="lungs-model"
      ref={containerRef}
      role="group"
      aria-label="หุ่นคน 3 มิติ ลากหรือใช้ปุ่มลูกศรเพื่อหมุน กด Home เพื่อมองด้านหน้า"
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home"
      tabIndex={renderFailed ? undefined : 0}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      onLostPointerCapture={stopDrag}
      onDoubleClick={() => resetRotation(rotation.current)}
      onKeyDown={rotateWithKeys}
    >
      {renderFailed && (
        <p className="model-unavailable" role="status">เบราว์เซอร์นี้เปิดมุมมอง 3 มิติไม่ได้</p>
      )}
    </div>
  );
}
