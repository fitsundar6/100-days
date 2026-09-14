/* ============================================================
   ALPHA X GYM — Admin Dashboard JavaScript
   Vanilla JS | localStorage | No frameworks
   ============================================================ */

'use strict';

/* ============================================================
   1. CONSTANTS & HELPERS
   ============================================================ */

const STORAGE_KEY = 'axg_clients';
const WEEKS       = 14;   // 0 (starting) + week 1-14

/** Load all clients from localStorage. Returns array. */
function loadClients() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

/** Save all clients array to localStorage. */
function saveClients(clients) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
}

/** Generate a simple unique ID. */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Parse YYYY-MM-DD in local time without timezone drift. */
function parseLocalDate(str) {
  if (!str) return new Date();
  if (str instanceof Date) return str;
  const parts = String(str).split('T')[0].split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

/** Add N days to a Date, return new Date. */
function addDays(date, n) {
  const d = typeof date === 'string' ? parseLocalDate(date) : new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** Format a Date as "10 Sep 2026". */
function fmtDate(date) {
  if (!date) return '—';
  const d = typeof date === 'string' ? parseLocalDate(date) : date;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Format a Date as "10 Sep" (short). */
function fmtDateShort(date) {
  if (!date) return '—';
  const d = typeof date === 'string' ? parseLocalDate(date) : date;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Format a date as YYYY-MM-DD for <input type="date"> value in local time. */
function toInputDate(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? parseLocalDate(date) : date;
  const year  = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day   = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Show a toast notification. type: 'success' | 'error' */
function showToast(message, type = 'success') {
  const existing = document.querySelector('.axg-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'axg-toast' + (type === 'error' ? ' axg-toast--error' : '');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2900);
}

/** Format weight change as "+3.2 kg" or "-5.0 kg" */
function fmtChange(change) {
  if (change === null || change === undefined || isNaN(change)) return '—';
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(1)} kg`;
}

/** Round to 1 decimal place. */
function round1(n) { return Math.round(n * 10) / 10; }

/** Clean phone number for WhatsApp wa.me link. */
function cleanPhoneNumber(phone) {
  if (!phone) return '';
  let cleaned = String(phone).replace(/[^0-9]/g, '');
  if (cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }
  return cleaned;
}


/* ============================================================
   2. CHALLENGE DATE CALCULATIONS
   ============================================================ */

function calcChallengeDates(startDateStr) {
  const start   = parseLocalDate(startDateStr);
  const endDate = addDays(start, 99);

  const weekDates = [];
  for (let w = 0; w <= WEEKS; w++) {
    weekDates.push(addDays(start, w * 7));
  }

  return { start, endDate, weekDates };
}

function calcChallengeDay(startDateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = parseLocalDate(startDateStr);
  start.setHours(0, 0, 0, 0);

  const end = addDays(start, 99);
  end.setHours(0, 0, 0, 0);

  if (today < start) return { day: 0,   status: 'upcoming' };
  if (today > end)   return { day: 100, status: 'completed' };

  const diff = Math.round((today - start) / (1000 * 60 * 60 * 24)) + 1;
  return { day: Math.min(Math.max(diff, 1), 100), status: 'active' };
}

function getCurrentWeight(client) {
  if (client.endingWeight !== null && client.endingWeight !== undefined && client.endingWeight !== '') {
    return parseFloat(client.endingWeight);
  }

  const weights = client.weeklyWeights || [];
  for (let i = weights.length - 1; i >= 0; i--) {
    if (weights[i] !== null && weights[i] !== undefined && weights[i] !== '') {
      return parseFloat(weights[i]);
    }
  }
  return client.startingWeight;
}

function getWeightChange(client) {
  const current  = getCurrentWeight(client);
  const starting = client.startingWeight;
  if (current === null || current === undefined || isNaN(current)) return null;
  return round1(current - starting);
}


/* ============================================================
   3. DASHBOARD STATS
   ============================================================ */

function updateStats() {
  const clients   = loadClients();
  let active      = 0;
  let completed   = 0;
  let totalChange = 0;
  let changeCount = 0;

  clients.forEach(c => {
    const { status } = calcChallengeDay(c.startDate);
    if (status === 'active')     active++;
    if (status === 'completed')  completed++;

    const change = getWeightChange(c);
    const hasLogged = (c.weeklyWeights && c.weeklyWeights.slice(1).some(w => w !== null && w !== '' && !isNaN(w))) ||
                      (c.endingWeight !== null && c.endingWeight !== undefined && !isNaN(c.endingWeight));

    if (hasLogged && change !== null) {
      totalChange += change;
      changeCount++;
    }
  });

  document.getElementById('statTotalClients').textContent     = clients.length;
  document.getElementById('statActiveClients').textContent    = active;
  document.getElementById('statCompletedClients').textContent = completed;

  const avgEl = document.getElementById('statAvgChange');
  if (changeCount > 0) {
    const avg = round1(totalChange / changeCount);
    avgEl.textContent = fmtChange(avg);
    avgEl.style.color = avg <= 0 ? 'var(--green)' : 'var(--red)';
  } else {
    avgEl.textContent = '— kg';
    avgEl.style.color = '';
  }
}


/* ============================================================
   4. CLIENT TABLE RENDERING
   ============================================================ */

let currentFilter = 'all';
let currentSearch = '';

function renderTable() {
  const clients = loadClients();

  let filtered = clients.filter(c => {
    const term = currentSearch.toLowerCase();
    const matchName  = c.name.toLowerCase().includes(term);
    const matchPhone = c.phone ? c.phone.includes(term) : false;
    if (!matchName && !matchPhone) return false;

    if (currentFilter === 'all') return true;
    const { status } = calcChallengeDay(c.startDate);
    return status === currentFilter;
  });

  const tbody = document.getElementById('clientTableBody');
  const wrap  = document.getElementById('clientTableWrap');
  const empty = document.getElementById('emptyState');

  tbody.innerHTML = '';

  if (clients.length === 0) {
    wrap.style.display  = 'none';
    empty.style.display = '';
    return;
  }

  wrap.style.display  = '';
  empty.style.display = 'none';

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center; color:var(--text-dim); padding:32px;">
          No clients match your search or filter.
        </td>
      </tr>`;
    return;
  }

  filtered.forEach(client => {
    const { day, status } = calcChallengeDay(client.startDate);
    const currentW = getCurrentWeight(client);
    const change   = getWeightChange(client);
    const pct      = status === 'upcoming' ? 0 : Math.min(day, 100);

    const changeText  = change !== null ? fmtChange(change) : '—';
    const changeClass = change === null ? 'axg-change--none'
                      : change < 0 ? 'axg-change--loss'
                      : change > 0 ? 'axg-change--gain'
                      : 'axg-change--none';

    const badgeClass = status === 'active'    ? 'axg-badge--active'
                     : status === 'completed' ? 'axg-badge--completed'
                     : 'axg-badge--upcoming';

    const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
    const fillClass   = status === 'completed' ? 'axg-mini-progress__fill axg-mini-progress__fill--complete'
                      : 'axg-mini-progress__fill';

    const dayLabel = status === 'upcoming' ? 'Not started' : `${day} / 100`;
    const phoneDisplay = client.phone ? escHtml(client.phone) : '<span style="color:var(--text-dim);">—</span>';

    const initials = client.name
      ? client.name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()
      : 'AX';

    const tr = document.createElement('tr');
    tr.dataset.clientId = client.id;

    tr.innerHTML = `
      <td data-label="Client" class="axg-table__cell--client">
        <button type="button" class="axg-client-cell-btn btn-view" data-id="${client.id}" title="Touch to see all client data">
          <span class="axg-client-avatar-circle">${initials}</span>
          <div class="axg-client-info-col">
            <span class="axg-table__name">${escHtml(client.name)}</span>
            <span class="axg-touch-hint-pill"><i class="fa-solid fa-folder-open"></i> Touch to see all data</span>
          </div>
        </button>
      </td>
      <td data-label="WhatsApp" class="axg-table__phone">
        ${phoneDisplay}
      </td>
      <td data-label="Start Weight" class="axg-table__weight">
        ${client.startingWeight} kg
      </td>
      <td data-label="Current Weight" class="axg-table__weight">
        ${currentW} kg
      </td>
      <td data-label="Change" class="${changeClass}">
        ${changeText}
      </td>
      <td data-label="Day">
        ${dayLabel}
      </td>
      <td data-label="Progress">
        <div class="axg-mini-progress">
          <span class="axg-mini-progress__label">${pct}%</span>
          <div class="axg-mini-progress__track">
            <div class="${fillClass}" style="width:${pct}%"></div>
          </div>
        </div>
      </td>
      <td data-label="Status">
        <span class="axg-badge ${badgeClass}">${statusLabel}</span>
      </td>
      <td data-label="Actions">
        <div class="axg-table-actions">
          <button type="button" class="axg-btn-see-data btn-view" data-id="${client.id}" title="Touch to see all client data">
            <i class="fa-solid fa-eye"></i> <span>All Data</span>
          </button>
          <button type="button" class="axg-icon-btn axg-icon-btn--whatsapp btn-whatsapp" data-id="${client.id}" title="Send WhatsApp Report">💬</button>
          <button type="button" class="axg-icon-btn btn-edit"   data-id="${client.id}" title="Edit">✏️</button>
          <button type="button" class="axg-icon-btn axg-icon-btn--delete btn-delete" data-id="${client.id}" title="Delete">🗑</button>
        </div>
      </td>`;

    tr.addEventListener('click', (e) => {
      if (e.target.closest('.btn-whatsapp') || e.target.closest('.btn-edit') || e.target.closest('.btn-delete')) return;
      openClientDetail(client.id);
    });

    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.btn-whatsapp').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      sendWhatsAppReport(btn.dataset.id);
    });
  });
  tbody.querySelectorAll('.btn-view').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openClientDetail(btn.dataset.id);
    });
  });
  tbody.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditModal(btn.dataset.id);
    });
  });
  tbody.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDeleteModal(btn.dataset.id);
    });
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


/* ============================================================
   5. ADD CLIENT MODAL
   ============================================================ */

function openAddModal() {
  document.getElementById('inputClientName').value  = '';
  document.getElementById('inputClientPhone').value = '';
  document.getElementById('inputStartWeight').value = '';
  document.getElementById('inputStartDate').value   = '';
  document.getElementById('datePreview').style.display = 'none';
  document.getElementById('addClientModal').style.display = 'flex';
}

function closeAddModal() {
  document.getElementById('addClientModal').style.display = 'none';
}

document.getElementById('inputStartDate').addEventListener('change', function () {
  if (!this.value) {
    document.getElementById('datePreview').style.display = 'none';
    return;
  }
  const { endDate } = calcChallengeDates(this.value);
  document.getElementById('previewEndDate').textContent = fmtDate(endDate);
  document.getElementById('datePreview').style.display = 'flex';
});

function createClient() {
  const name   = document.getElementById('inputClientName').value.trim();
  const phone  = document.getElementById('inputClientPhone').value.trim();
  const weight = parseFloat(document.getElementById('inputStartWeight').value);
  const date   = document.getElementById('inputStartDate').value;

  if (!name)                  { showToast('Please enter a client name.', 'error'); return; }
  if (!weight || weight <= 0) { showToast('Please enter a valid starting weight.', 'error'); return; }
  if (!date)                  { showToast('Please select a start date.', 'error'); return; }

  const { endDate } = calcChallengeDates(date);
  const weeklyWeights = [weight, ...Array(WEEKS).fill(null)];

  const client = {
    id:             uid(),
    name:           name,
    phone:          phone,
    startingWeight: weight,
    startDate:      date,
    endDate:        toInputDate(endDate),
    weeklyWeights:  weeklyWeights,
    endingWeight:   null,
    createdAt:      new Date().toISOString()
  };

  const clients = loadClients();
  clients.push(client);
  saveClients(clients);

  // Save to PostgreSQL via Prisma API
  fetch('/api/admin/clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      phone,
      startingWeight: weight,
      startDate: date,
    }),
  }).then(r => r.json()).then(d => {
    if (d.success && d.client) {
      client.id = d.client.id;
      saveClients(loadClients());
    }
  }).catch(err => console.warn('Could not save client to DB:', err));

  closeAddModal();
  renderTable();
  updateStats();
  showToast(`${name}'s 100-day challenge created!`);
}


