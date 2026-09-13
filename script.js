// Time Tracker v2 — multiple projects sharing one clock.
//
// Each project owns its entries, estimate and next-mark granularity. At most
// one project runs (holds an odd number of entries) at a time, so no minute is
// ever billed to two projects.

const $ = (id) => document.getElementById(id)

const GRANULARITY_OPTIONS = [6, 30, 60]
const DEFAULT_ESTIMATE = 7
const DEFAULT_GRANULARITY = 6
const UNDO_MS = 5000  // how long the handoff toast offers to take it back

// Gesture thresholds, in CSS pixels.
const AXIS_LOCK = 8   // travel before a drag commits to an axis
const SWIPE_MIN = 45  // horizontal travel that changes project
const PULL_MIN = 60   // vertical travel that opens or closes the dashboard

// Taken from the markup so index.html stays the one place it is worded.
const DEFAULT_RENAME_HINT = $('renameHint').textContent.trim()

// ---- State ----

let projects = []      // [{ id, name, entries, estimateHours, granularityMinutes }]
let activeIndex = 0    // project the page is showing
let runningId = null   // project holding the clock, or null when idle
let ticker             // 1s interval, alive only while something runs
let pendingUndo = null // entry snapshots behind the handoff toast
let naming = false     // the "+ New project" row is currently a name field

const activeProject = () => projects[activeIndex]
const projectById = (id) => projects.find((p) => p.id === id) || null
const isRunning = (p) => p.entries.length % 2 === 1
const clampIndex = (i) => Math.min(projects.length - 1, Math.max(0, i || 0))
const isEditing = () => $('dashboard').classList.contains('editing')
const isSheetOpen = () => $('page').classList.contains('sheet-open')

function newId() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// ---- Persistence and first-run migration ----

function clampEstimate(hours) {
  if (isNaN(hours)) return DEFAULT_ESTIMATE
  hours = Math.round(hours * 10) / 10 // snap to 0.1hr increments
  return Math.min(20, Math.max(0.1, hours))
}

// Coerces whatever came out of localStorage into a project the rest of the
// code can rely on, so half-written or hand-edited data can't crash rendering.
function normalizeProject(raw, index) {
  const p = raw && typeof raw === 'object' ? raw : {}
  const granularity = parseInt(p.granularityMinutes)
  return {
    id: typeof p.id === 'string' && p.id ? p.id : newId(),
    name: typeof p.name === 'string' && p.name.trim() ? p.name : 'Project ' + (index + 1),
    entries: Array.isArray(p.entries) ? p.entries.filter((e) => typeof e === 'string') : [],
    estimateHours: clampEstimate(parseFloat(p.estimateHours)),
    granularityMinutes: GRANULARITY_OPTIONS.includes(granularity) ? granularity : DEFAULT_GRANULARITY
  }
}

// v1's three top-level keys become project 0. The old keys are left in place:
// they cost nothing and mean a downgrade still finds its data.
function migrateLegacyProject() {
  let entries = []
  try {
    const old = JSON.parse(localStorage.getItem('entries'))
    if (Array.isArray(old)) entries = old
  } catch (e) { /* unreadable legacy data — start empty */ }
  return normalizeProject({
    name: 'Project 1',
    entries: entries,
    estimateHours: parseFloat(localStorage.getItem('estimateHours')),
    granularityMinutes: parseInt(localStorage.getItem('granularityMinutes'))
  }, 0)
}

// Entry parity is the real record of who holds the clock; runningId is only a
// stored shortcut. Where the two disagree, believe the entries.
function reconcileRunning(storedId) {
  const odd = projects.filter(isRunning)
  if (!odd.length) return null
  return (odd.find((p) => p.id === storedId) || odd[0]).id
}

function loadState() {
  let stored = null
  try { stored = JSON.parse(localStorage.getItem('projects')) } catch (e) { /* migrate instead */ }

  projects = Array.isArray(stored) && stored.length
    ? stored.map(normalizeProject)
    : [migrateLegacyProject()]

  runningId = reconcileRunning(localStorage.getItem('runningId'))

  // Restored on launch: the last viewed project, else the running one.
  const savedIndex = parseInt(localStorage.getItem('activeIndex'))
  if (!isNaN(savedIndex)) {
    activeIndex = clampIndex(savedIndex)
  } else {
    const runIndex = projects.findIndex((p) => p.id === runningId)
    activeIndex = runIndex >= 0 ? runIndex : 0
  }
}

