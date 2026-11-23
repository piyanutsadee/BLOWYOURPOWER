import argparse
import asyncio
import base64
import hashlib
import json
import mimetypes
import struct
import time
from pathlib import Path

APP_NAME = "Blow Your Power"
BASE_DIR = Path(__file__).resolve().parent
WEB_DIR = BASE_DIR / "client" / "dist"
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


# ------------------------------------------------------------------ controller
class Controller:
    """Blow -> advance progress (0.0 -> 1.0). Stop blowing -> wait, then rewind.
    Reaching 1.0 -> hold final state, then `finished` becomes True."""

    def __init__(self, duration, threshold, hold, reset_delay,
                 rewind_speed, finish_hold, speed):
        self.duration = max(0.5, float(duration))
        self.threshold = threshold
        self.hold = hold
        self.reset_delay = reset_delay
        self.play_rate = speed / self.duration          # progress per second
        self.back_rate = rewind_speed / self.duration   # rewind progress per second
        self.rewind_speed = rewind_speed
        self.finish_hold = finish_hold

        self.progress = 0.0
        self.above = 0.0
        self.playing = False
        self.quiet = 0.0
        self.done_until = None
        self.finished = False
        self.mode = "IDLE"
        self.last = time.time()

    def remaining(self, now):
        return max(0.0, self.done_until - now) if self.done_until is not None else 0.0

    def update(self, level, now):
        dt = max(0.0, min(0.1, now - self.last))
        self.last = now

        if self.done_until is not None:
            self.mode = "DONE"
            if now >= self.done_until:
                self.done_until = None
                self.finished = True
                self.progress = 0.0
                self.playing = False
                self.above = 0.0
                self.quiet = 0.0
                self.mode = "IDLE"
            return self.progress, self.mode

        if self.playing:
            self.playing = level > self.threshold
        else:
            self.above = self.above + dt if level > self.threshold else 0.0
            self.playing = self.above >= self.hold
        if not self.playing and level <= self.threshold:
            self.above = 0.0

        if self.playing:
            self.quiet = 0.0
            self.progress += self.play_rate * dt
            self.mode = "PLAY"
            if self.progress >= 1.0:
                self.progress = 1.0
                self.done_until = now + self.finish_hold
                self.mode = "DONE"
        else:
            self.quiet += dt
            if self.progress <= 0.002:
                self.progress = 0.0
                self.mode = "IDLE"
            elif self.quiet >= self.reset_delay:
                if self.rewind_speed <= 0:
                    self.progress = 0.0
                else:
                    self.progress = max(0.0, self.progress - self.back_rate * dt)
                self.mode = "REWIND"
            else:
                self.mode = "PAUSE"
        return self.progress, self.mode


# --------------------------------------------------------------- audio input
class AudioInput:
    """Captures microphone input using sounddevice + numpy with lowpass FFT
    (same algorithm as main.py), or runs in demo/simulation mode."""

    def __init__(self, device=None, lowpass=400.0, demo=False):
        self.device = device
        self.lowpass = lowpass
        self.demo = demo
        self.level = 0.0
        self.rate = 48000
        self.stream = None
        self._demo_blowing = False
        self._demo_override = None

    def set_demo_blow(self, active: bool):
        self._demo_blowing = bool(active)
        self._demo_override = None

    def set_demo_level(self, val):
        self._demo_override = None if val is None else max(0.0, min(0.25, float(val)))

    def tick_demo(self):
        if not self.demo:
            return
        if self._demo_override is not None:
            target = self._demo_override
        elif self._demo_blowing:
            # Gentle organic breath oscillation around 0.065
            t = time.time()
            target = 0.062 + 0.012 * (0.5 + 0.5 * (t * 3.7 % 1.0))
        else:
            target = 0.002
        self.level = 0.72 * self.level + 0.28 * target

    def start(self):
        if self.demo:
            print("Running in DEMO mode (no microphone required).")
            return

        try:
            import numpy as np
            import sounddevice as sd
        except ImportError as e:
            raise RuntimeError(
                f"Missing audio dependency ({e}). Install with: pip install -r requirements.txt "
                f"or run with --demo to test without a microphone."
            ) from e

        lp = self.lowpass

        def audio_callback(indata, n, t, status):
            x = indata.mean(axis=1)
            if lp > 0 and len(x) > 8:
                spec = np.abs(np.fft.rfft(x - x.mean())) ** 2
                k = max(2, int(lp * len(x) / self.rate))
                rms = float(np.sqrt(2.0 * spec[1:k].sum()) / len(x))
            else:
                rms = float(np.sqrt(np.mean(x ** 2)))
            self.level = 0.6 * self.level + 0.4 * rms

        device = self.device
        if device is not None and str(device).isdigit():
            device = int(device)

        last_error = None
        try:
            default_rate = int(sd.query_devices(device, "input")["default_samplerate"])
        except Exception:
            default_rate = 48000

        for rate in [default_rate, 48000, 44100, 32000, 16000]:
            for ch in (1, 2):
                try:
                    self.rate = rate
                    self.stream = sd.InputStream(
                        channels=ch, samplerate=rate, blocksize=2048,
                        device=device, callback=audio_callback
                    )
                    self.stream.start()
                    print(f"Microphone opened: {rate} Hz, {ch} channel(s)")
                    return
                except Exception as e:
                    self.stream = None
                    last_error = e
        raise RuntimeError(
            f"Could not open microphone: {last_error}\n"
            "Tip: run `python3 -m sounddevice` to list devices, or use --demo."
        )

    def stop(self):
        if self.stream is not None:
            self.stream.stop()
            self.stream.close()
            self.stream = None