/* ============================================================
   6. CLIENT DETAIL MODAL
   ============================================================ */

let activeClientId = null;
let weightChart    = null;

function openClientDetail(clientId) {
  const clients = loadClients();
  const client  = clients.find(c => c.id === clientId);
  if (!client) return;

  activeClientId = clientId;

  const { day, status } = calcChallengeDay(client.startDate);
  const currentW = getCurrentWeight(client);
  const change   = getWeightChange(client);
  const pct      = status === 'upcoming' ? 0 : Math.min(day, 100);

  document.getElementById('detailClientName').textContent = client.name;
  const phoneEl = document.getElementById('detailClientPhone');
  if (client.phone) {
    phoneEl.textContent = `📱 WhatsApp: ${client.phone}`;
  } else {
    phoneEl.textContent = '📱 No WhatsApp phone added';
  }

  document.getElementById('detailStartDate').textContent = fmtDate(client.startDate);
  document.getElementById('detailEndDate').textContent   = fmtDate(client.endDate);
  document.getElementById('detailCurrentDay').textContent = status === 'upcoming' ? 'Not started' : `Day ${day}`;

  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  document.getElementById('detailStatus').textContent = statusLabel;

  document.getElementById('detailStartWeight').textContent   = `${client.startingWeight} kg`;
  document.getElementById('detailCurrentWeight').textContent = `${currentW} kg`;

  const changeEl = document.getElementById('detailWeightChange');
  if (change !== null) {
    if (change < 0) {
      changeEl.textContent = `${Math.abs(change)} kg lost`;
      changeEl.style.color = 'var(--green)';
    } else if (change > 0) {
      changeEl.textContent = `${change} kg gained`;
      changeEl.style.color = 'var(--red)';
    } else {
      changeEl.textContent = 'No change';
      changeEl.style.color = 'var(--text-muted)';
    }
  } else {
    changeEl.textContent = '—';
    changeEl.style.color = '';
  }

  document.getElementById('detailProgressLabel').textContent =
    status === 'upcoming' ? 'Not started' : `Day ${day} / 100`;
  document.getElementById('detailProgressFill').style.width = `${pct}%`;

  document.getElementById('inputEndingWeight').value =
    client.endingWeight ? client.endingWeight : '';

  renderWeeklyCheckins(client);
  renderWeightChart(client);
  renderDailyCheckins(client);

  // Populate client switcher dropdown if multiple clients exist
  const switcherWrap = document.getElementById('clientSwitcherWrap');
  const clientSelect = document.getElementById('clientSelectDropdown');
  if (switcherWrap && clientSelect) {
    const allClients = loadClients();
    if (allClients.length > 1) {
      switcherWrap.style.display = 'flex';
      clientSelect.innerHTML = allClients.map(c =>
        `<option value="${c.id}" ${c.id === clientId ? 'selected' : ''}>${escHtml(c.name)}</option>`
      ).join('');
      clientSelect.onchange = function () {
        openClientDetail(this.value);
      };
    } else {
      switcherWrap.style.display = 'none';
    }
  }

  document.getElementById('clientDetailModal').style.display = 'flex';

  // Fetch live 100-day completion matrix from PostgreSQL
  fetch('/api/admin/clients/' + clientId)
    .then(r => r.json())
    .then(d => {
      if (d.success && d.client && Array.isArray(d.client.dayMatrix)) {
        d.client.dayMatrix.forEach(dm => {
          if (dm.completed) {
            const cell = document.querySelector(`.axg-day-cell[data-day="${dm.dayNumber}"]`);
            if (cell) {
              cell.className = 'axg-day-cell axg-day-cell--completed';
              const iconEl = cell.querySelector('.axg-day-cell__icon');
              if (iconEl) iconEl.innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--green)"></i>';
            }
          }
        });
      }
    })
    .catch(() => {});
}