function saveState() {
  localStorage.setItem('projects', JSON.stringify(projects))
  localStorage.setItem('activeIndex', activeIndex)
  localStorage.setItem('runningId', runningId == null ? '' : runningId)
}

// The single commit point: persist, keep the ticker in step with whether
// anything is running, and repaint.
function commit() {
  runningId = reconcileRunning(runningId)
  saveState()
  if (runningId && !ticker) {
    ticker = setInterval(tick, 1000)
  } else if (!runningId && ticker) {
    clearInterval(ticker)
    ticker = undefined
  }
  render()
}

function tick() {
  renderStats()
  if (!$('dashboard').hidden) renderDashboardStats()
}

// ---- Time helpers ----

function dateToEntry(date) {
  return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0')
}

const nowEntry = () => dateToEntry(new Date())
const toMinutes = (entry) => parseInt(entry.substring(0, 2)) * 60 + parseInt(entry.substring(3, 5))
const nowMinutes = () => toMinutes(nowEntry())

// Minutes-since-midnight to a 12-hour "H:MM AM/PM" string. Normalizing first
// means a negative or past-midnight input still yields a sensible clock time.
function formatClock(mins) {
  const normalized = ((mins % 1440) + 1440) % 1440
  const hours = Math.floor(normalized / 60)
  return (hours % 12 || 12) + ':' +
    (normalized % 60).toString().padStart(2, '0') +
    (hours < 12 ? ' AM' : ' PM')
}

// Walks entries two at a time. `total` counts an in-progress session up to
// now; `subtotal` counts only sessions that have both ends.
function projectMinutes(p) {
  let total = 0
  let subtotal = 0
  for (let i = 0; i < p.entries.length; i += 2) {
    const start = toMinutes(p.entries[i])
    const closed = i + 1 < p.entries.length
    const diff = (closed ? toMinutes(p.entries[i + 1]) : nowMinutes()) - start
    total += diff
    if (closed) subtotal += diff
  }
  return { total, subtotal }
}

// The epsilon absorbs float error, so an exact 4.6 doesn't floor to 4.5.
function floorTenth(hours) {
  return Math.floor((hours + 0.0001) * 10) / 10
}

const projectHours = (p) => floorTenth(projectMinutes(p).total / 60)

// ---- Project page ----

function render() {
  renderProjectBar()
  renderEntries()
  renderStats()
  $('estimateValue').innerText = activeProject().estimateHours
  $('granularitySelect').value = activeProject().granularityMinutes
  if (!$('dashboard').hidden) renderDashboard()
  updateDeleteControls()
}

function renderProjectBar() {
  const p = activeProject()
  $('projectName').innerText = p.name
  $('runningDot').hidden = p.id !== runningId

  const dots = $('projectDots')
  dots.innerHTML = ''
  projects.forEach((project, i) => {
    const dot = document.createElement('div')
    dot.className = 'deckDot' + (i === activeIndex ? ' active' : '')
    dot.title = project.name
    dot.onclick = () => goToProject(i)
    dots.appendChild(dot)
  })
}

function renderEntries() {
  const entries = activeProject().entries
  $('emptyState').hidden = entries.length !== 0

  const list = $('list')
  list.innerHTML = ''
  for (let i = 0; i < entries.length; i++) {
    const cell = document.createElement('div')
    cell.className = 'entryCell'

    const time = document.createElement('span')
    time.className = 'entryTime'
    const hours = document.createElement('span')
    hours.innerText = entries[i].substring(0, 2)
    hours.onclick = () => editEntryHours(i)
    const colon = document.createElement('span')
    colon.innerText = entries[i].charAt(2)
    const mins = document.createElement('span')
    mins.innerText = entries[i].substring(3, 5)
    mins.onclick = () => editEntryMinutes(i)
    time.append(hours, colon, mins)
    cell.appendChild(time)

    const del = document.createElement('button')
    del.innerText = '-'
    del.onclick = () => {
      if (!confirm('Are you sure?')) return
      activeProject().entries = entries.filter((e, j) => j != i)
      commit()
    }
    cell.appendChild(del)
    list.appendChild(cell)
  }
  updateScrollShadows()
}

