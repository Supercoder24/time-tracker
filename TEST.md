# Test Plan — Time Tracker

A guide for testing Version 1 (single project) and Version 2 (multiple
projects) features. Work through each subsection the same way on future
changes: it names what to test, how to test it, and what should happen.

## How to test

- **Tooling**: a live Chrome instance driven via the Chrome DevTools MCP tool
  suite (`chrome-devtools-mcp`), loading `index.html` directly as a
  `file://` URL — no server or build step.
- **Device emulation**: viewport set to **375 × 812 CSS px, device scale
  factor 3, mobile + touch flags** — the iPhone 13 mini — via the `emulate`
  tool. Check layout, spacing, and safe-area behavior at this size, and take
  screenshots at key states for visual confirmation (2-column entry layout,
  empty-state centering, scroll shadows, dashboard, rename sheet, etc.).
- **Interaction methods**, in order of preference for fidelity:
  1. Real taps: `.click()` on buttons, rows, and dots — matches how a user
     actually triggers most controls.
  2. Simulated touch gestures: dispatch `pointerdown` → `pointermove`
     (× 2–3, to cross the app's own axis-lock) → `pointerup` sequences with
     `pointerType: 'touch'`, using the same coordinate math and thresholds
     the app itself defines (`AXIS_LOCK`, `SWIPE_MIN`, `PULL_MIN` in
     `script.js`), for swiping between projects, pulling the dashboard open
     and closed, and dragging to reorder projects.
  3. Direct state inspection/setup: read and write `localStorage` and call
     exposed functions (e.g. `openDashboard()`) via `evaluate_script`, used
     only to assert internal state after an interaction, or to seed a
     scenario (e.g. an existing set of entries) that would be slow to build
     up one tap at a time.
- **Fresh state**: `localStorage.clear()` + reload before each major section,
  so earlier tests can't leak into later ones.

### Known testing-environment caveats

These are properties of the automated browser session, not application bugs
— keep them in mind so they don't get mistaken for regressions:

- **`document.hasFocus()` reads `false`** in this kind of automated session
  (the browser window never receives real OS-level focus). Because of this,
  calling the native `element.blur()` method on a focused input does not
  reliably fire a real `blur` event, even though `document.activeElement`
  updates correctly. For anything that commits on blur (the estimate
  input), trigger the commit with `input.dispatchEvent(new Event('blur'))`
  instead, which reaches the same listener. This only affects the
  automated session — on a real device, which always holds focus while the
  page is visible, tapping away or pressing Enter fires the real event.
- **The handoff Undo toast auto-hides after 5 seconds** (`UNDO_MS` in
  `script.js`). If a test triggers a handoff and clicks "Undo" as two
  separate steps with real wall-clock time in between (e.g. across several
  tool round-trips), the timer may already have fired by the time Undo is
  clicked, making it look like a no-op. Test Undo inside a single
  synchronous script (handoff + Undo click, no real time in between) to
  avoid a false failure.
- **Author synthetic entries with timestamps before the real current
  time.** Check the system clock with `new Date()` before hand-authoring
  any "currently running" entry (odd-length entry list). An entry whose
  start time is *later* than the actual current time produces a
  nonsensical negative total (`now − start < 0`) purely from that choice of
  fixture — it isn't reachable through normal use, since real entries are
  always stamped with the actual current time.

---

## Version 1 features (apply against the active project under v2)

Every v1 feature now operates per-project (reading/writing
`activeProject()` instead of a single global state), so test each of these
against whichever project is active.

### Clock in / clock out (`+`)
- **How to test**: tap `+` on an idle project; check `entries` gained a
  `"HH:MM"` stamp and `runningId` was set to that project.
- **Expected result**: entry appended, project marked running, running dot
  appears next to the project name.

### Running total
- **How to test**: read `#total` after starting a session with known past
  timestamps, and again after closing/reopening pairs of entries, comparing
  against hand-computed minutes.
- **Expected result**: matches `floorTenth(total / 60)` for both closed
  sessions and a live in-progress one.

### Projected finish time (`endTime`)
- **How to test**: start a session, read `#endTime`, and check it against
  start-time + (estimate×60 − subtotal of already-closed sessions).
- **Expected result**: e.g. a session started at 01:40 with an 8.4h
  estimate and 50 prior minutes should show `9:14 AM`.

### Adjustable estimate
- **How to test**: click `#estimateLabel` (it should swap in
  `#estimateInput`, pre-filled with the current value, focused+selected),
  set a new value, commit via `blur` (see focus caveat above), and check
  the label, `localStorage`, and `endTime` all updated. Reload to confirm
  the value persists.
- **Expected result**: estimate updates and persists; clamping is
  per-project and independent of other projects' estimates.

### Next-mark granularity dropdown
- **How to test**: change the `#granularitySelect` value (tenth/half/hour)
  and fire its `change` event; check `localStorage` and the recalculated
  `#nextMark` time.
- **Expected result**: stored granularity and displayed next-mark time both
  update to match the new selection.

### Editable entries (tap hour / tap minute)
- **How to test**: stub `window.prompt`, click an entry's hour span and
  then its minute span, and check the entry string updated in place at the
  correct position without disturbing other entries.
- **Expected result**: only the targeted entry's hour or minute changes;
  all other entries are untouched.

### Delete entry
- **How to test**: stub `window.confirm` to accept, click an entry's `-`
  button, check the entry was removed and the running/idle state
  recalculated correctly (parity flips when a running entry's partner is
  removed).
- **Expected result**: entry removed, running state consistent with the
  new entry count.

### Clear (per project)
- **How to test**: click `Clear` with entries present; check only the
  active project's entries were wiped (not other projects'), and that the
  confirmation text names the active project.
- **Expected result**: active project's entries emptied; other projects'
  entries untouched.

