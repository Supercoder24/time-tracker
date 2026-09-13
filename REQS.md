# Requirements — Time Tracker

A specification of what the app is and does, covering the original
single-project tracker, the multi-project (v2) rewrite, and every UI/UX
requirement layered on top of both. Written as a requirements reference,
not a change log — it describes the app as it should behave, not the order
in which pieces were built.

## 1. Platform and technical constraints

- Plain HTML, CSS, and JavaScript. No build step, no framework, no
  bundler, no backend or server. `index.html` is opened directly (including
  as a `file://` URL) and just works.
- All state lives in the browser's `localStorage`. Nothing is synced or
  sent anywhere; the app works fully offline.
- Primary target is a phone running mobile Safari/iOS, sized and tested
  against an **iPhone 13 mini (375 × 812 CSS px, device scale factor 3)**.
  The layout must also tolerate other viewport sizes reasonably, but the
  iPhone 13 mini is the design reference.
- The page declares `viewport-fit=cover` and uses CSS
  `env(safe-area-inset-*)` so content clears the notch, rounded corners,
  and home-indicator bar on real devices rather than sitting flush against
  them or hiding behind them.
- Dark mode only — there is no light theme.

## 2. Data model

- A **project** is `{ id, name, entries, estimateHours, granularityMinutes }`.
  - `entries` is a flat array of `"HH:MM"` strings. Even indices (0, 2, 4,
    …) are start times; odd indices are end times. An odd-length array
    means the last entry is a start time with no matching end yet — that
    project is "running."
  - `estimateHours` is a number, `0.1`–`20` in `0.1` steps.
  - `granularityMinutes` is one of `6` (tenth-hour), `30` (half-hour), or
    `60` (hour).
- The app holds a list of projects, which project is currently displayed
  (`activeIndex`), and which project (if any) is running (`runningId`).
- **At most one project may run at a time.** Starting a project while
  another is running stops the other one automatically (see §5.5).
- Persisted `localStorage` keys: `projects` (the array above), `activeIndex`,
  `runningId`.
- **Legacy migration**: if no `projects` key exists yet, the old
  single-project keys (`entries`, `estimateHours`, `granularityMinutes`) are
  read and migrated into one project named "Project 1." The old keys are
  left in place afterward (untouched, not deleted) so that reverting to an
  older version of the app would still find its data.
- State that fails to parse or is missing fields must not crash the app —
  malformed or partial project data is coerced into a valid shape (default
  name, empty entries, defaults for estimate/granularity) rather than
  thrown away or allowed to error.

## 3. Core time-tracking features (per project)

These apply to whichever project is currently active/displayed.

- **Clock in / clock out**: a single `+` button. Tapping it while idle
  starts the project (appends a start timestamp); tapping it while running
  stops it (appends an end timestamp). Timestamps are the actual current
  time, `HH:MM` (24-hour, zero-padded).
- **Running total**: displayed prominently (large type). Equals the sum of
  every start/end pair's duration, in hours, floored to one decimal place.
  If the project is currently running, the total includes elapsed time up
  to *now* and refreshes live (once per second) without a full re-render of
  the entry list.
- **Adjustable daily-hours estimate**: the estimate (default `7`) is shown
  as tappable text (e.g. "7h"). Tapping it swaps the number for an inline
  numeric input, pre-filled and focused/selected, using a numeric-friendly
  input mode so mobile keyboards show a number pad. Committing (blur or
  Enter) parses the value, rounds to the nearest `0.1`, clamps to
  `0.1`–`20`, and persists it. An invalid or empty value is discarded,
  leaving the prior estimate in place. The input must be wide enough to
  show a full value like `19.9` without clipping or scrolling.
  **The estimate is stored per project**, not globally: changing it on one
  project must leave every other project's estimate untouched, and each
  project shows its own value when switched to.
- **Projected finish time**: while running, shows the clock time at which
  today's accumulated total (already-completed sessions plus the current
  one) will reach the estimate target. If the target was already passed
  before this session started, the projection still resolves to a sensible
  clock time (not a negative or nonsensical value). Reads "never" while
  idle.
- **Next-mark projection**: while running, shows the next clock time at
  which the day's cumulative total will cross a boundary of the chosen
  granularity (tenth-hour / half-hour / hour), selectable via a dropdown
  next to the label. The dropdown's styling should read as part of the
  surrounding sentence (same size/weight/color as the adjacent text, not a
  visually distinct boxed control). Reads "never" while idle. The chosen
  granularity persists per project.
