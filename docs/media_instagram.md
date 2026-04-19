# Media & Instagram Integration

Execute these steps in order. **Agent** = tasks the Cursor agent does. **You** = manual steps you perform.

**Prerequisite:** Phase 3.7 complete. Admin mirrors public site. Media page renders from `media_layout` JSON in `content_blocks`. Akhlaq award renders on home page and awards page.

---

## Overview

Three distinct features, implemented in order:

1. **Week-scoped media layout** — Sections and blocks can be global (all weeks) or pinned to a specific week. Admin chooses when adding.
2. **Instagram embeds on media blocks** — Each block renders an embedded Instagram post (blockquote + embed.js) instead of a Watch link/button. Admin edits the post URL per block.
3. **Akhlaq post embed** — The akhlaq award card (home page + awards page) shows an embedded Instagram post below the winner name. Admin links the post per week alongside the winner entry.

---

## Feature 1 — Week-scoped media layout

### Background

`media_layout` is a single JSON blob in `content_blocks`. It has no week concept — all sections/blocks are shown every week. `renderMedia(week)` receives a week parameter but currently ignores it.

### Data shape change (no DB migration)

Add an optional `week` field to each section and block in the `media_layout` JSON:

```json
{
  "sections": [
    {
      "id": "sec_abc",
      "title": "Highlights",
      "week": null,
      "blocks": [
        { "id": "blk_1", "title": "Top Plays", "url": "https://...", "width": "full", "week": null }
      ]
    },
    {
      "id": "sec_xyz",
      "title": "Week 2 Recap",
      "week": 2,
      "blocks": [
        { "id": "blk_2", "title": "Week 2 Full Game", "url": "https://...", "week": 2 }
      ]
    }
  ]
}
```

- `week: null` (or missing) = show on all weeks
- `week: N` = show only when the displayed week equals N
- Sections inherit nothing from blocks — section `week` and block `week` are evaluated independently. A section may be global while a block inside it is week-specific (the block is simply hidden on other weeks).

### Step 1 — Agent: Update renderMedia to filter by week

**Who:** Agent

**What:**

1. In `js/render.js` `renderMedia(week)`, compute the display week as `week ?? config.CURRENT_WEEK`.
2. When iterating sections, skip any section where `section.week != null && section.week !== displayWeek`.
3. When iterating blocks within a section, skip any block where `block.week != null && block.week !== displayWeek`.
4. If filtering leaves a section with zero visible blocks, skip the entire section.

**How:** In Agent mode:

> Implement media_instagram.md Step 1: In renderMedia(week), filter sections and blocks by their week field. Skip items where week is non-null and doesn't match the current display week. Skip sections that become empty after block filtering.

---

### Step 2 — Agent: Admin "Add Section" modal — week scope choice

**Who:** Agent

**What:**

