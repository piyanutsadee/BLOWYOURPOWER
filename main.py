import argparse
import math
import time

import cv2
import numpy as np
import pygame
import sounddevice as sd

APP_NAME = "Blow Your Power"

# ---------------------------------------------------------------- text / theme
DUSTY = (176, 152, 128)    # withered lungs  -> dry, dusty brown
FRESH = (162, 232, 132)    # healed lungs    -> fresh green
SUBTLE = (225, 225, 215)
CREAM = (253, 250, 235)
BTN_GREEN = (47, 89, 30)

# mode -> (main text, sub text)   sub supports {pct} and {sec}
TEXT = {
    "IDLE":   ("Blow to heal the lungs", "Gentle, steady breath"),
    "PLAY":   ("Keep going...", "Lungs restored {pct}%"),
    "PAUSE":  ("Keep blowing!", "Lungs restored {pct}%"),
    "REWIND": ("Try again", "Starting over"),
    "DONE":   ("Lungs restored!", "Back to start in {sec}s"),
}


def lerp(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def load_font(path, size):
    """Use the given .ttf if provided, otherwise pygame's built-in default font."""
    if path:
        try:
            return pygame.font.Font(path, size)
        except Exception:
            print(f"Warning: could not load font {path}, using default font")
    return pygame.font.Font(None, size)


def draw_text(surface, text, font, color, center):
    shadow = font.render(text, True, (0, 0, 0))
    shadow.set_alpha(150)
    img = font.render(text, True, color)
    r = img.get_rect(center=center)
    surface.blit(shadow, r.move(2, 2))
    surface.blit(img, r)


# ------------------------------------------------------------------- renderer
class Renderer:
    """Video fills the whole screen (cover or fit); HUD floats on top.
    Frames are pre-converted once, only the visible part is scaled each frame,
    and text surfaces are cached, so a Pi can keep up with the frame rate."""

    def __init__(self, screen, surfs, fonts, text, fit, subtitle, prompt):
        self.screen = screen
        self.W, self.H = screen.get_size()
        self.surfs = surfs
        self.fonts = fonts
        self.text = text
        self.subtitle = subtitle
        self.prompt = prompt
        self._txt = {}
        self._buf_idx = None

        W, H = self.W, self.H
        fw, fh = surfs[0].get_size()
        if fit:
            s = min(W / fw, H / fh)
            self.dw, self.dh = int(fw * s), int(fh * s)
            self.src_rect = pygame.Rect(0, 0, fw, fh)
        else:                                   # cover: crop source to the screen shape
            s = max(W / fw, H / fh)
            self.dw, self.dh = W, H
            sw, sh = min(fw, int(round(W / s))), min(fh, int(round(H / s)))
            self.src_rect = pygame.Rect((fw - sw) // 2, (fh - sh) // 2, sw, sh)
        self.dx, self.dy = (W - self.dw) // 2, (H - self.dh) // 2
        self.buf = pygame.Surface((self.dw, self.dh)).convert()

        # soft dark strip at the bottom (pre-rendered once)
        band_h = int(H * 0.36)
        self.band_h = band_h
        band = pygame.Surface((W, band_h), pygame.SRCALPHA)
        for y in range(band_h):
            band.fill((0, 0, 0, int(190 * y / band_h)), (0, y, W, 1))
        self.band = band.convert_alpha()

        # dark veil for the title screen
        dim = pygame.Surface((W, H), pygame.SRCALPHA)
        dim.fill((0, 0, 0, 150))
        self.dim = dim.convert_alpha()

    def cached(self, font_key, string, color):
        k = (font_key, string, color)
        if k not in self._txt:
            if len(self._txt) > 400:
                self._txt.clear()
            font = self.fonts[font_key]
            shadow = font.render(string, True, (0, 0, 0))
            shadow.set_alpha(150)
            self._txt[k] = (font.render(string, True, color), shadow)
        return self._txt[k]

    def text_at(self, font_key, string, color, center=None, midleft=None):
        img, shadow = self.cached(font_key, string, color)
        r = img.get_rect(center=center) if center else img.get_rect(midleft=midleft)
        self.screen.blit(shadow, r.move(2, 2))
        self.screen.blit(img, r)

    def center_message(self, lines, color=(235, 235, 225)):
        s, W, H = self.screen, self.W, self.H
        s.fill((18, 16, 14))
        y = H // 2 - 40 * (len(lines) - 1)
        for i, (txt, key) in enumerate(lines):
            draw_text(s, txt, self.fonts[key], color, (W // 2, y + i * int(H * 0.11)))
        pygame.display.flip()

    def calib_screen(self, lines, level, color=(235, 235, 225)):
        """Calibration screen: cached text + a live level bar (shows the mic is alive)."""
        s, W, H = self.screen, self.W, self.H
        s.fill((18, 16, 14))
        y = H // 2 - 40 * (len(lines) - 1)
        for i, (txt, key) in enumerate(lines):
            self.text_at(key, txt, color, center=(W // 2, y + i * int(H * 0.11)))
        bw, bh = int(W * 0.5), max(8, H // 40)
        bx, by = (W - bw) // 2, int(H * 0.82)
        pygame.draw.rect(s, (60, 56, 50), (bx, by, bw, bh), border_radius=bh // 2)
        fw_ = int(bw * min(1.0, level / 0.12))
        if fw_ > 0:
            pygame.draw.rect(s, FRESH, (bx, by, max(fw_, bh), bh), border_radius=bh // 2)
        pygame.display.flip()

    def _blit_video(self, index):
        if index != self._buf_idx:
            src = self.surfs[index].subsurface(self.src_rect)
            pygame.transform.scale(src, (self.dw, self.dh), self.buf)
            self._buf_idx = index
        self.screen.blit(self.buf, (self.dx, self.dy))

    def draw_title(self, t):
        """Start screen: darkened first frame + a big 'Blow Your Power' button."""
        s, W, H = self.screen, self.W, self.H
        if self.dw != W or self.dh != H:
            s.fill((0, 0, 0))
        self._blit_video(0)
        s.blit(self.dim, (0, 0))

        pulse = 0.5 + 0.5 * math.sin(t * 3.0)

        # the button, labelled with the project name
        img, shadow = self.cached("huge", APP_NAME, CREAM)
        padx, pady = int(H * 0.07), int(H * 0.035)
        bw, bh = img.get_width() + 2 * padx, img.get_height() + 2 * pady
        rect = pygame.Rect(0, 0, bw, bh)
        rect.center = (W // 2, int(H * 0.44))
        pygame.draw.rect(s, BTN_GREEN, rect, border_radius=bh // 2)
        pygame.draw.rect(s, lerp((110, 170, 85), FRESH, pulse), rect,
                         width=max(2, H // 140), border_radius=bh // 2)
        r = img.get_rect(center=rect.center)
        s.blit(shadow, r.move(2, 2))
        s.blit(img, r)

        self.text_at("hint", self.subtitle, SUBTLE, center=(W // 2, int(H * 0.64)))

        # blinking prompt
        pimg, pshadow = self.cached("hint", self.prompt, FRESH)
        a = int(110 + 145 * pulse)
        pimg.set_alpha(a)
        pshadow.set_alpha(int(a * 0.6))
        pr = pimg.get_rect(center=(W // 2, int(H * 0.80)))
        s.blit(pshadow, pr.move(2, 2))
        s.blit(pimg, pr)

    def draw(self, index, mode, progress, level, thr, total, remaining, debug, fps_now):
        s, W, H = self.screen, self.W, self.H
        if self.dw != W or self.dh != H:
            s.fill((0, 0, 0))

        self._blit_video(index)
        s.blit(self.band, (0, H - self.band_h))

        q = round(progress * 20) / 20.0                    # quantised so text can be cached
        col = lerp(DUSTY, FRESH, q)
        pct = int(progress * 100)
        main, sub = self.text[mode]
        sub = sub.format(pct=pct, sec=max(1, int(math.ceil(remaining))))

        self.text_at("title", main, col, center=(W // 2, int(H * 0.77)))
        if sub:
            self.text_at("hint", sub, SUBTLE, center=(W // 2, int(H * 0.855)))

        # progress bar + percent
        bw, bh = int(W * 0.62), max(8, H // 32)
        bx, by = (W - bw) // 2, int(H * 0.92)
        pygame.draw.rect(s, (0, 0, 0), (bx - 1, by - 1, bw + 2, bh + 2), border_radius=bh)
        pygame.draw.rect(s, (70, 62, 55), (bx, by, bw, bh), border_radius=bh)
        fw_ = int(bw * progress)
        if fw_ > 0:
            pygame.draw.rect(s, col, (bx, by, max(fw_, bh), bh), border_radius=bh)
        self.text_at("hint", f"{pct}%", SUBTLE, midleft=(bx + bw + int(W * 0.02), by + bh // 2))

        if debug:
            mw, mh = int(W * 0.25), 8
            top = max(thr * 4, 0.05)
            pygame.draw.rect(s, (40, 40, 40), (12, 12, mw, mh))
            pygame.draw.rect(s, (120, 200, 120) if level > thr else (150, 150, 150),
                             (12, 12, max(1, int(mw * min(1.0, level / top))), mh))
            tx = 12 + int(mw * min(1.0, thr / top))
            pygame.draw.line(s, (255, 90, 90), (tx, 8), (tx, 12 + mh + 3), 2)
            txt = self.fonts["small"].render(
                f"lvl {level:.4f}  thr {thr:.4f}  f {index}/{total}  {mode}  {fps_now:.0f}fps",
                True, (245, 245, 245))
            txt.set_alpha(220)
            s.blit(txt, (12, 12 + mh + 6))


# ------------------------------------------------------------------ controller
class Controller:
    """Blow -> advance. Stop blowing -> wait, then rewind to the start.
    Reaching the end -> hold the final image, then `finished` becomes True.

    Everything is measured in real seconds (not loop ticks), so the video takes
    the same time to finish no matter how fast the screen redraws."""

    def __init__(self, total, direction, fps, threshold, hold, reset_delay,
                 rewind_speed, finish_hold, speed):
        self.total = total
        self.step = -1 if direction == "reverse" else 1
        self.start = total - 1 if direction == "reverse" else 0
        self.end = 0 if direction == "reverse" else total - 1
        self.pos = float(self.start)
        self.threshold = threshold
        self.hold = hold
        self.reset_delay = reset_delay
        self.play_rate = fps * speed                 # frames per second while blowing
        self.back_rate = fps * rewind_speed          # frames per second while rewinding
        self.rewind_speed = rewind_speed
        self.finish_hold = finish_hold
        self.above = 0.0
        self.playing = False
        self.quiet = 0.0
        self.done_until = None
        self.finished = False
        self.mode = "IDLE"
        self.last = time.time()

    @property
    def index(self):
        return max(0, min(self.total - 1, int(round(self.pos))))

    @property
    def progress(self):
        return min(1.0, abs(self.pos - self.start) / max(1, abs(self.end - self.start)))

    def remaining(self, now):
        return max(0.0, self.done_until - now) if self.done_until is not None else 0.0

    def update(self, level, now):
        dt = max(0.0, min(0.1, now - self.last))
        self.last = now

        if self.done_until is not None:
            self.mode = "DONE"
            if now >= self.done_until:
                self.done_until = None
                self.finished = True                 # main loop goes back to the start screen
                self.pos = float(self.start)
                self.playing = False
                self.above = 0.0
                self.quiet = 0.0
                self.mode = "IDLE"
            return self.index, self.mode

        if self.playing:
            self.playing = level > self.threshold          # below the red line = stopped
        else:
            self.above = self.above + dt if level > self.threshold else 0.0
            self.playing = self.above >= self.hold
        if not self.playing and level <= self.threshold:
            self.above = 0.0

        if self.playing:
            self.quiet = 0.0
            self.pos += self.step * self.play_rate * dt
            self.mode = "PLAY"
            if (self.step > 0 and self.pos >= self.end) or (self.step < 0 and self.pos <= self.end):
                self.pos = float(self.end)
                self.done_until = now + self.finish_hold
                self.mode = "DONE"
        else:
            self.quiet += dt
            if abs(self.pos - self.start) < 0.5:
                self.mode = "IDLE"
            elif self.quiet >= self.reset_delay:
                if self.rewind_speed <= 0:
                    self.pos = float(self.start)
                else:
                    self.pos -= self.step * self.back_rate * dt
                    if self.step > 0:
                        self.pos = max(float(self.start), self.pos)
                    else:
                        self.pos = min(float(self.start), self.pos)
                self.mode = "REWIND"
            else:
                self.mode = "PAUSE"
        return self.index, self.mode


# ------------------------------------------------------------------------ main
def load_frames(path, max_width):
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        return None, 0
    fps = cap.get(cv2.CAP_PROP_FPS) or 24
    frames = []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        h, w = frame.shape[:2]
        if max_width and w > max_width:
            frame = cv2.resize(frame, (max_width, int(h * max_width / w)))
        frames.append(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    cap.release()
    return frames, fps


def main():
    parser = argparse.ArgumentParser(description=f"{APP_NAME} - BreathPi Video Control Game")
    parser.add_argument("--source", default="mic", help="Audio source (mic)")
    parser.add_argument("--video", required=True, help="Path to video file")
    parser.add_argument("--device", default=None, help="Audio input device id/name")
    parser.add_argument("--threshold", type=float, default=None,
                        help="Fixed breath threshold (skips auto calibration)")
    parser.add_argument("--no-blow-calibration", action="store_true",
                        help="Skip the 'blow gently for 3 seconds' calibration step")
    parser.add_argument("--direction", choices=["reverse", "forward"], default="forward")
    parser.add_argument("--max-width", type=int, default=480,
                        help="Downscale frames to this width (0 = original)")
    parser.add_argument("--scale", type=float, default=1.0,
                        help="Window scale factor (only with --windowed)")
    parser.add_argument("--speed", type=float, default=1.0,
                        help="Playback speed while blowing (1.0 = normal, 1.5 = needs less blowing)")
    parser.add_argument("--lowpass", type=float, default=400,
                        help="Only count sound below this Hz (blow rumble). 0 = all sound")
    parser.add_argument("--hold", type=float, default=0.08,
                        help="Seconds the level must stay above threshold before playing")
    parser.add_argument("--sens", type=float, default=1.8,
                        help="Fallback threshold = quiet level x this (used if the blow is not heard)")
    parser.add_argument("--ratio", type=float, default=0.2,
                        help="Threshold position between quiet and your calibration blow "
                             "(0.2 = low/easy, 0.5 = harder)")
    parser.add_argument("--render-width", type=int, default=960,
                        help="Draw at this width and let the system scale to fullscreen "
                             "(smaller = faster, 0 = native resolution)")
    parser.add_argument("--finish-hold", type=float, default=5.0,
                        help="Seconds to keep the final image before going back to the start screen")
    parser.add_argument("--reset-delay", type=float, default=0.5,
                        help="Seconds the level stays below the threshold (red line) before it rewinds")
    parser.add_argument("--rewind-speed", type=int, default=4,
                        help="Rewind speed (x video speed, 0 = instant)")
    parser.add_argument("--font", default=None, help="Path to a custom .ttf font (optional)")
    parser.add_argument("--windowed", action="store_true",
                        help="Run in a normal window instead of fullscreen")
    parser.add_argument("--fullscreen", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--fit", action="store_true",
                        help="Letterbox the video (no cropping) instead of filling the screen")
    parser.add_argument("--debug", action="store_true",
                        help="Show level meter at start (press D to toggle)")
    args = parser.parse_args()

    print("Loading video into memory...")
    frames, fps = load_frames(args.video, args.max_width)
    if not frames:
        print(f"Error: Could not open/read video {args.video}")
        return
    total = len(frames)
    fh, fw = frames[0].shape[:2]
    print(f"Loaded {total} frames at {fps:.1f} FPS ({fw}x{fh})")

    state = {"level": 0.0, "rate": 48000}
    lp = args.lowpass

    def audio_callback(indata, n, t, status):
        x = indata.mean(axis=1)
        if lp > 0 and len(x) > 8:
            # Blowing on a mic makes strong LOW-frequency rumble; talking/ambient
            # noise is mostly higher. Measure only the energy below `lp` Hz.
            spec = np.abs(np.fft.rfft(x - x.mean())) ** 2
            k = max(2, int(lp * len(x) / state["rate"]))
            rms = float(np.sqrt(2.0 * spec[1:k].sum()) / len(x))
        else:
            rms = float(np.sqrt(np.mean(x ** 2)))
        state["level"] = 0.6 * state["level"] + 0.4 * rms

    device = args.device
    if device is not None and device.isdigit():
        device = int(device)

    stream = None
    last_error = None
    try:
        default_rate = int(sd.query_devices(device, "input")["default_samplerate"])
    except Exception:
        default_rate = 48000
    for rate in [default_rate, 48000, 44100, 32000, 16000]:
        for ch in (1, 2):
            try:
                state["rate"] = rate
                stream = sd.InputStream(channels=ch, samplerate=rate, blocksize=2048,
                                        device=device, callback=audio_callback)
                stream.start()
                print(f"Microphone opened: {rate} Hz, {ch} channel(s)")
                break
            except Exception as e:
                stream = None
                last_error = e
        if stream is not None:
            break
    if stream is None:
        print(f"Error: could not open microphone: {last_error}")
        print("Tip: run  python3 -m sounddevice  to list devices, then use --device ID")
        return

    pygame.init()
    fullscreen = not args.windowed
    if fullscreen:
        try:
            dw_, dh_ = pygame.display.get_desktop_sizes()[0]
            lw = min(args.render_width, dw_) if args.render_width > 0 else dw_
            lh = int(round(lw * dh_ / dw_))
            screen = pygame.display.set_mode((lw, lh), pygame.FULLSCREEN | pygame.SCALED)
        except Exception as e:
            print(f"SCALED fullscreen failed ({e}), using plain fullscreen")
            screen = pygame.display.set_mode((0, 0), pygame.FULLSCREEN)
    else:
        screen = pygame.display.set_mode((int(fw * args.scale), int(fh * args.scale)))
    pygame.display.set_caption(APP_NAME)
    w, h = screen.get_size()
    fonts = {"huge": load_font(args.font, max(22, int(h * 0.12))),
             "title": load_font(args.font, max(18, int(h * 0.085))),
             "hint": load_font(args.font, max(14, int(h * 0.050))),
             "small": load_font(args.font, max(12, int(h * 0.030)))}

    # convert every frame to a display-format surface once (much faster per frame)
    # (the raw frame is released right after it is converted, so memory never doubles)
    surfs = []
    for i in range(total):
        surfs.append(pygame.surfarray.make_surface(np.swapaxes(frames[i], 0, 1)).convert())
        frames[i] = None
    del frames

    ui = Renderer(screen, surfs, fonts, TEXT, args.fit,
                  subtitle="Blow to heal the lungs",
                  prompt="Press Space or click to play")
    clock = pygame.time.Clock()
    debug = [args.debug]

    def sample_levels(seconds, lines_fn):
        out = []
        end = time.time() + seconds
        last_draw = 0.0
        while True:
            now = time.time()
            if now >= end:
                break
            for ev in pygame.event.get():
                if ev.type == pygame.QUIT:
                    raise KeyboardInterrupt
                if ev.type == pygame.KEYDOWN and ev.key in (pygame.K_ESCAPE, pygame.K_q):
                    raise KeyboardInterrupt
            out.append(state["level"])
            if now - last_draw >= 0.1:                 # redraw ~10x/s only (light on a Pi)
                ui.calib_screen(lines_fn(end - now), state["level"])
                last_draw = now
            time.sleep(0.02)
        return out

    # ------------------------------------------------------------ start screen
    def run_title():
        """Returns True when the player presses play, False to quit."""
        pygame.mouse.set_visible(True)
        t0 = time.time()
        while True:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    return False
                if event.type == pygame.KEYDOWN:
                    if event.key in (pygame.K_ESCAPE, pygame.K_q):
                        return False
                    if event.key in (pygame.K_SPACE, pygame.K_RETURN, pygame.K_KP_ENTER):
                        return True
                if event.type == pygame.MOUSEBUTTONDOWN:
                    return True
            ui.draw_title(time.time() - t0)
            pygame.display.flip()
            clock.tick(30)

    # ------------------------------------------------------------- calibration
    def calibrate():
        if args.threshold is not None:
            return args.threshold
        print("Calibrating... please stay quiet for 2 seconds")
        quiet = sample_levels(2, lambda r: [("Stay quiet a moment", "title"),
                                            (f"{math.ceil(r):.0f}", "hint")])
        baseline = float(np.mean(quiet)) if quiet else 0.0
        threshold = max(baseline * args.sens, 0.005)
        if not args.no_blow_calibration:
            print("Now blow GENTLY into the mic for 3 seconds (as light as a real player would)")
            blow = sample_levels(3, lambda r: [("Blow gently into the mic", "title"),
                                               (f"{math.ceil(r):.0f}", "hint")])
            peak = float(np.percentile(blow, 90)) if blow else 0.0
            if peak > max(baseline * 1.5, 0.003):
                threshold = max(baseline + args.ratio * (peak - baseline), baseline * 1.3, 0.003)
                print(f"Blow level {peak:.4f}, quiet level {baseline:.4f}")
            else:
                print("Could not hear a clear blow, using the automatic threshold")
        return threshold

    # --------------------------------------------------------------- one round
    def play(threshold):
        """Returns True when the round finished normally, False to quit."""
        print(f"Threshold = {threshold:.4f}. Blow into the mic to play the video {args.direction}.")
        print("ESC/Q = quit, D = level meter, DOWN/LEFT = easier, UP/RIGHT = harder.")
        if fullscreen:
            pygame.mouse.set_visible(False)
        ctl = Controller(total, args.direction, fps, threshold, args.hold,
                         args.reset_delay, args.rewind_speed, args.finish_hold, args.speed)
        while True:
            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    return False
                if event.type == pygame.KEYDOWN:
                    if event.key in (pygame.K_ESCAPE, pygame.K_q):
                        return False
                    elif event.key == pygame.K_d:
                        debug[0] = not debug[0]
                    elif event.key in (pygame.K_DOWN, pygame.K_LEFT, pygame.K_MINUS):
                        ctl.threshold = max(0.001, ctl.threshold * 0.85)    # easier
                    elif event.key in (pygame.K_UP, pygame.K_RIGHT, pygame.K_EQUALS, pygame.K_PLUS):
                        ctl.threshold *= 1.15                               # harder

            level = state["level"]
            now = time.time()
            index, mode = ctl.update(level, now)
            if ctl.finished:
                return True
            ui.draw(index, mode, ctl.progress, level, ctl.threshold, total,
                    ctl.remaining(now), debug[0], clock.get_fps())
            pygame.display.flip()
            clock.tick(fps)

    # ---------------------------------------------------------------- main loop
    try:
        while True:
            if not run_title():
                break
            threshold = calibrate()
            if not play(threshold):
                break
    finally:
        stream.stop()
        stream.close()
        pygame.quit()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass