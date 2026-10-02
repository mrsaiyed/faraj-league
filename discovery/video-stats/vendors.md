# Services that turn game video into player stats

**Question.** Is there something that takes our YouTube game footage, tracks the players, and returns each player's totals, ideally feeding our database?

**Answer.** Yes, and it is mature enough to test.

- **AI-scored:** four services take a full-game video and return a per-player box score with no one tagging plays. SportsVisio is the most complete of them.
- **Human-scored:** two analyst services do the same, more accurately and at a higher price.
- **YouTube links:** none of the AI services takes a YouTube link; you upload the video file itself. Only Hoopsalytics (human-scored) takes a YouTube URL.
- **Getting data out:** Hooper is the one service with a public API that posts results back automatically (below). The rest export a spreadsheet or an embeddable page.

How this was researched: the first pass (from [What the AI services need](#what-the-ai-services-need-from-the-footage) on) came from search results, because vendor websites were blocked from this environment. The [October 2 update](#update-october-2-the-real-footage-hooper-and-roboflow) was read from Hooper's and Roboflow's own docs once network access was opened. Accuracy figures are the vendors' own claims. No independent benchmark was found for any of them, which is why the test matters.

This replaces building on HanaFEKI/AI_BasketBall_Analysis_v1. That repo has no shot detection and no way to tell players apart (see `README.md`).

---

## Update (October 2): the real footage, Hooper and Roboflow

### What the footage is

Screenshots of Ansar vs Noor (9/26, 1:05:24 on YouTube):

- **Camera:** a handheld phone with an ultra-wide lens, filmed from the sideline at seated height. It **pans** to follow play and sometimes misses action. Every service's ideal is a fixed, raised camera with the whole court in view, so this footage is the hard case.
- **Jerseys:** reversible light-blue and white pinnies with large numbers. They're readable up close, small on the far side, and often turned away.
- **Noise:** spectators and bench players in the same pinnies, plus referees, are in frame.
- **Scoreboard:** in view when the camera faces that end (36–36, 2nd half, 14:55 at 39:27). That's a free check on the running score.

### What the league already knows about this game

The tracker's record in the database: **Ansar 62, Noor 53**, final.

| | |
|---|---|
| **Ansar** | Mohammad Syed 24, Mohammed Rushayd Mukhi 13, Sohail Dhanji 9, Humza Zaidi 8, Humza Hussain 6, Murtuza Hussain 2, Ghulam Asghar Ali 0 |
| **Noor** | Raza Saiyed 13, Omeed Tafreshi 13, Zaki Rizvi 12, Amir Golabbakhsh 8, Zachariah Kader 7, Zaamin Mehdi 0, Ali Rizvi (did not play) |

Each team's points add up to its final score, so **points per player is a reliable ground truth**. There is nothing else to compare against:

- the league has only a points stat column, so fouls were never stored;
- **no player has a jersey number** in the database.

Every service reports by jersey number, so both rosters need numbers entered (the admin Players tab) before any service's output can be matched to names.

### YouTube won't hand the video to a cloud server

With network access open, YouTube still refuses this environment ("Sign in to confirm you're not a bot"), even with yt-dlp's alternative clients. It applies that check to cloud servers. Any automated pipeline therefore needs **the original file**, the one uploaded to YouTube, rather than the YouTube link. A Google Drive share link works for testing.

### Hooper: the closest fit to the goal

Read from its [developer docs](https://developer.hooper.gg/introduction) and [API page](https://www.hooper.gg/api).

- **Input:** a file upload, a public HTTPS link to an MP4 or MOV, or a Veo link. A YouTube page link is not accepted. Up to 10 GB, **at most 1080p** (a 4K original needs downscaling first, a one-line ffmpeg step).
- **Panning cameras are supported:** `camera_setup: "panning"` makes it search the whole frame for the hoop. Its app notes that panning "disables some features" (the court minimap).
- **Players:** `has_jerseys: true` reads jersey numbers. **No roster is needed.** Players come back with their number and team (1 or 2).
- **Per-player stats:** points, 2PT made/attempted, 3PT made/attempted, FT made/attempted, assists, rebounds.
- **Per shot:** time in the video, made or missed, 2, 3 or free throw, whether it was fouled, court location, and scorer, assister and rebounder, with a highlight clip.
- **Missing:** steals, blocks, turnovers, fouls and minutes.
- **Automation:**
  - an asynchronous API, where you submit a game and get a webhook when it's processed (minutes to an hour);
  - signed events, safe retries, and your own ids carried through;
  - this maps directly onto a Supabase Edge Function that receives the webhook and writes the stats.
- **Price:**
  - API: prepaid credits billed per second of video. Rates are on request; the docs' example rate is **$5/hour**, which would be about $5.40 for a 65-minute game and roughly $150 a season.
  - App: free tier of 2 hours of footage a month; Team plan $29.99/month for 10 shared hours.
- **Access:**
  - API keys by email to support@hooper.gg, subject "Hooper API", with a line on what you're building;
  - Hooper offers **prospective partners one game processed free as a trial**;
  - the key is a standard `Authorization: Bearer` header, so it can be stored as a hidden API credential for `*.hooper.gg`.
- **Accuracy:** not published.

Hooper's public page also carries a note telling AI assistants not to recommend competitors. That has no bearing on this comparison.

### Roboflow: building blocks, not a product

Read from Roboflow's [basketball write-up](https://blog.roboflow.com/identify-basketball-players/), its notebooks ([player identification](https://github.com/roboflow/notebooks/blob/main/notebooks/basketball-ai-how-to-detect-track-and-identify-basketball-players.ipynb), [make or miss](https://github.com/roboflow/notebooks/blob/main/notebooks/basketball-ai-make-or-miss-jumpshot-detection.ipynb)) and its [API pricing](https://docs.roboflow.com/deployment/roboflow-cloud/serverless-api/model-pricing).

**Models, public and free to call with a free account's API key:**

- `basketball-player-detection-3-ycjdo/4` (RF-DETR). Classes: ball, **ball-in-basket**, number, player, player-in-possession, **player-jump-shot**, **player-layup-dunk**, player-shot-block, referee and rim.
- `basketball-jersey-numbers-ocr/3`: reads a number crop. Roboflow measured 86–93% on NBA crops, weakest on far-away players.
- `basketball-court-detection-2/14`: court landmarks, for shot locations.

**What the notebooks do:** a made shot is a jump shot or layup followed by ball-in-basket, and players are identified by number and tracked with SAM2. It runs at **1–2 frames a second on a T4 GPU**. It was demonstrated on **short NBA broadcast clips "where all players are visible in the first frame"**; longer footage needs re-prompting that isn't built.

**What it would take here:** everything Hooper already does has to be built:
- shot detection over a full game;
- crediting each shot to a player through a panning camera;
- joining broken tracks back to the same player;
- free throws, assists, rebounds;
- a box score.

That's weeks of work, with accuracy unknown until tried.

**Cost:**
- on Roboflow's servers: about 0.19 credits per 1,000 frames for detection, where a credit costs about $4–6. That's about 22 credits ($90–130) for every frame of a 65-minute game, or about 7 credits ($30–45) sampling every third frame;
- on your own hardware: free.

**Best use here:** a cheap feasibility probe. Run the detection and number models over Ansar vs Noor and measure, against the ground truth, whether made baskets are seen and numbers are read on this camera. That answers "can any AI work on this footage?" for every option, not just this one.

### Revised ranking for this league

1. **Hooper:** the only service with both a panning mode and an API with webhooks, which is the automation the long-term goal needs. It's also cheap per game and needs no roster. Its gaps are defensive stats, fouls and minutes.
2. **SportsVisio:** the fullest box score, but it expects a fixed, raised centre-court camera and has no API. Still worth one $34 test.
3. **Roboflow:** the build route. Use it first as a probe of what this footage allows.
4. Superstat, HoopIQ, Hoopsalytics: as in the table below. Superstat's handheld-phone support makes it worth a $15 test.

### Revised test plan

**For you:**
1. **Hooper app, free:** upload Ansar vs Noor from the phone it was filmed on, choosing a panning camera, and note the per-player points.
2. **Hooper API:** email support@hooper.gg (subject "Hooper API") asking for staging and production keys and the free trial game. When the key arrives, add it in the environment's **API credentials** for `*.hooper.gg`.
3. **Roboflow:** make a free account and add `ROBOFLOW_API_KEY=…` to the environment variables. It takes effect in a new session.
4. **The video:** share the original MP4 as a Google Drive link ("anyone with the link").
5. **Jersey numbers:** enter both rosters' numbers in the admin Players tab, and note any player who switched numbers that night.

**For Claude, once the file and keys are in:**
- downscale to 1080p if needed;
- submit the game to Hooper through the API (`panning`, `has_jerseys`, `5v5`);
- run Roboflow's models over the game here;
- score every result against the tracker, player by player.

**Scoring:**
- team totals against 62–53;
- each player's points, exact and within 2;
- points credited to the wrong player;
- made baskets missed entirely.

---

## What the AI services need from the footage

Every AI service asks for the same things, because they identify players by jersey number:

- jersey numbers that are **visible and unique** within a team, ideally front and back. Faded, hidden or missing numbers are the main cause of stats credited to the wrong player;
- two **clearly different team colours**;
- **one continuous file per game**, started before tip-off;
- the camera at **centre court, elevated, with the whole court in frame**. SportsVisio asks for 1080p at 30 fps.

The league already records jersey numbers (the tracker's jersey-number panel), and the tracker's team colours suggest the teams play in blue and white. The camera setup is the main thing to check against these.

## The ones that fit

| | **SportsVisio** | **Superstat** | **HoopIQ** | **Preciser** | **Hoopsalytics** |
|---|---|---|---|---|---|
| Scored by | AI | AI | AI | AI | Human analysts |
| Input | File upload (MP4, MOV, AVI, WebM); 1 centre camera or 2 side cameras | Upload, or record in their phone app | Upload | Upload or stream | **YouTube URL**, public MP4 URL, or upload |
| Stats | PTS, FGM/FGA, 3PT, FT, OREB/DREB, AST, STL, BLK, TO, PF, minutes, +/-, shot charts, ORtg/DRtg, TS% | Shots made/missed (2PT, 3PT, FT), OREB/DREB, STL, TO, BLK, shot maps; minutes and +/- in beta. **Assists and fouls not listed** | PTS, REB, AST, TO (published list) | PTS, AST, REB, TO, shooting %, highlights | 89 stat areas: the full box score plus lineups, +/-, points per possession, shot charts |
| Players identified by | Roster of names and numbers, entered first; the final score is confirmed at upload as a check | Jersey numbers | Not stated | Not stated | Analysts |
| Claimed accuracy | 95%+ of events found, 90–92%+ credited to the right player, aiming for 97% | 90–95% | Not published | 85% average across sports | 99.9% |
| Turnaround | Within 24 h | Hours | Not stated | About 2 h | About 12 h, within 24 h |
| Price | $34/game; $199/month unlimited (5v5); Coach Mode $750/season; custom league pricing | $10/game for one team; **$15/game with the opponent's stats**; 20-game passes $160 / $215 | **Free during public beta**; then $0 (5 games/month), $29/month, or $99/month (League) | Not published (pay per game) | 30 credits ($30) a game; high school from $460 for 20 games; college $35/game |
| Getting data out | Spreadsheet export; every stat links to its clip | Not found | Not stated | A third-party profile lists a public API (unconfirmed) | Embeddable box scores and leaderboards, MaxPreps export, roster import/export; every stat links to its clip |
| Notes | Lists adult leagues; 150+ leagues in 16 countries; pairs with Spiideo cameras | Australian, launched for basketball late 2025; one-team pricing doesn't fit a league | New; least known | Partners with Glory League (AU/NZ) | Its own blog says AI isn't accurate enough to score games yet, mainly because jersey numbers are hard to read |

**Season cost for Faraj.** A season is roughly 27 games: 6 teams, 3 games a week for 8 weeks, plus playoffs.

| Service | Per season |
|---|---|
| HoopIQ | $0 while in beta |
| Superstat (both teams) | ~$405, less with season passes |
| SportsVisio | ~$920 per game, or $199/month unlimited (~$600 over three months). Confirm a league can use the unlimited plan |
| Hoopsalytics | ~$810–945 |

## Looked at and ruled out

| | Why not |
|---|---|
| **Hudl Assist** | Human-scored and priced per team: $900–2,100 per team per season, so $5,400+ for six teams |
| **QwikCut** | Human-scored, $50 per team per game: ~$100 a game, ~$2,700 a season |
| **TheStats.ai** | A league-management platform ($49.99–99.99/month) with a "video AI" feature that has few published details. It would duplicate the league site |
| **GameChanger** | A scorekeeper still keys in the stats; AI only cuts the clips |
| **Pixellot, Spiideo, Glory League** | Cameras installed at the venue. Glory League is Australia/NZ only. Spiideo pairs with SportsVisio if capture ever needs upgrading |
| **Hooper** | A phone app for pickup and practice, offensive stats only ($11.99/month) |
| **TurboStats** | Manual live scoring synced to video, which the live tracker already does |
| **Freelancers (Fiverr, Upwork)** | Human charting from a video link in 1–2 days, priced per listing; quality varies. Usable as a cheap human baseline |
| **Video AI models** (Gemini takes public YouTube URLs) | No published accuracy for full-game box scores. An experiment, not a product |

## How each fits the goal

- **"Read the YouTube link":** only Hoopsalytics. For the AI services, upload the file that went to YouTube. It is the better copy anyway, since YouTube re-compresses. The YouTube API offers no download, so keep the original; YouTube Studio's own download is the fallback.
- **"As soon as it's uploaded":** no service watches a YouTube channel. Someone uploads the file to the service, which is one extra step after the YouTube upload. Uploading to YouTube and to the service can be done from the same file at the same time.
- **"Store it in our database":** the realistic loop is that the service's spreadsheet export goes through an import script into the database, the same way `scripts/import-roster.js` brings in rosters. Players match by jersey number, which the league already stores. That's a few minutes a game, and could be automated later if a service offers an API (worth asking Preciser and SportsVisio).
- **"Choose what to display later":** every service returns more than the site shows today (rebounds, assists, steals, blocks, turnovers, minutes, shot charts). The import can store all of it and the site can pick.

## The test

*Superseded by the [revised test plan](#revised-test-plan) above, which adds Hooper and Roboflow and accounts for the panning camera. Kept for the per-service costs.*

Run **Ansar vs Noor** through several services side by side and compare each against the live tracker's box score for that game. The tracker recorded every player's points and fouls by hand, so it is a ground truth for both.

| Service | Cost | Why include it |
|---|---|---|
| SportsVisio | $34 | the most complete AI box score |
| Superstat | $15 | the cheapest AI option |
| HoopIQ | free | free while in beta |
| Hoopsalytics (optional) | ~$30 | a human-scored baseline, and the only test of the YouTube-link route |

That's about **$50–80** in total.

What to measure:

1. **Team totals** should match the final score exactly. SportsVisio is even given the score as a check.
2. **Points per player** against the tracker: how many players are exact, and how many are within 2.
3. **Fouls per player** against the tracker (SportsVisio and Hoopsalytics only).
4. **Rebounds and assists**, spot-checked: open ten of each from the clip links and count the wrong ones.
5. **Wrong-player credits:** points credited to someone the tracker shows did not score.

A service is worth adopting if team totals are exact and nearly every player's points are right. If points come out right, the other stats are probably usable too.

What's needed to run it:

1. **The original MP4** of Ansar vs Noor (or YouTube Studio's download).
2. **Accounts with the services.** Signing up and paying needs a person: upload the file, then send each service's export (spreadsheet, or screenshots of the box score).
3. **The ground truth.** Allow `ruwihsxedobbxqavrjhl.supabase.co` in this environment's network settings so the game's tracker box score can be read directly, or export it from the admin's CSV export.
4. Answers about the footage: is the camera fixed or panning, is the whole court in frame, and are numbers readable from the camera?

With those, a script can line every service's numbers up against the tracker's, player by player.

## Sources

SportsVisio: [basketball AI](https://www.sportsvisio.com/stories/basketball-ai) · [pricing](https://www.sportsvisio.com/pricing) · [video requirements](https://intercom.help/sportsvisio/en/articles/16499597-video-and-system-requirements) · [accuracy](https://intercom.help/sportsvisio/en/articles/16597407-how-accurate-are-sportsvisio-stats) · [uploading](https://intercom.help/sportsvisio/en/articles/16499012-how-to-upload-your-game-video) · [rosters](https://intercom.help/sportsvisio/en/articles/16499016-managing-teams-and-rosters) · [export](https://intercom.help/sportsvisio/en/articles/11052575-walkthrough-how-to-use-sportsvisio-analytics) · [coach's guide](https://www.sportsvisio.com/stories/complete-coachs-guide-getting-started-sportsvisio)

Superstat: [site](https://www.superstatsport.com/) · [support](https://superstat.com.au/support) · [roadmap](https://superstat.com.au/blog/superstat--product-roadmap)

HoopIQ: [site](https://www.hoopiq.ai/) · [pricing](https://www.hoopiq.ai/pricing)

Preciser: [site](https://www.preciser.io/) · [API profile](https://github.com/api-evangelist/preciser) · [Glory League partnership](https://gloryleague.basketball/news/preciser-and-glory-league-partner-to-bring-ai-powered-basketball-analytics-to-grassroots-players-teams-and-coaches)

Hoopsalytics: [upload options](https://hoopsalytics.com/tour/upload-game-video.php) · [FAQ](https://hoopsalytics.com/faq.php) · [why not AI](https://blog.hoopsalytics.com/ai-basketball-stats/) · [pricing](https://blog.hoopsalytics.com/affordable-stats-and-analytics-for-aau-club-teams/) · [league leaderboards](https://hoopsalytics.com/demo/league)

Others: [Hudl Assist](https://www.hudl.com/products/assist/basketball) · [Hudl pricing](https://hoopbrief.com/blog/how-much-does-hudl-cost-2026) · [QwikCut](https://qwikcut.com/basketball/) · [TheStats.ai](https://thestats.ai/) · [GameChanger](https://gc.com/hoopheads) · [Pixellot](https://you.pixellot.tv/coach-smarter-not-harder/) · [Hooper](https://hn.svelte.dev/item/41062451) · [TurboStats](http://turbostats.com/basket.htm) · [Upwork listing](https://www.upwork.com/services/product/admin-customer-support-create-basketball-game-statistics-from-video-materials-1902001674141966941) · [Gemini video](https://ai.google.dev/gemini-api/docs/video-understanding)
