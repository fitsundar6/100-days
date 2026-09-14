/**
 * ============================================================
 * ALPHA X GYM — ADMIN ATTENDANCE CONTROLLER (PART 8)
 * Real-time dynamic QR, GPS geofence, automatic absent tracking,
 * and 100-Day Challenge workout adherence synchronization.
 * ============================================================
 */

(function () {
  'use strict';

  // State Management
  let attendanceRecords = [];
  let currentFilter = 'all';
  let searchQuery = '';
  let selectedDate = getTodayKolkataDate();
  let refreshTimer = null;

  function getApiUrl(path) {
    const isFile = window.location.protocol === 'file:';
    const isNotPort3000 = window.location.port && window.location.port !== '3000';
    const base = (isFile || isNotPort3000) ? 'http://localhost:3000' : '';
    return `${base}${path}`;
  }

  function getTodayKolkataDate() {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date());
      const y = parts.find((p) => p.type === 'year')?.value;
      const m = parts.find((p) => p.type === 'month')?.value;
      const d = parts.find((p) => p.type === 'day')?.value;
      if (y && m && d) return `${y}-${m}-${d}`;
    } catch (e) {}
    return new Date().toISOString().split('T')[0];
  }

  // Toast notification helper
  function showToast(message, type = 'success') {
    const existing = document.getElementById('axgAttToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'axgAttToast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: var(--font-body);
      font-size: 13px;
      font-weight: 600;
      z-index: 99999;
      display: flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
      animation: fadeIn 0.2s ease-out;
      background: ${type === 'success' ? 'rgba(0, 230, 118, 0.95)' : type === 'error' ? 'rgba(255, 61, 0, 0.95)' : 'rgba(33, 150, 243, 0.95)'};
      color: #000;
    `;
    const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-info';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 4000);
  }

  // DOM Elements
  const navAttendance = document.getElementById('navAttendance');
  const attendanceSection = document.getElementById('attendanceSection');
  const tableBody = document.getElementById('attendanceTableBody');
  const dateFilterInput = document.getElementById('attDateFilter');
  const dateTodayBtn = document.getElementById('attDateTodayBtn');
  const searchInput = document.getElementById('attSearchInput');
  const filterTabs = document.getElementById('attFilterTabs');
  const refreshBtn = document.getElementById('btnRefreshAttendance');
  const triggerAbsentBtn = document.getElementById('btnTriggerAbsentJob');
  const settingsForm = document.getElementById('attendanceSettingsForm');

  // KPI elements
  const kpiTotalActive = document.getElementById('attKpiTotalActive');
  const kpiPresent = document.getElementById('attKpiPresent');
  const kpiAbsent = document.getElementById('attKpiAbsent');
  const kpiRate = document.getElementById('attKpiRate');
  const kpiCurrentlyInGym = document.getElementById('attKpiCurrentlyInGym');

  // Navigation Initialization
  function initNav() {
    if (navAttendance) {
      navAttendance.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.axg-nav-link').forEach((l) => l.classList.remove('axg-nav-link--active'));
        navAttendance.classList.add('axg-nav-link--active');

        const sidebar = document.getElementById('axgSidebar');
        if (sidebar) sidebar.classList.remove('axg-sidebar--open');

        if (attendanceSection) {
          attendanceSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          attendanceSection.classList.remove('axg-pulse-highlight');
          void attendanceSection.offsetWidth;
          attendanceSection.classList.add('axg-pulse-highlight');
        }
      });
    }
  }

  // Fetch Live Attendance Data
  async function loadAttendanceDashboard(showSpinner = false) {
    if (showSpinner && tableBody) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 32px; color: var(--text-muted);">
            <i class="fa-solid fa-spinner fa-spin" style="font-size: 20px; margin-bottom: 8px; display: block; color: var(--red);"></i>
            Fetching live attendance records for ${selectedDate}...
          </td>
        </tr>
      `;
    }

    try {
      const res = await fetch(getApiUrl(`/api/attendance/dashboard?date=${selectedDate}`));
      const data = await res.json();

      if (data.success) {
        attendanceRecords = data.records || [];
        updateKpis(data.kpis);
        renderAttendanceTable();
      } else {
        renderError('Could not load attendance records: ' + (data.error || 'Server error'));
      }
    } catch (err) {
      console.warn('Attendance load error:', err);
      renderError('Network error loading live attendance.');
    }
  }

  // Update KPI counters
  function updateKpis(kpis) {
    if (!kpis) return;
    if (kpiTotalActive) kpiTotalActive.textContent = kpis.totalActiveClients ?? '0';
    if (kpiPresent) kpiPresent.textContent = kpis.presentToday ?? '0';
    if (kpiAbsent) kpiAbsent.textContent = kpis.absentToday ?? '0';
    if (kpiRate) kpiRate.textContent = `${kpis.attendancePercentage ?? 0}%`;
    if (kpiCurrentlyInGym) kpiCurrentlyInGym.textContent = kpis.currentlyInGym ?? '0';
  }

  // Filter and Search logic
  function getFilteredRecords() {
    return attendanceRecords.filter((rec) => {
      // 1. Text Search Filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const nameMatch = (rec.clientName || '').toLowerCase().includes(q);
        const emailMatch = (rec.clientEmail || '').toLowerCase().includes(q);
        if (!nameMatch && !emailMatch) return false;
      }

      // 2. Status Filter Tabs
      if (currentFilter === 'present') {
        return rec.status === 'PRESENT';
      } else if (currentFilter === 'absent') {
        return rec.status === 'ABSENT';
      } else if (currentFilter === 'incomplete-workout') {
        return !rec.workoutCompleted;
      }

      return true;
    });
  }

  // Render Attendance Table
  function renderAttendanceTable() {
    if (!tableBody) return;

    const filtered = getFilteredRecords();

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 36px 16px; color: var(--text-dim);">
            <i class="fa-solid fa-clipboard-user" style="font-size: 28px; opacity: 0.3; margin-bottom: 10px; display: block;"></i>
            No attendance records found matching current criteria for <strong>${selectedDate}</strong>.
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = filtered
      .map((rec) => {
        const isPresent = rec.status === 'PRESENT';
        const isAbsent = rec.status === 'ABSENT';

        // Avatar
        const avatarImg = rec.clientAvatar
          ? `<img src="${rec.clientAvatar}" alt="${rec.clientName}" class="axg-att-avatar-img" />`
          : `<div class="axg-att-avatar-initials">${(rec.clientName || 'GA').substring(0, 2).toUpperCase()}</div>`;

        // Check-in Time Display
        const timeDisplay = isPresent && rec.checkInAt
          ? `<span style="color: #00e676; font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 6px;">
               <i class="fa-regular fa-clock"></i> ${rec.checkInAt}
             </span>`
          : isAbsent
          ? `<span style="color: var(--text-dim); font-size: 12px;">— (Did Not Check In)</span>`
          : `<span style="color: var(--text-dim); font-size: 12px;">— (Pending)</span>`;

        // Status Badge
        const statusBadge = isPresent
          ? `<span class="axg-att-status-badge axg-att-status-badge--present">
               <span class="axg-att-status-dot"></span> PRESENT
             </span>`
          : isAbsent
          ? `<span class="axg-att-status-badge axg-att-status-badge--absent">
               <span class="axg-att-status-dot"></span> ABSENT
             </span>`
          : `<span class="axg-att-status-badge axg-att-status-badge--pending">
               <span class="axg-att-status-dot"></span> UNRECORDED
             </span>`;

        // Geofence Badge
        const geofenceBadge = rec.locationVerified
          ? `<span class="axg-badge" style="background: rgba(0, 230, 118, 0.12); color: #00e676; border: 1px solid rgba(0, 230, 118, 0.25); font-size: 11px;">
               <i class="fa-solid fa-circle-check"></i> Verified (${rec.distanceMeters ?? '<15'}m)
             </span>`
          : isPresent
          ? `<span class="axg-badge" style="background: rgba(255, 171, 0, 0.12); color: #ffab00; border: 1px solid rgba(255, 171, 0, 0.25); font-size: 11px;">
               <i class="fa-solid fa-triangle-exclamation"></i> Manual Override
             </span>`
          : `<span style="color: var(--text-dim); font-size: 11px;">—</span>`;

        // Workout Protocol
        const protocolDisplay = `
          <div style="font-size: 12px; font-weight: 600; color: var(--text-pure);">
            Day ${rec.dayNumber ?? 14} / ${rec.totalDays ?? 100}
          </div>
          <div style="font-size: 11px; color: var(--text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 140px;">
            ${rec.workoutTitle || 'Daily Hypertrophy Split'}
          </div>
        `;

        // Workout Started
        const startedBadge = rec.workoutStarted
          ? `<span class="axg-badge" style="background: rgba(0, 229, 255, 0.12); color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.25); font-size: 11px;">
               <i class="fa-solid fa-play"></i> Started
             </span>`
          : `<span style="color: var(--text-dim); font-size: 11px;">Not Started</span>`;

        // Workout Completed
        const completedBadge = rec.workoutCompleted
          ? `<span class="axg-badge" style="background: rgba(0, 230, 118, 0.12); color: #00e676; border: 1px solid rgba(0, 230, 118, 0.25); font-size: 11px;">
               <i class="fa-solid fa-check-double"></i> Done
             </span>`
          : `<span style="color: var(--text-dim); font-size: 11px;">Pending</span>`;

        // Verification Method Label
        const methodMap = {
          dynamic_qr_gps: 'Dynamic QR + GPS',
          auto_absent: 'Auto Absent Job',
          manual_override: 'Coach Override',
          pending: 'Pending',
        };
        const methodDisplay = `<span style="font-size: 11px; color: var(--text-muted);">${methodMap[rec.verificationMethod] || rec.verificationMethod || '—'}</span>`;

        // Manual Override Actions
        const overrideAction = isPresent
          ? `<button type="button" class="axg-btn axg-btn--ghost axg-btn-override" data-client-id="${rec.clientId}" data-target-status="absent" title="Override to Absent" style="padding: 4px 8px; font-size: 11px; color: var(--red);">
               Mark Absent
             </button>`
          : `<button type="button" class="axg-btn axg-btn--ghost axg-btn-override" data-client-id="${rec.clientId}" data-target-status="present" title="Override to Present" style="padding: 4px 8px; font-size: 11px; color: #00e676;">
               Mark Present
             </button>`;

        return `
          <tr data-client-id="${rec.clientId}">
            <!-- Athlete Profile -->
            <td>
              <div class="axg-att-athlete-cell">
                ${avatarImg}
                <div>
                  <div class="axg-att-athlete-name">${escapeHtml(rec.clientName)}</div>
                  <div class="axg-att-athlete-email">${escapeHtml(rec.clientEmail || 'No email')}</div>
                </div>
              </div>
            </td>

            <!-- Check-in Time -->
            <td>${timeDisplay}</td>

            <!-- Attendance Status -->
            <td>${statusBadge}</td>

            <!-- Location Geofence -->
            <td>${geofenceBadge}</td>

            <!-- Protocol -->
            <td>${protocolDisplay}</td>

            <!-- Workout Started -->
            <td>${startedBadge}</td>

            <!-- Workout Done -->
            <td>${completedBadge}</td>

            <!-- Method -->
            <td>${methodDisplay}</td>

            <!-- Override -->
            <td style="text-align: right;">${overrideAction}</td>
          </tr>
        `;
      })
      .join('');

    // Attach click listeners to override buttons
    tableBody.querySelectorAll('.axg-btn-override').forEach((btn) => {
      btn.addEventListener('click', async function () {
        const clientId = this.dataset.clientId;
        const targetStatus = this.dataset.targetStatus;
        await handleManualOverride(clientId, targetStatus);
      });
    });
  }

  // Error state display
  function renderError(msg) {
    if (!tableBody) return;
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 32px; color: #ff5252;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
          ${escapeHtml(msg)}
        </td>
      </tr>
    `;
  }

  // Handle Manual Attendance Override
  async function handleManualOverride(clientId, status) {
    try {
      const res = await fetch(getApiUrl('/api/attendance/manual-override'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          status,
          date: selectedDate,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Athlete attendance manually marked ${status.toUpperCase()}.`, 'success');
        loadAttendanceDashboard(false);
      } else {
        showToast(data.error || 'Failed to override attendance', 'error');
      }
    } catch (err) {
      showToast('Network error overriding attendance', 'error');
    }
  }

  // Load and populate Gym Settings
  async function loadGymSettings() {
    try {
      const res = await fetch(getApiUrl('/api/attendance/settings'));
      const data = await res.json();
      if (data.success && data.settings) {
        const s = data.settings;
        const nameEl = document.getElementById('settingGymName');
        const latEl = document.getElementById('settingLatitude');
        const lngEl = document.getElementById('settingLongitude');
        const radEl = document.getElementById('settingAllowedRadius');
        const openEl = document.getElementById('settingOpenTime');
        const closeEl = document.getElementById('settingCloseTime');
        const qrEl = document.getElementById('settingQrRefresh');

        if (nameEl) nameEl.value = s.name || '';
        if (latEl) latEl.value = s.latitude || 12.9716;
        if (lngEl) lngEl.value = s.longitude || 77.5946;
        if (radEl) radEl.value = String(s.allowedRadiusMeters || 75);
        if (openEl) openEl.value = s.openTime || '05:00';
        if (closeEl) closeEl.value = s.closeTime || '22:00';
        if (qrEl) qrEl.value = String(s.qrRefreshSeconds || 30);
      }
    } catch (e) {
      console.warn('Could not load gym settings:', e);
    }
  }

  // Save Gym Settings Form Submit
  function initSettingsForm() {
    if (!settingsForm) return;

    settingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById('btnSaveAttendanceSettings');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
      }

      const payload = {
        name: document.getElementById('settingGymName')?.value,
        latitude: document.getElementById('settingLatitude')?.value,
        longitude: document.getElementById('settingLongitude')?.value,
        allowedRadiusMeters: document.getElementById('settingAllowedRadius')?.value,
        openTime: document.getElementById('settingOpenTime')?.value,
        closeTime: document.getElementById('settingCloseTime')?.value,
        qrRefreshSeconds: document.getElementById('settingQrRefresh')?.value,
      };

      try {
        const res = await fetch(getApiUrl('/api/attendance/settings'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
          showToast('Facility coordinates and geofence settings saved.', 'success');
        } else {
          showToast(data.error || 'Failed to save settings', 'error');
        }
      } catch (err) {
        showToast('Network error saving facility settings', 'error');
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Facility Settings';
        }
      }
    });
  }

  // Trigger End-of-day Absent Calculation
  function initAbsentJobButton() {
    if (!triggerAbsentBtn) return;

    triggerAbsentBtn.addEventListener('click', async () => {
      const confirmAction = confirm(
        `Run automatic absent calculation for ${selectedDate}?\n\nAll active athletes without a verified check-in will be marked ABSENT.`
      );
      if (!confirmAction) return;

      triggerAbsentBtn.disabled = true;
      triggerAbsentBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

      try {
        const res = await fetch(getApiUrl('/api/attendance/trigger-absent-job'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: selectedDate,
            force: true, // Allow manual admin execution
          }),
        });
        const data = await res.json();
        if (data.success && data.jobResult) {
          const r = data.jobResult;
          showToast(`Job complete: ${r.newlyMarkedAbsent} athletes marked ABSENT.`, 'success');
          loadAttendanceDashboard(false);
        } else {
          showToast(data.error || 'Absent job execution error', 'error');
        }
      } catch (err) {
        showToast('Network error triggering absent job', 'error');
      } finally {
        triggerAbsentBtn.disabled = false;
        triggerAbsentBtn.innerHTML = '<i class="fa-solid fa-moon"></i> <span>Run Absent Job</span>';
      }
    });
  }

  // Initialize Filter and Search Handlers
  function initFilters() {
    // Date filter
    if (dateFilterInput) {
      dateFilterInput.value = selectedDate;
      dateFilterInput.addEventListener('change', (e) => {
        selectedDate = e.target.value || getTodayKolkataDate();
        loadAttendanceDashboard(true);
      });
    }

    // Today button
    if (dateTodayBtn) {
      dateTodayBtn.addEventListener('click', () => {
        selectedDate = getTodayKolkataDate();
        if (dateFilterInput) dateFilterInput.value = selectedDate;
        loadAttendanceDashboard(true);
      });
    }

    // Search query
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.trim();
        renderAttendanceTable();
      });
    }

    // Filter tabs
    if (filterTabs) {
      filterTabs.querySelectorAll('.axg-challenge-filter-btn').forEach((btn) => {
        btn.addEventListener('click', function () {
          filterTabs.querySelectorAll('.axg-challenge-filter-btn').forEach((b) => {
            b.classList.remove('axg-challenge-filter-btn--active');
          });
          this.classList.add('axg-challenge-filter-btn--active');
          currentFilter = this.dataset.filter || 'all';
          renderAttendanceTable();
        });
      });
    }

    // Refresh button
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        loadAttendanceDashboard(true);
        showToast('Attendance data refreshed.', 'info');
      });
    }
  }

  // Embedded Admin QR State & Controller
  let adminQrInterval = null;
  let adminQrRemaining = 30;
  let adminQrTtl = 30;
  let adminQrFetching = false;

  async function fetchAdminQrPreview() {
    if (adminQrFetching) return;
    adminQrFetching = true;

    const qrImg = document.getElementById('adminQrImage');
    const loadingOverlay = document.getElementById('adminQrLoadingOverlay');
    const facilityLabel = document.getElementById('adminQrFacility');

    try {
      const res = await fetch(getApiUrl('/api/attendance/qr-token'), {
        headers: { 'Cache-Control': 'no-cache' },
      });
      const data = await res.json();
      if (data.success && data.qrDataUrl) {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
        if (qrImg) {
          qrImg.src = data.qrDataUrl;
        }
        if (facilityLabel && data.gym?.name) {
          facilityLabel.textContent = data.gym.name;
        }

        const expiresAt = new Date(data.expiresAt).getTime();
        const serverTime = data.serverTime ? new Date(data.serverTime).getTime() : Date.now();
        const diffMs = Math.max(0, expiresAt - serverTime);
        adminQrRemaining = Math.round(diffMs / 1000) || data.expiresInSeconds || 30;
        adminQrTtl = data.expiresInSeconds || 30;

        startAdminQrCountdown();
      }
    } catch (err) {
      console.warn('Could not fetch admin QR preview:', err);
      if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
        const txt = loadingOverlay.querySelector('span');
        if (txt) txt.textContent = 'Server reconnecting...';
      }
    } finally {
      adminQrFetching = false;
    }
  }

  function startAdminQrCountdown() {
    if (adminQrInterval) clearInterval(adminQrInterval);
    updateAdminQrCountdownUI();

    adminQrInterval = setInterval(() => {
      adminQrRemaining--;
      updateAdminQrCountdownUI();

      if (adminQrRemaining <= 1) {
        clearInterval(adminQrInterval);
        fetchAdminQrPreview();
      }
    }, 1000);
  }

  function updateAdminQrCountdownUI() {
    const cdLabel = document.getElementById('adminQrCountdown');
    const progressFill = document.getElementById('adminQrProgressFill');
    const safeRemaining = Math.max(0, adminQrRemaining);

    if (cdLabel) cdLabel.textContent = `${safeRemaining}s`;
    if (progressFill) {
      const pct = Math.max(0, Math.min(100, (safeRemaining / adminQrTtl) * 100));
      progressFill.style.width = `${pct}%`;
    }
  }

  function initAdminQrLive() {
    // Wire up links to fullscreen display
    const openQrBtns = document.querySelectorAll('a[href="/admin/gym-qr"], #btnOpenQrDisplay, #adminQrLaunchFullscreenBtn');
    openQrBtns.forEach((btn) => {
      btn.href = getApiUrl('/admin/gym-qr');
    });

    const refreshQrBtn = document.getElementById('adminQrManualRefreshBtn');
    if (refreshQrBtn) {
      refreshQrBtn.addEventListener('click', () => {
        fetchAdminQrPreview();
        showToast('Dynamic QR refreshed.', 'info');
      });
    }

    fetchAdminQrPreview();
  }

  // Escape HTML helper
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    initNav();
    initFilters();
    initAbsentJobButton();
    initSettingsForm();
    loadGymSettings();
    initAdminQrLive();
    loadAttendanceDashboard(true);

    // Auto-refresh every 30 seconds for live attendance monitoring
    refreshTimer = setInterval(() => {
      // Only refresh if date is today
      if (selectedDate === getTodayKolkataDate()) {
        loadAttendanceDashboard(false);
      }
    }, 30000);
  });
})();