# ---------------------------------------------------------------- game engine
class GameEngine:
    """Manages TITLE -> CALIB_QUIET -> CALIB_BLOW -> GAME state transitions."""

    def __init__(self, args, audio: AudioInput):
        self.args = args
        self.audio = audio
        self.screen = "TITLE"
        self.threshold = args.threshold if args.threshold is not None else 0.02
        self.debug = args.debug
        self.ctl = None

        self._calib_end = 0.0
        self._quiet_samples = []
        self._blow_samples = []
        self._baseline = 0.0

    def handle_command(self, msg: dict):
        cmd = msg.get("cmd")
        if cmd == "start":
            if self.screen == "TITLE":
                self._begin_calibration()
        elif cmd == "reset":
            self.screen = "TITLE"
            self.ctl = None
        elif cmd == "threshold_up":
            self.threshold *= 1.15
            if self.ctl:
                self.ctl.threshold = self.threshold
        elif cmd == "threshold_down":
            self.threshold = max(0.001, self.threshold * 0.85)
            if self.ctl:
                self.ctl.threshold = self.threshold
        elif cmd == "toggle_debug":
            self.debug = not self.debug
        elif cmd == "demo_blow" and self.audio.demo:
            self.audio.set_demo_blow(bool(msg.get("active", False)))
        elif cmd == "demo_level" and self.audio.demo:
            self.audio.set_demo_level(msg.get("value"))

    def _begin_calibration(self):
        if self.args.threshold is not None:
            self.threshold = self.args.threshold
            self._start_game()
            return
        if self.audio.demo:
            self.threshold = 0.02
            self._start_game()
            return
        self.screen = "CALIB_QUIET"
        self._quiet_samples = []
        self._blow_samples = []
        self._calib_end = time.time() + 2.0

    def _start_game(self):
        self.screen = "GAME"
        self.ctl = Controller(
            duration=self.args.duration,
            threshold=self.threshold,
            hold=self.args.hold,
            reset_delay=self.args.reset_delay,
            rewind_speed=self.args.rewind_speed,
            finish_hold=self.args.finish_hold,
            speed=self.args.speed,
        )

    @staticmethod
    def _percentile(values, p):
        if not values:
            return 0.0
        s = sorted(values)
        k = (len(s) - 1) * (p / 100.0)
        f = int(k)
        c = min(f + 1, len(s) - 1)
        return s[f] + (s[c] - s[f]) * (k - f)

    def step(self) -> dict:
        self.audio.tick_demo()
        now = time.time()
        level = self.audio.level

        if self.screen == "CALIB_QUIET":
            self._quiet_samples.append(level)
            rem = max(0.0, self._calib_end - now)
            if rem <= 0.0:
                self._baseline = sum(self._quiet_samples) / max(1, len(self._quiet_samples))
                self.threshold = max(self._baseline * self.args.sens, 0.005)
                if self.args.no_blow_calibration:
                    self._start_game()
                else:
                    self.screen = "CALIB_BLOW"
                    self._blow_samples = []
                    self._calib_end = now + 3.0
            return {
                "screen": self.screen,
                "mode": "IDLE",
                "progress": 0.0,
                "level": level,
                "threshold": self.threshold,
                "remaining": 0.0,
                "calib_remaining": rem,
                "demo": self.audio.demo,
                "debug": self.debug,
            }

        if self.screen == "CALIB_BLOW":
            self._blow_samples.append(level)
            rem = max(0.0, self._calib_end - now)
            if rem <= 0.0:
                peak = self._percentile(self._blow_samples, 90)
                if peak > max(self._baseline * 1.5, 0.003):
                    self.threshold = max(
                        self._baseline + self.args.ratio * (peak - self._baseline),
                        self._baseline * 1.3,
                        0.003,
                    )
                self._start_game()
            return {
                "screen": self.screen,
                "mode": "IDLE",
                "progress": 0.0,
                "level": level,
                "threshold": self.threshold,
                "remaining": 0.0,
                "calib_remaining": rem,
                "demo": self.audio.demo,
                "debug": self.debug,
            }

        if self.screen == "GAME" and self.ctl is not None:
            progress, mode = self.ctl.update(level, now)
            if self.ctl.finished:
                self.screen = "TITLE"
                self.ctl = None
                return {
                    "screen": "TITLE",
                    "mode": "IDLE",
                    "progress": 0.0,
                    "level": level,
                    "threshold": self.threshold,
                    "remaining": 0.0,
                    "calib_remaining": 0.0,
                    "demo": self.audio.demo,
                    "debug": self.debug,
                }
            return {
                "screen": "GAME",
                "mode": mode,
                "progress": progress,
                "level": level,
                "threshold": self.ctl.threshold,
                "remaining": self.ctl.remaining(now),
                "calib_remaining": 0.0,
                "demo": self.audio.demo,
                "debug": self.debug,
            }

        return {
            "screen": "TITLE",
            "mode": "IDLE",
            "progress": 0.0,
            "level": level,
            "threshold": self.threshold,
            "remaining": 0.0,
            "calib_remaining": 0.0,
            "demo": self.audio.demo,
            "debug": self.debug,
        }


