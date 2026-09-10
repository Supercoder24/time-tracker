# Time Tracker

A minimal, single-page work-hours tracker built with plain HTML, CSS, and JavaScript. It records clock-in/clock-out timestamps and shows a running total of hours worked, with no build step, framework, or backend — everything runs in the browser and persists via `localStorage`. The layout and styling are tuned for mobile Safari/iOS (safe-area insets, a dark "liquid glass" aesthetic), with a fixed header and a `+` button that stay in place while only the entry list scrolls.

## What it does

- **Clock in / clock out**: Tapping the `+` button logs the current time. Entries alternate between a "start" and an "end" timestamp — the first tap starts a work session, the next tap ends it, and so on.
- **Running total**: The header shows the total hours worked so far, rounded down to the nearest tenth. If a session is currently active (an odd number of entries), the total keeps counting up live, updating once per second.
- **Projected finish time**: While clocked in, the app calculates and displays the clock time at which the day's total will reach a target estimate (7 hours by default), so you know when you can stop.
- **Adjustable estimate**: Tapping the estimate label (e.g. "7h") turns it into a number input — type a new value (0.1-20 hours, in 0.1hr steps) and it's saved and reflected immediately, e.g. "8h: 5:35 PM". The input uses `inputmode="decimal"` so phones show a numeric keypad. The chosen estimate persists in `localStorage` across sessions.
- **Next mark**: Also while clocked in, it shows the next clock time at which your cumulative total will tick over to the next unit of a chosen granularity — tenth of an hour (6 minutes, the default), half hour (30 minutes), or hour (60 minutes). A dropdown next to "Next" switches between them, e.g. "Next half: 4:30 PM". The chosen granularity persists in `localStorage` across sessions.
- **Editable entries**: Every logged timestamp is shown as separate hour/minute spans, displayed two-per-row — each start time paired with its matching end time — so more entries fit on screen at once. Tapping the hours or minutes of any entry opens a prompt to correct it (e.g. if you forgot to clock in/out at the right time). A currently-active session (no end time yet) appears alone, occupying just the first slot of its row.
- **Delete an entry**: Each entry has its own `-` button (with a confirmation prompt) to remove that timestamp.
- **Clear all**: A `Clear` button (with confirmation) wipes every entry and resets the tracker.
- **Empty state**: When there are no entries, a centered "No Entries" message is shown instead of the (empty) list.
- **Scrollable entry list**: The header (total, estimate, next-mark, `Clear`) and the `+` button stay fixed on screen; only the entry list between them scrolls. Soft top/bottom highlight overlays fade in over the list only when there's more content to scroll to in that direction, and disappear at the true start/end.

## How it works

### Data model

The entire state is a single array of `"HH:MM"` strings in `entries`, stored under the `entries` key in `localStorage`. Entries alternate meaning by position:

- Even indices (0, 2, 4, …) are **start** times.
- Odd indices (1, 3, 5, …) are **end** times.
- If the array has an odd length, the last entry is a start time with no matching end yet — i.e., the tracker is currently "clocked in."

All mutations go through `setEntries()`, which updates the in-memory array, persists it to `localStorage`, and re-renders the UI (`showEntries()` + `calcTotal()`). It also starts or stops a one-second `setInterval` (`checkTime`) depending on whether a session is active, so the total and projected times refresh live only while clocked in.

### Rendering

`showEntries()` rebuilds `<div id="list">` from scratch on every state change, appending one `.entryCell` div per entry — each containing clickable hour/minute spans (for editing) and its own delete button — in the same order they appear in `entries`. `#list` is styled as a two-column CSS grid, so with no per-entry pairing logic in JS, consecutive entries (a start immediately followed by its end) simply land side-by-side as the grid auto-flows; an odd trailing entry (currently clocked in) is left alone in the first column of its row. `main.css` styles the page as a fixed-height flex column: a fixed-size `#header` (total/estimate/next-mark/`Clear`) on top, a `#listWrap` card that fills the remaining space and is the only element that scrolls (`overflow-y: auto`), and the `+` button as a fixed-size row at the bottom — so `+` and `Clear` never move or get covered regardless of how many entries there are. Scroll position is tracked by a small `scroll` listener (`updateScrollShadows()`) that toggles CSS classes controlling the top/bottom highlight overlays described above.

### Layout and styling

The page targets a phone screen edge-to-edge: `index.html` sets `viewport-fit=cover` so CSS `env(safe-area-inset-*)` resolves to real values on notched/home-indicator devices, and `main.css` uses those insets (plus a small fixed gutter) as padding on `body` so content clears the device's rounded corners, notch, and home-indicator bar rather than running flush against them. Visually, the UI follows a dark "liquid glass" style: translucent, blurred (`backdrop-filter`) panels for the entry list and buttons, soft drop shadows for depth, an accent-blue tint on the primary `+` action, and the system font stack (`-apple-system` and friends) so it renders as San Francisco on real Apple devices.

