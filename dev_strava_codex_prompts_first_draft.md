# Sprintly — Codex Prompts (First Draft)

This document contains the first draft of the three-part Codex prompt set for the project.

## Project Overview

Build a minimalist VS Code extension + companion website that behaves like a "Strava for developers." The extension should be consent-first, lightweight, and focused on recording coding-session activity only after the user explicitly starts recording. The website should handle history, social sharing, and leaderboards.

The product should feel fun, playful, and shareable, while staying privacy-conscious and opt-in.

---

## Prompt 1 — VS Code Extension Foundation

**Goal:** Build the minimal VS Code extension shell with consent flow, status bar entry, and a small session panel.

**Prompt:**

> Build the first version of a minimalist VS Code extension for a product called DevStrava. The extension must be consent-first and must not record anything by default.
>
> Requirements:
>
> 1. Show a startup prompt when VS Code opens a new window or when the extension activates for that session.
> 2. The prompt must ask the user whether they want to start recording the current coding session.
> 3. If the user declines, nothing should be recorded.
> 4. Add a small status bar icon on the lower-right side of VS Code, similar in placement to the GitHub Copilot icon.
> 5. Clicking the status bar icon should reopen the same recording consent prompt.
> 6. Add another click action or menu action that opens a small in-extension panel showing the current session stats.
> 7. Keep the UI minimal, clean, and non-intrusive.
> 8. Make the extension architecture easy to extend later for more tracking and social features.
>
> Implementation notes:
>
> - Use VS Code extension best practices.
> - Keep the initial version lightweight.
> - Store user consent locally.
> - Separate UI logic from tracking logic.
> - Make sure the extension does not begin recording unless the user explicitly agrees.
>
> Deliverables:
>
> - Extension scaffold
> - Consent prompt flow
> - Status bar icon
> - Small session stats panel
> - Basic session state management

### Prompt 1.1 — Replace the session tab with a compact Copilot-style view

**Goal:** Change the session stats UI so it no longer opens as a separate editor tab. It should behave like a compact, native VS Code control panel similar to the Copilot popup shown in the reference image.

**Status:** Completed on 2026-04-26

**Prompt:**

> Update the DevStrava extension UI so the session panel does NOT open as a separate VS Code tab, editor group, or document view.
>
> Use the attached reference image as the visual target: a compact, floating, card-like control panel with a small header, subtle borders, rounded corners, and a dense but minimal stats layout.
>
> Exact changes required:
> 1. Remove the current implementation that opens the session panel in a separate editor tab.
> 2. Replace it with a non-editor VS Code view pattern so the panel feels native and compact.
> 3. The status bar icon should open or reveal this compact control surface instead of creating a new tab.
> 4. The panel must be small, minimal, and visually similar to the Copilot popup style: a top header, compact content blocks, soft spacing, and a refined control-panel feel.
> 5. Include only essential information: current session status, one or two core stats, privacy/recording state, and a small action area.
> 6. Keep the panel anchored to the extension UI flow, not to a file editor.
> 7. Do not use `createWebviewPanel`, `showTextDocument`, or any approach that opens a normal editor tab.
> 8. Use a view-based or popup-like implementation that stays inside the VS Code chrome rather than the editor area.
> 9. Preserve the consent-first behavior: nothing is recorded until the user explicitly starts recording.
>
> Visual direction:
> - Small floating panel
> - Clean header area
> - Rounded cards
> - Soft border and subtle shadow
> - Minimal text density
> - Compact developer-friendly styling
> - Copilot-like utility, not dashboard-like clutter
>
> Deliverables:
> - Refactored session panel implementation
> - Status bar click-to-open behavior for the compact panel
> - UI that matches the reference style more closely
> - No tab-based session panel anymore

---

## Prompt 2 — Session Tracking and Developer Style Scoring

**Goal:** Track coding behavior and convert it into fun, privacy-safe developer stats.

**Prompt:**

> Extend the DevStrava VS Code extension so it can track session activity after the user has explicitly enabled recording.
>
> Track only high-level signals, not raw code content.
>
> Requirements:
>
> 1. Track editor activity such as file edits, saves, file switches, and time spent actively coding.
> 2. Track mistake and recovery signals such as repeated edits, quick reversions, failed runs, or test failures when available.
> 3. Track terminal usage inside VS Code, including command execution when possible.
> 4. Create a simple scoring system that can represent coding style categories such as vibecoding, hardcore coding, debugging intensity, and productivity rhythm.
> 5. Show current session stats in the in-extension panel.
> 6. Keep raw sensitive content local by default.
> 7. Prepare the data model so it can later sync summaries to the cloud.
> 8. Make the stats readable, playful, and easy to share later.
>
> Implementation notes:
>
> - Prefer aggregated counters and scores over raw event logs.
> - Design the schema so it can support future features like streaks, badges, and league ranking.
> - Make it possible to reset or pause tracking easily.
> - Keep privacy at the center of the design.
>
> Deliverables:
>
> - Session telemetry model
> - Activity scoring model
> - Style/archetype mapping
> - Live stats view
> - Pause/resume/reset controls

---

## Prompt 3 — Website, History, Sharing, and Leaderboards

**Goal:** Build the companion website that handles history, public showcase, and competitive features.

**Prompt:**

> Build the website for DevStrava, the developer activity tracking product.
>
> The website should be the place where users view history, generate shareable cards, and participate in leaderboards.
>
> Requirements:
>
> 1. Create a clean website dashboard where users can log in and view their session history.
> 2. Show weekly, monthly, and all-time stats in a visually polished format.
> 3. Provide shareable developer cards with avatars, percentages, streaks, and style labels.
> 4. Let users explicitly choose which stats they want to share on social media.
> 5. Add a region-wise leaderboard system to make the product competitive.
> 6. Keep public sharing separate from private tracking.
> 7. Make the website feel playful, modern, and premium.
> 8. Design the website so future features like teams, challenges, and seasonal rankings can be added later.
>
> Implementation notes:
>
> - The extension should only record stats.
> - The website should handle all sharing and public display flows.
> - The site should make it easy to compare yourself against your own past behavior.
> - Keep the public profile and social card experience highly visual.
>
> Deliverables:
>
> - Website dashboard
> - History page
> - Share card generator
> - Leaderboard page
> - Public/private profile controls

---

## Future Expansion Ideas

- Team challenges and office leagues
- Weekly coding workout summaries
- Avatar progression and unlockables
- Personal bests and streak milestones
- AI-assist usage insights
- Test discipline scoring
- Terminal intensity scoring
- Seasonal competitions
- Private mode vs public mode
- A "developer persona" profile system

---

## Version Note

**Version:** First Draft

This document is intentionally incomplete so more features can be added in future revisions.