- **Editable entries**: tapping an entry's hour or minute opens a prompt to
  correct just that value, without disturbing the rest of the entry or any
  other entries.
- **Delete an entry**: each entry has its own delete control, confirmed
  before removing it.
- **Clear**: a `Clear` button (confirmed, and naming the active project in
  the confirmation) wipes every entry for the active project only — other
  projects are untouched.
- **Empty state**: when the active project has no entries, a "No Entries"
  message is shown in place of the list, centered both horizontally and
  vertically within the list area.
- **Entries displayed two-per-row**: each start time is paired with its
  matching end time, side by side, rather than one entry per row, so more
  history fits on screen at once. An in-progress (odd, unmatched) entry
  appears alone in the first column of its row. This pairing must fall out
  of entries' natural order (a start immediately followed by its end) —
  no separate bookkeeping of "pairs" in the data model or rendering logic.
- **Delete control appearance**: a small circular button with a plain dash
  character, centered exactly within the circle (not merely within its
  table cell/row) — both horizontally and vertically.
- **At least 6 entries must be visible on screen at once** (i.e. 3 rows of
  the two-column layout) on the iPhone 13 mini viewport, without scrolling,
  leaving the header and buttons at full, comfortable size.

## 4. Layout requirements

- The header (total, estimate, next-mark, `Clear`) stays fixed at the top
  of the screen. The `+` button stays fixed at the bottom. **Only the entry
  list scrolls** between them — scrolling the list must never move the
  header or `+`, and the header/`+` must never overlap or obscure list
  content (or vice versa).
- A consistent side gutter keeps all content (buttons, text, the list)
  clear of the screen edges — nothing should run flush edge-to-edge.
- Deliberate spacing separates the header from `Clear`, `Clear` from the
  entry list, and the entry list from `+`, so the layout doesn't feel
  cramped, while still leaving room for requirement §3's "6 entries
  visible" target.
- **Touch target size**: every interactive control must be comfortably
  tappable on a small phone — a target of roughly **44 × 44 px** is the
  floor, even where the control is deliberately small to look at (the deck
  dots, the pull-down grabber, the round row buttons). Where enlarging the
  visible shape would unbalance the design, the target is extended
  invisibly around it instead, without changing the layout. Extended
  targets must not overlap each other: adjacent controls may meet, but a
  tap must never be able to land on the wrong one. This is testable — the
  top edge, middle and bottom edge of each control must all hit that
  control, not a neighbour.
- **Where the floor cannot be met, priority decides.** The project bar
  stacks three tappable rows too closely for three 44 px targets, so the
  controls that are the *only* way to do their job win, and a control with
  another route to the same outcome yields:
  - the project name (rename/delete) and the deck dots (jump to project)
    keep full-height targets;
  - the deck dots may be **narrower** than 44 px horizontally, since
    spacing them that far apart reads as sparse;
  - the pull-down grabber takes a **short** target, because tapping it is
    only a shortcut — the pull-down gesture it hints at works from
    anywhere on the bar or header.
- Where the layout tightens on short screens, it gives back spacing, never
  tap-target size.
- **Scroll-position affordance**: soft highlight overlays fade in above and
  below the entry list only when there is more content to scroll to in that
  direction, and fade out at the true top/bottom. These overlays must
  render **in front of** the entry rows (never hidden behind row text or
  controls), and use a **linear gradient**, not a radial/elliptical one.
  The color should be light enough to read clearly against the dark list
  background without being blindingly bright.

## 5. Multi-project features

- The app supports any number of named **projects**, each with its own
  entries, estimate, and granularity (§2). Only one can be running at a
  time system-wide, not per project.
- **Project bar**: shows the active project's name (tappable — opens the
  rename/delete sheet, §5.7), a small indicator dot next to the name that
  is visible only when the active project is the one currently running,
  and a row of dots — one per project, in deck order — with the active
  project's dot highlighted. Tapping a dot jumps directly to that project.
  The bar is a **prominent piece of navigation, not a thin strip**: it
  should fill the space that would otherwise sit empty between the top of
  the screen and the running total, rather than leaving a dead margin
  there. Growing it must come out of that empty space — the total and
  everything below it should stay roughly where they are, not be pushed
  down the screen. The project name is set large enough to read at a
  glance, and the dots large enough to aim at (§4).
  The dashboard has an equivalent bar; because it is shorter, its heading
  carries extra spacing so that **both screens' totals sit at the same
  height** and nothing jumps as the dashboard slides over the page.
  The row of dots wraps to further lines rather than overflowing when a
  deck grows past what fits across the screen.
  On viewports too short to afford both a generous bar and §3's six visible
  entries, the bar tightens its spacing so the entry list keeps its rows —
  the entry count wins over the bar's breathing room.
- **Swipe left/right** anywhere on the project page (except directly on a
  button/input/select, other than `+`, which still allows a swipe to start
  through it) changes the active project. The deck loops: swiping past the
  last project wraps to the first, and vice versa. `+` is swipe-through
  because it is full-width and sits where a thumb rests; refusing to swipe
  from it would make most of the reachable area dead to the gesture.
  **A gesture either travels far enough to act, or it counts as a tap —
  there is no dead zone between the two.** A drag from `+` that never
  reaches the commit threshold still punches the clock, so a tap with a
  smudge of movement is never silently lost; only a gesture that actually
  changed project or opened the dashboard suppresses the tap underneath it,
  so one swipe can never both change project and punch the clock. Controls
  small enough to hit precisely (`Clear`, entry delete buttons, the
  estimate field, the dropdown) are **not** swipe-through — a drag starting
  on them does nothing.
- **Pull down** (from the project bar, header, or the entry list only when
  it's scrolled to the very top) opens the **dashboard**. **Pull up** from
  the dashboard (from its bar/header, or its own list only when scrolled to
  the top) closes it. Both are drag gestures with a minimum travel distance
  before they commit, and visually damped resistance while dragging.
- **Dashboard — aggregate stats**: a total across every project's sessions
  today (summed from actual session minutes, not by adding each project's
  already-rounded total, so nothing is double-counted), and a projected
  "reached at HH:MM" / "never" line against the estimate of whichever
  project is currently running (or, if none is running, the currently
  active project) — summing per-project estimates would not be meaningful,
  since each is a full day's target, not an additive quantity. Also shows
  which project (if any) is currently running.
- **Dashboard — project rows**: one row per project, showing its name
  (tap to jump to it and close the dashboard), its total hours, and a
  start/stop toggle that starts that project (triggering a handoff if
  another project is running) or stops it if it's the one already running.
  Starting or stopping from here leaves the dashboard open.
  The toggle **stays a `+` in both states** — it is one toggle, not two
  different actions — and marks the running row by taking the accent blue
  (with a gradient, matching the rest of the UI) rather than turning into a
  red minus. A red minus reads as "remove this entry/row," which is not
  what the control does; red is reserved for genuinely destructive actions
  (§6). The running row is additionally tinted and its leading dot lit, so
  it is identifiable without relying on the button alone.
- **Automatic handoff**: starting a project while a different one is
  running stops the running project and starts the new one in the same
  action, both stamped with the same timestamp, so no minute is unbilled
  or double-billed.
- **Handoff Undo**: immediately after a handoff, a toast appears naming the
  project that was stopped and the time, offering "Undo" for a limited
  window (a few seconds) before it dismisses itself. Undo restores both
  projects' entries and the running project to exactly their pre-handoff
  state.
- **New project creation**: a "+ New project" row in the dashboard becomes
  an inline name field when tapped. Confirming (a "Done" button or Enter)
  with a non-empty name creates the project; canceling (Escape) discards it
  without creating anything.
- **Rename/delete sheet**: tapping the project name (on the project page)
  raises a panel with the project's name in an editable field and
  Save/Delete actions. Save (button or Enter) commits a new name; Escape
  discards changes. Delete removes the project and its entries (confirmed
  first), stopping the clock first if that project was the one running.
  **At least one project must always exist.** Deleting the last remaining
  project is refused outright — it must not silently delete and substitute
  a fresh blank project in its place, which looks like a successful delete
  while discarding the data. When one project remains:
  - every delete control (the sheet's and each Edit-mode row's) is
    **disabled**, not merely blocked on click, and mutes itself rather than
    disappearing, so the action stays visible and explains itself;
  - the sheet's explanatory text changes to say why deletion is
    unavailable, and points at `Clear` as the way to empty the project
    instead;
  - the removal routine refuses independently of the controls, so the rule
    still holds if it is reached by any other path.
- **Dashboard Edit mode**: toggles the project rows into a reorderable
  form — a drag handle to reorder (dragging updates both the visual list
  and the persisted order immediately, and that order is also the swipe
  deck's order), a tap-to-rename affordance per row, and a delete control
  per row (governed by the same "at least one project" rule above). The
  drag begins **as soon as the handle is dragged**, with no press-and-hold
  delay — the handle exists precisely so the gesture is unambiguous. The
  new-project row is hidden while editing, and `Clear all` and `Close` are
  disabled until Edit is confirmed. After a reorder, **the project that was
  on screen stays on screen**, whatever position it ended up in; the view
  follows the project, not the index.
- **Clear all** (dashboard): wipes every project's entries in one action
  (confirmed first) and stops the clock if anything was running.

## 6. Visual design requirements

- A dark, "liquid glass" aesthetic throughout: translucent, blurred panels
  (the entry-list card, buttons, the rename sheet, the dashboard card) with
  soft drop shadows for a sense of depth, rather than flat opaque fills.
- System font stack (`-apple-system` and equivalents) so the app renders in
  San Francisco on real Apple devices, matching native-feeling type rather
  than a browser-default serif or generic sans-serif.
- The primary action (`+`) carries an accent-blue tint to distinguish it
  from secondary/neutral actions (`Clear`, dashboard buttons).
- **Colour carries meaning and must stay consistent.** Red marks
  *destructive* actions only — deleting an entry or a project. A control
  that merely toggles state (starting or stopping the clock) never turns
  red, however "stop"-like it is; it uses the accent instead. Accent blue
  marks the primary action or the live/selected thing. Applying red to a
  non-destructive control makes it read as "remove this," which
  misdescribes what it does.
- **An enabled control must never look disabled.** Muted, low-contrast
  treatment is reserved for controls that genuinely cannot be used right
  now; secondary actions are distinguished by weight and fill, not by
  looking greyed out. Conversely, a control that cannot act must look that
  way rather than failing silently when tapped.
- Buttons are large, rounded/pill-shaped, and give tactile press feedback
  (a subtle scale-down) when tapped.
- Form controls that must remain native (the granularity `<select>`) are
  reskinned to blend with the surrounding UI (matching font size/weight/
  color, a custom dropdown indicator) rather than showing the browser's
  default control chrome.
- Total/`Clear`/`+` are the visually dominant elements of the page — their
  type size should read as large and confident, not competing for space
  with secondary text (labels, hints, timestamps) which stay smaller and
  more muted in color.

## 7. Wording and in-app copy

- The unit of work is a **project**. That word is used everywhere in the
  interface and in the documentation — placeholders, prompts, confirmations,
  labels, hints. Other names for the same thing ("contract," "job," and so
  on) must not appear, whatever the example data happens to be called.
- **Explanatory captions must describe what the app actually does.** A hint
  that overstates or misstates the behaviour (describing a press-and-hold
  when a plain drag is what works, or describing an action that is
  currently unavailable) is worse than no hint, and must be corrected or
  removed rather than left to mislead. Where a rule changes what is
  possible, the copy changes with it.
- Captions earn their place: keep the ones that explain something genuinely
  undiscoverable, and drop the ones that narrate what the controls already
  make obvious.
- Any wording that appears both in the markup and in code has a single
  source — the code reads it from the markup rather than restating it — so
  editing it in one place cannot leave the other stale.

## 8. Code and documentation conventions

- Match the style of the original single-project version: plain functions,
  two-space indent, no semicolon-heavy or framework-flavoured idioms, and
  no tooling that would require a build step.
- **Comments are concise and explain "why," not "what."** A comment earns
  its place by capturing something the code cannot say for itself — a
  non-obvious ordering constraint, a workaround, the reason a value is what
  it is. Restating the adjacent line in prose does not.
- **Naming is consistent, concise, and explanatory** across variables and
  functions. Related operations share a shape (`startX`/`moveX`/`endX`,
  `renderX`/`updateX`), a word means one thing throughout, units are
  explicit where ambiguous, and an identifier that has drifted from what it
  now holds gets renamed rather than left misleading.
- `README.md` documents the app at the same level of detail as the code
  it describes, without narrating the history of how it got there.

## 9. Known limitations and non-goals

- **Single calendar day.** All arithmetic treats timestamps as minutes
  since midnight within one day, so a session spanning midnight (in at
  23:00, out at 01:00) yields a negative duration. This was true of the
  original version and is accepted, not fixed.
- **No sync.** Data is local to one browser on one device. There is no
  account, no export, and no backup beyond whatever the browser keeps.
- **No history beyond today.** The app tracks the current day's entries per
  project; it does not archive or report across days.
