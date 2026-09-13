# Time Tracker

A minimal, single-page work-hours tracker built with plain HTML, CSS, and JavaScript. It records clock-in/clock-out timestamps and shows a running total of hours worked, with no build step, framework, or backend — everything runs in the browser and persists via `localStorage`. The layout and styling are tuned for mobile Safari/iOS (safe-area insets, a dark "liquid glass" aesthetic), with a fixed header and a `+` button that stay in place while only the entry list scrolls.

**Version 2 adds multiple projects.** The project page is still the v1 page — same total, estimate and next-mark lines, same `Clear`, entry grid and `+`. What's new is the strip above it (a project name and a dot switcher) and two gestures: swipe sideways for another project, pull down for the dashboard. One clock is shared across every project, so starting a project always stops whichever one was running.

## What it does

### On a project page

- **Clock in / clock out**: Tapping `+` logs the current time to the project you're looking at. Entries alternate between a "start" and an "end" timestamp.
- **Running total**: The header shows this project's hours so far, rounded down to the nearest tenth. While a session is active it counts up live, once per second.
- **Projected finish time**: While clocked in, the clock time at which this project reaches its target estimate (7 hours by default).
- **Adjustable estimate**: Tapping the "7h" label turns it into a number input — type a new value (0.1-20 hours, in 0.1hr steps) and it saves immediately, e.g. "8h: 5:35 PM". `inputmode="decimal"` gives phones a numeric keypad. Each project keeps its own estimate.
- **Next mark**: The next clock time at which this project's cumulative total ticks over to the next tenth of an hour (6 minutes, the default), half hour, or hour. Each project keeps its own granularity.
- **Editable entries**: Timestamps are shown as separate hour/minute spans, two per row, so each start sits beside its end. Tapping the hours or minutes opens a prompt to correct it. An active session with no end yet sits alone in the first column of its row.
- **Delete an entry**: Each entry has a `-` button, with a confirmation.
- **Clear**: Empties the current project's entries, with a confirmation.
- **Empty state**: A centred "No Entries" message replaces the list when a project has none.
- **Scrollable entry list**: The strip, header and `+` stay fixed; only the list between them scrolls. Soft highlight overlays fade in at the top and bottom edges only when there is more to scroll that way.

### The project strip

A 44px strip above the total holds three things: a **grabber** bar hinting the pull-down (tapping it also opens the dashboard); the **project name**, with a glowing blue dot beside it when this project holds the clock, which opens the rename sheet when tapped; and a row of **deck dots**, one per project, showing where this project sits in the swipe order. Tapping a dot jumps to that project.

### Gestures

- **Swipe left/right** anywhere on the project page to move through the deck. The deck loops, so swiping past the last project lands on the first and no project in a four-project set is more than two swipes away.
- **Pull down** — from the strip or header, or from the entry list once it is scrolled to the top — to open the dashboard. **Pull up**, or tap `Close`, to go back.

Both use pointer events, so they work with a mouse as well as touch. A drag locks to whichever axis moved further first, so a diagonal swipe can't do two things at once.

Gestures can also start on the **`+` button**, which is full-width and sits where a thumb rests; refusing to swipe from it would make most of the reachable area dead. The rule that keeps this unambiguous is that a gesture either travels far enough to act or counts as a tap, with no dead zone between: a drag from `+` that never reaches the 45px threshold still logs a time, and only a gesture that actually changed project or opened the dashboard suppresses the tap underneath. Every other control stays an ordinary control — `Clear`, the entry `-` buttons, the estimate field and the dropdown are small enough to hit precisely, so dragging from them does nothing.

### The handoff

Tapping `+` on a project while a *different* one is running does the whole switch in one transaction: the running project gets a closing entry at the current minute and this one gets an opening entry at the same minute. Instead of a confirmation dialog, a toast appears at the bottom of the entry card — "Stopped **Riverbend** at 10:40" with an **Undo** button — and stays for 5 seconds. Undo restores both projects' entries exactly and hands the clock back.

### The dashboard

Pull down for an "All projects · today" view with the same header grammar as a project page, totalled across every project:

