// Element IDs: Add, none, list, total, history

let entries = []
let interval;

// Daily-hours estimate used for the projected finish time, adjustable
// 0.1-20 in 0.1 steps and persisted separately from `entries`.
let estimateHours = loadEstimateHours()

// Granularity (in minutes) for the "next mark" display: tenth-hour (6),
// half-hour (30), or hour (60). Persisted separately from `entries`.
const GRANULARITY_OPTIONS = [6, 30, 60]
let granularityMins = loadGranularity()

getEntries()
showEstimateLabel()
showGranularitySelect()

function setEntries(newEntries) {
  entries = newEntries
  localStorage.setItem('entries', JSON.stringify(newEntries))
  showEntries()
  calcTotal()
  if (entries.length % 2 == 0) {
    if (interval) {
      clearInterval(interval)
      interval = undefined;
    }
  } else {
    if (!interval) {
      interval = setInterval(checkTime, 1000)
    }
  }
}

function getEntries(date) {
  let oldEntries = localStorage.getItem('entries')
  if (oldEntries) {
    setEntries(JSON.parse(oldEntries))
  } else {
    setEntries([])
  }
}

function dateToEntry(now) {
  return (now.getHours()).toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0")
}

function addEntry() {
  let newEntry = dateToEntry(new Date())
  setEntries([...entries, newEntry])
}

document.getElementById('add').addEventListener('click', addEntry)

function showEntries() {
  if (entries.length == 0) {
    document.getElementById('none').style.display = 'block'
  } else {
    document.getElementById('none').style.display = 'none'
  }
  const list = document.getElementById('list')
  list.innerHTML = ""
  for (let i = 0; i < entries.length; i++) {
    let cell = document.createElement('div')
    cell.className = 'entryCell'
    let time = document.createElement('span')
    time.className = 'entryTime'
    let hrs = document.createElement('span')
    hrs.innerText = entries[i].substring(0, 2)
    hrs.onclick = () => {
      setHrs(i)
    }
    time.appendChild(hrs)
    let colon = document.createElement('span')
    colon.innerText = entries[i].charAt(2)
    time.appendChild(colon)
    let mins = document.createElement('span')
    mins.innerText = entries[i].substring(3, 5)
    mins.onclick = () => {
      setMins(i)
    }
    time.appendChild(mins)
    cell.appendChild(time)
    let deleter = document.createElement('button')
    deleter.innerText = '-'
    deleter.onclick = () => {
      if (confirm('Are you sure?')) {
        setEntries(entries.filter((e, j) => j != i))
      }
    }
    cell.appendChild(deleter)
    list.appendChild(cell)
  }
  updateScrollShadows()
}

// Keeps the top/bottom scroll-shadow overlays in sync with actual scroll
// position, so they only show in the direction there's more to scroll.
function updateScrollShadows() {
  const wrap = document.getElementById('listWrap')
  const atTop = wrap.scrollTop <= 1
  const atBottom = wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 1
  wrap.classList.toggle('show-top-shadow', !atTop)
  wrap.classList.toggle('show-bottom-shadow', !atBottom)
}

document.getElementById('listWrap').addEventListener('scroll', updateScrollShadows)

function checkTime() {
  calcTotal()
}

function clampEstimate(hrs) {
  if (isNaN(hrs)) return 7
  hrs = Math.round(hrs * 10) / 10 // snap to 0.1hr increments
  return Math.min(20, Math.max(0.1, hrs))
}

function loadEstimateHours() {
  return clampEstimate(parseFloat(localStorage.getItem('estimateHours')))
}

function setEstimateHours(hrs) {
  estimateHours = clampEstimate(hrs)
  localStorage.setItem('estimateHours', estimateHours)
  showEstimateLabel()
  calcTotal()
}

function showEstimateLabel() {
  document.getElementById('estimateValue').innerText = estimateHours
}

// Tapping anywhere in the "7h" label (number or the "h" suffix) swaps the
// number for an input so the estimate can be adjusted; the "h" stays put
// so it keeps reading "[input]h" while editing.
function editEstimate() {
  const input = document.getElementById('estimateInput')
  if (input.style.display === 'inline-block') return // already editing
  document.getElementById('estimateValue').style.display = 'none'
  input.value = estimateHours
  input.style.display = 'inline-block'
  input.focus()
  input.select()
}

function finishEstimateEdit() {
  const input = document.getElementById('estimateInput')
  let value = parseFloat(input.value)
  if (!isNaN(value)) {
    setEstimateHours(value)
  }
  input.style.display = 'none'
  document.getElementById('estimateValue').style.display = 'inline'
}

document.getElementById('estimateLabel').addEventListener('click', editEstimate)
document.getElementById('estimateInput').addEventListener('click', (e) => e.stopPropagation()) // don't re-trigger editEstimate while already editing
document.getElementById('estimateInput').addEventListener('blur', finishEstimateEdit)
document.getElementById('estimateInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') e.target.blur() // commit on Enter, same as blur
})