// The live numbers. Runs every second while a project is going, so it touches
// text only — no DOM rebuilding.
function renderStats() {
  const p = activeProject()
  const { total, subtotal } = projectMinutes(p)
  $('total').innerText = floorTenth(total / 60)

  if (!isRunning(p)) {
    $('endTime').innerText = 'never'
    $('nextMark').innerText = 'never'
    return
  }

  const startMins = toMinutes(p.entries[p.entries.length - 1])
  const nowMins = nowMinutes()

  // When this session will carry the day to the estimate. A negative remainder
  // (earlier sessions already passed it) still formats as a real clock time.
  $('endTime').innerText = formatClock(startMins + (p.estimateHours * 60 - subtotal))

  // The next mark follows this project's cumulative total, not just the
  // current session, or it lands wrong whenever an earlier session closed
  // today. The doubled modulo keeps the offset positive.
  const step = p.granularityMinutes
  const soFar = subtotal + (nowMins - startMins)
  const remainder = ((soFar % step) + step) % step
  $('nextMark').innerText = formatClock(nowMins + (step - remainder) % step)
}

// Fades each scroll shadow in only when there is more to scroll that way.
function updateScrollShadows() {
  const wrap = $('listWrap')
  const atTop = wrap.scrollTop <= 1
  const atBottom = wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 1
  wrap.classList.toggle('show-top-shadow', !atTop)
  wrap.classList.toggle('show-bottom-shadow', !atBottom)
}

$('listWrap').addEventListener('scroll', updateScrollShadows)

// ---- The clock ----

// Both the + button and the dashboard row buttons land here: stop this project,
// start it, or hand the clock over from whichever project was running.
function toggleClock(project) {
  hideUndo()
  const stamp = nowEntry()

  if (project.id === runningId) {
    project.entries.push(stamp)
    runningId = null
  } else if (runningId) {
    const from = projectById(runningId)
    // Snapshot both sides before touching either, so Undo is exact.
    pendingUndo = {
      fromId: from.id,
      fromEntries: from.entries.slice(),
      toId: project.id,
      toEntries: project.entries.slice()
    }
    from.entries.push(stamp)
    project.entries.push(stamp)
    runningId = project.id
    showUndo(from.name, stamp)
  } else {
    project.entries.push(stamp)
    runningId = project.id
  }
  commit()
}

function showUndo(fromName, stamp) {
  const text = $('undoText')
  const name = document.createElement('b')
  name.innerText = fromName
  text.innerHTML = ''
  text.append('Stopped ', name, ' at ' + stamp)
  $('undoToast').hidden = false
  pendingUndo.timer = setTimeout(hideUndo, UNDO_MS)
}

function hideUndo() {
  if (pendingUndo && pendingUndo.timer) clearTimeout(pendingUndo.timer)
  pendingUndo = null
  $('undoToast').hidden = true
}

// Puts both entry arrays back as they were, so the stopped project reopens and
// the started one's entry is discarded.
function undoHandoff() {
  if (!pendingUndo) return
  const from = projectById(pendingUndo.fromId)
  const to = projectById(pendingUndo.toId)
  if (from) from.entries = pendingUndo.fromEntries
  if (to) to.entries = pendingUndo.toEntries
  runningId = from ? from.id : null
  hideUndo()
  commit()
}

$('add').addEventListener('click', () => toggleClock(activeProject()))
$('undoButton').addEventListener('click', undoHandoff)

// ---- Entry editing ----

function editEntryHours(i) {
  const entries = activeProject().entries
  let hours = prompt('New hrs? (was ' + entries[i].substring(0, 2) + ')')
  if (!hours) return
  hours = Math.floor(parseInt(hours)).toString().padStart(2, '0')
  hours = hours.length > 2 ? hours.substring(0, 2) : hours
  if (hours == 'Na' || hours > 23) return
  entries[i] = hours + entries[i].substring(2, 5)
  commit()
}

