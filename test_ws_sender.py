#!/usr/bin/env python3
"""
Test script that simulates microphone breath data like `main.py`
and sends it into the WebSocket server (`server.py --demo`) so you can
watch the 3D lungs & live data update in the web UI.

Zero external dependencies (Python stdlib only).

Examples:
  python3 test_ws_sender.py
  python3 test_ws_sender.py --url ws://localhost:5173/ws
  python3 test_ws_sender.py --scenario wave --loop
  python3 test_ws_sender.py --scenario steady --peak 0.08
"""

import argparse
import asyncio
import base64
import json
import math
import os
import random
import struct
import time
from urllib.parse import urlparse


# ------------------------------------------------------ minimal stdlib WS client
class SimpleWSClient:
    def __init__(self, url: str):
        parsed = urlparse(url)
        if parsed.scheme != "ws":
            raise ValueError(f"Only ws:// URLs are supported (got {url})")
        self.host = parsed.hostname or "127.0.0.1"
        self.port = parsed.port or 80
        self.path = parsed.path or "/"
        if parsed.query:
            self.path += f"?{parsed.query}"
        self.reader = None
        self.writer = None

    async def connect(self):
        self.reader, self.writer = await asyncio.open_connection(self.host, self.port)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET {self.path} HTTP/1.1\r\n"
            f"Host: {self.host}:{self.port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        ).encode("ascii")
        self.writer.write(req)
        await self.writer.drain()

        resp = await self.reader.readuntil(b"\r\n\r\n")
        first_line = resp.split(b"\r\n", 1)[0].decode("iso-8859-1", errors="replace")
        if "101" not in first_line:
            raise RuntimeError(f"WebSocket handshake failed: {first_line}")

    async def send_json(self, obj: dict):
        payload = json.dumps(obj).encode("utf-8")
        mask = os.urandom(4)
        n = len(payload)
        hdr = bytearray([0x81])
        if n < 126:
            hdr.append(0x80 | n)
        elif n < 65536:
            hdr.append(0x80 | 126)
            hdr.extend(struct.pack("!H", n))
        else:
            hdr.append(0x80 | 127)
            hdr.extend(struct.pack("!Q", n))
        hdr.extend(mask)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.writer.write(bytes(hdr) + masked)
        await self.writer.drain()

    async def recv_json(self):
        while True:
            hdr = await self.reader.readexactly(2)
            b1, b2 = hdr[0], hdr[1]
            opcode = b1 & 0x0F
            masked = (b2 & 0x80) != 0
            length = b2 & 0x7F
            if length == 126:
                length = struct.unpack("!H", await self.reader.readexactly(2))[0]
            elif length == 127:
                length = struct.unpack("!Q", await self.reader.readexactly(8))[0]
            mask_key = await self.reader.readexactly(4) if masked else b""
            payload = await self.reader.readexactly(length)
            if masked:
                payload = bytes(b ^ mask_key[i % 4] for i, b in enumerate(payload))

            if opcode == 0x8:  # Close
                return None
            if opcode == 0x9:  # Ping -> Pong
                mask = os.urandom(4)
                pong_hdr = bytearray([0x8A, 0x80 | len(payload)]) + mask
                pong_data = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
                self.writer.write(bytes(pong_hdr) + pong_data)
                await self.writer.drain()
                continue
            if opcode == 0xA:  # Pong
                continue
            if opcode == 0x1:  # Text
                return json.loads(payload.decode("utf-8", errors="replace"))

    async def close(self):
        if self.writer is not None:
            try:
                self.writer.write(bytes([0x88, 0x80]) + os.urandom(4))
                await self.writer.drain()
                self.writer.close()
            except Exception:
                pass


# ------------------------------------------------ main.py-like breath generator
def breath_sample(target: float, t: float, prev_level: float) -> float:
    """Mimics main.py audio_callback RMS + EMA smoothing (0.6 * prev + 0.4 * rms)."""
    if target <= 0.005:
        rms = max(0.0, target + random.uniform(-0.0008, 0.0008))
    else:
        ripple = 0.006 * math.sin(t * 7.5) + 0.003 * math.sin(t * 19.0)
        jitter = random.uniform(-0.004, 0.004)
        rms = max(0.0, target + ripple + jitter)
    return 0.6 * prev_level + 0.4 * rms


def build_scenario(name: str, peak: float):
    """Returns list of (phase_label, duration_sec, target_level)."""
    quiet = 0.002
    if name == "steady":
        return [
            ("IDLE (quiet)", 1.0, quiet),
            ("BLOW (steady to 100%)", 9.5, peak),
            ("DONE (hold)", 5.5, quiet),
        ]
    if name == "wave":
        return [
            ("IDLE (quiet)", 1.0, quiet),
            ("BLOW (light)", 2.5, peak * 0.65),
            ("BLOW (strong)", 2.5, peak * 1.15),
            ("PAUSE (stop)", 0.4, quiet),
            ("REWIND (quiet)", 2.0, quiet),
            ("BLOW (recover)", 4.0, peak),
            ("REWIND (quiet)", 2.5, quiet),
        ]
    # default: "full" — exercises every Controller mode in main.py
    return [
        ("IDLE (quiet)", 1.5, quiet),
        ("PLAY (gentle blow)", 3.5, peak * 0.85),
        ("PAUSE (brief stop)", 0.4, quiet),
        ("REWIND (stopped too long)", 1.8, quiet),
        ("PLAY (strong blow to 100%)", 9.5, peak),
        ("DONE (celebrate & hold)", 5.5, quiet),
    ]


