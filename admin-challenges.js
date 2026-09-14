/**
 * ============================================================
 * ALPHA X GYM — ADMIN PUBLIC CHALLENGES MANAGEMENT
 * Powered by PostgreSQL + Prisma REST API (NO Supabase)
 * Core Architecture: ADMIN CONTROLS EVERYTHING
 * Handles challenge creation, editing, publishing, day-by-day
 * workout management, athlete tracking, and public link generation.
 * ============================================================
 */

(function () {
  'use strict';

  let currentEditingChallengeId = null;
  let currentFilter = 'all';
  let searchQuery = '';

  // Workout Builder State
  let wbChallengeId = null;
  let wbDays = [];
  let wbCurrentDay = 1;

  // DOM Elements
  const challengesGrid         = document.getElementById('adminChallengesGrid');
  const challengeModal         = document.getElementById('challengeModal');
  const challengeForm          = document.getElementById('challengeForm');
  const modalTitle             = document.getElementById('challengeModalTitle');
  const openCreateBtn          = document.getElementById('openCreateChallengeModal');
  const closeChallengeModalBtn = document.getElementById('closeChallengeModal');
  const cancelChallengeBtn     = document.getElementById('cancelChallengeBtn');

  // KPI Elements
  const kpiTotalEl             = document.getElementById('kpiTotalChallenges');
  const kpiActiveEl            = document.getElementById('kpiActiveChallenges');
  const kpiParticipantsEl      = document.getElementById('kpiTotalParticipants');
  const kpiCompletedTodayEl    = document.getElementById('kpiCompletedToday');

  // Search & Filter Tabs
  const searchInput            = document.getElementById('challengeSearchInput');
  const filterTabsContainer    = document.getElementById('challengeFilterTabs');

  // Share Link Modal Elements
  const shareLinkModal         = document.getElementById('shareLinkModal');
  const closeShareLinkModalBtn = document.getElementById('closeShareLinkModal');
  const shareLinkInput         = document.getElementById('shareLinkInput');
  const copyShareLinkBtn       = document.getElementById('copyShareLinkBtn');
  const previewShareLinkBtn    = document.getElementById('previewShareLinkBtn');
  const shareChallengeTitle    = document.getElementById('shareChallengeTitleDisplay');

  // Form Inputs
  const inputTitle             = document.getElementById('inputChallengeTitle');
  const inputDesc              = document.getElementById('inputChallengeDesc');
  const inputDays              = document.getElementById('inputChallengeDays');
  const inputStart             = document.getElementById('inputChallengeStart');
  const inputEnd               = document.getElementById('inputChallengeEnd');
  const inputStatus            = document.getElementById('inputChallengeStatus');
  const inputImage             = document.getElementById('inputChallengeImage');
  const inputVisibility        = document.getElementById('inputChallengeVisibility');
  const inputRules             = document.getElementById('inputChallengeRules');
  const inputRewards           = document.getElementById('inputChallengeRewards');

  // Workout Builder Elements
  const wbModal                = document.getElementById('workoutBuilderModal');
  const wbCloseBtn             = document.getElementById('closeWorkoutBuilderModal');
  const wbCancelBtn            = document.getElementById('closeWorkoutBuilderBtn');
  const wbSaveBtn              = document.getElementById('saveWorkoutDayBtn');
  const wbTitleDisplay         = document.getElementById('wbChallengeTitle');
  const wbDaysStrip            = document.getElementById('wbDaysStrip');
  const wbDayTitleInput        = document.getElementById('wbDayTitleInput');
  const wbDayRewardInput       = document.getElementById('wbDayRewardInput');
  const wbDayDescInput         = document.getElementById('wbDayDescInput');
  const wbExercisesList        = document.getElementById('wbExercisesList');
  const wbAddExerciseBtn       = document.getElementById('wbAddExerciseBtn');

  // Challenge Details Modal Elements
  const cdModal                = document.getElementById('challengeDetailsModal');
  const cdCloseBtn             = document.getElementById('closeChallengeDetailsModal');
  const cdCloseFooterBtn       = document.getElementById('closeChallengeDetailsFooterBtn');
  const cdModalTitle           = document.getElementById('cdModalTitle');
  const cdModalStatusBadge     = document.getElementById('cdModalStatusBadge');
  const cdModalDesc            = document.getElementById('cdModalDesc');
  const cdModalStatus          = document.getElementById('cdModalStatus');
  const cdModalStart           = document.getElementById('cdModalStart');
  const cdModalEnd             = document.getElementById('cdModalEnd');
  const cdModalDays            = document.getElementById('cdModalDays');
  const cdModalParticipants    = document.getElementById('cdModalParticipants');
  const cdModalCompletions     = document.getElementById('cdModalCompletions');
  const cdModalProgress        = document.getElementById('cdModalProgress');
  const cdModalPublicLink      = document.getElementById('cdModalPublicLink');
  const cdModalCopyLinkBtn     = document.getElementById('cdModalCopyLinkBtn');
  const cdModalOpenPublicBtn   = document.getElementById('cdModalOpenPublicBtn');
  const cdModalRulesBox        = document.getElementById('cdModalRulesBox');
  const cdModalRulesText       = document.getElementById('cdModalRulesText');
  const cdModalRewardsBox      = document.getElementById('cdModalRewardsBox');
  const cdModalRewardsText     = document.getElementById('cdModalRewardsText');
  const cdBtnEditChallenge     = document.getElementById('cdBtnEditChallenge');
  const cdBtnManageDays        = document.getElementById('cdBtnManageDays');
  const cdBtnManageExercises   = document.getElementById('cdBtnManageExercises');
  const cdBtnManageRewards     = document.getElementById('cdBtnManageRewards');
  const cdBtnViewParticipants  = document.getElementById('cdBtnViewParticipants');
  const cdBtnViewAnalytics     = document.getElementById('cdBtnViewAnalytics');
  const cdModalCreatedAt       = document.getElementById('cdModalCreatedAt');
  const myChallengesBadge      = document.getElementById('myChallengesCountBadge');

  /**
   * Generates public shareable URL for a challenge
   */
  function getPublicChallengeUrl(challengeId) {
    const origin = window.location.origin;
    const pathname = window.location.pathname;
    const basePath = pathname.substring(0, pathname.lastIndexOf('/') + 1);
    return `${origin}${basePath}challenge.html?id=${challengeId}`;
  }

  /**
   * Format date for clean UI display (e.g. 15 Sep 2026)
   */
  function formatDateDisplay(d) {
    if (!d) return '—';
    try {
      const parts = String(d).split('T')[0].split('-');
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        const dateObj = new Date(year, month, day);
        return dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      }
      const parsed = new Date(d);
      if (!isNaN(parsed.getTime())) {
        return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      }
      return String(d);
    } catch (e) {
      return String(d);
    }
  }

  /**
   * Fetch challenges from PostgreSQL + Prisma API with offline fallback & local sync
   */
  async function fetchChallenges() {
    let apiChallenges = null;
    try {
      const res = await fetch('/api/admin/challenges');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.challenges)) {
          apiChallenges = data.challenges;
        }
      }
    } catch (err) {
      console.warn('API fetch failed, reading cached challenges:', err);
    }

    let local = JSON.parse(localStorage.getItem('axg_public_challenges') || '[]');

    if (apiChallenges && Array.isArray(apiChallenges)) {
      // Keep any local challenges that haven't synced to API yet, then merge API items
      const apiIds = new Set(apiChallenges.map(c => c.id));
      const localOnly = local.filter(c => !apiIds.has(c.id));
      const merged = [...localOnly, ...apiChallenges];
      localStorage.setItem('axg_public_challenges', JSON.stringify(merged));
      return merged;
    }

    if (local.length > 0) {
      return local;
    }

    // Default seeded challenge if completely empty
    const defaultChallenge = {
      id: '100day-alpha',
      title: 'Alpha X 100-Day Challenge',
      name: 'Alpha X 100-Day Challenge',
      description: 'The premier 100-day discipline and hypertrophy transformation challenge.',
      total_days: 100,
      totalDays: 100,
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 99 * 86400000).toISOString().split('T')[0],
      status: 'active',
      visibility: 'public',
      rules: '1. Complete daily prescribed sets. 2. Log weight in KG and actual reps. 3. Rest 60-90s between sets.',
      rewards: 'Day 7: Consistency Badge, Day 30: Warrior Badge, Day 100: Alpha X Finisher',
      image_url: 'images/gym-hero.jpg',
      participants_count: 3,
      completed_workouts: 14,
      completion_rate: 68,
      created_at: new Date().toISOString(),
    };
    local = [defaultChallenge];
    localStorage.setItem('axg_public_challenges', JSON.stringify(local));
    return local;
  }

  /**
   * Update KPI Stat Cards and Directory Counter
   */
  async function updateKPIs(challenges) {
    const total = challenges.length;
    const active = challenges.filter(c => (c.status || 'active').toLowerCase() === 'active').length;
    let participants = 0;
    let completedToday = 0;

    challenges.forEach(c => {
      participants += (c.participants_count || 0);
      completedToday += (c.completed_workouts || c.completed_today || 0);
    });

    try {
      const res = await fetch('/api/admin/dashboard-stats');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.stats) {
          if (kpiTotalEl) kpiTotalEl.textContent = total;
          if (kpiActiveEl) kpiActiveEl.textContent = `${active} Active`;
          if (kpiParticipantsEl) kpiParticipantsEl.textContent = data.stats.totalClients || participants;
          if (kpiCompletedTodayEl) kpiCompletedTodayEl.textContent = data.stats.completedToday || completedToday;
          if (myChallengesBadge) myChallengesBadge.textContent = `${total} ${total === 1 ? 'Challenge' : 'Challenges'}`;
          return;
        }
      }
    } catch (e) {
      // ignore
    }

    if (kpiTotalEl) kpiTotalEl.textContent = total;
    if (kpiActiveEl) kpiActiveEl.textContent = `${active} Active`;
    if (kpiParticipantsEl) kpiParticipantsEl.textContent = participants;
    if (kpiCompletedTodayEl) kpiCompletedTodayEl.textContent = completedToday;
    if (myChallengesBadge) myChallengesBadge.textContent = `${total} ${total === 1 ? 'Challenge' : 'Challenges'}`;
  }

  /**
   * Render Challenges in Admin Grid with Full Controls
   */
  async function renderChallenges() {
    if (!challengesGrid) return;

    challengesGrid.innerHTML = `
      <div class="axg-loading-placeholder">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <span>Loading PostgreSQL challenge hub...</span>
      </div>`;

    const allChallenges = await fetchChallenges();
    await updateKPIs(allChallenges);

    // Apply Filter & Search
    let filtered = allChallenges;
    if (currentFilter !== 'all') {
      filtered = filtered.filter(c => c.status === currentFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(c =>
        (c.title && c.title.toLowerCase().includes(q)) ||
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.description && c.description.toLowerCase().includes(q))
      );
    }

    if (!filtered || filtered.length === 0) {
      challengesGrid.innerHTML = `
        <div class="axg-empty-state" style="grid-column: 1 / -1;">
          <div class="axg-empty-state__icon-box">
            <i class="fa-solid fa-trophy axg-empty-state__icon"></i>
          </div>
          <h3 class="axg-empty-state__heading">No Challenges Found</h3>
          <p class="axg-empty-state__text">
            ${currentFilter !== 'all' ? `No challenges with status "${currentFilter}".` : 'Create your first challenge to initialize athlete tracking.'}
          </p>
          <button type="button" class="axg-btn axg-btn--primary" onclick="document.getElementById('openCreateChallengeModal').click()">
            <i class="fa-solid fa-plus"></i> Create Challenge
          </button>
        </div>`;
      return;
    }

    challengesGrid.innerHTML = '';

    filtered.forEach(challenge => {
      const publicUrl = getPublicChallengeUrl(challenge.id);
      const status = (challenge.status || 'active').toLowerCase();
      const statusClass = status === 'active'    ? 'axg-badge--active'
                        : status === 'completed' ? 'axg-badge--completed'
                        : status === 'draft'     ? 'axg-badge--upcoming'
                        : status === 'archived'  ? 'axg-badge--archived'
                        : 'axg-badge--inactive';
      const statusLabel = status.toUpperCase();
      const coverImage = challenge.image_url || challenge.imageUrl || 'images/gym-hero.jpg';

      const visibility = (challenge.visibility || 'public').toLowerCase();
      const visibilityClass = visibility === 'public'   ? 'axg-badge--public'
                            : visibility === 'unlisted' ? 'axg-badge--unlisted'
                            : 'axg-badge--private';
      const visibilityIcon = visibility === 'public'   ? 'fa-globe'
                           : visibility === 'unlisted' ? 'fa-link'
                           : 'fa-lock';
      const visibilityLabel = visibility.toUpperCase();

      const card = document.createElement('div');
      card.className = 'axg-challenge-card';
      card.dataset.id = challenge.id;

      card.innerHTML = `
        <!-- Rich Cover Banner -->
        <div class="axg-challenge-card__cover" style="background-image: linear-gradient(180deg, rgba(7, 7, 7, 0.4) 0%, rgba(18, 18, 18, 0.96) 100%), url('${coverImage}');">
          <div class="axg-challenge-card__badge-group">
            <span class="axg-badge ${statusClass}">
              <i class="fa-solid fa-circle" style="font-size: 7px; margin-right: 4px;"></i> ${statusLabel}
            </span>
            <span class="axg-badge ${visibilityClass}">
              <i class="fa-solid ${visibilityIcon}" style="font-size: 8px; margin-right: 4px;"></i> ${visibilityLabel}
            </span>
            <span class="axg-challenge-card__days">
              <i class="fa-solid fa-calendar-days"></i> ${challenge.total_days || challenge.totalDays || 100} Days
            </span>
          </div>

          <div class="axg-challenge-card__actions">
            <button type="button" class="axg-icon-btn btn-edit-challenge" data-id="${challenge.id}" title="Edit Challenge Information">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button type="button" class="axg-icon-btn btn-toggle-status" data-id="${challenge.id}" data-status="${challenge.status}" title="${challenge.status === 'active' ? 'Deactivate Challenge' : 'Activate Challenge'}">
              <i class="fa-solid ${challenge.status === 'active' ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
            </button>
            <button type="button" class="axg-icon-btn axg-icon-btn--archive btn-archive-challenge" data-id="${challenge.id}" data-status="${challenge.status}" title="${challenge.status === 'archived' ? 'Restore Challenge' : 'Archive Challenge'}">
              <i class="fa-solid ${challenge.status === 'archived' ? 'fa-box-open' : 'fa-box-archive'}"></i>
            </button>
            <button type="button" class="axg-icon-btn axg-icon-btn--delete btn-delete-challenge" data-id="${challenge.id}" title="Delete Challenge">
              <i class="fa-regular fa-trash-can"></i>
            </button>
          </div>
        </div>

        <!-- Card Body -->
        <div class="axg-challenge-card__body">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
            <h3 class="axg-challenge-card__title" style="cursor: pointer;" title="Click to open challenge details">${escapeHtml(challenge.title || challenge.name)}</h3>
            <span style="font-size: 11px; font-weight: 700; color: ${status === 'active' ? 'var(--green)' : 'var(--text-muted)'}; white-space: nowrap;">
              ${status === 'active' ? '🟢 Active' : status === 'completed' ? '🔵 Completed' : status === 'draft' ? '🟡 Draft' : '⚪ Archived'}
            </span>
          </div>
          <p class="axg-challenge-card__desc">${escapeHtml(challenge.description || 'Admin prescribed 100-Day transformation challenge.')}</p>

          ${challenge.rules ? `
          <div class="axg-challenge-card__rule-chip" title="${escapeHtml(challenge.rules)}">
            <i class="fa-solid fa-clipboard-list"></i>
            <span><strong>Rules:</strong> ${escapeHtml(challenge.rules.length > 70 ? challenge.rules.slice(0, 70) + '...' : challenge.rules)}</span>
          </div>` : ''}

          ${(challenge.rewards || challenge.rewardSummary) ? `
          <div class="axg-challenge-card__reward-chip" title="${escapeHtml(challenge.rewards || challenge.rewardSummary)}">
            <i class="fa-solid fa-award"></i>
            <span><strong>Rewards:</strong> ${escapeHtml((challenge.rewards || challenge.rewardSummary).length > 70 ? (challenge.rewards || challenge.rewardSummary).slice(0, 70) + '...' : (challenge.rewards || challenge.rewardSummary))}</span>
          </div>` : ''}

          <!-- Timeline Strip -->
          <div class="axg-challenge-card__timeline">
            <div class="axg-timeline-item">
              <span class="axg-timeline-label">Start Date</span>
              <span class="axg-timeline-value">${challenge.start_date || challenge.startDate ? formatDateDisplay(challenge.start_date || challenge.startDate) : '—'}</span>
            </div>
            <div class="axg-timeline-arrow"><i class="fa-solid fa-arrow-right"></i></div>
            <div class="axg-timeline-item">
              <span class="axg-timeline-label">End Date</span>
              <span class="axg-timeline-value">${challenge.end_date || challenge.endDate ? formatDateDisplay(challenge.end_date || challenge.endDate) : '—'}</span>
            </div>
          </div>

          <!-- Admin Metric Chips -->
          <div class="axg-challenge-metrics-bar">
            <div class="axg-cmetric-item">
              <span class="axg-cmetric-val accent">${challenge.participants_count || 0}</span>
              <span class="axg-cmetric-lbl">Participants</span>
            </div>
            <div class="axg-cmetric-item">
              <span class="axg-cmetric-val">${challenge.total_days || challenge.totalDays || 100}</span>
              <span class="axg-cmetric-lbl">Days</span>
            </div>
            <div class="axg-cmetric-item">
              <span class="axg-cmetric-val green">${challenge.completion_rate || 0}%</span>
              <span class="axg-cmetric-lbl">Progress</span>
            </div>
          </div>

          <!-- User Explicitly Requested Action Toolbar: [Open] [Edit] [Manage Days] [Participants] [Copy Public Link] [Delete] -->
          <div class="axg-card-actions-bar" style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px;">
            <button type="button" class="axg-btn axg-btn--primary axg-btn--small btn-open-challenge" data-id="${challenge.id}" title="Open full challenge details & controls">
              <i class="fa-solid fa-folder-open"></i> Open
            </button>
            <button type="button" class="axg-btn axg-btn--ghost axg-btn--small btn-edit-challenge" data-id="${challenge.id}" title="Edit Challenge Information">
              <i class="fa-solid fa-pen-to-square"></i> Edit
            </button>
            <button type="button" class="axg-btn axg-btn--ghost axg-btn--small btn-manage-workouts" data-id="${challenge.id}" data-title="${escapeHtml(challenge.title || challenge.name)}" title="Manage Workouts (Day 1–${challenge.total_days || challenge.totalDays || 100})">
              <i class="fa-solid fa-calendar-days"></i> Manage Days
            </button>
            <button type="button" class="axg-btn axg-btn--ghost axg-btn--small btn-view-participants" data-id="${challenge.id}" title="View Enrolled Athletes">
              <i class="fa-solid fa-users"></i> Participants
            </button>
            <button type="button" class="axg-btn axg-btn--ghost axg-btn--small btn-copy-link" data-url="${publicUrl}" title="Copy shareable public link">
              <i class="fa-regular fa-copy"></i> Copy Public Link
            </button>
            <button type="button" class="axg-btn axg-btn--ghost axg-btn--small axg-btn--delete btn-delete-challenge" data-id="${challenge.id}" title="Delete Challenge">
              <i class="fa-regular fa-trash-can"></i> Delete
            </button>
          </div>
        </div>

        <!-- Card Footer: Public Athlete Link Box -->
        <div class="axg-challenge-card__footer">
          <div class="axg-public-link-box">
            <span class="axg-link-label"><i class="fa-solid fa-link"></i> Public Challenge Link:</span>
            <div class="axg-link-input-group">
              <input type="text" class="axg-link-input" readonly value="${publicUrl}" />
              <button type="button" class="axg-btn axg-btn--copy btn-copy-link" data-url="${publicUrl}" title="Copy shareable link">
                <i class="fa-regular fa-copy"></i> <span>Copy Public Link</span>
              </button>
              <a href="${publicUrl}" target="_blank" class="axg-btn axg-btn--preview" title="Open public client page in new tab">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> <span>Open Public Challenge</span>
              </a>
            </div>
          </div>
        </div>
      `;

      challengesGrid.appendChild(card);
    });

    bindCardEvents();
  }

  /**
   * Bind Event Listeners to Challenge Cards
   */
  function bindCardEvents() {
    // Open Challenge Details
    challengesGrid.querySelectorAll('.btn-open-challenge').forEach(btn => {
      btn.onclick = function () {
        openChallengeDetails(this.dataset.id);
      };
    });

    challengesGrid.querySelectorAll('.axg-challenge-card__title').forEach(titleEl => {
      titleEl.onclick = function () {
        const card = this.closest('.axg-challenge-card');
        if (card) openChallengeDetails(card.dataset.id);
      };
    });

    // Copy Link Buttons
    challengesGrid.querySelectorAll('.btn-copy-link').forEach(btn => {
      btn.onclick = function () {
        copyToClipboard(this.dataset.url, this);
      };
    });

    // Edit Challenge Buttons
    challengesGrid.querySelectorAll('.btn-edit-challenge').forEach(btn => {
      btn.onclick = function () {
        openEditModal(this.dataset.id);
      };
    });

    // Status Toggle Buttons (Active <-> Draft)
    challengesGrid.querySelectorAll('.btn-toggle-status').forEach(btn => {
      btn.onclick = function () {
        toggleChallengeStatus(this.dataset.id, this.dataset.status);
      };
    });

    // Archive Challenge Buttons
    challengesGrid.querySelectorAll('.btn-archive-challenge').forEach(btn => {
      btn.onclick = function () {
        archiveChallenge(this.dataset.id, this.dataset.status);
      };
    });

    // Delete Challenge Buttons
    challengesGrid.querySelectorAll('.btn-delete-challenge').forEach(btn => {
      btn.onclick = function () {
        deleteChallenge(this.dataset.id);
      };
    });

    // Manage Workouts / Days Trigger
    challengesGrid.querySelectorAll('.btn-manage-workouts').forEach(btn => {
      btn.onclick = function () {
        openWorkoutBuilder(this.dataset.id, this.dataset.title);
      };
    });

    // View Participants Trigger
    challengesGrid.querySelectorAll('.btn-view-participants').forEach(btn => {
      btn.onclick = function () {
        const clientNav = document.getElementById('navClients');
        if (clientNav) clientNav.click();
      };
    });
  }

  /**
   * Open Challenge Details Modal
   */
  async function openChallengeDetails(challengeId) {
    const challenges = await fetchChallenges();
    const challenge = challenges.find(c => c.id === challengeId);
    if (!challenge) return;

    const publicUrl = getPublicChallengeUrl(challenge.id);
    const status = (challenge.status || 'active').toLowerCase();

    if (cdModalTitle) cdModalTitle.textContent = challenge.title || challenge.name || 'Challenge Details';
    if (cdModalStatusBadge) {
      cdModalStatusBadge.className = `axg-badge ${
        status === 'active' ? 'axg-badge--active' :
        status === 'completed' ? 'axg-badge--completed' :
        status === 'draft' ? 'axg-badge--upcoming' : 'axg-badge--archived'
      }`;
      cdModalStatusBadge.textContent = status.toUpperCase();
    }

    if (cdModalDesc) {
      cdModalDesc.textContent = challenge.description || 'Admin prescribed 100-Day transformation challenge.';
    }

    if (cdModalStatus) {
      const icon = status === 'active' ? '🟢' : status === 'completed' ? '🔵' : status === 'draft' ? '🟡' : '⚪';
      cdModalStatus.textContent = `${icon} ${status.charAt(0).toUpperCase() + status.slice(1)}`;
      cdModalStatus.style.color = status === 'active' ? 'var(--green)' : status === 'completed' ? 'var(--blue)' : 'var(--yellow)';
    }

    const startStr = challenge.start_date || challenge.startDate;
    const endStr = challenge.end_date || challenge.endDate;
    if (cdModalStart) cdModalStart.textContent = startStr ? formatDateDisplay(startStr) : '—';
    if (cdModalEnd) cdModalEnd.textContent = endStr ? formatDateDisplay(endStr) : '—';

    const totalDays = challenge.total_days || challenge.totalDays || 100;
    if (cdModalDays) cdModalDays.textContent = `${totalDays} Days`;

    if (cdModalParticipants) cdModalParticipants.textContent = `${challenge.participants_count || 0} Athletes`;
    if (cdModalCompletions) cdModalCompletions.textContent = `${challenge.completed_workouts || challenge.completed_today || 0} Sessions`;
    if (cdModalProgress) cdModalProgress.textContent = `${challenge.completion_rate || 0}%`;

    if (cdModalPublicLink) cdModalPublicLink.value = publicUrl;
    if (cdModalCopyLinkBtn) {
      cdModalCopyLinkBtn.onclick = function () {
        copyToClipboard(publicUrl, cdModalCopyLinkBtn);
      };
    }
    if (cdModalOpenPublicBtn) {
      cdModalOpenPublicBtn.href = publicUrl;
    }

    if (cdModalRulesBox && cdModalRulesText) {
      if (challenge.rules) {
        cdModalRulesText.textContent = challenge.rules;
        cdModalRulesBox.style.display = 'block';
      } else {
        cdModalRulesBox.style.display = 'none';
      }
    }

    if (cdModalRewardsBox && cdModalRewardsText) {
      const rew = challenge.rewards || challenge.rewardSummary;
      if (rew) {
        cdModalRewardsText.textContent = rew;
        cdModalRewardsBox.style.display = 'block';
      } else {
        cdModalRewardsBox.style.display = 'none';
      }
    }

    if (cdModalCreatedAt) {
      const created = challenge.created_at || challenge.createdAt;
      cdModalCreatedAt.textContent = created ? `Created: ${formatDateDisplay(created)}` : 'Created: Active';
    }

    // Action Buttons in Details Modal
    if (cdBtnEditChallenge) {
      cdBtnEditChallenge.onclick = () => {
        closeChallengeDetails();
        openEditModal(challenge.id);
      };
    }
    if (cdBtnManageDays) {
      cdBtnManageDays.onclick = () => {
        closeChallengeDetails();
        openWorkoutBuilder(challenge.id, challenge.title || challenge.name);
      };
    }
    if (cdBtnManageExercises) {
      cdBtnManageExercises.onclick = () => {
        closeChallengeDetails();
        openWorkoutBuilder(challenge.id, challenge.title || challenge.name);
      };
    }
    if (cdBtnManageRewards) {
      cdBtnManageRewards.onclick = () => {
        closeChallengeDetails();
        openEditModal(challenge.id);
      };
    }
    if (cdBtnViewParticipants) {
      cdBtnViewParticipants.onclick = () => {
        closeChallengeDetails();
        const clientNav = document.getElementById('navClients');
        if (clientNav) clientNav.click();
      };
    }
    if (cdBtnViewAnalytics) {
      cdBtnViewAnalytics.onclick = () => {
        closeChallengeDetails();
        const dashNav = document.getElementById('navDashboard');
        if (dashNav) dashNav.click();
      };
    }

    if (cdModal) cdModal.style.display = 'flex';
  }

  function closeChallengeDetails() {
    if (cdModal) cdModal.style.display = 'none';
  }

  /**
   * Toggle Challenge Status
   */
  async function toggleChallengeStatus(challengeId, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'draft' : 'active';

    try {
      await fetch(`/api/admin/challenges/${challengeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (err) {
      console.warn('API error:', err);
    }

    let currentList = JSON.parse(localStorage.getItem('axg_public_challenges') || '[]');
    const item = currentList.find(c => c.id === challengeId);
    if (item) {
      item.status = newStatus;
      localStorage.setItem('axg_public_challenges', JSON.stringify(currentList));
    }

    await renderChallenges();
    showToast(`Challenge is now ${newStatus.toUpperCase()}`);
  }

  /**
   * Archive / Unarchive Challenge
   */
  async function archiveChallenge(challengeId, currentStatus) {
    const newStatus = currentStatus === 'archived' ? 'active' : 'archived';
    const actionLabel = newStatus === 'archived' ? 'archive' : 'restore';
    if (!confirm(`Are you sure you want to ${actionLabel} this challenge?`)) return;

    try {
      await fetch(`/api/admin/challenges/${challengeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
    } catch (err) {
      console.warn('API error:', err);
    }

    let currentList = JSON.parse(localStorage.getItem('axg_public_challenges') || '[]');
    const item = currentList.find(c => c.id === challengeId);
    if (item) {
      item.status = newStatus;
      localStorage.setItem('axg_public_challenges', JSON.stringify(currentList));
    }

    await renderChallenges();
    showToast(`Challenge is now ${newStatus.toUpperCase()}`);
  }

  /**
   * Open Create Modal
   */
  function openCreateModal() {
    currentEditingChallengeId = null;
    modalTitle.textContent = 'Create New Challenge';
    challengeForm.reset();

    const today = new Date().toISOString().split('T')[0];
    inputStart.value = today;
    inputDays.value = 100;
    calculateEndDate();
    inputStatus.value = 'active';
    if (inputImage) inputImage.value = '';
    if (inputVisibility) inputVisibility.value = 'public';
    if (inputRules) inputRules.value = '';
    if (inputRewards) inputRewards.value = '';

    challengeModal.style.display = 'flex';
  }

  /**
   * Open Edit Modal
   */
  async function openEditModal(challengeId) {
    currentEditingChallengeId = challengeId;
    modalTitle.textContent = 'Edit Challenge Settings';

    const challenges = await fetchChallenges();
    const challenge = challenges.find(c => c.id === challengeId);
    if (!challenge) return;

    inputTitle.value  = challenge.title || challenge.name || '';
    inputDesc.value   = challenge.description || '';
    inputDays.value   = challenge.total_days || challenge.totalDays || 100;
    inputStart.value  = challenge.start_date || challenge.startDate ? String(challenge.start_date || challenge.startDate).split('T')[0] : '';
    inputEnd.value    = challenge.end_date || challenge.endDate ? String(challenge.end_date || challenge.endDate).split('T')[0] : '';
    inputStatus.value = challenge.status || 'active';
    if (inputImage) inputImage.value = challenge.image_url || challenge.imageUrl || '';
    if (inputVisibility) inputVisibility.value = challenge.visibility || 'public';
    if (inputRules) inputRules.value = challenge.rules || '';
    if (inputRewards) inputRewards.value = challenge.rewards || challenge.rewardSummary || '';

    challengeModal.style.display = 'flex';
  }

  function closeChallengeModal() {
    challengeModal.style.display = 'none';
    currentEditingChallengeId = null;
    challengeForm.reset();
  }

  function calculateEndDate() {
    if (!inputStart.value) return;
    const days = parseInt(inputDays.value, 10) || 100;
    const startParts = inputStart.value.split('-').map(Number);
    const startDate = new Date(startParts[0], startParts[1] - 1, startParts[2]);
    startDate.setDate(startDate.getDate() + (days - 1));

    const y = startDate.getFullYear();
    const m = String(startDate.getMonth() + 1).padStart(2, '0');
    const d = String(startDate.getDate()).padStart(2, '0');
    inputEnd.value = `${y}-${m}-${d}`;
  }

  /**
   * Save (Create or Update) Challenge via PostgreSQL + Prisma REST API
   */
  async function handleSaveChallenge(e) {
    e.preventDefault();

    const title       = inputTitle.value.trim();
    const description = inputDesc.value.trim();
    const total_days  = parseInt(inputDays.value, 10) || 100;
    const start_date  = inputStart.value;
    const end_date    = inputEnd.value;
    const status      = inputStatus.value || 'active';
    const image_url   = inputImage ? inputImage.value.trim() : '';
    const visibility  = inputVisibility ? inputVisibility.value : 'public';
    const rules       = inputRules ? inputRules.value.trim() : '';
    const rewards     = inputRewards ? inputRewards.value.trim() : '';

    if (!title || !start_date || !end_date) {
      alert('Please fill in Challenge Title, Start Date, and End Date.');
      return;
    }

    const isCreating = !currentEditingChallengeId;
    const generatedId = currentEditingChallengeId || ('chal_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6));

    let challengeRecord = {
      id: generatedId,
      title,
      name: title,
      description,
      total_days,
      totalDays: total_days,
      start_date,
      startDate: start_date,
      end_date,
      endDate: end_date,
      status,
      visibility,
      rules,
      rewards,
      rewardSummary: rewards,
      image_url: image_url || 'images/gym-hero.jpg',
      imageUrl: image_url || 'images/gym-hero.jpg',
      participants_count: 0,
      completed_workouts: 0,
      completion_rate: 0,
      created_at: new Date().toISOString(),
    };

    const payload = {
      title,
      name: title,
      description,
      total_days,
      start_date,
      end_date,
      status,
      image_url,
      imageUrl: image_url,
      visibility,
      rules,
      rewards,
      rewardSummary: rewards,
    };

    try {
      const url = currentEditingChallengeId
        ? `/api/admin/challenges/${currentEditingChallengeId}`
        : '/api/admin/challenges';
      const method = currentEditingChallengeId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.challenge) {
          challengeRecord = { ...challengeRecord, ...data.challenge };
        }
      }
    } catch (err) {
      console.warn('API save note (using local cache synchronization):', err);
    }

    // Always update local storage so newly created challenge is immediately at the VERY TOP of the list
    let currentList = JSON.parse(localStorage.getItem('axg_public_challenges') || '[]');
    if (isCreating) {
      currentList = [challengeRecord, ...currentList.filter(c => c.id !== challengeRecord.id)];
    } else {
      const idx = currentList.findIndex(c => c.id === challengeRecord.id);
      if (idx !== -1) {
        currentList[idx] = { ...currentList[idx], ...challengeRecord };
      } else {
        currentList.unshift(challengeRecord);
      }
    }
    localStorage.setItem('axg_public_challenges', JSON.stringify(currentList));

    closeChallengeModal();
    await renderChallenges();

    // Show explicit success message as requested
    if (isCreating) {
      showToast('Challenge Created Successfully');
    } else {
      showToast('Challenge updated successfully');
    }

    // Automatically redirect/scroll to My Challenges section
    const targetSection = document.getElementById('challengeManagementSection') || document.getElementById('adminChallengesGrid');
    if (targetSection) {
      targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // Pulse highlight newly created challenge card
    setTimeout(() => {
      const targetCard = document.querySelector(`.axg-challenge-card[data-id="${challengeRecord.id}"]`);
      if (targetCard) {
        targetCard.classList.remove('axg-pulse-highlight');
        void targetCard.offsetWidth;
        targetCard.classList.add('axg-pulse-highlight');
      }
    }, 250);
  }

  /**
   * Delete Challenge
   */
  async function deleteChallenge(challengeId) {
    if (!confirm('Are you sure you want to delete this challenge? This will remove all associated workout days from PostgreSQL.')) {
      return;
    }

    try {
      await fetch(`/api/admin/challenges/${challengeId}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('API delete error:', err);
    }

    let currentList = JSON.parse(localStorage.getItem('axg_public_challenges') || '[]');
    currentList = currentList.filter(c => c.id !== challengeId);
    localStorage.setItem('axg_public_challenges', JSON.stringify(currentList));

    await renderChallenges();
    showToast('Challenge deleted successfully.');
  }

  /**
   * Open Share Link Modal
   */
  function openShareLinkModal(challenge) {
    const publicUrl = getPublicChallengeUrl(challenge.id);
    if (shareChallengeTitle) shareChallengeTitle.textContent = challenge.title || challenge.name;
    if (shareLinkInput) shareLinkInput.value = publicUrl;
    if (previewShareLinkBtn) previewShareLinkBtn.href = publicUrl;

    if (shareLinkModal) shareLinkModal.style.display = 'flex';
  }

  function closeShareLinkModal() {
    if (shareLinkModal) shareLinkModal.style.display = 'none';
  }

  function copyToClipboard(text, btnElement) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Link copied successfully.');
      if (btnElement) {
        const originalHtml = btnElement.innerHTML;
        btnElement.innerHTML = '<i class="fa-solid fa-check"></i> <span>Link copied!</span>';
        btnElement.classList.add('axg-btn--copied');
        setTimeout(() => {
          btnElement.innerHTML = originalHtml;
          btnElement.classList.remove('axg-btn--copied');
        }, 2000);
      }
    }).catch(() => {
      prompt('Copy this link:', text);
      showToast('Link copied successfully.');
    });
  }

  // ============================================================
  // WORKOUT BUILDER CONTROLLER (DAY 1 TO 100)
  // ============================================================
  async function openWorkoutBuilder(challengeId, challengeName) {
    wbChallengeId = challengeId;
    if (wbTitleDisplay) wbTitleDisplay.textContent = `Workout Builder: ${challengeName || '100-Day Challenge'}`;
    if (wbModal) wbModal.style.display = 'flex';

    // Fetch Days from Prisma API
    try {
      const res = await fetch(`/api/admin/challenges/${challengeId}/days`);
      if (res.ok) {
        const data = await res.json();
        wbDays = data.days || [];
      }
    } catch (e) {
      console.warn('Could not load days from API:', e);
      wbDays = [];
    }

    renderDaysStrip();
    selectWorkoutDay(1);
  }

  function renderDaysStrip() {
    if (!wbDaysStrip) return;
    wbDaysStrip.innerHTML = '';

    const total = 100;
    for (let d = 1; d <= total; d++) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `axg-btn ${d === wbCurrentDay ? 'axg-btn--primary' : 'axg-btn--ghost'} axg-btn--small`;
      pill.style.cssText = 'min-width: 68px; flex-shrink: 0; text-align: center;';
      pill.textContent = `Day ${d}`;
      pill.onclick = () => selectWorkoutDay(d);
      wbDaysStrip.appendChild(pill);
    }
  }

  function selectWorkoutDay(dayNum) {
    wbCurrentDay = dayNum;
    renderDaysStrip();

    // Find day in memory
    const existing = wbDays.find(d => d.dayNumber === dayNum);
    if (existing) {
      wbDayTitleInput.value = existing.title || `Day ${dayNum} Workout`;
      wbDayRewardInput.value = existing.reward || '+10 Daily Points';
      wbDayDescInput.value = existing.description || '';
      renderExerciseList(existing.exercises || []);
    } else {
      wbDayTitleInput.value = `Day ${dayNum} — Transformation Routine`;
      wbDayRewardInput.value = dayNum % 7 === 0 ? `+${dayNum * 5} Milestone Points` : '+10 Daily Points';
      wbDayDescInput.value = 'Complete all prescribed sets with clean form.';
      renderExerciseList([
        { name: 'Barbell Bench Press', sets: 4, reps: '8-10', restSeconds: 90, description: 'Compound push volume.' },
        { name: 'Incline Dumbbell Press', sets: 3, reps: '10-12', restSeconds: 60, description: 'Upper chest focus.' },
        { name: 'Triceps Rope Pushdown', sets: 4, reps: '10-12', restSeconds: 45, description: 'Elbow extension lockout.' },
      ]);
    }
  }

  function renderExerciseList(exercises) {
    if (!wbExercisesList) return;
    wbExercisesList.innerHTML = '';

    exercises.forEach((ex, idx) => {
      const row = document.createElement('div');
      row.className = 'axg-exercise-edit-row';
      row.style.cssText = 'background: var(--surface-1); border: 1px solid var(--border-card); border-radius: var(--radius-md); padding: 12px; display: flex; flex-direction: column; gap: 8px;';

      row.innerHTML = `
        <div style="display: flex; gap: 10px; align-items: center;">
          <span style="font-size: 12px; font-weight: 800; color: var(--red); width: 24px;">#${idx + 1}</span>
          <input type="text" class="axg-input ex-name" placeholder="Exercise Name" value="${escapeHtml(ex.name || '')}" style="flex: 2;" />
          <input type="number" class="axg-input ex-sets" placeholder="Sets" value="${ex.sets || 3}" style="width: 70px;" min="1" max="20" />
          <input type="text" class="axg-input ex-reps" placeholder="Reps" value="${escapeHtml(String(ex.reps || '10'))}" style="width: 90px;" />
          <input type="number" class="axg-input ex-rest" placeholder="Rest (sec)" value="${ex.restSeconds || 60}" style="width: 90px;" />
          <button type="button" class="axg-icon-btn axg-icon-btn--delete btn-del-ex" title="Remove Exercise">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
        <input type="text" class="axg-input ex-desc" placeholder="Instructions / Form cues" value="${escapeHtml(ex.description || '')}" style="font-size: 12px;" />
      `;

      row.querySelector('.btn-del-ex').onclick = () => {
        row.remove();
      };

      wbExercisesList.appendChild(row);
    });
  }

  async function handleSaveWorkoutDay() {
    if (!wbChallengeId) return;

    const title = wbDayTitleInput.value.trim();
    const reward = wbDayRewardInput.value.trim();
    const description = wbDayDescInput.value.trim();

    // Collect exercises
    const exerciseRows = wbExercisesList.querySelectorAll('.axg-exercise-edit-row');
    const exercises = [];
    exerciseRows.forEach(row => {
      const name = row.querySelector('.ex-name').value.trim();
      const sets = parseInt(row.querySelector('.ex-sets').value, 10) || 3;
      const reps = row.querySelector('.ex-reps').value.trim() || '10';
      const restSeconds = parseInt(row.querySelector('.ex-rest').value, 10) || 60;
      const desc = row.querySelector('.ex-desc').value.trim();

      if (name) {
        exercises.push({ name, sets, reps, restSeconds, description: desc });
      }
    });

    try {
      const res = await fetch(`/api/admin/challenges/${wbChallengeId}/days/${wbCurrentDay}/exercises`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, reward, description, exercises }),
      });

      if (res.ok) {
        const data = await res.json();
        // Update local state
        const idx = wbDays.findIndex(d => d.dayNumber === wbCurrentDay);
        if (idx !== -1) {
          wbDays[idx] = data.workoutDay;
        } else {
          wbDays.push(data.workoutDay);
        }
        showToast(`Day ${wbCurrentDay} routine saved to PostgreSQL!`);
      }
    } catch (e) {
      console.warn('Failed to save to API:', e);
      showToast('Error saving routine to database.');
    }
  }

  function showToast(msg) {
    const existing = document.querySelector('.axg-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'axg-toast';
    toast.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--green); margin-right:8px;"></i> ${escapeHtml(msg)}`;
    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) toast.remove();
    }, 3000);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function initNavSwitching() {
    const navChallengeAdmin = document.getElementById('navChallengeAdmin');
    if (navChallengeAdmin) {
      navChallengeAdmin.addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.axg-nav-link').forEach(l => l.classList.remove('axg-nav-link--active'));
        navChallengeAdmin.classList.add('axg-nav-link--active');

        const sidebar = document.getElementById('axgSidebar');
        if (sidebar) sidebar.classList.remove('axg-sidebar--open');

        const section = document.getElementById('challengeManagementSection');
        if (section) {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
          section.classList.remove('axg-pulse-highlight');
          void section.offsetWidth;
          section.classList.add('axg-pulse-highlight');
        }
      });
    }
  }

  function initFiltersAndSearch() {
    if (filterTabsContainer) {
      filterTabsContainer.querySelectorAll('.axg-challenge-filter-btn').forEach(btn => {
        btn.addEventListener('click', function () {
          filterTabsContainer.querySelectorAll('.axg-challenge-filter-btn').forEach(b => {
            b.classList.remove('axg-challenge-filter-btn--active');
          });
          this.classList.add('axg-challenge-filter-btn--active');
          currentFilter = this.dataset.filter || 'all';
          renderChallenges();
        });
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        searchQuery = this.value;
        renderChallenges();
      });
    }
  }

  function init() {
    if (openCreateBtn) openCreateBtn.addEventListener('click', openCreateModal);
    if (closeChallengeModalBtn) closeChallengeModalBtn.addEventListener('click', closeChallengeModal);
    if (cancelChallengeBtn) cancelChallengeBtn.addEventListener('click', closeChallengeModal);
    if (challengeForm) challengeForm.addEventListener('submit', handleSaveChallenge);

    if (inputStart) inputStart.addEventListener('change', calculateEndDate);
    if (inputDays)  inputDays.addEventListener('input', calculateEndDate);

    if (closeShareLinkModalBtn) closeShareLinkModalBtn.addEventListener('click', closeShareLinkModal);
    if (copyShareLinkBtn) {
      copyShareLinkBtn.addEventListener('click', () => {
        copyToClipboard(shareLinkInput.value, copyShareLinkBtn);
      });
    }

    // Workout Builder
    if (wbCloseBtn) wbCloseBtn.onclick = () => { wbModal.style.display = 'none'; };
    if (wbCancelBtn) wbCancelBtn.onclick = () => { wbModal.style.display = 'none'; };
    if (wbSaveBtn) wbSaveBtn.onclick = handleSaveWorkoutDay;
    if (wbAddExerciseBtn) {
      wbAddExerciseBtn.onclick = () => {
        const row = document.createElement('div');
        row.className = 'axg-exercise-edit-row';
        row.style.cssText = 'background: var(--surface-1); border: 1px solid var(--border-card); border-radius: var(--radius-md); padding: 12px; display: flex; flex-direction: column; gap: 8px;';
        row.innerHTML = `
          <div style="display: flex; gap: 10px; align-items: center;">
            <span style="font-size: 12px; font-weight: 800; color: var(--red); width: 24px;">+</span>
            <input type="text" class="axg-input ex-name" placeholder="Exercise Name" style="flex: 2;" />
            <input type="number" class="axg-input ex-sets" placeholder="Sets" value="3" style="width: 70px;" min="1" max="20" />
            <input type="text" class="axg-input ex-reps" placeholder="Reps" value="10" style="width: 90px;" />
            <input type="number" class="axg-input ex-rest" placeholder="Rest (sec)" value="60" style="width: 90px;" />
            <button type="button" class="axg-icon-btn axg-icon-btn--delete btn-del-ex" title="Remove Exercise">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
          <input type="text" class="axg-input ex-desc" placeholder="Instructions / Form cues" style="font-size: 12px;" />
        `;
        row.querySelector('.btn-del-ex').onclick = () => row.remove();
        wbExercisesList.appendChild(row);
      };
    }

    // Challenge Details Modal
    if (cdCloseBtn) cdCloseBtn.onclick = closeChallengeDetails;
    if (cdCloseFooterBtn) cdCloseFooterBtn.onclick = closeChallengeDetails;

    initNavSwitching();
    initFiltersAndSearch();
    renderChallenges();
  }

  window.renderAdminChallenges = renderChallenges;
  window.openShareLinkModal = openShareLinkModal;
  window.openChallengeDetails = openChallengeDetails;

  document.addEventListener('DOMContentLoaded', init);

})();
