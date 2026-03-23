# Faraj League — Deploy to Production Plan

This document outlines the deployment strategy for Faraj League: first get the site live on your **dev repo's GitHub Pages**, then sync to the **forked PRD repo** (farajleague.org).

---

## Strategy Overview

| Phase | Target | Purpose |
|-------|--------|---------|
| **Phase A** | Your GitHub (dev repo) | Validate full stack on Pages before touching PRD |
| **Phase B** | Forked repo (farajleague.org) | Production rollout |

**Why this order?** Your dev repo uses the same hosting model (static Pages) and same Supabase backend. If it works there, it will work on the fork. You avoid breaking the live PRD site while validating.

---

## Phase A: Get Live on Your GitHub (First 5 Steps)

---

### Step 1 — Supabase: Migrations

**Goal:** Ensure all schema changes are applied to your Supabase project.

**Actions:**

1. Open **Supabase Dashboard** → your project
2. Go to **SQL Editor**
3. Run migrations in order if not already applied:

   | Order | File |
   |-------|------|
   | 1 | `001_initial_schema.sql` |
   | 2 | `002_phase3_schema.sql` |
   | 3 | `003_phase36_game_stat_values.sql` |
   | 4 | `004_phase37_media_slots.sql` |
   | 5 | `005_roster_sort_order.sql` |
   | 6 | `006_phase5_login_attempts.sql` |

4. **Verify:** Table Editor shows `login_attempts` (from 006). Migration 006 is required for auth-login rate limiting.

**Alternative:** If using Supabase CLI and linked project:
```bash
npx supabase db push
```

---

### Step 2 — Supabase: Edge Function Secrets

**Goal:** Configure secrets so auth-login and admin functions work.

**Actions:**

1. Supabase Dashboard → **Project Settings** (gear) → **Edge Functions**
2. Go to **Secrets** (or **Manage secrets**)
3. Add these secrets:

   | Secret Name | Value | Notes |
   |-------------|-------|-------|
   | `ADMIN_PASSWORD` | Your admin login password | Same one you use locally |
   | `SUPABASE_SERVICE_ROLE_KEY` | From Settings → API → service_role | Needed for auth-login rate limiting and admin writes |

4. **Verify:** Both secrets appear in the list. Do not commit these to git.

---

### Step 3 — Deploy Edge Functions

**Goal:** Deploy all Edge Functions to Supabase so the live site can authenticate and perform admin operations.

**Prerequisites:** Step 1 and Step 2 complete. Supabase CLI linked to your project (or `SUPABASE_URL` + `SUPABASE_ACCESS_TOKEN` configured).

**Actions:**

1. From your project root:
   ```bash
   npx supabase functions deploy auth-login admin-export-csv admin-seasons admin-teams admin-players admin-games admin-awards admin-stats admin-sponsors admin-media admin-content admin-media-slots admin-game-stats
   ```

2. **Verify:** Supabase Dashboard → Edge Functions. All 12 functions should appear and show a recent deploy time.

3. **Optional quick test:** Call auth-login from a terminal (replace URL with your Supabase project URL):
   ```bash
   curl -X POST "https://ruwihsxedobbxqavrjhl.supabase.co/functions/v1/auth-login" \
     -H "Content-Type: application/json" \
     -d '{"password":"YOUR_ADMIN_PASSWORD"}'
   ```
   Expected: `{"token":"..."}` on success, or `401` if password wrong.

---

### Step 4 — Push to GitHub and Enable Pages

**Goal:** Get the static site hosted on GitHub Pages from your dev repo.

**Actions:**

1. **Commit and push** your current work:
   ```bash
   git status
   git add .
   git commit -m "Deploy: Phase 5 complete, all phases done"
   git push origin git 
   ```

2. **Enable GitHub Pages** on your dev repo:
   - Go to your repo on GitHub → **Settings** → **Pages**
   - Under **Build and deployment**:
     - Source: **Deploy from a branch**
     - Branch: `main`
     - Folder: `/ (root)`
   - Click **Save**

3. **Wait for deploy** (usually 1–2 minutes). GitHub will show a message like: *"Your site is live at https://&lt;username&gt;.github.io/faraj-league/"*

4. **Note your live URL:**  
   - If repo name is `faraj-league`: `https://<username>.github.io/faraj-league/`  
   - Public site: `https://<username>.github.io/faraj-league/`  
   - Admin: `https://<username>.github.io/faraj-league/admin/`

---

### Step 5 — Test the Live Site

**Goal:** Confirm public site and admin work end-to-end on GitHub Pages.

**Checklist:**

| Test | What to do | Expected |
|------|------------|----------|
| Public site loads | Open `https://<username>.github.io/faraj-league/` | Home, Standings, Schedule, etc. load with data |
| Season dropdown | Change season | Data updates |
| Admin login | Open `https://<username>.github.io/faraj-league/admin/` → Login | Success with your admin password |
| Admin CRUD | Edit a team name or player, save | Success feedback; public site reflects change |
| Admin Export CSV | Admin drawer → Export CSV | ZIP downloads with CSVs inside |
| Rate limiting | Fail login 6+ times quickly | 429 "Too many login attempts"; wait ~1 min, then login works again |

**If something fails:**
- **CORS errors:** Edge Functions use `Access-Control-Allow-Origin: *`; REST API typically allows browser origins. If you see CORS errors, note the exact request URL and share for debugging.
- **404 on Pages:** Ensure Pages is set to branch `main` and folder `/ (root)`. Repo must be public unless you use a paid Pages plan.
- **Auth fails:** Verify `ADMIN_PASSWORD` secret matches what you type; confirm auth-login function deployed successfully.

---

## Phase B: Move to Forked PRD (After Phase A Works)

Once Phase A is green, proceed to production.

### Step 6 — Sync Dev to Fork

**Option A — Pull request**
1. On GitHub, create a PR: base = fork’s `main`, compare = your dev repo’s `main`
2. Review and merge

**Option B — Merge upstream (from fork)**
1. In fork repo: add your dev repo as upstream if not already
2. `git fetch upstream && git checkout main && git merge upstream/main && git push origin main`

### Step 7 — GitHub Pages on Fork

1. Fork repo → Settings → Pages
2. Source: Deploy from branch `main`, folder `/ (root)`
3. Save; wait for build

### Step 8 — Custom Domain (if applicable)

1. Fork → Settings → Pages → Custom domain
2. Enter `farajleague.org`
3. Configure DNS per GitHub’s instructions (CNAME or A records)
4. Enable **Enforce HTTPS**

---

## Quick Reference

**Edge Functions deploy command:**
```bash
npx supabase functions deploy auth-login admin-export-csv admin-seasons admin-teams admin-players admin-games admin-awards admin-stats admin-sponsors admin-media admin-content admin-media-slots admin-game-stats
```

**Config note:** `js/config.js` has Supabase URL and anon key baked in. Dev and prod share the same Supabase project, so no config change is needed when moving from your GitHub to the fork.

---

## Checklist Summary

**Phase A (your GitHub):**
- [ ] Step 1: Migrations 001–006 applied
- [ ] Step 2: `ADMIN_PASSWORD` and `SUPABASE_SERVICE_ROLE_KEY` set in Supabase secrets
- [ ] Step 3: All 12 Edge Functions deployed
- [ ] Step 4: Code pushed; GitHub Pages enabled on dev repo
- [ ] Step 5: Public site and admin tested on live URL

**Phase B (fork / PRD):**
- [ ] Step 6: Sync dev → fork
- [ ] Step 7: GitHub Pages enabled on fork
- [ ] Step 8: Custom domain configured (if used)