function editEntryMinutes(i) {
  const entries = activeProject().entries
  let mins = prompt('New mins? (was ' + entries[i].substring(3, 5) + ')')
  if (!mins) return
  mins = Math.floor(parseInt(mins)).toString().padStart(2, '0')
  mins = mins.length > 2 ? mins.substring(0, 2) : mins
  if (mins == 'Na' || mins > 60) return
  entries[i] = entries[i].substring(0, 3) + mins
  commit()
}

$('clear').addEventListener('click', () => {
  if (!confirm('Are you sure you want to clear ' + activeProject().name + '?')) return
  activeProject().entries = []
  hideUndo()
  commit()
})

// ---- Estimate and granularity (per project) ----

// Tapping the "7h" label swaps the number for an input; the "h" stays put so
// it keeps reading "[input]h" while editing.
function editEstimate() {
  const input = $('estimateInput')
  if (input.style.display === 'inline-block') return // already editing
  $('estimateValue').style.display = 'none'
  input.value = activeProject().estimateHours
  input.style.display = 'inline-block'
  input.focus()
  input.select()
}

function finishEstimateEdit() {
  const input = $('estimateInput')
  const value = parseFloat(input.value)
  if (!isNaN(value)) {
    activeProject().estimateHours = clampEstimate(value)
    commit()
  }
  input.style.display = 'none'
  $('estimateValue').style.display = 'inline'
}

$('estimateLabel').addEventListener('click', editEstimate)
$('estimateLabel').addEventListener('keydown', (e) => {
  if (e.target !== e.currentTarget) return // the input handles its own keys
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    editEstimate()
  }
})
$('estimateInput').addEventListener('click', (e) => e.stopPropagation()) // don't re-enter editEstimate
$('estimateInput').addEventListener('blur', finishEstimateEdit)
$('estimateInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') e.target.blur() // commit on Enter, same as blur
})

$('granularitySelect').addEventListener('change', (e) => {
  const mins = parseInt(e.target.value)
  if (!GRANULARITY_OPTIONS.includes(mins)) return
  activeProject().granularityMinutes = mins
  commit()
})

// ---- Deck navigation ----

function goToProject(index, slideFrom) {
  if (index === activeIndex) return
  hideUndo()
  activeIndex = clampIndex(index)
  saveState()
  render()
  if (slideFrom) slideIn(slideFrom)
}

// The deck loops, so the last project is one swipe from the first.
function stepProject(delta) {
  if (projects.length < 2) return snapBack()
  const n = projects.length
  goToProject(((activeIndex + delta) % n + n) % n, delta > 0 ? 1 : -1)
}

// Brings the incoming page in from `dir` (1 = from the right); commitSwipe()
// already ran the outgoing half.
function slideIn(dir) {
  const page = $('page')
  page.style.transition = 'none'
  page.style.transform = 'translateX(' + (dir * 100) + '%)'
  void page.offsetWidth // apply the jump before transitioning back
  page.style.transition = ''
  page.style.transform = ''
}

function snapBack() {
  $('page').style.transition = ''
  $('page').style.transform = ''
}

function commitSwipe(delta) {
  if (projects.length < 2) return
  const page = $('page')
  page.style.transition = ''
  page.style.transform = 'translateX(' + (delta > 0 ? -100 : 100) + '%)'
  setTimeout(() => stepProject(delta), 180)
}

// ---- Gestures: swipe between projects, pull down for the dashboard ----

let gesture = null
let swallowTap = false  // set when a gesture acted, to cancel the tap under it
let swallowTapTimer

// Controls a finger lands on rather than beside. A swipe may start here; if it
// never travels far enough to act, the tap still lands (see gestureEnd).
const SWIPE_THROUGH = '#add'

function gestureStart(e, opts) {
  const control = e.target.closest('button, input, select, textarea')
  if (control && !control.matches(SWIPE_THROUGH)) return
  if (e.button != null && e.button !== 0) return
  if (isSheetOpen()) return
  gesture = {
    x0: e.clientX,
    y0: e.clientY,
    axis: null,
    opts: opts,
    id: e.pointerId,
    captured: false,
    onControl: !!control
  }
}