function closeClientDetailModal() {
  document.getElementById('clientDetailModal').style.display = 'none';
  activeClientId = null;
  if (weightChart) { weightChart.destroy(); weightChart = null; }
}


/* ============================================================
   7. 1-CLICK WHATSAPP AUTOMATION
   ============================================================ */

function sendWhatsAppReport(clientId) {
  const clients = loadClients();
  const client  = clients.find(c => c.id === (clientId || activeClientId));
  if (!client) return;

  let phone = client.phone ? cleanPhoneNumber(client.phone) : '';

  if (!phone) {
    const input = prompt(`Enter WhatsApp number for ${client.name} (with country code, e.g. 919876543210):`);
    if (!input) return;
    phone = cleanPhoneNumber(input);
    if (!phone) {
      showToast('Invalid phone number.', 'error');
      return;
    }
    client.phone = input.trim();
    saveClients(clients);
    renderTable();
  }

  const { day, status } = calcChallengeDay(client.startDate);
  const currentW  = getCurrentWeight(client);
  const change    = getWeightChange(client);
  const checkins  = loadDailyCheckins(client);
  const completed = calculateCompletedDays(checkins);
  const rest      = calculateRestDays(checkins);
  const missed    = calculateNotEnteredDays(checkins);

  let changeLine = '—';
  if (change !== null) {
    if (change < 0) {
      changeLine = `-${Math.abs(change)} kg lost! 🔥`;
    } else if (change > 0) {
      changeLine = `+${change} kg gained 💪`;
    } else {
      changeLine = `Maintained (0.0 kg change) ⚖️`;
    }
  }

  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  const attRate = Math.round(((completed + rest) / 100) * 100);

  const message = 
`⚡ *ALPHA X GYM — 100-DAY TRANSFORMATION REPORT* ⚡

👤 *Client:* ${client.name}
📅 *Challenge:* Day ${day} of 100 (${statusLabel})
⚖️ *Starting Weight:* ${client.startingWeight} kg
🎯 *Current Weight:* ${currentW} kg
📉 *Total Change:* ${changeLine}

📊 *Gym Attendance Record:*
✅ Completed Workouts: ${completed} Days
🛌 Planned Rest Days: ${rest} Days
🚫 Missed Sessions: ${missed} Days
📈 Discipline & Adherence: ${attRate}%

💬 *Coach Message:*
"Consistency beats motivation every single time. Every workout and rest day counts towards your goal. Keep showing up!" 💪🔥

— *Alpha X Gym Coaching Team* 🏋️‍♂️`;

  const encoded = encodeURIComponent(message);
  const url = `https://wa.me/${phone}?text=${encoded}`;

  window.open(url, '_blank');
  showToast(`Opening WhatsApp report for ${client.name}...`);
}


/* ============================================================
   8. WEEKLY CHECK-INS
   ============================================================ */

function renderWeeklyCheckins(client) {
  const container     = document.getElementById('weeklyCheckinsContainer');
  const { weekDates } = calcChallengeDates(client.startDate);
  const weights       = client.weeklyWeights || [];
  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'axg-weekly-row axg-weekly-row--header';
  header.innerHTML = `
    <span>Week</span>
    <span>Date</span>
    <span>Weight</span>
    <span>Change</span>
    <span>Action</span>`;
  container.appendChild(header);

  for (let w = 0; w <= WEEKS; w++) {
    const isStart    = w === 0;
    const label      = isStart ? 'Starting' : `Week ${w}`;
    const dateStr    = fmtDateShort(weekDates[w]);
    const weight     = weights[w];

    let changeText  = '—';
    let changeStyle = 'color:var(--text-dim)';
    if (!isStart && weight !== null && weight !== undefined && weight !== '') {
      let prevWeight = null;
      for (let p = w - 1; p >= 0; p--) {
        if (weights[p] !== null && weights[p] !== undefined && weights[p] !== '') {
          prevWeight = weights[p];
          break;
        }
      }

      if (prevWeight !== null) {
        const diff = round1(parseFloat(weight) - parseFloat(prevWeight));
        changeText  = fmtChange(diff);
        changeStyle = diff < 0 ? 'color:var(--green)' : diff > 0 ? 'color:var(--red)' : 'color:var(--text-dim)';
      }
    }

    const row = document.createElement('div');
    row.className = 'axg-weekly-row' + (weight ? ' axg-weekly-row--saved' : '');
    row.dataset.week = w;

    const inputHtml = isStart
      ? `<span class="axg-weekly-input" style="background:transparent;border-color:transparent;color:var(--red);font-weight:700;">
           ${weight} kg
         </span>`
      : `<div class="axg-weekly-input-wrap">
           <input
             type="number"
             class="axg-weekly-input"
             data-week="${w}"
             value="${weight !== null && weight !== undefined ? weight : ''}"
             placeholder="kg"
             step="0.1"
             min="1"
           />
           <span class="axg-weekly-unit">kg</span>
         </div>`;

    const actionHtml = isStart ? '' :
      `<button type="button" class="axg-weekly-save-btn" data-week="${w}">Save</button>`;

    row.innerHTML = `
      <div class="axg-weekly-row__week ${isStart ? 'axg-weekly-row__week--start' : ''}">
        ${label}
      </div>
      <div class="axg-weekly-row__date">${dateStr}</div>
      <div>${inputHtml}</div>
      <div class="axg-weekly-row__change" style="${changeStyle}">${changeText}</div>
      <div>${actionHtml}</div>`;

    container.appendChild(row);
  }

  container.querySelectorAll('.axg-weekly-save-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const week  = parseInt(btn.dataset.week);
      const input = container.querySelector(`.axg-weekly-input[data-week="${week}"]`);
      saveWeeklyWeight(week, input ? input.value : '');
    });
  });

  container.querySelectorAll('.axg-weekly-input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const week = parseInt(input.dataset.week);
        saveWeeklyWeight(week, input.value);
      }
    });
  });
}

