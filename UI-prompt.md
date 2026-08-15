You are helping build the UI for "Sprintly", a VS Code extension that renders inside VS Code's Quick Panel (webview panel) API. The base extension + Quick Panel setup is already working. Your job is ONLY to build the HTML/CSS/JS webview UI.

---

## TECHNICAL CONTEXT

- All UI lives in a single VS Code Webview Panel rendered via `panel.webview.html = getWebviewContent()`
- The webview is ~400px wide, tall viewport, dark environment (matches VS Code dark themes)
- Use vanilla HTML + CSS + JS only (no React, no bundler, no npm imports)
- External fonts are allowed via Google Fonts CDN
- No VS Code API calls needed in the UI layer — just pure frontend
- Screens are shown/hidden via JS class toggling (no routing library)
- All assets are inline SVG or CSS-drawn — no external image files

---

## DESIGN SYSTEM — SPRINTLY CLAY SYSTEM

Apply this consistently across all screens:

**Colors (CSS variables):**
```css
--bg: #0A0A0F;
--surface: #13131A;
--card: #1C1C27;
--card-glow: #22223A;
--violet: #6C63FF;
--violet-glow: rgba(108, 99, 255, 0.25);
--coral: #FF6B6B;
--coral-glow: rgba(255, 107, 107, 0.25);
--teal: #4ECDC4;
--teal-glow: rgba(78, 205, 196, 0.25);
--gold: #FFD166;
--text-primary: #F0F0FF;
--text-secondary: #8888AA;
--text-muted: #44445A;
```

**Clay Morphism Card Style:**
```css
.clay-card {
  background: var(--card);
  border-radius: 20px;
  border: 1px solid rgba(255,255,255,0.06);
  box-shadow:
    0 8px 32px rgba(0,0,0,0.4),
    inset 0 1px 0 rgba(255,255,255,0.08),
    inset 0 -1px 0 rgba(0,0,0,0.3);
}
```

**Typography:**
- Headings & metrics: `'Space Grotesk', sans-serif` (import from Google Fonts)
- Code-style stats: `'JetBrains Mono', monospace` (import from Google Fonts)

**Micro-interactions:**
- All buttons: subtle scale(0.97) on active, glow pulse on hover
- Cards: slight translateY(-2px) on hover
- All transitions: 200ms ease

---

## SCREENS TO BUILD

Build all 5 screens in one HTML file. Only one screen is visible at a time. A hidden `<div id="app">` wraps all screens. Add a dev nav bar at the top (only visible in dev mode) with buttons to jump between screens for testing.

---

### SCREEN 1 — Opening Animation (`#screen-open`)

**Layout (top to bottom):**
1. Header bar: Sprintly wordmark (Space Grotesk, bold, violet) + "GOLD RANK" pill (gold color, tiny uppercase, pill shape with gold border)
2. Hero clay card:
   - Subtext: "WEDNESDAY GRIND" (muted, mono, tiny uppercase)
   - H1: "Ready to sprint?" (large, bold, white)
   - "Start Session" primary button (full width, violet background, rounded-xl, bold)
3. Stats row: 3 clay pills side by side
   - 🔥 Streak: **12**
   - ⏱ Avg: **45m**
   - 🏆 Rank: **#4**
   - Each pill: dark surface, small label above, bold number below
4. Recent activity card:
   - Label: "LAST SESSION" (muted uppercase mono)
   - Title: "Deep Work" (white, bold)
   - Meta: "2 hours ago · 1h 34m · Flow State 🟢" (secondary text)
   - Small teal dot indicator on left

**Animation on load:**
- Wordmark fades + slides down from -10px (0ms delay)
- Hero card fades + slides up from +20px (100ms delay)
- Stats pills pop in staggered (200ms, 300ms, 400ms delay)
- Recent activity card fades in (500ms delay)
- All use CSS `@keyframes` with `animation-fill-mode: backwards`

---

### SCREEN 2 — Session Active (`#screen-session`)

**Layout:**
1. Top bar: "SESSION LIVE" badge (pulsing coral dot + text) + timer "1:47:23" (mono, large, right aligned)
2. Vibe vs. Hard bar:
   - Label row: "VIBE" (coral) left + "HARD" (teal) right + percentages
   - Thick rounded bar split: 40% coral left, 60% teal right, with a soft blend in middle
   - Animated: coral side has subtle shimmer, teal side has subtle pulse
3. Live metrics row: 3 clay cards
   - 💥 Build Fails: **7** (coral number)
   - 🤖 AI Prompts: **34** (violet number)
   - ⏱ Time: **1h 47m** (teal number)
4. Rank Pulse card (clay card with violet left border):
   - "#3 in Mumbai" (bold, large)
   - "Ahmad overtook you 4 mins ago" (coral text, small)
   - Small up/down rank change indicator
5. Controls row:
   - "Pause" button (ghost style, left)
   - "End Session" button (center, coral, prominent, rounded-xl)
   - "Set Goal" button (ghost style, right)