function gestureMove(e) {
  if (!gesture) return
  const dx = e.clientX - gesture.x0
  const dy = e.clientY - gesture.y0

  // Lock to whichever axis moved further first, so a diagonal drag can't do
  // two things at once.
  if (!gesture.axis) {
    if (Math.abs(dx) < AXIS_LOCK && Math.abs(dy) < AXIS_LOCK) return
    gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    if (gesture.axis === 'y' && !gesture.opts.canPull(gesture)) {
      gesture = null
      return
    }
    // Capture only now: capturing on pointerdown would redirect the following
    // click to the capture target and break every tap handler inside it.
    try {
      gesture.opts.el.setPointerCapture(gesture.id)
      gesture.captured = true
    } catch (err) { /* capture is a nicety, not a requirement */ }
    $('page').classList.add('swiping')
  }

  const el = gesture.opts.el
  el.style.transition = 'none'
  if (gesture.axis === 'x') {
    el.style.transform = gesture.opts.horizontal ? 'translateX(' + dx + 'px)' : ''
  } else {
    // Damped to 40% so the pull reads as resistance, not free movement.
    const travel = gesture.opts.pullDown ? Math.max(0, dy) : Math.min(0, dy)
    el.style.transform = 'translateY(' + travel * 0.4 + 'px)'
  }
}

function gestureEnd(e) {
  if (!gesture) return
  const g = gesture
  gesture = null
  $('page').classList.remove('swiping')
  if (!g.axis) return

  const dx = e.clientX - g.x0
  const dy = e.clientY - g.y0
  const el = g.opts.el
  if (g.captured) {
    try { el.releasePointerCapture(g.id) } catch (err) { /* already released */ }
  }
  el.style.transition = ''
  el.style.transform = ''

  // A gesture either travels far enough to act or counts as a tap — no dead
  // zone between, so a short drag on the + still punches the clock.
  let acted = false
  if (g.axis === 'x' && g.opts.horizontal && Math.abs(dx) >= SWIPE_MIN) {
    commitSwipe(dx < 0 ? 1 : -1)
    acted = true
  } else if (g.axis === 'y') {
    if (g.opts.pullDown && dy >= PULL_MIN) { openDashboard(); acted = true }
    else if (!g.opts.pullDown && dy <= -PULL_MIN) { closeDashboard(); acted = true }
  }

  // Otherwise one swipe would both change project and punch the clock. The
  // timeout matters because a touch drag often produces no click at all.
  if (acted && g.onControl) {
    swallowTap = true
    clearTimeout(swallowTapTimer)
    swallowTapTimer = setTimeout(() => { swallowTap = false }, 400)
  }
}

// Capture phase, so this beats the control's own handler whatever the order.
document.addEventListener('click', (e) => {
  if (!swallowTap) return
  swallowTap = false
  clearTimeout(swallowTapTimer)
  e.preventDefault()
  e.stopPropagation()
}, true)

// The pull-down is always available from the strip and header, and from the
// entry list only once it is scrolled to the top.
function canPullFromPage(g) {
  const wrap = $('listWrap')
  if (isSheetOpen()) return false
  return !wrap.contains(document.elementFromPoint(g.x0, g.y0)) || wrap.scrollTop <= 0
}

function canPullFromDashboard(g) {
  const card = $('dashCard')
  if (isEditing()) return false
  return !card.contains(document.elementFromPoint(g.x0, g.y0)) || card.scrollTop <= 0
}

const pageGestures = { el: null, horizontal: true, pullDown: true, canPull: canPullFromPage }
const dashboardGestures = { el: null, horizontal: false, pullDown: false, canPull: canPullFromDashboard }

function bindGestures(el, opts) {
  opts.el = el
  el.addEventListener('pointerdown', (e) => {
    swallowTap = false // never carry suppression into a fresh press
    clearTimeout(swallowTapTimer)
    gestureStart(e, opts)
  })
  el.addEventListener('pointermove', gestureMove)
  el.addEventListener('pointerup', gestureEnd)
  el.addEventListener('pointercancel', () => {
    gesture = null
    el.style.transform = ''
    $('page').classList.remove('swiping')
  })
}

