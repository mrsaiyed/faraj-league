/**
 * Page templates extracted from public index.html for admin visual mirror.
 * Preserve exact structure and IDs so public render functions find elements.
 */

export const HOME_TEMPLATE = `
  <div class="hero">
    <div class="hero-bg"></div><div class="hero-geo"></div>
    <div class="hero-content">
      <div class="hero-badge" id="hero-badge">Spring 2026 · Inaugural Season</div>
      <div id="title-sponsor-banner"></div>
      <img src="../faraj-logo.png" style="width:340px;height:340px;mix-blend-mode:screen;" alt="Faraj League">
      <div class="hero-divider"></div>
      <p class="hero-hadith-ar">أفْضَلُ العِبادةِ انتِظارُ الفَرَجْ</p>
      <p class="hero-hadith-en">"The best worship is awaiting the reappearance." — Holy Prophet (s.a.w.s.)</p>
      <p class="season-tag" id="season-tag">6 Teams · 42 Players · Ages 17–30</p>
    </div>
  </div>
  <div class="historic-banner" id="historic-banner" style="display:none;">
    <div class="historic-banner-label">Season Complete</div>
    <div class="season-champs">
      <div><div class="champ-label">Champions</div><div class="champ-value" id="hb-champ">—</div></div>
      <div><div class="champ-label">MVP</div><div class="champ-value" id="hb-mvp">—</div></div>
      <div><div class="champ-label">Scoring Title</div><div class="champ-value" id="hb-scoring">—</div></div>
    </div>
  </div>
  <div class="quick-stats">
    <div class="qs-item"><div class="qs-num">6</div><div class="qs-label">Teams</div></div>
    <div class="qs-item"><div class="qs-num">42</div><div class="qs-label">Players</div></div>
    <div class="qs-item"><div class="qs-num">2</div><div class="qs-label">Conferences</div></div>
    <div class="qs-item"><div class="qs-num" id="weeks-played">0</div><div class="qs-label">Weeks Played</div></div>
  </div>
  <div class="section">
    <p class="section-sub" id="home-standings-sub">Spring 2026</p>
    <h2 class="section-title" id="home-standings-title">Standings</h2>
    <div class="section-line"></div>
    <div class="home-standings-wrap" id="home-standings"></div>
    <hr class="section-divider">
    <p class="section-sub" id="home-matchup-sub">Week 1 · Upcoming</p>
    <h2 class="section-title">Recent Matchups</h2>
    <div class="section-line"></div>
    <div class="matchups-grid" id="home-matchups"><div class="loading">Loading...</div></div>
    <div style="margin-top:2rem;">
      <p class="section-sub" id="home-awards-sub">Week 1 · Latest</p>
      <h2 class="section-title">Recent Awards</h2>
      <div class="section-line"></div>
      <div class="home-awards-grid" id="home-awards"><div class="loading">Loading...</div></div>
    </div>
  </div>
  <footer><div class="footer-logo">Faraj League</div><div class="footer-hadith">"The best worship is awaiting the reappearance." — Holy Prophet (s.a.w.s.)</div><div class="footer-insta">@farajleague on Instagram</div></footer>
`;

export const STANDINGS_TEMPLATE = `
  <div class="section">
    <p class="section-sub" id="standings-section-sub">Spring 2026</p><h2 class="section-title">Standings</h2><div class="section-line"></div>
    <div class="conf-grid">
      <div class="card"><div class="conf-header" id="conf-header-mecca">Mecca Conference</div><table class="standings-table"><thead><tr><th style="width:28px">#</th><th>Team</th><th>W</th><th>L</th><th>PF</th><th>PA</th></tr></thead><tbody id="mecca-standings"><tr><td colspan="6" class="loading">Loading...</td></tr></tbody></table></div>
      <div class="card"><div class="conf-header" id="conf-header-medina">Medina Conference</div><table class="standings-table"><thead><tr><th style="width:28px">#</th><th>Team</th><th>W</th><th>L</th><th>PF</th><th>PA</th></tr></thead><tbody id="medina-standings"><tr><td colspan="6" class="loading">Loading...</td></tr></tbody></table></div>
    </div>
    <hr class="section-divider">
    <p class="section-sub">Results by Week</p><h2 class="section-title">Scores</h2><div class="section-line"></div>
    <div class="week-dropdown-wrap"><span class="week-dropdown-label">Week</span><select class="week-dropdown" id="scores-week-select" onchange="renderScores(this.value)"></select></div>
    <div id="scores-content"><div class="loading">Loading...</div></div>
  </div>
  <footer><div class="footer-logo">Faraj League</div><div class="footer-hadith">"The best worship is awaiting the reappearance." — Holy Prophet (s.a.w.s.)</div><div class="footer-insta">@farajleague on Instagram</div></footer>
`;