function loadGranularity() {
  let saved = parseInt(localStorage.getItem('granularityMinutes'))
  return GRANULARITY_OPTIONS.includes(saved) ? saved : 6
}

function setGranularity(mins) {
  if (!GRANULARITY_OPTIONS.includes(mins)) return
  granularityMins = mins
  localStorage.setItem('granularityMinutes', granularityMins)
  calcTotal()
}

function showGranularitySelect() {
  document.getElementById('granularitySelect').value = granularityMins
}

document.getElementById('granularitySelect').addEventListener('change', (e) => {
  setGranularity(parseInt(e.target.value))
})

// Converts minutes-since-midnight into a 12-hour "H:MM AM/PM" string.
// Wraps properly across hour and day boundaries, and even accepts a
// negative or >1440 input (e.g. a projected time before "now" or past
// midnight) by normalizing into a single 0-1439 day first.
function formatClock(absMins) {
  let normalized = ((absMins % 1440) + 1440) % 1440
  let hours = Math.floor(normalized / 60)
  let mins = normalized % 60
  let display = hours % 12 || 12
  return display + ':' + mins.toString().padStart(2, "0") + (hours < 12 ? ' AM' : ' PM')
}

function calcTotal() {
  let total = 0
  let subtotal = 0
  for (let i = 0; i < entries.length; i += 2) {
    let start = entries[i]
    let end;
    if (i + 1 < entries.length) {
      end = entries[i + 1]
    } else {
      end = dateToEntry(new Date())
    }
    let endMins = parseInt(end.substring(0, 2)) * 60 + parseInt(end.substring(3, 5))
    let startMins = parseInt(start.substring(0, 2)) * 60 + parseInt(start.substring(3, 5))
    let minsDiff = endMins - startMins
    total += minsDiff
    if (i + 1 < entries.length) {
      subtotal += minsDiff
    }
  }
  total /= 60 // mins to hrs
  total += 0.0001
  total = Math.floor(total * 10) / 10
  document.getElementById('total').innerText = total

  if (entries.length % 2 == 1) { // Odd entries means running
    let start = entries[entries.length - 1]
    let startAbs = parseInt(start.substring(0, 2)) * 60 + parseInt(start.substring(3, 5))
    let now = dateToEntry(new Date())
    let nowAbs = parseInt(now.substring(0, 2)) * 60 + parseInt(now.substring(3, 5))

    // Calculate the estimate point: a fixed number of minutes after this
    // session's start. minsLeft can be negative if earlier completed
    // sessions already exceed the estimate; formatClock's wraparound still
    // resolves that to a sensible clock time instead of producing negative
    // minutes.
    let minsLeft = (estimateHours * 60) - subtotal
    document.getElementById('endTime').innerText = formatClock(startAbs + minsLeft)

    // Calculate the next granularity-minute mark (tenth-hour/half-hour/hour,
    // per granularityMins). This has to be based on the day's cumulative
    // total (subtotal from earlier completed sessions plus time elapsed in
    // this one), not just this session's own elapsed time, otherwise the
    // mark is wrong whenever there was an earlier completed session today.
    // Also use a true positive modulo (JS's % keeps the sign of the
    // dividend) so the offset to the next mark is never negative.
    let totalSoFar = subtotal + (nowAbs - startAbs)
    let remainder = ((totalSoFar % granularityMins) + granularityMins) % granularityMins
    let minsToNext = (granularityMins - remainder) % granularityMins
    document.getElementById('tenth').innerText = formatClock(nowAbs + minsToNext)
  } else {
    document.getElementById('endTime').innerText = 'never'
    document.getElementById('tenth').innerText = 'never'
  }
}

function setHrs(i) {
  let newHrs = prompt('New hrs? (was ' + entries[i].substring(0, 2) + ')')
  if (!newHrs) return
  newHrs = Math.floor(parseInt(newHrs)).toString().padStart(2, "0")
  newHrs = newHrs.length > 2 ? newHrs.substring(0, 2) : newHrs
  if (newHrs == 'Na') return
  if (newHrs > 23) return
  setEntries(entries.map((e, j) => {
    if (j == i) {
      return newHrs + e.substring(2, 5)
    } else {
      return e
    }
  }))
}

function setMins(i) {
  let newMins = prompt('New mins? (was ' + entries[i].substring(3, 5) + ')')
  if (!newMins) return
  newMins = Math.floor(parseInt(newMins)).toString().padStart(2, "0")
  newMins = newMins.length > 2 ? newMins.substring(0, 2) : newMins
  if (newMins == 'Na') return
  if (newMins > 60) return
  setEntries(entries.map((e, j) => {
    if (j == i) {
      return e.substring(0, 3) + newMins
    } else {
      return e
    }
  }))
}

function clear() {
  if (confirm('Are you sure you want to clear?')) {
    setEntries([])
  }
}

document.getElementById('clear').addEventListener('click', clear)