1. In `admin/js/sections.js`, find `openAddSectionModal`.
2. Add a radio group or select to the modal: **All Weeks** (default) / **This week only (Week N)**.
3. "This week only" uses the currently selected admin week (`config.CURRENT_WEEK` or the admin's week dropdown value).
4. When the admin saves, set `section.week = null` for "All Weeks" or `section.week = selectedWeek` for "This week only".
5. Save the mutated `media_layout` to `admin-content` as today.

**How:** In Agent mode:

> Implement media_instagram.md Step 2: In openAddSectionModal in admin/js/sections.js, add a radio/select for "All Weeks" vs "This week only (Week N)". Set section.week accordingly before saving media_layout.

---

### Step 3 — Agent: Admin "Add Media" modal — week scope choice

**Who:** Agent

**What:**

1. In `admin/js/sections.js`, find `openAddMediaModal`.
2. Add the same radio group: **All Weeks** (default) / **This week only (Week N)**.
3. Set `block.week = null` or `block.week = selectedWeek` before saving.
4. Display the current week label in the radio option (e.g. "This week only (Week 2)") so the admin knows which week they are scoping to.

**How:** In Agent mode:

> Implement media_instagram.md Step 3: In openAddMediaModal in admin/js/sections.js, add "All Weeks" / "This week only" radio. Set block.week accordingly before saving media_layout.

---

### Step 4 — Agent: Admin media view — show week indicator on scoped items

**Who:** Agent

**What:**

1. In `attachMediaSlotOverlays` (or wherever edit overlays are added to blocks), detect if a block or section has a non-null `week` value.
2. Add a small badge or label near the block's edit overlay: e.g. `Week 2 only` in a muted style. This helps the admin distinguish global vs week-specific content at a glance.
3. No functional change to saving — just a visual indicator.

**How:** In Agent mode:

> Implement media_instagram.md Step 4: In attachMediaSlotOverlays in admin/js/sections.js, add a small "Week N only" badge near any block or section that has a non-null week field. Style it subtly (muted color, small font).

---

## Feature 2 — Instagram embed on media blocks

### Background

Each block in `media_layout` has a `url` field. Currently this renders as a "Watch" anchor or a "View on Instagram" button. The goal is to render an actual embedded Instagram post using Instagram's standard embed format.

Instagram's standard embed: a `<blockquote class="instagram-media">` tag with `data-instgrm-permalink` set to the post URL, activated by loading `https://www.instagram.com/embed.js` once and calling `instgrm.Embeds.process()` after render.

The `url` field on each block already holds the post URL — only the render and embed script loading change.

### Step 5 — Agent: Update block rendering to Instagram embed

**Who:** Agent

**What:**

1. In `js/render.js` `renderMedia`, change the per-block inner HTML.
2. If `block.url` is set, render:
   ```html
   <div class="instagram-embed-wrap">
     <blockquote
       class="instagram-media"
       data-instgrm-permalink="BLOCK_URL"
       data-instgrm-version="14"
       style="width:100%;max-width:540px;margin:0 auto;">
     </blockquote>
   </div>
   ```
3. If `block.url` is empty/null, render the existing "Coming soon" placeholder (no change).
4. After setting `innerHTML` on the media container, call `activateInstagramEmbeds()` (new helper — see next item).
5. Add a helper function `activateInstagramEmbeds()` in `js/render.js`:
   - If `window.instgrm` exists (script already loaded): call `window.instgrm.Embeds.process()`.
   - Otherwise: inject a `<script src="https://www.instagram.com/embed.js" async>` tag into `<head>` if not already present. The script auto-processes on load.

**How:** In Agent mode:

> Implement media_instagram.md Step 5: In renderMedia in js/render.js, replace the Watch link/button with an instagram-media blockquote for blocks that have a url. Add activateInstagramEmbeds() helper that calls instgrm.Embeds.process() if loaded, or injects embed.js. Call it after rendering media blocks.

---

### Step 6 — Agent: Admin block modal — clarify URL label

**Who:** Agent

**What:**

1. In `admin/js/sections.js`, find `openMediaBlockModal`.
2. Change the URL field label from "URL" (or "Link") to **"Instagram Post URL"** to make it clear what format is expected.
3. Add placeholder text: `https://www.instagram.com/p/XXXXX/`
4. No functional change — just UI clarity.

**How:** In Agent mode:

> Implement media_instagram.md Step 6: In openMediaBlockModal in admin/js/sections.js, update the URL field label to "Instagram Post URL" and add a placeholder showing the expected format.

---

### Step 7 — Agent: Admin media preview — load Instagram embeds

**Who:** Agent

**What:**

1. After the admin saves a block URL and the media section re-renders, call `activateInstagramEmbeds()` (imported or duplicated from `js/render.js`) so the embed activates in the admin view as well.
2. Ensure the admin page loads `embed.js` the same way as the public page (use the same helper).

**How:** In Agent mode:

> Implement media_instagram.md Step 7: After admin saves a media block and re-renders, call activateInstagramEmbeds() so the embed activates in admin view. Import or replicate the helper from js/render.js.

---

## Feature 3 — Akhlaq award Instagram post embed

### Background

The akhlaq award card appears in two places:
- `renderHome()` — fills `#home-awards` (truncated card, click navigates to awards tab)
- `renderAwards(week)` — fills the awards grid on the full awards page

Both use `wa = config.DB.awards.find(a => a.week === displayWeek)` and render `wa.akhlaq` as the winner name. There is currently no post URL or embed.

### Step 8 — You: DB migration — add akhlaq_post_url to awards

**Who:** You

**What:**

Run the following SQL in the Supabase Dashboard → SQL Editor:

```sql
ALTER TABLE awards ADD COLUMN IF NOT EXISTS akhlaq_post_url TEXT;
```

No RLS change needed — public SELECT already covers the full row.

**Verify:** Column appears in Supabase → Table Editor → awards.

---

### Step 9 — Agent: Data layer — pick up akhlaq_post_url

**Who:** Agent

**What:**

1. In `js/data.js` `transformSeasonData`, the awards mapping already reads each field explicitly. Add `akhlaq_post_url: a.akhlaq_post_url || ''` to the mapped object.
2. `config.DB.awards` entries will now carry `akhlaq_post_url`.

**How:** In Agent mode:

> Implement media_instagram.md Step 9: In transformSeasonData in js/data.js, add akhlaq_post_url to the awards mapping so config.DB.awards entries include it.

---

### Step 10 — Agent: Render akhlaq embed on home and awards page

**Who:** Agent

**What:**

1. **`renderHome()` in `js/render.js`** — After the existing akhlaq card HTML, if `wa.akhlaq_post_url` is set, append an Instagram embed blockquote inside the card. Wrap it in a `div.akhlaq-post-wrap` for styling. Keep existing card structure intact above the embed.

   ```html
   <!-- existing card -->
   <div class="award-card akhlaq-card home-award-link">
     <div class="akhlaq-inner">...</div>
     <!-- new: embed below, only if url present -->
     <div class="akhlaq-post-wrap">
       <blockquote class="instagram-media" data-instgrm-permalink="URL" data-instgrm-version="14" style="width:100%;max-width:540px;margin:0 auto;"></blockquote>
     </div>
   </div>
   ```

2. **`renderAwards(week)` in `js/render.js`** — Same: if `wa.akhlaq_post_url` is set, append the embed blockquote inside the akhlaq card, below the winner name and sub-label.

3. After rendering in both functions, call `activateInstagramEmbeds()` to process the new blockquote.

4. If `wa.akhlaq_post_url` is empty/null, render the card as today — no empty embed container.

**How:** In Agent mode:

> Implement media_instagram.md Step 10: In renderHome and renderAwards in js/render.js, append an Instagram embed blockquote inside the akhlaq card when wa.akhlaq_post_url is set. Call activateInstagramEmbeds() after render. No change when url is empty.

---

### Step 11 — Agent: Edge function — accept akhlaq_post_url on awards save

**Who:** Agent

**What:**

1. In `supabase/functions/admin-awards/index.ts`, find the UPDATE/INSERT handler.
2. Add `akhlaq_post_url` as an accepted optional field in the body.
3. Include it in the upsert/update payload when present (allow null to clear it).

**How:** In Agent mode:

> Implement media_instagram.md Step 11: In supabase/functions/admin-awards/index.ts, accept akhlaq_post_url as an optional field and include it in the DB upsert/update.

---

### Step 12 — Agent: Admin awards section — add akhlaq post URL field

**Who:** Agent

**What:**

1. In `admin/js/sections.js`, find the admin awards editing UI (the modal or inline edit for the akhlaq winner).
2. Add a second field below the akhlaq winner input: **"Akhlaq Post (Instagram URL)"** with placeholder `https://www.instagram.com/p/XXXXX/`.
3. On save, include `akhlaq_post_url` in the payload sent to the `admin-awards` Edge Function.
4. After save, re-render the awards section so the embed appears immediately in the admin view.

**How:** In Agent mode:

> Implement media_instagram.md Step 12: In the admin awards akhlaq edit UI in admin/js/sections.js, add an "Akhlaq Post (Instagram URL)" field. Save it via admin-awards Edge Function alongside the winner name. Re-render after save.

---

### Step 13 — You: Deploy updated Edge Function

**Who:** You

**What:**

```bash
npx supabase functions deploy admin-awards
```

**Verify:** Save an akhlaq winner with a post URL from admin; confirm the embed appears on the public awards page.

---

## Step 14 — You: End-to-end test

**Who:** You

**What:**

1. **Week-scoped media:** Add a section scoped to "This week only (Week 2)". Confirm it shows on Week 2 view and is hidden on Week 1 view. Add a global section; confirm it shows on all weeks.
2. **Instagram embed:** Add an Instagram post URL to a media block. Confirm the embed renders (not a button). Leave another block empty; confirm "Coming soon" placeholder still shows.
3. **Akhlaq embed:** Enter an akhlaq winner and an Instagram post URL for Week 2 via admin. Confirm the embed appears on the awards page (Week 2) and on the home page akhlaq card. Confirm Week 1 (no post URL) shows no embed.
4. **Admin clarity:** Confirm week-scoped blocks show "Week N only" badge in admin media view. Confirm "All Weeks" blocks show no badge.

---

## Summary

| Order | Who   | Step |
|-------|-------|------|
| 1     | Agent | renderMedia filters sections/blocks by week field |
| 2     | Agent | "Add Section" modal — All Weeks / This week choice |
| 3     | Agent | "Add Media" modal — All Weeks / This week choice |
| 4     | Agent | Admin media view — "Week N only" badge on scoped items |
| 5     | Agent | Block rendering — Instagram blockquote embed + activateInstagramEmbeds() |
| 6     | Agent | Block modal — label "Instagram Post URL" + placeholder |
| 7     | Agent | Admin media re-render calls activateInstagramEmbeds() |
| 8     | You   | DB migration: `ALTER TABLE awards ADD COLUMN akhlaq_post_url TEXT` |
| 9     | Agent | transformSeasonData picks up akhlaq_post_url |
| 10    | Agent | renderHome + renderAwards append embed when akhlaq_post_url set |
| 11    | Agent | admin-awards Edge Function accepts akhlaq_post_url |
| 12    | Agent | Admin awards edit UI — Akhlaq Post URL field |
| 13    | You   | Deploy admin-awards Edge Function |
| 14    | You   | End-to-end test |

---

## Data reference

**media_layout block shape (extended):**

| Field  | Type           | Notes |
|--------|----------------|-------|
| id     | string         | Block ID |
| title  | string         | Display label |
| url    | string \| null | Instagram post URL; empty = "Coming soon" |
| width  | 'half' \| 'full' | Grid width |
| week   | number \| null | null = all weeks; N = this week only |

**media_layout section shape (extended):**

| Field  | Type           | Notes |
|--------|----------------|-------|
| id     | string         | Section ID |
| title  | string         | Section header |
| blocks | array          | Block entries |
| week   | number \| null | null = all weeks; N = this week only |

**awards table (after migration):**

| Column          | Type | Notes |
|-----------------|------|-------|
| akhlaq_post_url | TEXT | nullable; Instagram post URL for the akhlaq award winner |

**config.DB.awards entry (after Step 9):**

```js
{
  week: 2,
  akhlaq: 'Player Name',
  akhlaq_post_url: 'https://www.instagram.com/p/XXXXX/',
  motm1: '...', motm2: '...', motm3: '...',
  champ: '', mvp: '', scoring: ''
}
```