bindGestures($('page'), pageGestures)
bindGestures($('dashboard'), dashboardGestures)

$('grabber').addEventListener('click', openDashboard)
$('dashGrabber').addEventListener('click', closeDashboard)

// ---- Rename sheet and deletion ----

function openRenameSheet() {
  $('renameInput').value = activeProject().name
  $('renameSheet').hidden = false
  $('add').hidden = true
  $('page').classList.add('sheet-open')
  updateDeleteControls()
  $('renameInput').focus()
  $('renameInput').select()
}

function closeRenameSheet() {
  $('renameSheet').hidden = true
  $('add').hidden = false
  $('page').classList.remove('sheet-open')
}

$('projectNameRow').addEventListener('click', openRenameSheet)

$('saveProject').addEventListener('click', () => {
  const name = $('renameInput').value.trim()
  if (name) activeProject().name = name
  closeRenameSheet()
  commit()
})

$('renameInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('saveProject').click()
  if (e.key === 'Escape') closeRenameSheet()
})

$('deleteProject').addEventListener('click', () => {
  closeRenameSheet()
  removeProject(activeIndex)
})

// The deck must always hold at least one project.
const canDeleteProject = () => projects.length > 1

// Deleting the project that holds the clock stops it.
function removeProject(index) {
  if (!canDeleteProject()) {
    alert('This is your only project, so it can\'t be deleted.\n\nUse Clear to empty it instead, or add another project first.')
    return
  }
  const p = projects[index]
  if (!confirm('Delete "' + p.name + '" and its entries?')) return
  if (p.id === runningId) runningId = null
  hideUndo()
  projects.splice(index, 1)
  activeIndex = clampIndex(activeIndex)
  commit()
}

// Never offer a delete control that cannot do anything; the sheet's footnote
// has to say something true too.
function updateDeleteControls() {
  const allowed = canDeleteProject()
  const reason = allowed ? '' : 'Your only project can\'t be deleted'
  $('deleteProject').disabled = !allowed
  $('deleteProject').title = reason
  $('renameHint').innerText = allowed
    ? DEFAULT_RENAME_HINT
    : 'This is your only project, so it can\'t be deleted. Use Clear to empty it, or add another project first.'
  document.querySelectorAll('.dashDelete').forEach((button) => {
    button.disabled = !allowed
    button.title = reason
  })
}

// ---- Dashboard ----

function openDashboard() {
  if (isSheetOpen()) return
  hideUndo()
  $('dashboard').hidden = false
  renderDashboard()
  void $('dashboard').offsetWidth // apply translateY(-100%) before the class flips
  $('dashboard').classList.add('open')
}

function closeDashboard() {
  exitEditMode()
  $('dashboard').classList.remove('open')
  // Held in the tree until the slide-up ends, then removed so it can't swallow
  // taps meant for the project page.
  setTimeout(() => {
    if (!$('dashboard').classList.contains('open')) $('dashboard').hidden = true
  }, 260)
}

$('dashClose').addEventListener('click', closeDashboard)

// Every session from every project in time order — needed to answer when the
// day crossed the target, which no single project can answer alone.
function allSessions() {
  const sessions = []
  const now = nowMinutes()
  for (const p of projects) {
    for (let i = 0; i < p.entries.length; i += 2) {
      const start = toMinutes(p.entries[i])
      const end = i + 1 < p.entries.length ? toMinutes(p.entries[i + 1]) : now
      if (end > start) sessions.push({ start, end })
    }
  }
  return sessions.sort((a, b) => a.start - b.start)
}

// The day's target is the estimate of whichever project you're racing. Summing
// per-project estimates would be meaningless — they are all workday lengths.
function dashboardTargetHours() {
  return ((runningId && projectById(runningId)) || activeProject()).estimateHours
}