### Time math

`calcTotal()` walks the `entries` array two at a time (start/end pairs), converting each `HH:MM` into total minutes since midnight to compute the duration of each session. If the last pair is incomplete (currently clocked in), it uses the current time as a stand-in "end" so the total stays live. Minutes are summed, converted to hours, and floored to one decimal place for display.

When a session is active, the same function also derives, via a shared `formatClock()` helper that converts minutes-since-midnight into a 12-hour `H:MM AM/PM` string:
- **`endTime`** — the clock time at which accumulated minutes will reach the target estimate (`estimateHours * 60` minutes) for the day. This is `subtotal` (minutes from prior *completed* sessions) subtracted from the target to get the minutes still needed, added to the current session's start time. If `subtotal` already exceeds the target (the day's total passed the estimate before this session even began), the result is a target time in the past — `formatClock()` still normalizes it into a valid clock time rather than showing negative minutes.
- **`tenth`** — the next clock time at which the day's *cumulative* total (prior completed sessions' `subtotal` plus time elapsed in the current session) will cross a boundary of `granularityMins` minutes (6/30/60, per the granularity dropdown). The offset to the next boundary is computed with a true positive modulo (`((totalSoFar % granularityMins) + granularityMins) % granularityMins`), since including `subtotal` means the running total isn't guaranteed to start at a multiple of the granularity.

`formatClock()` centralizes the hour-rollover and 12-hour conversion so both values handle an exact `:60` minute boundary, negative offsets, and midnight wraparound consistently, and both are labeled AM/PM to avoid ambiguity.

### Adjustable estimate

The target used for the projected finish time is held in `estimateHours` (default `7`), separate from `entries`. The `#estimateLabel` span — containing a visible `#estimateValue` number and a static "h" suffix — is the tappable target; clicking anywhere in it (including the "h") calls `editEstimate()`, which hides `#estimateValue` and reveals `#estimateInput` in its place, right before the "h" (so it keeps reading "[input]h"). `#estimateInput` is a `type="number"` field with `inputmode="decimal"`, so mobile browsers show a numeric keypad instead of a full text keyboard. Blurring the input (including via Enter, which just triggers `blur()`) calls `finishEstimateEdit()`, which reads the typed value and, if it's a valid number, hands it to `setEstimateHours()`. That function routes the value through `clampEstimate()` — rounding to the nearest 0.1 and clamping to the 0.1-20 range — before storing it in `estimateHours`, persisting it to `localStorage` under the `estimateHours` key, refreshing the label text (`showEstimateLabel()`), and recalculating `endTime` via `calcTotal()`. An invalid (empty/non-numeric) input is discarded, leaving the previous estimate in place. A click on `#estimateInput` itself stops propagation so it doesn't re-trigger `editEstimate()` and reset the in-progress value while already editing.

### Adjustable next-mark granularity

The unit used for the "next mark" display is held in `granularityMins` (default `6`, i.e. tenth-hour), separate from `entries`. A native `<select id="granularitySelect">` next to "Next" offers "tenth" (6 minutes), "half" (30 minutes), and "hour" (60 minutes) as options, valued by their minute counts. Changing the selection fires `setGranularity()`, which validates the value against `GRANULARITY_OPTIONS`, stores it in `granularityMins`, persists it to `localStorage` under the `granularityMinutes` key, and recalculates the next-mark time via `calcTotal()`. On load, `showGranularitySelect()` sets the dropdown to match the persisted value.

### Persistence

There is no server or database. State lives entirely in the browser's `localStorage`: work entries under the `entries` key, the finish-time estimate under `estimateHours`, and the next-mark granularity under `granularityMinutes`. Data is local to the device/browser and survives page reloads but isn't synced across devices.

## Files

| File | Purpose |
|---|---|
| [index.html](index.html) | Page structure: fixed header (total/estimate/next-mark/`Clear`), scrollable two-column entry grid, `+` button. |
| [main.css](main.css) | Dark "liquid glass" styling: fixed-height flex layout, blurred/translucent panels, safe-area-aware spacing, scroll-shadow overlays. |
| [script.js](script.js) | All application logic: entry management, persistence, rendering, and time calculations. |

## Usage

Open [index.html](index.html) directly in a browser — no build step or server required. Tap `+` to clock in, tap `+` again to clock out, and repeat throughout the day; each start/end pair renders side-by-side once both are logged. Edit or delete entries by tapping their hour/minute values or an entry's `-` button, use `Clear` to start fresh, tap the estimate label (e.g. "7h") to set a different daily-hours target, and use the "Next" dropdown to switch the next-mark granularity between tenth-hour, half-hour, and hour. The header and `+` stay put; scroll within the entry list to see older or additional entries.