# ---------------------------------------------- stdlib HTTP + WebSocket server
def ws_encode_text(text: str) -> bytes:
    payload = text.encode("utf-8")
    n = len(payload)
    header = bytearray([0x81])
    if n < 126:
        header.append(n)
    elif n < 65536:
        header.append(126)
        header.extend(struct.pack("!H", n))
    else:
        header.append(127)
        header.extend(struct.pack("!Q", n))
    return bytes(header) + payload


async def ws_read_message(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    while True:
        hdr = await reader.readexactly(2)
        b1, b2 = hdr[0], hdr[1]
        opcode = b1 & 0x0F
        masked = (b2 & 0x80) != 0
        length = b2 & 0x7F
        if length == 126:
            length = struct.unpack("!H", await reader.readexactly(2))[0]
        elif length == 127:
            length = struct.unpack("!Q", await reader.readexactly(8))[0]
        mask_key = await reader.readexactly(4) if masked else b""
        payload = await reader.readexactly(length)
        if masked:
            payload = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))

        if opcode == 0x8:  # Close
            return None
        if opcode == 0x9:  # Ping -> Pong
            pong = bytearray([0x8A, len(payload)]) + payload
            writer.write(bytes(pong))
            await writer.drain()
            continue
        if opcode == 0xA:  # Pong
            continue
        if opcode == 0x1:  # Text
            return payload.decode("utf-8", errors="replace")


async def serve_http_file(writer: asyncio.StreamWriter, raw_path: str):
    path_only = raw_path.split("?", 1)[0]
    if path_only == "/":
        path_only = "/index.html"
    rel = path_only.lstrip("/")
    target = (WEB_DIR / rel).resolve()
    if not str(target).startswith(str(WEB_DIR.resolve())) or not target.is_file():
        body = b"404 Not Found"
        resp = (
            "HTTP/1.1 404 Not Found\r\n"
            f"Content-Length: {len(body)}\r\n"
            "Content-Type: text/plain\r\n"
            "Connection: close\r\n\r\n"
        ).encode() + body
        writer.write(resp)
        await writer.drain()
        return

    content_type, _ = mimetypes.guess_type(str(target))
    if content_type is None:
        content_type = "application/octet-stream"
    if content_type.startswith("text/") or content_type in ("application/javascript", "application/json"):
        content_type += "; charset=utf-8"

    body = target.read_bytes()
    resp = (
        "HTTP/1.1 200 OK\r\n"
        f"Content-Type: {content_type}\r\n"
        f"Content-Length: {len(body)}\r\n"
        "Cache-Control: no-cache\r\n"
        "Connection: close\r\n\r\n"
    ).encode() + body
    writer.write(resp)
    await writer.drain()