function saveWeeklyWeight(weekIndex, rawValue) {
  if (rawValue === '' || rawValue === null) {
    showToast('Please enter a weight value.', 'error');
    return;
  }

  const weight = parseFloat(rawValue);
  if (isNaN(weight) || weight <= 0) {
    showToast('Please enter a valid weight.', 'error');
    return;
  }

  const clients = loadClients();
  const client  = clients.find(c => c.id === activeClientId);
  if (!client) return;

  client.weeklyWeights[weekIndex] = round1(weight);
  saveClients(clients);

  showToast(`Week ${weekIndex} weight saved — ${round1(weight)} kg`);
  openClientDetail(activeClientId);
  renderTable();
  updateStats();
}


/* ============================================================
   9. ENDING WEIGHT
   ============================================================ */

function saveEndingWeight() {
  const val = document.getElementById('inputEndingWeight').value;
  if (!val) { showToast('Please enter an ending weight.', 'error'); return; }

  const weight = parseFloat(val);
  if (isNaN(weight) || weight <= 0) { showToast('Enter a valid ending weight.', 'error'); return; }

  const clients = loadClients();
  const client  = clients.find(c => c.id === activeClientId);
  if (!client) return;

  client.endingWeight = round1(weight);
  saveClients(clients);

  showToast(`Ending weight saved — ${round1(weight)} kg`);
  openClientDetail(activeClientId);
  renderTable();
  updateStats();
}


/* ============================================================
   10. WEIGHT PROGRESS CHART
   ============================================================ */

function renderWeightChart(client) {
  const canvas = document.getElementById('weightChart');
  if (weightChart) { weightChart.destroy(); weightChart = null; }

  if (typeof Chart === 'undefined') {
    if (canvas && canvas.parentElement) canvas.parentElement.style.display = 'none';
    return;
  }

  const weights = client.weeklyWeights || [];
  const labels  = [];
  const data    = [];

  for (let w = 0; w <= WEEKS; w++) {
    const wt = weights[w];
    if (wt !== null && wt !== undefined && wt !== '') {
      labels.push(w === 0 ? 'Start' : `W${w}`);
      data.push(parseFloat(wt));
    }
  }

  if (client.endingWeight !== null && client.endingWeight !== undefined && client.endingWeight !== '') {
    labels.push('End');
    data.push(parseFloat(client.endingWeight));
  }

  if (data.length < 2) {
    canvas.parentElement.style.display = 'none';
    return;
  }

  canvas.parentElement.style.display = '';

  const minW = Math.floor(Math.min(...data) - 2);
  const maxW = Math.ceil(Math.max(...data)  + 2);

  weightChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label:                'Weight (kg)',
        data:                 data,
        borderColor:          '#E8000D',
        backgroundColor:      'rgba(232,0,13,0.08)',
        pointBackgroundColor: '#E8000D',
        pointBorderColor:     '#fff',
        pointRadius:          5,
        pointHoverRadius:     7,
        borderWidth:          2.5,
        tension:              0.35,
        fill:                 true
      }]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.y} kg`
          }
        }
      },
      scales: {
        x: {
          grid:  { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#888', font: { size: 11 } }
        },
        y: {
          min:   minW,
          max:   maxW,
          grid:  { color: 'rgba(255,255,255,0.05)' },
          ticks: {
            color: '#888',
            font:  { size: 11 },
            callback: v => `${v} kg`
          }
        }
      }
    }
  });
}


/* ============================================================
   11. EDIT CLIENT MODAL
   ============================================================ */

function openEditModal(clientId) {
  const clients = loadClients();
  const client  = clients.find(c => c.id === clientId);
  if (!client) return;

  activeClientId = clientId;

  document.getElementById('editClientName').value          = client.name;
  document.getElementById('editClientPhone').value         = client.phone || '';
  document.getElementById('editStartWeight').value         = client.startingWeight;
  document.getElementById('editStartDate').value           = client.startDate;
  document.getElementById('editDatePreview').style.display = 'none';

  document.getElementById('editClientModal').style.display = 'flex';
}

function closeEditModal() {
  document.getElementById('editClientModal').style.display = 'none';
}

document.getElementById('editStartDate').addEventListener('change', function () {
  if (!this.value) {
    document.getElementById('editDatePreview').style.display = 'none';
    return;
  }
  const { endDate } = calcChallengeDates(this.value);
  document.getElementById('editPreviewEndDate').textContent = fmtDate(endDate);
  document.getElementById('editDatePreview').style.display = 'flex';
});

function saveEditClient() {
  const name   = document.getElementById('editClientName').value.trim();
  const phone  = document.getElementById('editClientPhone').value.trim();
  const weight = parseFloat(document.getElementById('editStartWeight').value);
  const date   = document.getElementById('editStartDate').value;

  if (!name)                  { showToast('Please enter a name.', 'error'); return; }
  if (!weight || weight <= 0) { showToast('Enter a valid starting weight.', 'error'); return; }
  if (!date)                  { showToast('Select a start date.', 'error'); return; }

  const clients = loadClients();
  const client  = clients.find(c => c.id === activeClientId);
  if (!client) return;

  const dateChanged   = client.startDate !== date;
  const weightChanged = client.startingWeight !== weight;

  client.name           = name;
  client.phone          = phone;
  client.startingWeight = weight;
  client.startDate      = date;

  const { endDate } = calcChallengeDates(date);
  client.endDate    = toInputDate(endDate);

  if (dateChanged) {
    client.weeklyWeights = [weight, ...Array(WEEKS).fill(null)];
    delete client.dailyCheckins;
    showToast('Start date changed — weekly weights and attendance reset.');
  }

  if (weightChanged && !dateChanged) {
    client.weeklyWeights[0] = weight;
  }

  saveClients(clients);
  closeEditModal();
  renderTable();
  updateStats();

  if (document.getElementById('clientDetailModal').style.display !== 'none') {
    openClientDetail(activeClientId);
  }

  showToast(`${name}'s profile updated.`);
}