function renderDashboardStats() {
  $('dashLabel').innerText = isEditing() ? 'Editing · drag to reorder' : 'All projects · today'

  const sessions = allSessions()
  const totalMins = sessions.reduce((sum, s) => sum + (s.end - s.start), 0)
  $('dashTotal').innerText = floorTenth(totalMins / 60)

  const targetHours = dashboardTargetHours()
  const target = targetHours * 60

  // Replay the day in order to find the minute the running sum hit the target.
  let elapsed = 0
  let crossing = null
  for (const s of sessions) {
    const span = s.end - s.start
    if (elapsed + span >= target) { crossing = s.start + (target - elapsed); break }
    elapsed += span
  }

  if (isEditing()) {
    $('dashEstimate').innerText = 'Order sets the swipe deck'
  } else if (crossing != null) {
    $('dashEstimate').innerText = targetHours + 'h reached at ' + formatClock(crossing)
  } else if (runningId) {
    $('dashEstimate').innerText = targetHours + 'h: ' + formatClock(nowMinutes() + (target - totalMins))
  } else {
    $('dashEstimate').innerText = targetHours + 'h: never'
  }

  // Rows are only rebuilt on state changes, so tick their hours in place.
  document.querySelectorAll('#dashList .dashRow[data-id]').forEach((row) => {
    const p = projectById(row.dataset.id)
    const cell = row.querySelector('.dashHours')
    if (p && cell) cell.innerText = projectHours(p)
  })

  const running = runningId ? projectById(runningId) : null
  const name = document.createElement('span')
  name.innerText = running ? running.name : 'nothing'
  if (!running) name.className = 'idle'
  $('dashRunning').innerHTML = 'Running: '
  $('dashRunning').appendChild(name)
}

function renderDashboard() {
  renderDashboardStats()
  if (isEditing()) renderEditRows()
  else renderProjectRows()
  updateDeleteControls()
}

function renderProjectRows() {
  const list = $('dashList')
  list.innerHTML = ''

  projects.forEach((p) => {
    const row = document.createElement('div')
    row.className = 'dashRow' + (p.id === runningId ? ' running' : '') + (naming ? ' dimmed' : '')
    row.dataset.id = p.id

    const dot = document.createElement('div')
    dot.className = 'dashDot'

    const name = document.createElement('div')
    name.className = 'dashName'
    name.innerText = p.name
    name.onclick = () => {
      goToProject(projects.indexOf(p))
      closeDashboard()
    }

    const hours = document.createElement('div')
    hours.className = 'dashHours'
    hours.innerText = projectHours(p)

    // Starts this project, stopping whatever was running; on the running row
    // the same button stops the clock. The dashboard stays open either way.
    const toggle = document.createElement('button')
    toggle.className = 'dashToggle' + (p.id === runningId ? ' running' : '')
    toggle.innerText = '+'
    toggle.title = (p.id === runningId ? 'Stop ' : 'Start ') + p.name
    toggle.onclick = () => toggleClock(p)

    row.append(dot, name, hours, toggle)
    list.appendChild(row)
  })

  list.appendChild(naming ? buildNamingRow() : buildNewProjectRow())
}

function buildNewProjectRow() {
  const row = document.createElement('div')
  row.className = 'dashRow new'
  const spacer = document.createElement('div')
  spacer.className = 'dashDot'
  const label = document.createElement('div')
  label.className = 'dashName'
  label.innerText = '+ New project'
  row.append(spacer, label)
  row.onclick = startNaming
  return row
}

// The row becomes the name field in place — the same tap-to-edit pattern as
// the estimate on the project page.
function buildNamingRow() {
  const row = document.createElement('div')
  row.className = 'dashRow naming'

  const input = document.createElement('input')
  input.id = 'newProjectInput'
  input.type = 'text'
  input.placeholder = 'Project name'
  input.autocomplete = 'off'
  input.onkeydown = (e) => {
    if (e.key === 'Enter') finishNaming()
    if (e.key === 'Escape') cancelNaming()
  }

  const done = document.createElement('button')
  done.id = 'newProjectDone'
  done.innerText = 'Done'
  done.onclick = finishNaming

  row.append(input, done)
  return row
}

function startNaming() {
  naming = true
  renderProjectRows()
  $('newProjectInput').focus()
}

function cancelNaming() {
  naming = false
  renderProjectRows()
}

function finishNaming() {
  const name = $('newProjectInput').value.trim()
  naming = false
  if (name) projects.push(normalizeProject({ name: name }, projects.length))
  commit()
}