async def run_server(args):
    audio = AudioInput(device=args.device, lowpass=args.lowpass, demo=args.demo)
    audio.start()
    engine = GameEngine(args, audio)
    clients: set[asyncio.StreamWriter] = set()

    async def handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        try:
            raw = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=10.0)
        except Exception:
            writer.close()
            return

        lines = raw.decode("iso-8859-1", errors="replace").split("\r\n")
        if not lines or len(lines[0].split(" ")) < 2:
            writer.close()
            return

        method, path = lines[0].split(" ")[:2]
        headers = {}
        for line in lines[1:]:
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()

        if headers.get("upgrade", "").lower() == "websocket" and "sec-websocket-key" in headers:
            key = headers["sec-websocket-key"]
            accept = base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
            handshake = (
                "HTTP/1.1 101 Switching Protocols\r\n"
                "Upgrade: websocket\r\n"
                "Connection: Upgrade\r\n"
                f"Sec-WebSocket-Accept: {accept}\r\n\r\n"
            ).encode()
            writer.write(handshake)
            await writer.drain()
            clients.add(writer)
            try:
                while True:
                    text = await ws_read_message(reader, writer)
                    if text is None:
                        break
                    try:
                        msg = json.loads(text)
                        if isinstance(msg, dict):
                            engine.handle_command(msg)
                    except json.JSONDecodeError:
                        pass
            except (asyncio.IncompleteReadError, ConnectionResetError, BrokenPipeError):
                pass
            finally:
                clients.discard(writer)
                try:
                    writer.close()
                except Exception:
                    pass
        elif method == "GET":
            await serve_http_file(writer, path)
            writer.close()
        else:
            writer.write(b"HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n")
            await writer.drain()
            writer.close()

    async def broadcast_loop():
        while True:
            snapshot = engine.step()
            if clients:
                frame = ws_encode_text(json.dumps(snapshot))
                dead = []
                for w in list(clients):
                    try:
                        w.write(frame)
                        await w.drain()
                    except Exception:
                        dead.append(w)
                for w in dead:
                    clients.discard(w)
            await asyncio.sleep(1.0 / 30.0)

    server = await asyncio.start_server(handle_client, args.host, args.port)
    url = f"http://localhost:{args.port}"
    print(f"{APP_NAME} (3D Web) running at {url}")
    print("Press Ctrl+C to stop.")

    broadcaster = asyncio.create_task(broadcast_loop())
    try:
        async with server:
            await server.serve_forever()
    finally:
        broadcaster.cancel()
        audio.stop()


def main():
    parser = argparse.ArgumentParser(description=f"{APP_NAME} - 3D Three.js Web Server")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8080, help="HTTP + WebSocket port (default: 8080)")
    parser.add_argument("--demo", action="store_true",
                        help="Run in demo mode without microphone (hold Space/button in browser to blow)")
    parser.add_argument("--device", default=None, help="Audio input device id/name")
    parser.add_argument("--threshold", type=float, default=None,
                        help="Fixed breath threshold (skips auto calibration)")
    parser.add_argument("--no-blow-calibration", action="store_true",
                        help="Skip the 'blow gently for 3 seconds' calibration step")
    parser.add_argument("--duration", type=float, default=8.0,
                        help="Seconds of steady blowing to reach 100%% (default: 8.0)")
    parser.add_argument("--speed", type=float, default=1.0,
                        help="Playback speed multiplier while blowing (default: 1.0)")
    parser.add_argument("--lowpass", type=float, default=400.0,
                        help="Only count sound below this Hz (blow rumble). 0 = all sound")
    parser.add_argument("--hold", type=float, default=0.08,
                        help="Seconds the level must stay above threshold before advancing")
    parser.add_argument("--sens", type=float, default=1.8,
                        help="Fallback threshold = quiet level x this")
    parser.add_argument("--ratio", type=float, default=0.2,
                        help="Threshold position between quiet and calibration blow")
    parser.add_argument("--reset-delay", type=float, default=0.5,
                        help="Seconds below threshold before rewinding")
    parser.add_argument("--rewind-speed", type=float, default=4.0,
                        help="Rewind speed multiplier (0 = instant)")
    parser.add_argument("--finish-hold", type=float, default=5.0,
                        help="Seconds to hold 100%% before returning to start screen")
    parser.add_argument("--debug", action="store_true",
                        help="Show level meter at start (press D to toggle)")
    args = parser.parse_args()

    try:
        asyncio.run(run_server(args))
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