### Empty state
- **How to test**: clear all entries and take a screenshot of the card.
- **Expected result**: "No Entries" renders centered both horizontally and
  vertically in the card.

### Two-column entry pairing
- **How to test**: seed 5+ entries (an odd count, so the last is
  "running") and screenshot the list.
- **Expected result**: start/end pairs render side-by-side two-per-row;
  the odd trailing "running" entry sits alone in the left column of its
  own row.

### Scrollable list & scroll-shadow overlays
- **How to test**: seed 20 entries, scroll the list to the top, middle,
  and bottom, and check the `show-top-shadow` / `show-bottom-shadow`
  classes on `#listWrap` at each position, plus a screenshot mid-scroll.
- **Expected result**: shadows appear only when there is more to scroll in
  that direction and disappear at the true top/bottom.

---

## Version 2 features

### Multiple projects & the project bar
- **How to test**: create three projects (see "New project creation"
  below), check `#projectName` reflects the active one, `#runningDot` is
  only visible when the active project is the one running, and
  `#projectDots` renders one dot per project with the active one marked
  `.active`.
- **Expected result**: project bar always reflects the active project and
  the true running project, independent of each other.

### Tap a project dot to jump to that project
- **How to test**: click a non-active dot in `#projectDots`.
- **Expected result**: `activeIndex` and the visible project update
  immediately; the running dot correctly follows whichever project is
  actually running, independent of which one is being viewed.

### Swipe between projects
- **How to test**: with 3 projects, dispatch a simulated horizontal drag
  (`pointerdown` → `pointermove` × 3 past `AXIS_LOCK` and `SWIPE_MIN` →
  `pointerup`) on `#page`:
  - a ≥45px leftward drag,
  - a ≥45px rightward drag back,
  - a ≥45px rightward drag from the first project (should wrap to the
    last),
  - a 30px drag (below the 45px `SWIPE_MIN` threshold).
- **Expected result**: left/right swipes change the active project in the
  correct direction, the deck wraps at both ends, and the sub-threshold
  drag snaps back without changing anything.

### Pull down to open / pull up to close the dashboard
- **How to test**: dispatch a simulated vertical drag (≥60px, `PULL_MIN`)
  on `#page` (downward) and then on `#dashboard` (upward).
- **Expected result**: dashboard slides open on the downward pull and
  closes (and is removed from the layout, `hidden`, after its 260ms
  transition) on the upward pull.

### Dashboard aggregate stats
- **How to test**: with entries split across two projects, open the
  dashboard and check `#dashTotal` against a hand-summed total across
  every project's sessions, and `#dashEstimate` against the
  currently-running (or active, if idle) project's estimate.
- **Expected result**: total doesn't double-count a project that's
  mid-session, and the "reached at HH:MM" / "never" wording matches
  whether the target has already been crossed today.

### Start/stop a project directly from the dashboard, with automatic handoff
- **How to test**: click a project row's toggle (`+`) while idle (starts
  it); click the *other* project's toggle while the first was running
  (should stop the first, start the second, in one action); click the
  running project's own toggle (should just stop it).
- **Expected result**: verified via the stored `entries` arrays and
  `runningId` after each click — the handoff stamps both projects with the
  same timestamp and switches `runningId` in a single `commit()`.

### Handoff Undo toast
- **How to test**: trigger a handoff (see above) and check `#undoToast`
  became visible with the correct "Stopped `<name>` at `HH:MM`" text; then,
  in one synchronous script (see focus/timing caveats), click
  `#undoButton` and check both projects' `entries` and `runningId` were
  restored to their pre-handoff state and the toast hid again.
- **Expected result**: pre-handoff state fully restored on both projects,
  toast hidden.

### New project creation
- **How to test**: click the "+ New project" row, confirm it becomes an
  inline text input (focused), and try all three ways to finish: typing a
  name and clicking "Done", typing a name and pressing Enter, and pressing
  Escape (should discard without creating a project).
- **Expected result**: Done and Enter both create the named project;
  Escape creates nothing.

### Rename sheet
- **How to test**: tap the project name row, confirm the sheet raises with
  the current name pre-filled and the `+` button hidden underneath; test
  Save (button), Enter, and Escape (discard) on the rename input; and test
  Delete both with multiple projects present (should succeed, after
  confirm) and with only one project left.
- **Expected result**: rename commits via Save/Enter and is discarded on
  Escape. With only one project, `#deleteProject` is a genuinely `disabled`
  button (not just guarded in the handler) — a `.click()` on it shouldn't
  even reach `removeProject()` — and the footnote text should explain why.

### Dashboard Edit mode
- **How to test**: enter Edit mode and check the label/button text change,
  then test each of its three row actions:
  - **Drag to reorder**: simulate a pointer drag from a row's handle up
    past two other rows.
  - **Inline rename**: stub `window.prompt` and tap a row's name.
  - **Delete**: stub `window.confirm` and tap a row's `-` button.
- **Expected result**: the dragged row's new position is reflected
  immediately in both the DOM order and the persisted project order
  (which is also swipe-deck order), rename updates the name in place, and
  delete removes the row (guarded by the same last-project rule as above).

### Clear all (dashboard)
- **How to test**: seed entries in two projects, open the dashboard, stub
  `confirm`, and click "Clear all".
- **Expected result**: every project's `entries` is emptied and the
  running project (if any) stops.

### Legacy v1 → v2 migration
- **How to test**: clear `localStorage` and write only the old top-level
  v1 keys (`entries`, `estimateHours`, `granularityMinutes`, no `projects`
  key), then reload.
- **Expected result**: a single project named "Project 1" is created
  carrying over the old entries/estimate/granularity, and the legacy keys
  are left untouched in `localStorage` (as designed, so a downgrade would
  still find its data).