$('dashClearAll').addEventListener('click', () => {
  if (!confirm('Clear every entry in all ' + projects.length + ' projects?')) return
  projects.forEach((p) => { p.entries = [] })
  runningId = null
  hideUndo()
  commit()
})

// ---- Dashboard edit mode ----

function enterEditMode() {
  naming = false
  $('dashboard').classList.add('editing')
  $('dashEdit').innerText = 'Done'
  renderDashboard()
}

function exitEditMode() {
  if (!isEditing()) return
  $('dashboard').classList.remove('editing')
  $('dashEdit').innerText = 'Edit'
  renderDashboard()
}

$('dashEdit').addEventListener('click', () => {
  if (isEditing()) exitEditMode()
  else enterEditMode()
})

// Edit mode swaps each row's start button for a drag handle and a delete
// button, and drops the new-project row. List order is deck order.
function renderEditRows() {
  const list = $('dashList')
  list.innerHTML = ''

  projects.forEach((p) => {
    const row = document.createElement('div')
    row.className = 'dashRow'
    row.dataset.id = p.id

    const handle = document.createElement('div')
    handle.className = 'dragHandle'
    for (let bar = 0; bar < 3; bar++) handle.appendChild(document.createElement('i'))
    handle.addEventListener('pointerdown', (e) => startReorder(e, row))

    const name = document.createElement('div')
    name.className = 'dashName'
    name.innerText = p.name
    name.onclick = () => renameInPlace(p)

    const del = document.createElement('button')
    del.className = 'dashDelete'
    del.innerText = '–'
    del.onclick = () => removeProject(projects.indexOf(p))

    row.append(handle, name, del)
    list.appendChild(row)
  })

  const hint = document.createElement('div')
  hint.className = 'dashHint'
  hint.innerText = 'Drag a handle to reorder. Tap a name to rename it.'
  list.appendChild(hint)
}

function renameInPlace(p) {
  const name = prompt('Rename project', p.name)
  if (name == null) return
  if (name.trim()) p.name = name.trim()
  commit()
}

// ---- Drag to reorder ----

let reorder = null

// Lifts the row under the finger. `projects` is reordered as the row passes
// each neighbour, so what you see is already the order you'll get.
function startReorder(e, row) {
  if (e.button != null && e.button !== 0) return
  e.preventDefault()
  const index = projects.findIndex((p) => p.id === row.dataset.id)
  reorder = {
    row: row,
    to: index,
    grabOffset: e.clientY - row.getBoundingClientRect().top,
    activeId: activeProject().id
  }
  row.classList.add('lifted')
  window.addEventListener('pointermove', moveReorder)
  window.addEventListener('pointerup', endReorder)
}

function moveReorder(e) {
  if (!reorder) return
  const list = $('dashList')
  const rows = [...list.querySelectorAll('.dashRow')]
  const height = reorder.row.offsetHeight || 1
  // Where the finger wants the row's top edge, in list coordinates.
  const desiredTop = e.clientY - reorder.grabOffset - list.getBoundingClientRect().top
  const target = Math.max(0, Math.min(projects.length - 1, Math.round(desiredTop / height)))

  if (target !== reorder.to) {
    const [moved] = projects.splice(reorder.to, 1)
    projects.splice(target, 0, moved)
    reorder.to = target
    const others = rows.filter((r) => r !== reorder.row)
    list.insertBefore(reorder.row, others[target] || list.querySelector('.dashHint'))
  }
  // Recomputed after any re-insert, so the row stays under the finger.
  reorder.row.style.transform = 'translateY(' + (desiredTop - reorder.row.offsetTop) + 'px)'
}

function endReorder() {
  if (!reorder) return
  const activeId = reorder.activeId
  reorder.row.classList.remove('lifted')
  reorder.row.style.transform = ''
  reorder = null
  window.removeEventListener('pointermove', moveReorder)
  window.removeEventListener('pointerup', endReorder)
  // The project on screen must stay on screen, whatever index it ended up at.
  activeIndex = clampIndex(projects.findIndex((p) => p.id === activeId))
  commit()
}

// ---- Boot ----

loadState()
commit()