/* ============================================================
   12. DELETE CLIENT
   ============================================================ */

function openDeleteModal(clientId) {
  const clients = loadClients();
  const client  = clients.find(c => c.id === clientId);
  if (!client) return;

  activeClientId = clientId;
  document.getElementById('deleteClientNameDisplay').textContent = client.name;
  document.getElementById('deleteConfirmModal').style.display = 'flex';
}

function closeDeleteModal() {
  document.getElementById('deleteConfirmModal').style.display = 'none';
}

function deleteClient() {
  let clients = loadClients();
  clients     = clients.filter(c => c.id !== activeClientId);
  saveClients(clients);

  closeDeleteModal();

  if (document.getElementById('clientDetailModal').style.display !== 'none') {
    closeClientDetailModal();
  }

  renderTable();
  updateStats();
  showToast('Client deleted.');
  activeClientId = null;
}


/* ============================================================
   13. SEARCH & FILTER
   ============================================================ */

document.getElementById('searchInput').addEventListener('input', function () {
  currentSearch = this.value;
  renderTable();
});

document.querySelectorAll('.axg-filter-tab').forEach(tab => {
  tab.addEventListener('click', function () {
    document.querySelectorAll('.axg-filter-tab').forEach(t => t.classList.remove('axg-filter-tab--active'));
    this.classList.add('axg-filter-tab--active');
    currentFilter = this.dataset.filter;
    renderTable();
  });
});


/* ============================================================
   14. BUTTON & FORM EVENT LISTENERS
   ============================================================ */

document.getElementById('openAddClientModal').addEventListener('click', openAddModal);
document.getElementById('closeAddClientModal').addEventListener('click', closeAddModal);
document.getElementById('cancelAddClient').addEventListener('click', closeAddModal);
document.getElementById('addClientForm').addEventListener('submit', (e) => {
  e.preventDefault();
  createClient();
});

document.getElementById('closeClientDetailModal').addEventListener('click', closeClientDetailModal);
document.getElementById('closeDetailBtn').addEventListener('click', closeClientDetailModal);
document.getElementById('saveEndingWeight').addEventListener('click', saveEndingWeight);
document.getElementById('sendWhatsappBtn').addEventListener('click', () => sendWhatsAppReport(activeClientId));

document.getElementById('deleteClientBtn').addEventListener('click', () => {
  closeClientDetailModal();
  openDeleteModal(activeClientId);
});
document.getElementById('editClientBtn').addEventListener('click', () => {
  const id = activeClientId;
  closeClientDetailModal();
  openEditModal(id);
});

document.getElementById('closeEditClientModal').addEventListener('click', closeEditModal);
document.getElementById('cancelEditClient').addEventListener('click', closeEditModal);
document.getElementById('editClientForm').addEventListener('submit', (e) => {
  e.preventDefault();
  saveEditClient();
});

document.getElementById('closeDeleteModal').addEventListener('click', closeDeleteModal);
document.getElementById('cancelDeleteClient').addEventListener('click', closeDeleteModal);
document.getElementById('confirmDeleteClient').addEventListener('click', deleteClient);

document.querySelectorAll('.axg-modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', function (e) {
    if (e.target === this) {
      this.style.display = 'none';
      if (this.id === 'clientDetailModal') {
        activeClientId = null;
        if (weightChart) { weightChart.destroy(); weightChart = null; }
      }
    }
  });
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  ['addClientModal', 'clientDetailModal', 'editClientModal', 'deleteConfirmModal'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.style.display !== 'none') {
      el.style.display = 'none';
      if (id === 'clientDetailModal') {
        activeClientId = null;
        if (weightChart) { weightChart.destroy(); weightChart = null; }
      }
    }
  });
});

