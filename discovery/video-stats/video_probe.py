"""
video_probe.py: run HanaFEKI/AI_BasketBall_Analysis_v1's own detection, tracking,
possession and pass/interception code over a window of a game video, and report
what it can and cannot see. Discovery only; nothing here is used by the site.

Streams frames in chunks instead of the repo's read_video(), which loads the whole
video into RAM. Writes summary.json plus a few annotated frames to --out.

  python video_probe.py GAME.mp4 --start 0 --duration 120
  python video_probe.py "https://www.youtube.com/watch?v=PKYepWAL0u8" --start 0 --duration 300

Setup (README.md): clone the repo next to this file and apply repo-fixes.diff.

Stand-ins, for when the fine-tuned weights cannot be downloaded:
  * player + ball detector: COCO-pretrained YOLO ("person" -> "player",
    "sports ball" -> "Ball"), unless --player-model/--ball-model point at the
    fine-tuned weights (the tutorial's player_detector.pt / ball_detector_model.pt);
  * team assignment: k-means on jersey colour instead of Fashion-CLIP.
"""
import argparse
import copy
import functools
import json
import os
import subprocess
import sys
import time
from collections import Counter, defaultdict

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get("REPO_DIR", os.path.join(HERE, "AI_BasketBall_Analysis_v1"))
sys.path.insert(0, REPO)

from trackers import PlayerTracker, BallTracker  # noqa: E402  (the repo's code)
from ball_acquisition import BallAquisitionDetector  # noqa: E402
from pass_interception_detector import PassAndInterceptionDetector  # noqa: E402


def fetch_youtube(url, out_dir, start, duration):
    """Download only the requested window (yt-dlp + ffmpeg)."""
    os.makedirs(out_dir, exist_ok=True)
    target = os.path.join(out_dir, "source.mp4")
    section = f"*{start}-{start + duration}" if duration else f"*{start}-inf"
    cmd = ["yt-dlp", "-f", "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080]",
           "--download-sections", section, "--force-keyframes-at-cuts",
           "-o", target, "--merge-output-format", "mp4", url]
    print("[probe] " + " ".join(cmd))
    subprocess.run(cmd, check=True)
    return target, 0  # the file now starts at `start`


def as_repo_classes(tracker):
    """
    The repo filters on the exact names 'player' and 'Ball'. COCO calls them
    'person' and 'sports ball'; the fine-tuned dataset calls players 'Player',
    which the repo's lowercase lookup never matches (zero players tracked).
    """
    names = tracker.model.model.names
    for k, v in list(names.items()):
        if v.lower() in ("person", "player"):
            names[k] = "player"
        elif v.lower() in ("sports ball", "ball"):
            names[k] = "Ball"


def with_conf(tracker, conf):
    """The repo hard-codes conf=0.5, which a COCO model never reaches on a ball."""
    tracker.detect_frames = functools.partial(type(tracker).detect_frames, tracker, conf=conf)


class KMeansTeamAssigner:
    """Stand-in for the repo's Fashion-CLIP TeamAssigner, same reset-every-50-frames cadence."""

    def __init__(self):
        self.centers = None
        self.cache = {}

    @staticmethod
    def jersey_colour(frame, bbox):
        x1, y1, x2, y2 = [int(v) for v in bbox]
        h, w = y2 - y1, x2 - x1
        crop = frame[max(y1 + int(h * 0.15), 0):max(y1 + int(h * 0.5), 1),
                     max(x1 + int(w * 0.25), 0):max(x1 + int(w * 0.75), 1)]
        if crop.size == 0:
            return None
        lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB).reshape(-1, 3).astype(np.float32)
        return np.median(lab, axis=0)

    def fit(self, frames, tracks):
        samples = []
        for frame, ft in zip(frames, tracks):
            for t in ft.values():
                c = self.jersey_colour(frame, t["bbox"])
                if c is not None:
                    samples.append(c)
        if len(samples) < 2:
            return
        crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.5)
        _, _, centers = cv2.kmeans(np.array(samples), 2, None, crit, 5, cv2.KMEANS_PP_CENTERS)
        # Team 1 = the lighter jersey, so runs are comparable.
        self.centers = centers[np.argsort(-centers[:, 0])]

    def assign(self, frames, tracks, frame_offset):
        out = []
        for i, (frame, ft) in enumerate(zip(frames, tracks)):
            if (frame_offset + i) % 50 == 0:
                self.cache = {}
            row = {}
            for pid, t in ft.items():
                if pid not in self.cache:
                    c = self.jersey_colour(frame, t["bbox"])
                    if c is None or self.centers is None:
                        continue
                    self.cache[pid] = int(np.argmin(np.linalg.norm(self.centers - c, axis=1))) + 1
                row[pid] = self.cache[pid]
            out.append(row)
        return out


