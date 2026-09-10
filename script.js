// TODO: Add display for next tenth hour/half hour/hour

// Element IDs: Add, none, list, total, history

let entries = []
let interval;

getEntries()

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
    let row = document.createElement('tr')
    let cell = document.createElement('td')
    let hrs = document.createElement('span')
    hrs.innerText = entries[i].substring(0, 2)
    hrs.onclick = () => {
      setHrs(i)
    }
    cell.appendChild(hrs)
    let colon = document.createElement('span')
    colon.innerText = entries[i].charAt(2)
    cell.appendChild(colon)
    let mins = document.createElement('span')
    mins.innerText = entries[i].substring(3, 5)
    mins.onclick = () => {
      setMins(i)
    }
    cell.appendChild(mins)
    row.appendChild(cell)
    let deleteCell = document.createElement('td')
    let deleter = document.createElement('button')
    deleter.innerText = '-'
    deleter.onclick = () => {
      if (confirm('Are you sure?')) {
        setEntries(entries.filter((e, j) => j != i))
      }
    }
    deleteCell.appendChild(deleter)
    row.appendChild(deleteCell)
    list.appendChild(row)
  }
}

function checkTime() {
  calcTotal()
}

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

    // Calculate 7 hr point: a fixed number of minutes after this session's
    // start. minsLeft can be negative if earlier completed sessions already
    // total 7+ hours; formatClock's wraparound still resolves that to a
    // sensible clock time instead of producing negative minutes.
    let minsLeft = (7 * 60) - subtotal
    document.getElementById('endTime').innerText = formatClock(startAbs + minsLeft)

    // Calculate next 6-minute (tenth-of-an-hour) mark. This has to be based
    // on the day's cumulative total (subtotal from earlier completed
    // sessions plus time elapsed in this one), not just this session's own
    // elapsed time, otherwise the mark is wrong whenever there was an
    // earlier completed session today. Also use a true positive modulo
    // (JS's % keeps the sign of the dividend) so the offset to the next
    // mark is always 0-5, never negative.
    let totalSoFar = subtotal + (nowAbs - startAbs)
    let remainder = ((totalSoFar % 6) + 6) % 6
    let minsToNext = (6 - remainder) % 6
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