/* ============================================================
   14B. NAVIGATION & VIEW ALL CLIENTS HANDLERS
   ============================================================ */

function showAllClientsView() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.value = '';
    currentSearch = '';
  }
  currentFilter = 'all';
  document.querySelectorAll('.axg-filter-tab').forEach(tab => {
    const isAll = tab.dataset.filter === 'all';
    tab.classList.toggle('axg-filter-tab--active', isAll);
    tab.setAttribute('aria-selected', isAll ? 'true' : 'false');
  });
  renderTable();

  // Highlight active link in sidebar
  document.querySelectorAll('.axg-nav-link').forEach(link => link.classList.remove('axg-nav-link--active'));
  const navClients = document.getElementById('navClients');
  if (navClients) navClients.classList.add('axg-nav-link--active');

  // Close mobile sidebar drawer
  const sidebar = document.getElementById('axgSidebar');
  if (sidebar) sidebar.classList.remove('axg-sidebar--open');

  // Smooth scroll directly to the client roster section
  const section = document.getElementById('clientsSection');
  if (section) {
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    section.classList.remove('axg-pulse-highlight');
    void section.offsetWidth;
    section.classList.add('axg-pulse-highlight');
  }
}

const navClients = document.getElementById('navClients');
if (navClients) {
  navClients.addEventListener('click', (e) => {
    e.preventDefault();
    showAllClientsView();
  });
}

const viewAllClientsBtn = document.getElementById('viewAllClientsBtn');
if (viewAllClientsBtn) {
  viewAllClientsBtn.addEventListener('click', (e) => {
    e.preventDefault();
    showAllClientsView();
  });
}

const statTotalClientsCard = document.getElementById('statTotalClientsCard');
if (statTotalClientsCard) {
  statTotalClientsCard.addEventListener('click', () => {
    showAllClientsView();
  });
}

const navDashboard = document.getElementById('navDashboard');
if (navDashboard) {
  navDashboard.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.axg-nav-link').forEach(link => link.classList.remove('axg-nav-link--active'));
    navDashboard.classList.add('axg-nav-link--active');
    const sidebar = document.getElementById('axgSidebar');
    if (sidebar) sidebar.classList.remove('axg-sidebar--open');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

const navChallenge = document.getElementById('navChallenge');
if (navChallenge) {
  navChallenge.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.axg-nav-link').forEach(link => link.classList.remove('axg-nav-link--active'));
    navChallenge.classList.add('axg-nav-link--active');
    const sidebar = document.getElementById('axgSidebar');
    if (sidebar) sidebar.classList.remove('axg-sidebar--open');
    const activeTab = document.querySelector('.axg-filter-tab[data-filter="active"]');
    if (activeTab) activeTab.click();
    const section = document.getElementById('clientsSection');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}


/* ============================================================
   15. DAILY GYM CHECK-IN SYSTEM (WITH REST DAY 🛌)
   ============================================================ */

function loadDailyCheckins(client) {
  const saved = client.dailyCheckins || [];
  const map   = {};
  saved.forEach(entry => { map[entry.day] = entry; });

  const { day: currentDay } = calcChallengeDay(client.startDate);
  const start = parseLocalDate(client.startDate);
  const result = [];

  for (let d = 1; d <= 100; d++) {
    const date     = addDays(start, d - 1);
    const dateStr  = toInputDate(date);
    const isFuture = d > currentDay;

    let status = map[d] ? map[d].status : (isFuture ? 'upcoming' : 'not_recorded');

    if (!isFuture && status === 'upcoming') {
      status = 'not_recorded';
    }

    result.push({ day: d, date: dateStr, status });
  }

  return result;
}

function saveDailyCheckins(clientId, checkins) {
  const clients = loadClients();
  const client  = clients.find(c => c.id === clientId);
  if (!client) return;
  client.dailyCheckins = checkins;
  saveClients(clients);
}

function calculateCompletedDays(checkins) {
  return checkins.filter(c => c.status === 'completed').length;
}

function calculateRestDays(checkins) {
  return checkins.filter(c => c.status === 'rest_day').length;
}

function calculateNotEnteredDays(checkins) {
  return checkins.filter(c => c.status === 'not_entered').length;
}

function calculateNotRecordedDays(checkins) {
  return checkins.filter(c => c.status === 'not_recorded').length;
}

function updateDayStatus(dayNumber, newStatus) {
  const clients = loadClients();
  const client  = clients.find(c => c.id === activeClientId);
  if (!client) return;

  const checkins = loadDailyCheckins(client);
  const entry    = checkins.find(c => c.day === dayNumber);
  if (!entry) return;

  if (entry.status === 'upcoming') return;

  entry.status = newStatus;
  saveDailyCheckins(activeClientId, checkins);

  const updatedClients = loadClients();
  const updatedClient  = updatedClients.find(c => c.id === activeClientId);
  renderDailyCheckins(updatedClient);
}

function renderDailyCheckins(client) {
  const grid = document.getElementById('dailyGrid');
  if (!grid) return;

  const checkins = loadDailyCheckins(client);
  grid.innerHTML = '';

  checkins.forEach(entry => {
    const { day, date, status } = entry;

    const dateObj   = parseLocalDate(date);
    const shortDate = fmtDateShort(dateObj);

    let icon      = '⬜';
    let cellClass = 'axg-day-cell--not-recorded';

    if (status === 'completed')   { icon = '✅'; cellClass = 'axg-day-cell--completed'; }
    if (status === 'rest_day')    { icon = '🛌'; cellClass = 'axg-day-cell--rest'; }
    if (status === 'not_entered') { icon = '🚫'; cellClass = 'axg-day-cell--not-entered'; }
    if (status === 'upcoming')    { icon = '🔒'; cellClass = 'axg-day-cell--upcoming'; }

    const actionsHtml = status !== 'upcoming' ? `
      <div class="axg-day-cell__actions">
        <button
          type="button"
          class="axg-day-action-btn axg-day-action-btn--complete"
          data-day="${day}"
          data-status="completed"
          title="Completed Workout"
        >✅</button>
        <button
          type="button"
          class="axg-day-action-btn axg-day-action-btn--rest"
          data-day="${day}"
          data-status="rest_day"
          title="Planned Rest Day"
        >🛌</button>
        <button
          type="button"
          class="axg-day-action-btn axg-day-action-btn--missed"
          data-day="${day}"
          data-status="not_entered"
          title="Not Entered Gym"
        >🚫</button>
      </div>` : '';

    const cell = document.createElement('div');
    cell.className   = `axg-day-cell ${cellClass}`;
    cell.dataset.day = day;
    cell.title       = status === 'upcoming'
      ? `Day ${day} — ${shortDate} (Upcoming)`
      : `Day ${day} — ${shortDate}`;

    cell.innerHTML = `
      <span class="axg-day-cell__num">${String(day).padStart(2, '0')}</span>
      <span class="axg-day-cell__icon">${icon}</span>
      <span class="axg-day-cell__date">${shortDate}</span>
      ${actionsHtml}`;

    grid.appendChild(cell);
  });

  grid.querySelectorAll('.axg-day-action-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const day    = parseInt(btn.dataset.day);
      const status = btn.dataset.status;
      updateDayStatus(day, status);
    });
  });

  grid.querySelectorAll('.axg-day-cell:not(.axg-day-cell--upcoming)').forEach(cell => {
    cell.addEventListener('click', (e) => {
      if (e.target.closest('.axg-day-action-btn')) return;
      const day   = parseInt(cell.dataset.day);
      const entry = loadDailyCheckins(
        loadClients().find(c => c.id === activeClientId)
      ).find(c => c.day === day);
      if (!entry || entry.status === 'upcoming') return;

      const cycle = {
        not_recorded: 'completed',
        completed:    'rest_day',
        rest_day:     'not_entered',
        not_entered:  'not_recorded'
      };
      updateDayStatus(day, cycle[entry.status] || 'not_recorded');
    });
  });

  updateAttendanceStats(checkins);
}