**Animations:**
- Timer counts up (JS setInterval, starts at 1:47:23 for demo)
- Pulsing red dot on "SESSION LIVE" badge (CSS keyframe scale pulse)
- Vibe/Hard bar animates width on load

---

### SCREEN 3 — Leaderboard (`#screen-leaderboard`)

**Layout:**
1. Header: "LEADERBOARD" title + city subtitle "Mumbai · This Week"
2. Segment toggle: 3 pills — "Region" | "Global" | "Friends" (active pill: violet bg)
3. Timeframe row: "This Week" | "This Month" | "All Time" (smaller, text toggles)
4. Rank list (5 entries):
   - Rank #1: 👑 crown icon, name "Rahul S.", score "847 pts", avatar circle (initials), teal accent
   - Rank #2: name "Priya M.", score "791 pts"
   - Rank #3: name "Dev K.", score "734 pts"
   - Rank #4: name "Ahmad R.", score "698 pts"
   - Rank #5: name "Nisha T.", score "654 pts"
   - Each row: rank number (mono bold), avatar circle, name, pts (right), subtle separator
5. **Pinned at bottom** (sticky): "YOU · #8 · 521 pts" card with violet border — always visible

**Interaction:**
- Segment toggles switch active state with JS
- Active row has subtle violet left border

---

### SCREEN 4 — History / Heatmap (`#screen-history`)

**Layout:**
1. Header: "YOUR HISTORY" + current streak badge "🔥 12 day streak"
2. Heatmap grid:
   - 7 columns (days of week: M T W T F S S) × 10 rows (last 10 weeks)
   - Each cell: small rounded square, color intensity based on "activity level" (0=muted, 1=teal-20%, 2=teal-50%, 3=teal-100%, 4=violet bright)
   - Hardcode a realistic pattern with some empty cells, some bright
   - **Breathing animation:** cells with activity level ≥ 2 have a subtle CSS pulse animation, staggered by index using `animation-delay`
3. Personal Bests row (3 clay pills):
   - 🏅 Longest: **4h 12m**
   - 🏆 Best Rank: **#1**
   - ✨ Clean Days: **7**
4. Session log (scrollable, last 6 sessions):
   - Each row: date (mono, muted) + session name + duration + tag pill
   - Tags: "Flow State" (teal), "Grind" (coral), "Rough Day" (muted)
   - Alternating subtle bg for rows

---

### SCREEN 5 — Session End / Share Card (`#screen-end`)

**Layout:**
1. Background: CSS animated golden particle effect (use JS canvas or CSS pseudo-elements with keyframe float animations — ~20 gold dots floating upward, varying sizes/speeds/opacity)
2. Central trophy clay card (elevated, larger shadow, golden inner glow):
   - "SESSION COMPLETE" (muted uppercase mono, top)
   - Main stat: "1h 47m" (huge, bold, Space Grotesk, white with subtle gold text-shadow)
   - Vibe/Hard split bar (same as Screen 2, compact)
   - Stats row: Build Fails | AI Prompts | Final Rank
   - "FLOW STATE 🟢" tag below stats
3. Reaction row: "How was it?"
   - 3 emoji buttons: "💪 Grind" | "⚡ Flow State" | "😵 Rough Day"
   - Tap to select (highlight with respective color), JS toggle
4. Action buttons:
   - "Share this" — primary, violet, full width, with share icon
   - "Save to History" — ghost, below

**Animation:**
- Card animates in: scale(0.85) → scale(1) + fade, 400ms spring-like (cubic-bezier)
- Golden particles: pure CSS, floating upward with random horizontal drift
- On reaction tap: selected button pulses with its accent color

---

## NAVIGATION (Dev Helper)

Add a small dev nav at very top of the webview (only shown when `?dev=true` or via a `#dev-nav` toggle):

Small buttons, muted style, allows switching between screens during development.

Default screen shown: `#screen-open`

---

## FILE STRUCTURE TO CREATE

Create a single file: `src/webview/sprintly-ui.html`

This is the complete self-contained webview HTML. The extension's `getWebviewContent()` function will return `fs.readFileSync(path.join(context.extensionPath, 'src/webview/sprintly-ui.html'), 'utf8')`.

Make sure:
- All CSS is in a `<style>` block in `<head>`
- All JS is in a `<script>` block before `</body>`
- Google Fonts CDN links are in `<head>`
- No external JS libraries (pure vanilla)
- The HTML is production-ready, not a wireframe — full visual polish

---

## QUALITY BAR

- Every screen must look like a real, shipped product — not a prototype
- Clay morphism must be felt: real depth, real glow, real inflation
- Typography must be intentional: size hierarchy, weight contrast, mono vs sans contrast
- Animations must be smooth: 60fps CSS keyframes, no janky JS animations
- Spacing must be tight but breathable: ~16px gutters, ~12px internal padding on pills
- No placeholder grey boxes — every element must be the real designed element