export const SCHEDULE_TEMPLATE = `
  <div class="section">
    <p class="section-sub" id="schedule-section-sub">Spring 2026</p>
    <h2 class="section-title">Schedule</h2>
    <div class="section-line"></div>
    <div class="week-dropdown-wrap"><span class="week-dropdown-label">Week</span><select class="week-dropdown" id="schedule-week-select" onchange="renderSchedule(parseInt(this.value), document.getElementById('schedule-team-filter')?.value || null)"></select></div>
    <select id="schedule-team-filter" style="margin-left:1rem;" onchange="renderSchedule(parseInt(document.getElementById('schedule-week-select')?.value), this.value || null)"><option value="">All teams</option></select>
    <div id="schedule-prev" style="margin-top:1.5rem;"></div>
    <div id="schedule-focus" style="margin-top:1.5rem;"></div>
    <div id="schedule-next" style="margin-top:1.5rem;"></div>
  </div>
  <footer><div class="footer-logo">Faraj League</div><div class="footer-hadith">"The best worship is awaiting the reappearance." — Holy Prophet (s.a.w.s.)</div><div class="footer-insta">@farajleague on Instagram</div></footer>
`;

export const MEDIA_TEMPLATE = `
  <div class="section">
    <p class="section-sub">Highlights & Interviews</p><h2 class="section-title">Media</h2><div class="section-line"></div>
    <div class="week-dropdown-wrap"><span class="week-dropdown-label">Week</span><select class="week-dropdown" id="media-week-select" onchange="renderMedia(this.value)"></select></div>
    <div id="media-content"></div>
    <div style="margin-top:1.5rem;text-align:center;"><button class="insta-btn">Follow @farajleague on Instagram</button></div>
  </div>
  <footer><div class="footer-logo">Faraj League</div><div class="footer-hadith">"The best worship is awaiting the reappearance." — Holy Prophet (s.a.w.s.)</div><div class="footer-insta">@farajleague on Instagram</div></footer>
`;

export const ABOUT_TEMPLATE = `
  <div class="section">
    <p class="section-sub">Who We Are</p><h2 class="section-title">About the League</h2><div class="section-line"></div>
    <div class="about-grid">
      <div class="about-text">
        <div id="about-text" class="about-text-block">The Faraj League is a community basketball league built on brotherhood and the spirit of collective preparation. Our name is drawn from the narration of the Holy Prophet (s.a.w.s.): <em style="color:#e2c97e;">أفْضَلُ العِبادةِ انتِظارُ الفَرَجْ</em> — "The best worship is awaiting the reappearance."

TBD</div>
      </div>
      <div>
        <div class="conf-info-card">
          <div class="conf-info-title" id="about-conf-title">Spring 2026 Structure</div>
          <div class="conf-accordion">
            <div class="conf-acc-header" onclick="toggleAcc('mecca')"><div class="conf-acc-title"><div class="conf-dot" style="background:#c8a84b"></div><span id="about-mecca-label">Mecca Conference</span></div><span class="conf-acc-arrow" id="arrow-mecca">▾</span></div>
            <div class="conf-acc-body" id="body-mecca"></div>
          </div>
          <div class="conf-accordion">
            <div class="conf-acc-header" onclick="toggleAcc('medina')"><div class="conf-acc-title"><div class="conf-dot" style="background:#2fa89a"></div><span id="about-medina-label">Medina Conference</span></div><span class="conf-acc-arrow" id="arrow-medina">▾</span></div>
            <div class="conf-acc-body" id="body-medina"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <footer><div class="footer-logo">Faraj League</div><div class="footer-hadith">"The best worship is awaiting the reappearance." — Holy Prophet (s.a.w.s.)</div><div class="footer-insta">@farajleague on Instagram</div></footer>
`;