function updateAttendanceStats(checkins) {
  const completed   = calculateCompletedDays(checkins);
  const rest        = calculateRestDays(checkins);
  const notEntered  = calculateNotEnteredDays(checkins);
  const notRecorded = calculateNotRecordedDays(checkins);
  const rate        = Math.round(((completed + rest) / 100) * 100);

  const elC  = document.getElementById('attCompleted');
  const elR  = document.getElementById('attRest');
  const elNE = document.getElementById('attNotEntered');
  const elNR = document.getElementById('attNotRecorded');
  const elP  = document.getElementById('attPercent');

  if (elC)  elC.textContent  = completed;
  if (elR)  elR.textContent  = rest;
  if (elNE) elNE.textContent = notEntered;
  if (elNR) elNR.textContent = notRecorded;
  if (elP)  elP.textContent  = `${rate}%`;
}


/* ============================================================
   16. INITIALISE ON PAGE LOAD
   ============================================================ */

async function syncFromPostgres() {
  try {
    const res = await fetch('/api/admin/clients');
    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.clients) && data.clients.length > 0) {
        const local = loadClients();
        const merged = data.clients.map(c => {
          const lMatch = local.find(l => l.id === c.id || l.phone === c.phone);
          return {
            id: c.id,
            name: c.name,
            phone: c.phone,
            startingWeight: c.startingWeight || lMatch?.startingWeight || 80,
            endingWeight: c.endingWeight || lMatch?.endingWeight || null,
            targetWeight: c.targetWeight || lMatch?.targetWeight || null,
            startDate: lMatch?.startDate || toInputDate(new Date(Date.now() - 14 * 86400000)),
            endDate: lMatch?.endDate || toInputDate(addDays(new Date(), 85)),
            weeklyWeights: c.weeklyWeights || lMatch?.weeklyWeights || [c.startingWeight],
            dailyCheckins: lMatch?.dailyCheckins || [],
            createdAt: c.createdAt || new Date().toISOString(),
          };
        });
        saveClients(merged);
        renderTable();
        updateStats();
      }
    }
  } catch (e) {
    console.warn('PostgreSQL sync offline fallback:', e);
  }
}

function init() {
  renderTable();
  updateStats();
  syncFromPostgres();
}

init();