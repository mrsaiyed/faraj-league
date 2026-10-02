# Services that turn game video into player stats

**Question.** Is there something that takes our YouTube game footage, tracks the players, and returns each player's totals, ideally feeding our database?

**Answer.** Yes, and it is mature enough to test.

- **AI-scored:** four services take a full-game video and return a per-player box score with no one tagging plays. SportsVisio is the most complete of them.
- **Human-scored:** two analyst services do the same, more accurately and at a higher price.
- **YouTube links:** none of the AI services takes a YouTube link; you upload the video file itself. Only Hoopsalytics (human-scored) takes a YouTube URL.
- **Getting data out:** none publishes an API for pulling stats into a database. Results come out as a spreadsheet or an embeddable page.

So "upload to YouTube and stats appear in our database" is semi-automatic off the shelf: upload the same file to the service, then import its export.

How this was researched: vendor websites were blocked from this environment, so the details come from search results quoting their own pages and help centres. Accuracy figures are the vendors' own claims. No independent benchmark was found for any of them, which is why the [test](#the-test) matters.

This replaces building on HanaFEKI/AI_BasketBall_Analysis_v1. That repo has no shot detection and no way to tell players apart (see `README.md`).

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