def read_chunks(path, start_s, duration_s, chunk):
    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    cap.set(cv2.CAP_PROP_POS_MSEC, start_s * 1000)
    limit = int(duration_s * fps) if duration_s else None
    read, buf = 0, []
    while limit is None or read < limit:
        ok, frame = cap.read()
        if not ok:
            break
        buf.append(frame)
        read += 1
        if len(buf) == chunk:
            yield fps, buf
            buf = []
    if buf:
        yield fps, buf
    cap.release()


def annotate(frame, players, teams, ball, holder):
    img = frame.copy()
    colours = {1: (255, 255, 255), 2: (200, 120, 0)}
    for pid, t in players.items():
        x1, y1, x2, y2 = [int(v) for v in t["bbox"]]
        col = (0, 215, 255) if pid == holder else colours.get(teams.get(pid), (128, 128, 128))
        cv2.rectangle(img, (x1, y1), (x2, y2), col, 2)
        cv2.putText(img, f"{pid}/T{teams.get(pid, '?')}", (x1, y1 - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, col, 2)
    if ball:
        x1, y1, x2, y2 = [int(v) for v in ball["bbox"]]
        cv2.circle(img, ((x1 + x2) // 2, (y1 + y2) // 2), max(6, (x2 - x1) // 2 + 4), (0, 0, 255), 2)
    return img


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input", help="video file or YouTube URL")
    ap.add_argument("--start", type=float, default=0, help="seconds into the video")
    ap.add_argument("--duration", type=float, default=60, help="seconds to process (0 = all)")
    ap.add_argument("--player-model", default="yolo11m.pt",
                    help="COCO weights download on first use; or a fine-tuned .pt")
    ap.add_argument("--ball-model", default=None, help="defaults to --player-model")
    ap.add_argument("--player-conf", type=float, default=0.5, help="the repo's value")
    ap.add_argument("--ball-conf", type=float, default=0.5, help="the repo's value; try 0.15 with COCO")
    ap.add_argument("--chunk", type=int, default=240)
    ap.add_argument("--snapshots", type=int, default=6)
    ap.add_argument("--out", default=os.path.join(HERE, "out"))
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    path, start = args.input, args.start
    if path.startswith("http"):
        path, start = fetch_youtube(path, args.out, args.start, args.duration)

    t0 = time.time()
    player_tracker = PlayerTracker(args.player_model)
    ball_tracker = BallTracker(args.ball_model or args.player_model)
    for tr in (player_tracker, ball_tracker):
        as_repo_classes(tr)
    with_conf(player_tracker, args.player_conf)
    with_conf(ball_tracker, args.ball_conf)
    teams = KMeansTeamAssigner()
    timing = defaultdict(float)

    all_players, all_balls_raw, all_teams = [], [], []
    snap_frames = {}
    fps = 30
    frames_seen = 0
    total_frames_est = None
    for fps, frames in read_chunks(path, start, args.duration, args.chunk):
        if total_frames_est is None:
            if args.duration:
                total_frames_est = int(args.duration * fps)
            else:
                cap = cv2.VideoCapture(path)
                total_frames_est = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) - start * fps)
                cap.release()
        s = time.time()
        players = player_tracker.get_object_tracks(frames)
        timing["player_detect_track"] += time.time() - s
        s = time.time()
        balls = ball_tracker.get_object_tracks(frames)
        timing["ball_detect"] += time.time() - s
        s = time.time()
        if teams.centers is None:
            teams.fit(frames, players)
        tm = teams.assign(frames, players, frames_seen)
        timing["team_assign"] += time.time() - s
        if total_frames_est:
            want = set(np.linspace(0, total_frames_est - 1, args.snapshots).astype(int))
            for i, f in enumerate(frames):
                if frames_seen + i in want:
                    snap_frames[frames_seen + i] = f
        all_players += players
        all_balls_raw += balls
        all_teams += tm
        frames_seen += len(frames)
        print(f"[probe] {frames_seen} frames, {time.time() - t0:.0f}s elapsed", flush=True)

    n = frames_seen
    raw_ball_frames = sum(1 for b in all_balls_raw if b)
    s = time.time()
    balls_filtered = ball_tracker.remove_wrong_detections(copy.deepcopy(all_balls_raw))
    filtered_ball_frames = sum(1 for b in balls_filtered if b)
    balls = ball_tracker.interpolate_ball_positions(balls_filtered)
    interp_ball_frames = sum(1 for b in balls if b)
    possession = BallAquisitionDetector().detect_ball_possession(all_players, balls)
    pid = PassAndInterceptionDetector()
    passes = pid.detect_passes(possession, all_teams)
    interceptions = pid.detect_interceptions(possession, all_teams)
    timing["possession_passes"] += time.time() - s

    # Track-ID health: a player keeps one ID only if nothing breaks the track.
    ids_per_frame = [len(p) for p in all_players]
    all_ids = set(i for p in all_players for i in p)
    id_lifetimes = Counter(i for p in all_players for i in p)
    team_seen = defaultdict(set)
    for row in all_teams:
        for i, t in row.items():
            team_seen[i].add(t)
    flipped = sum(1 for s_ in team_seen.values() if len(s_) > 1)

    held = [p for p in possession if p != -1]
    team_of_holder = Counter(all_teams[i].get(p, 0) for i, p in enumerate(possession) if p != -1)
    holder_changes = sum(1 for a, b in zip(possession, possession[1:]) if a != -1 and b != -1 and a != b)

    total_time = time.time() - t0
    summary = {
        "input": args.input, "start_s": args.start, "frames": n, "video_fps": fps,
        "video_seconds": round(n / fps, 1),
        "models": {"player": os.path.basename(args.player_model),
                   "ball": os.path.basename(args.ball_model or args.player_model),
                   "team": "kmeans-jersey-colour (stand-in for fashion-clip)"},
        "processing": {
            "wall_seconds": round(total_time, 1),
            "frames_per_second": round(n / total_time, 2),
            "x_realtime": round((n / fps) / total_time, 3),
            "stage_seconds": {k: round(v, 1) for k, v in timing.items()},
        },
        "players": {
            "mean_people_detected_per_frame": round(float(np.mean(ids_per_frame)), 1) if n else 0,
            "unique_track_ids": len(all_ids),
            "track_ids_per_minute": round(len(all_ids) / max(n / fps / 60, 1e-9), 1),
            "median_track_lifetime_s": round(float(np.median(list(id_lifetimes.values()))) / fps, 1) if all_ids else 0,
            "ids_assigned_to_both_teams": flipped,
        },
        "ball": {
            "frames_detected_raw_pct": round(100 * raw_ball_frames / max(n, 1), 1),
            "after_jump_filter_pct": round(100 * filtered_ball_frames / max(n, 1), 1),
            "after_interpolation_pct": round(100 * interp_ball_frames / max(n, 1), 1),
        },
        "outputs_the_repo_produces": {
            "possession_frames_pct": round(100 * len(held) / max(n, 1), 1),
            "possession_by_team_pct": {f"team{t}": round(100 * c / max(len(held), 1), 1)
                                       for t, c in sorted(team_of_holder.items())},
            "holder_changes": holder_changes,
            "passes_by_team": dict(Counter(f"team{t}" for t in passes if t)),
            "interceptions_by_team": dict(Counter(f"team{t}" for t in interceptions if t)),
        },
    }
    with open(os.path.join(args.out, "summary.json"), "w") as f:
        json.dump(summary, f, indent=2)
    for i, f in snap_frames.items():
        img = annotate(f, all_players[i], all_teams[i], balls[i].get(1), possession[i])
        cv2.imwrite(os.path.join(args.out, f"frame_{i:06d}.jpg"), img)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
