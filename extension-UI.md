# Sprintly Project Documentation

This document provides a detailed overview of the core screens developed for **Sprintly**, a developer productivity and coding session tracking app integrated into the VS Code Quick Panel.

## 1. App Opening Animation
**Placeholder:** `{{DATA:SCREEN:SCREEN_12}}` (Static) / `{{DATA:SCREEN:SCREEN_17}}` (Animated)
**Device:** Mobile (VS Code Quick Panel)

### Description
The entry point of the Sprintly experience. This screen features a "Humanized" tactile design with soft clay-morphism cards against a deep dark background.

*   **Header:** Features the Sprintly wordmark and a "GOLD RANK" pill.
*   **Hero Card:** A prominent "Ready to sprint?" greeting with a high-contrast "Start Session" primary button.
*   **Stats Row:** Three clay pills showing "Streak" (12), "Average Session" (45m), and "Current Rank" (#4).
*   **Recent Activity:** A summary card showing the last session (e.g., "Deep Work, 2 hours ago").

### Intent
To welcome the developer and provide immediate access to starting a new session while surfaced relevant historical momentum (streak/rank) to motivate the "grind."

---

## 2. Session Active
**Placeholder:** `{{DATA:SCREEN:SCREEN_9}}`
**Device:** Mobile (VS Code Quick Panel)

### Description
The live tracking interface shown while a developer is coding.

*   **Vibe vs. Hard Bar:** A signature visual element showing the split between creative/exploratory work (Coral) and focused debugging/coding (Teal).
*   **Live Metrics:** Real-time counters for build fails (7), AI prompts (34), and total session time (1h 47m).
*   **Rank Pulse:** A live nudge card showing the current city rank (e.g., "#3 in Mumbai") and social competitive updates (e.g., "Ahmad overtook you 4 mins ago").
*   **Controls:** Subtle "Pause" and "Set a goal" actions flanking a prominent "End Session" button.

### Intent
To provide real-time, low-friction feedback on the "energy" of a coding session, helping developers balance intense focus with creative flow.

---

## 3. Leaderboard
**Placeholder:** `{{DATA:SCREEN:SCREEN_7}}`
**Device:** Mobile (VS Code Quick Panel)

### Description
The social/competitive layer of the Sprintly ecosystem.

*   **Segmentation:** Toggles for "Region," "Global," and "Friends" lists.
*   **Timeframes:** Filters for "This Week," "This Month," and "All Time."
*   **Rank Cards:** A vertical list of high-achieving developers, with the user's current position pinned at the bottom for constant visibility.

### Intent
To foster a sense of community and healthy competition among developers by showcasing regional and global productivity leaders.

---

## 4. History (Animated Heatmap)
**Placeholder:** `{{DATA:SCREEN:SCREEN_39}}`
**Device:** Mobile (VS Code Quick Panel)

### Description
A comprehensive log of past performance and long-term consistency.

*   **Consistency Heatmap:** A GitHub-style activity grid where cells pulse with a staggered "breathing" animation to indicate intensity.
*   **Milestones:** "Personal Bests" row showcasing the longest session, highest rank, and cleanest (zero-fail) days.
*   **Session Log:** A scrollable list of individual session cards, each showing the time, rank, and "Flow State" tags.

### Intent
To serve as a "journal of achievement," allowing developers to reflect on their habits and celebrate long-term productivity trends.

---

## 5. Session End (Full HD Share Card)
**Placeholder:** `{{DATA:SCREEN:SCREEN_23}}`
**Device:** Mobile (VS Code Quick Panel)

### Description
The high-energy, celebratory conclusion to a coding session.

*   **The Stat Card:** A central, HDR-quality clay card designed as a "trophy." It displays the total session time (1h 47m) in bold typography, the final Vibe/Hard split, and key stats.
*   **Golden Dust:** A cinematic background animation of sparkling golden particles that creates a sense of reward.
*   **Social Actions:** A prominent "Share this" button paired with a secondary "Save" action.
*   **Journaling:** A "How was it?" reaction row (Grind, Flow State, Rough Day) to tag the session before saving.

### Intent
To provide a "shareable moment" that rewards the developer's effort. It transforms raw data into a visual achievement that can be shared to social platforms like X or LinkedIn.

---

## Design Language: Sprintly Clay System
All screens adhere to the **Clay Morphism** aesthetic:
- **Surface:** Deep `#0A0A0F` base.
- **Elevation:** Soft, inflated cards with complex inner glows and blurred drop shadows.
- **Typography:** Bold **Space Grotesk** for headings and metrics; **JetBrains Mono** for monospaced code-style stats.
- **Accents:** Sprintly Violet (`#6C63FF`), Vibe Coral (`#FF6B6B`), and Hard Teal (`#4ECDC4`).