async def run_test(args):
    ws = SimpleWSClient(args.url)
    print(f"Connecting to {args.url} ...")
    await ws.connect()
    print("Connected! Open the web UI (e.g. http://localhost:5173) to watch live updates.\n")

    latest = {}
    stop_event = asyncio.Event()

    async def reader_task():
        last_print = 0.0
        try:
            while not stop_event.is_set():
                msg = await ws.recv_json()
                if msg is None:
                    print("\nServer closed WebSocket connection.")
                    stop_event.set()
                    return
                latest.clear()
                latest.update(msg)
                now = time.time()
                if now - last_print >= args.log_interval:
                    last_print = now
                    pct = int(round(msg.get("progress", 0.0) * 100))
                    print(
                        f"  [WEB DATA] screen={msg.get('screen', '?'):<11} "
                        f"mode={msg.get('mode', '?'):<6} "
                        f"progress={pct:3d}%  "
                        f"level={msg.get('level', 0.0):.4f}  "
                        f"thr={msg.get('threshold', 0.0):.4f}  "
                        f"rem={msg.get('remaining', 0.0):.1f}s"
                    )
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"\nReader stopped: {e}")
            stop_event.set()

    reader = asyncio.create_task(reader_task())

    # Wait briefly for initial snapshot
    await asyncio.sleep(0.25)

    if not latest.get("demo", False):
        print(
            "Warning: server is NOT running in --demo mode, so `demo_level` commands "
            "will be ignored by server.py.\n"
            "Make sure backend is started with `--demo` (default in docker-compose.yml).\n"
        )

    # Enable on-screen debug signal meter if requested and currently off
    if args.show_debug and not latest.get("debug", False):
        await ws.send_json({"cmd": "toggle_debug"})
        await asyncio.sleep(0.1)

    level = 0.002
    phases = build_scenario(args.scenario, args.peak)
    dt = 1.0 / args.hz

    try:
        round_num = 0
        while not stop_event.is_set():
            round_num += 1
            print(f"=== Round {round_num} (scenario={args.scenario}, peak={args.peak:.3f}) ===")
            await ws.send_json({"cmd": "reset"})
            await asyncio.sleep(0.15)
            await ws.send_json({"cmd": "start"})
            await asyncio.sleep(0.15)

            for label, dur, target in phases:
                if stop_event.is_set():
                    break
                print(f"\n--> Phase: {label} ({dur:.1f}s, target_level={target:.3f})")
                end_t = time.time() + dur
                while time.time() < end_t and not stop_event.is_set():
                    now = time.time()
                    level = breath_sample(target, now, level)
                    await ws.send_json({"cmd": "demo_level", "value": round(level, 5)})
                    await asyncio.sleep(dt)

            if not args.loop:
                break
    finally:
        # Release override so web UI returns cleanly to idle
        try:
            await ws.send_json({"cmd": "demo_level", "value": None})
        except Exception:
            pass
        stop_event.set()
        reader.cancel()
        await ws.close()
        print("\nDone.")


def main():
    parser = argparse.ArgumentParser(
        description="Send simulated main.py breath data to Blow Your Power WebSocket server."
    )
    parser.add_argument(
        "--url",
        default="ws://localhost:18080/ws",
        help="WebSocket URL (default: ws://localhost:18080/ws; or ws://localhost:5173/ws)",
    )
    parser.add_argument(
        "--scenario",
        choices=["full", "steady", "wave"],
        default="full",
        help="Test pattern: full (all modes), steady (0->100%%), wave (up/down)",
    )
    parser.add_argument(
        "--peak",
        type=float,
        default=0.065,
        help="Simulated blow RMS level (default: 0.065; threshold is ~0.020)",
    )
    parser.add_argument(
        "--hz",
        type=float,
        default=30.0,
        help="Send rate in Hz (default: 30)",
    )
    parser.add_argument(
        "--log-interval",
        type=float,
        default=0.35,
        help="How often to print received web state in seconds (default: 0.35)",
    )
    parser.add_argument(
        "--loop",
        action="store_true",
        help="Repeat the scenario continuously until Ctrl+C",
    )
    parser.add_argument(
        "--no-debug",
        dest="show_debug",
        action="store_false",
        help="Do not automatically toggle the SignalMeter debug HUD on the web UI",
    )
    args = parser.parse_args()

    try:
        asyncio.run(run_test(args))
    except KeyboardInterrupt:
        print("\nStopped by user.")


if __name__ == "__main__":
    main()
