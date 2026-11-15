#!/usr/bin/env python3
"""Beat-synced music video edit in the style of the reference reel.

What it copies from the reference:
  - hard cuts on the beat, faster cutting in loud sections
  - punch-in zoom on the cut
  - RGB-split glitch hits
  - blue/white light-leak flash transitions
  - short dips to black between sections
  - per-shot color grades: cool teal, magenta/red club, black & white
  - grain + vignette over everything, 9:16 vertical output

Usage:
  python3 beatcut.py --clips clips_dir --audio song.mp3 --out edit.mp4 [--seconds 30] [--seed 1]

Needs ffmpeg/ffprobe and numpy. Nothing else.
"""
import argparse, json, os, random, subprocess, tempfile
import numpy as np

W, H, FPS = 720, 1280, 30


def run(cmd):
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "json", path], capture_output=True, text=True).stdout
    return float(json.loads(out)["format"]["duration"])


def detect_beats(audio, start, length, sr=22050):
    """Onset-strength beat picking. Returns beat times (s, relative to start) and loudness per beat."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(start), "-t", str(length), "-i", audio,
                          "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"], capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32)
    hop, win = 512, 1024
    frames = np.lib.stride_tricks.sliding_window_view(x, win)[::hop] * np.hanning(win)
    spec = np.abs(np.fft.rfft(frames, axis=1))
    low = np.log1p(spec[:, :40])                 # kick/bass band carries the beat
    flux = np.maximum(0, np.diff(low, axis=0)).sum(1)
    flux = (flux - flux.mean()) / (flux.std() + 1e-9)
    rms = np.sqrt((frames ** 2).mean(1))[1:]
    t = np.arange(len(flux)) * hop / sr
    # tempo from autocorrelation (70-180 bpm)
    ac = np.correlate(flux, flux, "full")[len(flux) - 1:]
    lags = np.arange(len(ac)) * hop / sr
    ok = (lags > 60 / 180) & (lags < 60 / 70)
    period = lags[ok][np.argmax(ac[ok])]
    # walk a beat grid, snapping each beat to the strongest nearby onset
    beats, cur = [], t[np.argmax(flux[: int(period * sr / hop) + 1])]
    while cur < length:
        lo, hi = np.searchsorted(t, [cur - 0.07, cur + 0.07])
        if hi > lo:
            cur = t[lo + np.argmax(flux[lo:hi])]
        beats.append(cur)
        cur += period
    loud = np.array([rms[min(np.searchsorted(t, b), len(rms) - 1)] for b in beats])
    loud = loud / (loud.max() + 1e-9)
    return np.array(beats), loud, 60 / period


GRADES = {
    "teal":    "colorbalance=rs=-.15:bs=.2:rm=-.1:bm=.12,eq=contrast=1.15:saturation=1.2",
    "magenta": "colorbalance=rs=.25:bs=.2:gs=-.2:rm=.15:bm=.15,eq=contrast=1.25:saturation=1.5:brightness=-.03",
    "bw":      "hue=s=0,eq=contrast=1.3",
    "warm":    "colorbalance=rs=.1:gs=.03:bs=-.1,eq=contrast=1.1:saturation=1.1",
}


def shot_filter(dur, grade, fx):
    n = max(1, int(round(dur * FPS)))
    base = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS},setsar=1"
    f = [base]
    if "punch" in fx:   # quick zoom from 115% easing to 100%
        f.append(f"scale=iw*1.15:ih*1.15,zoompan=z='max(1,1.15-0.15*on/{min(n, 8)})':"
                 f"x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s={W}x{H}:fps={FPS}")
    f.append(GRADES[grade])
    if "glitch" in fx:  # RGB split for the first 4 frames
        f.append("split[a][b];[b]rgbashift=rh=-14:bh=14:gv=4,"
                 "dblur=angle=0:radius=6[g];[a][g]overlay=enable='lt(n,4)'")
    if "flash" in fx:   # blue-white light leak burst at the head of the shot
        f.append("split[a][b];[b]colorbalance=bs=1:bm=.6:rs=-.5,eq=brightness=.55:contrast=1.6,"
                 "gblur=sigma=30[l];[a][l]blend=all_mode=screen:all_opacity=1:"
                 "enable='lt(n,5)'")
    if "whip" in fx:    # motion-blur smear out of the shot
        f.append(f"dblur=angle=0:radius=40:enable='gt(n,{n - 4})'")
    if "black" in fx:   # dip to black on the last frames
        f.append(f"fade=t=out:st={max(0, dur - 0.12):.3f}:d=0.12")
    return ",".join(f)


def build(clips_dir, audio, out, seconds, audio_start, seed):
    rnd = random.Random(seed)
    exts = (".mp4", ".mov", ".m4v", ".mkv", ".webm")
    clips = [os.path.join(clips_dir, c) for c in sorted(os.listdir(clips_dir)) if c.lower().endswith(exts)]
    if not clips:
        raise SystemExit("no video clips found")
    lens = {c: duration(c) for c in clips}
    beats, loud, bpm = detect_beats(audio, audio_start, seconds)
    print(f"{bpm:.0f} bpm, {len(beats)} beats")

    # cut plan: loud sections cut every beat, quiet ones every 2 beats
    cuts, i = [0.0], 0
    while i < len(beats) - 1:
        step = 1 if loud[i] > 0.6 else 2
        i += step
        if i < len(beats):
            cuts.append(beats[i])
    cuts.append(seconds)
    cuts = sorted(set(round(c, 3) for c in cuts if c <= seconds))

    tmp = tempfile.mkdtemp()
    parts, grade, last_clip = [], rnd.choice(list(GRADES)), None
    for k, (a, b) in enumerate(zip(cuts, cuts[1:])):
        dur = b - a
        if dur < 0.08:
            continue
        clip = rnd.choice([c for c in clips if c != last_clip] or clips)
        last_clip = clip
        src_start = rnd.uniform(0, max(0, lens[clip] - dur - 0.1))
        if rnd.random() < 0.25:       # change grade every few shots, like the reference
            grade = rnd.choice(list(GRADES))
        lv = loud[min(np.searchsorted(beats, a), len(loud) - 1)]
        fx = set()
        if rnd.random() < 0.55: fx.add("punch")
        if lv > 0.7 and rnd.random() < 0.35: fx.add("glitch")
        if rnd.random() < 0.12: fx.add("flash")
        if rnd.random() < 0.12: fx.add("whip")
        if dur > 0.8 and rnd.random() < 0.12: fx.add("black")
        p = os.path.join(tmp, f"s{k:04d}.mp4")
        run(["ffmpeg", "-y", "-ss", f"{src_start:.3f}", "-t", f"{dur:.3f}", "-i", clip,
             "-filter_complex", shot_filter(dur, grade, fx), "-an", "-frames:v",
             str(max(1, int(round(dur * FPS)))), "-c:v", "libx264", "-preset", "veryfast",
             "-crf", "18", "-pix_fmt", "yuv420p", p])
        parts.append(p)
        print(f"  shot {k:3d} {a:6.2f}s {dur:4.2f}s {grade:7s} {','.join(sorted(fx))}")

    lst = os.path.join(tmp, "list.txt")
    with open(lst, "w") as fh:
        fh.writelines(f"file '{p}'\n" for p in parts)
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-ss", str(audio_start), "-t",
         str(seconds), "-i", audio, "-filter_complex",
         "[0:v]noise=alls=10:allf=t,vignette=PI/5[v]", "-map", "[v]", "-map", "1:a",
         "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "192k", "-shortest", out])
    print("wrote", out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--clips", required=True, help="folder of source video clips")
    ap.add_argument("--audio", required=True, help="song (any format ffmpeg reads, or a video)")
    ap.add_argument("--out", default="edit.mp4")
    ap.add_argument("--seconds", type=float, default=30)
    ap.add_argument("--audio-start", type=float, default=0)
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    build(a.clips, a.audio, a.out, a.seconds, a.audio_start, a.seed)