- **Combined total** of every project's hours.
- **Estimate line**, reading either `7h: 6:40 AM` (a forward projection while the clock runs), `7h reached at 10:32 AM` (once the day's total has crossed the target), or `7h: never` (idle and still short).
- **Running: \<name\>**, or "Running: nothing" when idle.
- **One row per project** with a dot, the name, its hours, and a round `+` button. The button starts that project — stopping whatever was running — and the dashboard stays open. On the running row the same `+` stops the clock, tinted with the accent gradient rather than turning red: it's a toggle, not a destructive action, and red is reserved for deleting. Tapping a project's *name* closes the dashboard and lands you on it.
- **+ New project**, which becomes a name field in place. Type a name, tap `Done`, and it joins the end of the deck, created empty with its own estimate and granularity.
- **Clear all**, which empties every project's entries (keeping the projects) and stops the clock, with a confirmation.

### Edit mode

`Edit` swaps each row's start button for a drag handle and a delete button, drops the new-project row, and mutes `Clear all` and `Close` until you're done. The header reads "Editing · drag to reorder" and "Order sets the swipe deck".

- **Drag a handle** to reorder. List order *is* deck order, so dragging a project to the top puts it one swipe from everything else. The project you were viewing stays the project you're viewing, whatever index it ends up at.
- **Tap a name** to rename it without leaving the dashboard.
- **Tap the red `–`** to delete a project and its entries. This is the only red control on the dashboard, because it is the only destructive one.

### Rename and delete

Tapping the project name dims the page and raises a sheet in place of `+`, with the name in an editable field, a red `Delete project` and a blue `Save`. Deleting asks once, then removes the project and its entries; if it was running, the clock stops.

**The deck must always keep at least one project, so your only project cannot be deleted.** With one project left, both delete controls mute themselves and stop responding, and the sheet's footnote explains why instead of describing an unavailable action. `removeProject()` refuses independently of the buttons, so the rule holds however the call is reached. To start over on a single project, use `Clear`.

## How it works

### Data model

v1 stored one `entries` array. v2 stores a list of projects, each with its own entries, estimate and granularity, plus a pointer to the visible one:

```
projects: [
  { id, name,
    entries: ["07:00", …],
    estimateHours, granularityMinutes }
]
activeIndex   // visible page
runningId     // null when idle
```

Within a project, entries alternate meaning by position as in v1: even indices are **start** times, odd indices are **end** times, and an odd-length array means that project is currently clocked in.

**At most one project may have an odd entry count.** Entry parity is the real record of who holds the clock; `runningId` is only a stored shortcut. `reconcileRunning()` runs on load and on every state change, and believes the entries wherever the two disagree — so hand-edited or half-written storage self-heals rather than producing two simultaneously running projects. `normalizeProject()` coerces each stored record into something usable (missing id, blank name, non-array entries, out-of-range estimate, unknown granularity); unparseable JSON falls through to the migration path and yields one fresh project.

### Migration from v1

On first run with no `projects` key, `migrateLegacyProject()` folds v1's `entries`, `estimateHours` and `granularityMinutes` into project 0. The old keys are deliberately left in place — they cost nothing and mean a downgrade still finds its data.

### Clock states

```
IDLE  --tap + on P-->  RUNNING(P)

RUNNING(P):
  + on P     -> close entry                            -> IDLE
  + on Q     -> close P and open Q at the same minute  -> RUNNING(Q)
  delete P   -> RUNNING(P) ends                        -> IDLE
  Undo (5s)  -> reopen P's entry, discard Q's          -> RUNNING(P)
```

All of it funnels through `toggleClock(project)`, which both the `+` button and the dashboard row buttons call. The handoff case snapshots both entry arrays *before* touching either, so `undoHandoff()` restores them exactly rather than trying to reverse the edits.

### State changes

Every mutation ends in `commit()`: it reconciles `runningId`, persists to `localStorage`, starts or stops the one-second `ticker` depending on whether anything runs, and re-renders. `tick()` touches text only — the project page's stats and, when the dashboard is open, its header and row hours — so a live-updating second never rebuilds the DOM.

### Rendering

`renderEntries()` rebuilds `#list` from the active project on every state change, one `.entryCell` per entry. `#list` is a two-column grid, so with no pairing logic in JS consecutive entries land side by side as the grid auto-flows, and an odd trailing entry is left alone in the first column.

The entry card is split in two: `#listCard` owns the border, fill, rounding and clipping and does **not** scroll, while `#listWrap` inside it is the only thing that does. That split is what lets the handoff toast and the empty-state message stay pinned to the card instead of scrolling away. `updateScrollShadows()` toggles the classes behind the top and bottom overlays.

### Layout and styling

`#page` and `#dashboard` are siblings in the same absolutely-positioned box: the dashboard is parked at `translateY(-100%)` and slides down over the page rather than pushing it, so opening reads as the continuation of the pull-down. `index.html` sets `viewport-fit=cover` so `env(safe-area-inset-*)` resolves on notched devices, and both elements use those insets plus a small gutter as padding.

`touch-action` keeps the gestures and native scrolling apart: `pan-y` on `#page` and `#listCard` (vertical scrolls entries, horizontal is the swipe), and `none` on `#projectBar`, `#header`, `#add` and each `.dragHandle`, none of which scroll, so both axes belong to JS there.

Visually it follows v1's dark "liquid glass" style: translucent blurred panels, soft drop shadows, an accent-blue `+`, and the system font stack. Small fixed details in the project strip are sized in pixels rather than `em` so they stay crisp instead of scaling with the type ramp.

### Time math

`projectMinutes()` walks one project's entries two at a time, converting each `HH:MM` into minutes since midnight. An incomplete last pair uses the current time as a stand-in end, so the total stays live. It returns `total` (including the open session) and `subtotal` (completed sessions only). `floorTenth()` converts to hours and floors to one decimal, its small epsilon absorbing float error so an exact 4.6 doesn't floor to 4.5.

While a project runs, `renderStats()` also derives, via `formatClock()`:

- **`endTime`** — when accumulated minutes will reach the target. This is `subtotal` subtracted from the target to get the minutes still needed, added to the current session's start. If `subtotal` already exceeds the target the result lies in the past, and `formatClock()` normalizes it into a valid clock time rather than showing negative minutes.
- **`nextMark`** — when the project's *cumulative* total crosses the next `granularityMinutes` boundary. Including `subtotal` means the running total isn't guaranteed to start on a multiple of the granularity, so the offset uses a doubled modulo (`((soFar % step) + step) % step`) to stay positive.

The dashboard needs an answer no single project can give — when the *day* crossed the target — so `allSessions()` flattens every session from every project into one list ordered by start time and `renderDashboardStats()` replays it, accumulating until the sum reaches the target and interpolating the crossing minute. The target itself is the estimate of whichever project you're racing: the running one, or the one you were viewing when you pulled the dashboard down. Per-project estimates are workday lengths, so summing them would be meaningless.

> **Known limitation, inherited from v1:** all arithmetic treats timestamps as minutes since midnight within a *single* calendar day. A session spanning midnight (in at 23:00, out at 01:00) produces a negative duration.

### Persistence

There is no server or database. State lives in `localStorage`: the project list under `projects`, the visible index under `activeIndex`, and the running project's id under `runningId`. v1's `entries`, `estimateHours` and `granularityMinutes` keys are left untouched after migration. Data is local to the device and survives reloads, but isn't synced.

## Files

| File | Purpose |
|---|---|
| [index.html](index.html) | Page structure: project strip, header, entry grid, `+`, rename sheet, dashboard overlay. |
| [main.css](main.css) | Design tokens and the dark "liquid glass" styling: fixed-height flex layout, blurred panels, safe-area spacing, scroll shadows, `touch-action` zoning, dashboard and edit-mode components. |
| [script.js](script.js) | All logic: the project model and migration, persistence, the shared clock and handoff, rendering, time math, gestures, dashboard and drag-to-reorder. |

## Usage

Open [index.html](index.html) directly in a browser — no build step or server required.

Tap `+` to clock in, tap again to clock out. Edit or delete entries by tapping their hour/minute values or an entry's `-`, use `Clear` to reset the current project, tap the "7h" label to set a different daily target, and use the "Next" dropdown to change the next-mark granularity.

Swipe sideways, or tap a deck dot, to move between projects; tapping `+` on a different project hands the clock over with 5 seconds to undo. Pull down, or tap the grabber, for the dashboard: every project's total, start or stop any of them without leaving the view, add a project, or use `Edit` to reorder, rename and remove. Tap a project's title on its own page to rename or delete it.

If you're upgrading from v1, your existing entries, estimate and granularity migrate into the first project automatically the first time you open v2.
