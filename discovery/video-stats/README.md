# Discovery: game stats from YouTube footage

**Question.** Can [HanaFEKI/AI_BasketBall_Analysis_v1](https://github.com/HanaFEKI/AI_BasketBall_Analysis_v1) turn the full-game footage on [youtube.com/@FarajLeague](https://www.youtube.com/@FarajLeague) into game stats, tested on Ansar vs Noor ([PKYepWAL0u8](https://www.youtube.com/watch?v=PKYepWAL0u8))? The long-term goal is to process each upload automatically and store the results in the database, choosing what to display later.

**Answer.** Not as it stands, and not with small changes. The repo is a short-clip demo built for NBA broadcast footage. It does not produce a box score: it has no shots, makes, points, rebounds, assists, fouls or minutes, and no way of telling which player is which. As committed it also does not run. The parts worth keeping (detect, track, split players into two teams) are standard library calls of a few dozen lines, so a real system would start elsewhere. The options are ranked at the end. The cheapest accurate first step uses data the league already records.

This is discovery only. Nothing here touches the site.

**Follow-up:** this repo is set aside. [`vendors.md`](vendors.md) compares the services that already do this (SportsVisio, Superstat, HoopIQ, Preciser, Hoopsalytics and others) and sets out a side-by-side test on Ansar vs Noor.

---

## What was and wasn't tested

This sandbox's network policy blocks `www.youtube.com` and `*.googlevideo.com`, so **the Ansar vs Noor video could not be downloaded**. The same policy blocks:

- `drive.google.com` (the repo's trained weights),
- `huggingface.co` (its team-colour model),
- `universe.roboflow.com` (its training data),
- `ruwihsxedobbxqavrjhl.supabase.co` (the league's box score for the game, to compare against).

Allowing those hosts in the environment's network settings, or supplying the MP4, makes the real test one command (see [Running the Ansar vs Noor test](#running-the-ansar-vs-noor-test)).

What was done instead:

- every source file was read;
- the pipeline was patched until it ran, and its own tracking, possession and pass code was run on the repo's sample clips with the same detector architecture (`yolov5l6u`, COCO-pretrained in place of the blocked fine-tuned weights);
- speed and memory were measured;
- its training notebooks were checked for the models' real accuracy.

## What the repo does

| Stage | How | Output |
|---|---|---|
| Detect players and ball | YOLO (`yolov5l6u`) fine-tuned on a 7-class NBA broadcast dataset | boxes per frame |
| Track | ByteTrack (`supervision`) | a track ID per box: not a player identity |
| Teams | Fashion-CLIP asked "white shirt" or "dark blue shirt" (hard-coded) | team 1 / 2 per track |
| Possession | ball centre within 50 px of a player box | holder per frame |
| Passes / "interceptions" | holder changes within a team / between teams | counts |
| Court map, speed, distance | YOLOv8-pose court keypoints → homography onto a 28×15 m FIBA court | top-down positions, km/h |

The README's own future work lists jersey-number OCR and detecting shots, fouls and rebounds. That is the box score.

## What a box score needs, against what exists

| Stat | Needs | In the repo |
|---|---|---|
| Points, FGM/FGA | shot detection, make/miss at the rim, shooter attribution | none |
| 2PT vs 3PT | shot location on the court | homography exists but crashes (below), and is calibrated for NBA courts |
| Free throws | FT situation detection | none |
| Rebounds | possession after a missed shot | none (needs shot detection first) |
| Assists | pass followed by a made shot | passes only, unreliable (below) |
| Steals / turnovers | change of possession by cause | "interceptions" counts every change of possession: rebounds, inbounds and steals alike |
| Fouls | the whistle | none; this is the hardest to see on video. The live tracker already records fouls |
| Minutes | each player's identity across the whole game | none; track IDs last about a second (below) |
| *Which player* | jersey-number recognition | none |

## Problems found (all verified by running the code)

1. **`main.py` does not run.** 6 of its 10 imports fail. They name the folders and classes of the tutorial it is based on (`court_keypoint_detector`, `ball_aquisition`, `pass_and_interception_detector`, `tactical_view_converter`, `speed_and_distance_calculator`, plus three drawers that don't exist). The renamed modules also import helpers that are never defined (`get_center_of_bbox`, `get_foot_position`) and a typo (`draw_traingle`). `repo-fixes.diff` here is the minimum that makes the modules import.
2. **`requirements.txt` does not install.** Its line `python_version >=3.8` is read as a package name. It also omits `supervision`, `transformers` and `pandas`.
3. **It would track zero players with its own trained weights.** The dataset's class is `Player`, and `PlayerTracker` looks up `"player"`.
4. **Court map, speed and distance crash.** The keypoint detector checks `hasattr(kps, 'confidence')`, but Ultralytics calls it `conf`, so the confidence filter never runs and it returns bare arrays. `validate_keypoints()` then calls `.xy` on them: `AttributeError: 'numpy.ndarray' object has no attribute 'xy'`.
5. **It loads the whole video into memory.** That's 2.76 MB per 720p frame (measured). A 55-minute video at 30 fps is 99,000 frames: about **274 GB at 720p and 616 GB at 1080p**. The probe here streams instead.
6. **Stats are reported with confidence on invented data.** Ball gaps are interpolated with no limit. On the sample clip the ball was detected in **9% of frames, existed in 100% after interpolation, and possession was assigned in 98%**. Nothing marks the difference.
7. **Teams drift.** The team model re-classifies every track every 50 frames, so players can switch teams mid-play, which counts as passes and "interceptions". With the stand-in detector, referees and a courtside fan were assigned to teams. The prompts must be rewritten for each pair of jerseys.
8. **Tuned in pixels for 720p NBA broadcasts.** A 25 px per frame ball-jump limit and a 50 px possession radius depend on resolution and camera distance. Speed is multiplied by an unexplained `0.4` and assumes 30 fps.
9. **Track IDs are not players.** The sample clip produced 43 track IDs in 8 seconds, with a median track life of 0.6 s (the stand-in detector also picks up the crowd, which inflates this). ByteTrack starts a new ID whenever a player is lost for about a second (occlusion, leaving the frame), and nothing joins IDs back to a person.
10. **The models are weakly validated, even on NBA footage.** The tutorial's training notebooks validate on **32 images**. Ball recall is **0.64** for the player model and **0.57** for the ball model, and player recall is 0.88. Every possession and pass figure rests on the ball.

**Where it comes from.** v1 shares the design and tuning constants (the `0.4`, the 50 px radius, the shirt prompts, the 50-frame reset) of [abdullahtarek/basketball_analysis](https://github.com/abdullahtarek/basketball_analysis), a YouTube tutorial project. That is why `main.py` imports its names. The speed module is 99% identical, and the homography step is rewritten. The tutorial repo is the working one, and it publishes the three trained weight files (Google Drive).

## Cost to run

Measured here on 4 vCPUs with no GPU:

| Model | Frames/s | A 55-min game at 30 fps |
|---|---|---|
| `yolov5l6u` (the repo's architecture), player + ball passes | 0.32 | **≈ 86 hours** |
| `yolo11m` (a lighter COCO model), player + ball passes | 2.0 | ≈ 14 hours |
| `yolov8x-pose` (court-keypoint architecture) | ~1.6 (CPU shared) | adds more on top |

So any of this needs a GPU worker. Supabase Edge Functions can't run it: they have no GPU and short time limits.

## What the Faraj footage changes (unknown until it can be seen)

The repo was trained on panning NBA TV cameras. Everything above gets better or worse depending on:

- fixed camera or panning;
- height and angle, and whether the whole court is in frame;
- resolution, fps, and whether the recording is continuous (cuts break time sync);
- Ansar's and Noor's jersey colours;
- whether jersey numbers are readable;
- whether people stand along the sidelines.

A fixed, high, full-court camera with readable numbers is the best case for every option below.

## Options, ranked

### 1. Use what the league already records (recommended first)

The admin live tracker already logs **who scored and who fouled, with a wall-clock time** on every event (`at: Date.now()`, plus period, game clock and elapsed time, in `admin/js/live-tracker.js`). That log stays in the scorekeeper's browser (`localStorage`). Only totals reach the database.

Persisting the log and recording one sync point per video (when the tip-off is in the video) gives a timestamped play-by-play for every basket, with no computer vision at all:

- YouTube chapters for every basket, links into the video from each box score, and per-player highlight lists;
- a firm anchor for vision to *add* to rather than replace: shot location at a known make (shot chart), then misses and rebounds.

This turns the hardest problem (who scored) into one that's already solved.

### 2. Trial a vendor on Ansar vs Noor

Run the game through a service and compare its box score with the tracker's:

- [Hoopsalytics](https://hoopsalytics.com/tour/upload-game-video.php) accepts a **YouTube URL** directly. Results arrive in about 12 hours. [Their blog](https://blog.hoopsalytics.com/affordable-stats-and-analytics-for-aau-club-teams/) puts a game at 30 credits at $1 each.
- [SportsVisio](https://www.sportsvisio.com/stories/basketball-ai) takes an upload and returns a box score, shot charts and highlights within 24 hours. Stats [export to a spreadsheet](https://intercom.help/sportsvisio/en/articles/11052575-walkthrough-how-to-use-sportsvisio-analytics). It claims 95%+ event detection and 92%+ player attribution when numbers are visible and recording is continuous; those are vendor figures, not verified here.
- Also: [Superstat](https://www.superstatsport.com/), [TheStats.ai](https://thestats.ai/).

An export can be imported into the database the same way rosters are.

### 3. Build it, but not on this repo

If a vendor doesn't fit, start from Roboflow's open [basketball player-identification pipeline](https://blog.roboflow.com/identify-basketball-players/). It covers:

- RF-DETR detection of players, numbers, ball and rim;
- SAM2 tracking;
- SigLIP + UMAP + k-means team split (no hard-coded colours);
- SmolVLM2 jersey-number OCR.

That solves player identity, which this repo leaves open. Add shot and make detection on top (e.g. [AI-Basketball-Shot-Detection-Tracker](https://github.com/avishah3/AI-Basketball-Shot-Detection-Tracker)). Roboflow report **1–2 frames/s on a T4 GPU**, about 14–28 GPU-hours for a 55-minute game. Expect to label Faraj frames to fine-tune it. This is weeks of work with uncertain accuracy.

### 4. Cheap experiment: a video model

Gemini's API [accepts public YouTube URLs](https://ai.google.dev/gemini-api/docs/video-understanding) directly. Asking it for every made basket with a timestamp and jersey colour would take an afternoon to try. Counting accuracy over a full game is unproven, so it is worth checking against the tracker, not trusting.

## The automated pipeline (long-term goal)

```
new upload ──WebSub push──▶ Supabase Edge Function ──▶ game_videos row (queued)
                                                          │
                       vendor (takes the URL)  or  GPU worker (needs the file)
                                                          │
                                                          ▼
                                     video_events rows ──▶ site shows what you choose
```

- **Knowing a video was uploaded.** YouTube [push notifications](https://developers.google.com/youtube/v3/guides/push_notifications) (WebSub) call a webhook on each upload. They're free and outside the API quota.
- **Getting the file.** The YouTube Data API has **no download endpoint**, even for the channel owner. `yt-dlp` works but is a grey area under YouTube's terms and is often challenged from cloud IP addresses. The robust route is to keep the original recording: whoever uploads also puts the same file in storage. The other route is a vendor that fetches the URL itself.
- **Storing it** (a sketch, not a migration):
  - `game_videos (game_id, youtube_id, tipoff_video_seconds, status, source, processed_at)`
  - `video_events (game_id, video_seconds, period, game_clock, type, team_id, player_id NULL, court_x, court_y, confidence, source ['tracker'|'vendor'|'cv'], model_version)`

  Tracker events, vendor events and vision events would then share one shape. `confidence` and `source` let the site show only what is trusted.

## Running the Ansar vs Noor test

The files in this folder:

- `video_probe.py` runs the repo's own detection, tracking, possession and pass code over any window of a video, streaming frames. It writes `summary.json` (speed, track-ID health, ball detection before and after interpolation, possession, passes, interceptions) and annotated frames to look at.
- `repo-fixes.diff` is the minimal patch that lets the repo's modules import.

Setup:

```bash
cd discovery/video-stats
git clone --depth 1 https://github.com/HanaFEKI/AI_BasketBall_Analysis_v1
git -C AI_BasketBall_Analysis_v1 apply ../repo-fixes.diff
python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt

# First 5 minutes, straight from YouTube (needs www.youtube.com and *.googlevideo.com):
python video_probe.py "https://www.youtube.com/watch?v=PKYepWAL0u8" --start 0 --duration 300 --ball-conf 0.15

# Or a downloaded file:
python video_probe.py ansar-noor.mp4 --start 0 --duration 300 --ball-conf 0.15

# With the tutorial's fine-tuned weights (Google Drive links in its README):
python video_probe.py ansar-noor.mp4 --player-model models/player_detector.pt --ball-model models/ball_detector_model.pt
```

Compare `out/summary.json` and the frames with the game's box score in the admin.

Sources: [YouTube push notifications](https://developers.google.com/youtube/v3/guides/push_notifications) · [Gemini video understanding](https://ai.google.dev/gemini-api/docs/video-understanding) · [Roboflow: identify basketball players](https://blog.roboflow.com/identify-basketball-players/) · [Hoopsalytics upload options](https://hoopsalytics.com/tour/upload-game-video.php) · [Hoopsalytics pricing](https://blog.hoopsalytics.com/affordable-stats-and-analytics-for-aau-club-teams/) · [SportsVisio](https://www.sportsvisio.com/stories/basketball-ai) · [abdullahtarek/basketball_analysis](https://github.com/abdullahtarek/basketball_analysis)
