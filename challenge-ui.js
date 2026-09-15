/* ============================================================
   ALPHA X GYM — PUBLIC CHALLENGE & CLIENT WORKOUT PAGE
   Frontend UI Controller (PostgreSQL + Prisma REST API)
   ============================================================ */

(function () {
  'use strict';

  // Extract challengeId and dayNumber from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const paramChallengeId = urlParams.get('id') || '100day-alpha';
  const paramDay = parseInt(urlParams.get('day') || '1', 10);

  function getApiUrl(path) {
    const isFile = window.location.protocol === 'file:';
    const isNotPort3000 = window.location.port && window.location.port !== '3000';
    const base = (isFile || isNotPort3000) ? 'http://localhost:3000' : '';
    return `${base}${path}`;
  }

  // Athlete In-Memory Identity (strictly loaded from authenticated session)
  let currentClient = null;
  let currentParticipant = null;

  // --- STATE MANAGEMENT ---
  const state = {
    challenge: {
      id: paramChallengeId,
      title: 'ALPHA X 100-DAY CHALLENGE',
      currentDay: paramDay,
      totalDays: 100,
      completedDays: 0,
      remainingDays: 100,
      progressPercent: 0,
    },
    currentWorkoutDayId: null,
    currentDayTitle: `Day ${paramDay} — Transformation Protocol`,
    currentReward: '+10 Daily Points',
    workoutSession: {
      active: false,
      paused: false,
      sessionId: null,
      startTime: null,
      elapsedSeconds: 0,
      timerInterval: null,
    },
    restTimer: {
      duration: 60,
      remaining: 60,
      interval: null,
      running: false,
    },
    exercises: [
      {
        id: 'ex-1',
        name: 'Barbell Bench Press',
        target: '4 Sets × 8–10 Reps',
        completed: false,
        sets: [
          { weight: 80, reps: 10 },
          { weight: 80, reps: 9 },
          { weight: 85, reps: 7 },
          { weight: 85, reps: 6 },
        ],
      },
      {
        id: 'ex-2',
        name: 'Incline Dumbbell Press',
        target: '3 Sets × 10–12 Reps',
        completed: false,
        sets: [
          { weight: 30, reps: 12 },
          { weight: 32, reps: 10 },
          { weight: 32, reps: 9 },
        ],
      },
      {
        id: 'ex-3',
        name: 'Cable Chest Flyes',
        target: '3 Sets × 12–15 Reps',
        completed: false,
        sets: [
          { weight: 15, reps: 15 },
          { weight: 17.5, reps: 12 },
          { weight: 17.5, reps: 12 },
        ],
      },
      {
        id: 'ex-4',
        name: 'Triceps Rope Pushdown',
        target: '4 Sets × 10–12 Reps',
        completed: false,
        sets: [
          { weight: 22.5, reps: 12 },
          { weight: 25, reps: 10 },
          { weight: 25, reps: 10 },
          { weight: 27.5, reps: 8 },
        ],
      },
      {
        id: 'ex-5',
        name: 'Overhead Dumbbell Triceps Extension',
        target: '3 Sets × 10–12 Reps',
        completed: false,
        sets: [
          { weight: 24, reps: 12 },
          { weight: 26, reps: 10 },
          { weight: 26, reps: 10 },
        ],
      },
    ],
    personalRecords: {
      'Barbell Bench Press': { weight: 100, reps: 5 },
      'Incline Dumbbell Press': { weight: 34, reps: 8 },
      'Cable Chest Flyes': { weight: 20, reps: 10 },
      'Triceps Rope Pushdown': { weight: 30, reps: 8 },
      'Overhead Dumbbell Triceps Extension': { weight: 28, reps: 8 },
    },
  };

  // --- AUDIO SYNTHESIZER ---
  function playAlertBeep() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);

      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch (e) {
      console.warn('Audio play restricted or unsupported:', e);
    }
  }

  // --- 1. AUTHENTICATED CLIENT SESSION LOADER ---
  async function loadAuthenticatedClientSession() {
    const token = localStorage.getItem('axg_client_token');

    if (!token) {
      showClientAuthModal();
      return false;
    }

    try {
      const res = await fetch(getApiUrl('/api/client/me'), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          // Token expired or client record not found -> clean state
          localStorage.removeItem('axg_client_token');
          showClientAuthModal();
          return false;
        }
        throw new Error('Server error loading client profile');
      }

      const data = await res.json();
      if (!data.success || !data.client) {
        showClientAuthModal();
        return false;
      }

      // Store authenticated client strictly from server session
      currentClient = data.client;
      currentParticipant = data.participant || null;

      // Update Header UI
      updateHeaderIdentity(currentClient);

      // Update Challenge Metrics from Server
      if (data.challenge) {
        state.challenge.id = data.challenge.id;
        state.challenge.title = data.challenge.name;
        state.challenge.totalDays = data.challenge.totalDays || 100;
        if (!urlParams.get('day')) {
          state.challenge.currentDay = data.challenge.currentDay || 1;
        }
        state.challenge.completedDays = data.challenge.completedDays || 0;
        state.challenge.remainingDays = data.challenge.remainingDays || 100;
        state.challenge.progressPercent = data.challenge.progressPercent || 0;
      }

      // Update Personal Records & Stats
      if (data.stats) {
        if (data.stats.personalRecords && Object.keys(data.stats.personalRecords).length > 0) {
          state.personalRecords = data.stats.personalRecords;
          renderPersonalRecords();
        }

        // Update Performance Stats Card
        const workoutsCountEl = document.querySelector('.axg-perf-stat-card__val');
        if (workoutsCountEl) workoutsCountEl.textContent = String(data.stats.workoutsCompleted || 0);

        const streakEl = document.querySelectorAll('.axg-perf-stat-card__val')[1];
        if (streakEl) streakEl.textContent = `${data.stats.streakDays || 0} Days 🔥`;

        const setsEl = document.getElementById('perfTotalSets');
        if (setsEl) setsEl.textContent = String(data.stats.totalSets || 0);

        const repsEl = document.getElementById('perfTotalReps');
        if (repsEl) repsEl.textContent = String(data.stats.totalReps || 0);

        const volEl = document.getElementById('perfTotalVolume');
        if (volEl) volEl.textContent = `${(data.stats.totalVolumeKg || 0).toLocaleString()} kg`;
      }

      // Update Attendance Badge
      if (data.attendanceToday) {
        renderAttendanceDiscipline(data.attendanceToday);
      }

      hideClientAuthModal();
      return true;
    } catch (err) {
      console.warn('Could not reach /api/client/me, falling back:', err);
      return false;
    }
  }

  function updateHeaderIdentity(client) {
    const athleteNameEl = document.getElementById('clientNameHeader');
    if (athleteNameEl) athleteNameEl.textContent = client.name || 'Athlete Mode';

    const avatarEl = document.getElementById('clientAvatarHeader');
    if (avatarEl) {
      if (client.avatarUrl) {
        avatarEl.src = client.avatarUrl;
        avatarEl.style.display = 'inline-block';
      } else {
        avatarEl.style.display = 'none';
      }
    }

    const statusDot = document.getElementById('clientStatusDot');
    if (statusDot) statusDot.style.color = '#22c55e';

    const signOutBtn = document.getElementById('btnClientSignOut');
    if (signOutBtn) signOutBtn.style.display = 'inline-flex';
  }

  function showClientAuthModal() {
    const modal = document.getElementById('clientAuthModal');
    if (modal) modal.style.display = 'flex';
    initClientGoogleAuth();
  }

  function hideClientAuthModal() {
    const modal = document.getElementById('clientAuthModal');
    if (modal) modal.style.display = 'none';
  }

  function clientSignOut() {
    localStorage.removeItem('axg_client_token');
    localStorage.removeItem('axg_client_profile');
    localStorage.removeItem('axg_current_client');
    localStorage.removeItem('axg_current_participant');
    localStorage.removeItem('axg_today_attendance');
    localStorage.removeItem('axg_today_challenge');

    currentClient = null;
    currentParticipant = null;

    const athleteNameEl = document.getElementById('clientNameHeader');
    if (athleteNameEl) athleteNameEl.textContent = 'Athlete Mode';

    const avatarEl = document.getElementById('clientAvatarHeader');
    if (avatarEl) avatarEl.style.display = 'none';

    const signOutBtn = document.getElementById('btnClientSignOut');
    if (signOutBtn) signOutBtn.style.display = 'none';

    const statusDot = document.getElementById('clientStatusDot');
    if (statusDot) statusDot.style.color = 'var(--text-dim)';

    showClientAuthModal();
  }

  // --- 2. GOOGLE IDENTITY SERVICES FOR CLIENT DASHBOARD ---
  async function initClientGoogleAuth() {
    try {
      let clientId = '661072520427-500vtigts0bad6rruv7c8sdp5lqiujll.apps.googleusercontent.com';
      try {
        const res = await fetch(getApiUrl('/api/registration/config'));
        const config = await res.json();
        if (config && config.googleClientId) {
          clientId = config.googleClientId;
        }
      } catch (cfgErr) {}

      if (window.google && clientId) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            handleClientGoogleAuth({ credential: response.credential });
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        const target = document.getElementById('googleSignInBtnClient');
        if (target) {
          window.google.accounts.id.renderButton(target, {
            theme: 'filled_black',
            size: 'large',
            width: 300,
            text: 'continue_with',
            shape: 'pill',
          });
        }
        const notice = document.getElementById('clientAuthNotice');
        if (notice) notice.style.display = 'none';
      }
    } catch (e) {
      console.warn('Google client init notice in dashboard:', e);
    }
  }

  async function handleClientGoogleAuth(payload) {
    try {
      const res = await fetch(getApiUrl('/api/client/auth/google'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Google login failed');
      }

      if (data.exists && data.token) {
        // Save authenticated JWT
        localStorage.setItem('axg_client_token', data.token);
        localStorage.setItem('axg_client_profile', JSON.stringify(data.client));

        hideClientAuthModal();
        await loadAuthenticatedClientSession();
        await loadPrescribedWorkout();
        initDisciplineAudit();
      } else {
        // New Google account without Alpha X Gym profile -> Redirect to registration
        alert('No Alpha X Gym profile found for this Google account. Please complete your registration.');
        window.location.href = '/register.html';
      }
    } catch (err) {
      console.error('Client Google auth error:', err);
      alert(err.message || 'Failed to authenticate with Google. Please try again.');
    }
  }

  // --- 3. FETCH PRESCRIBED WORKOUT FROM POSTGRESQL ---
  async function loadPrescribedWorkout() {
    try {
      const workoutRes = await fetch(
        getApiUrl(`/api/public/challenge/${state.challenge.id}/workout/${state.challenge.currentDay}`)
      );
      if (workoutRes.ok) {
        const wData = await workoutRes.json();
        if (wData.success) {
          if (wData.day) {
            state.currentWorkoutDayId = wData.day.id;
            state.currentDayTitle = wData.day.title || `Day ${state.challenge.currentDay} Workout`;
            state.currentReward = wData.day.reward || '+10 Points';
          }

          if (Array.isArray(wData.exercises) && wData.exercises.length > 0) {
            state.exercises = wData.exercises.map((ex, idx) => {
              const numSets = ex.sets || 3;
              const setsArray = [];
              for (let s = 1; s <= numSets; s++) {
                setsArray.push({ weight: 40 + idx * 5, reps: 10 });
              }

              return {
                id: ex.id,
                name: ex.name,
                target: `${ex.sets} Sets × ${ex.reps} Reps • Rest: ${ex.restSeconds}s`,
                completed: false,
                sets: setsArray,
              };
            });
          }
        }
      }
    } catch (err) {
      console.warn('API fetch workout failed, using cached template:', err);
    }

    updateHeroUI();
    renderExercises();
  }

  function updateHeroUI() {
    const heroTitle = document.querySelector('.axg-hero-title');
    if (heroTitle) heroTitle.textContent = state.challenge.title;

    const dayStatVal = document.querySelector('.axg-hero-stat-card__val.accent');
    if (dayStatVal) dayStatVal.textContent = `DAY ${state.challenge.currentDay}`;

    const remainingStat = document.querySelectorAll('.axg-hero-stat-card__val')[2];
    if (remainingStat) {
      remainingStat.textContent = String(Math.max(0, state.challenge.totalDays - state.challenge.currentDay));
    }

    const secSub = document.querySelector('.axg-section-sub');
    if (secSub) {
      secSub.innerHTML = `DAY ${state.challenge.currentDay} &bull; ${state.currentDayTitle}`;
    }

    if (currentClient && currentClient.name) {
      const athleteNameEl = document.getElementById('clientNameHeader');
      if (athleteNameEl) athleteNameEl.textContent = currentClient.name;
    }
  }

  // --- 4. WORKOUT TIMER / STOPWATCH ---
  async function startWorkoutTimer() {
    if (state.workoutSession.active && !state.workoutSession.paused) return;

    // Check if client is authenticated
    if (!currentClient || !currentParticipant) {
      showClientAuthModal();
      return;
    }

    const token = localStorage.getItem('axg_client_token');

    // Call API: start workout session with authenticated token
    if (currentParticipant && currentParticipant.id) {
      try {
        const startRes = await fetch(getApiUrl('/api/public/workout/start'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            participantId: currentParticipant.id,
            challengeId: state.challenge.id,
            dayNumber: state.challenge.currentDay,
          }),
        });
        if (startRes.ok) {
          const sData = await startRes.json();
          if (sData.success && sData.session) {
            state.workoutSession.sessionId = sData.session.id;
          }
        }
      } catch (e) {
        console.warn('API start workout offline timer:', e);
      }
    }

    if (!state.workoutSession.active) {
      state.workoutSession.active = true;
      state.workoutSession.startTime = Date.now() - state.workoutSession.elapsedSeconds * 1000;
    } else if (state.workoutSession.paused) {
      state.workoutSession.paused = false;
      state.workoutSession.startTime = Date.now() - state.workoutSession.elapsedSeconds * 1000;
    }

    const banner = document.getElementById('workoutTimerBanner');
    const clockEl = document.getElementById('workoutTimerClock');
    const toggleBtn = document.getElementById('btnWorkoutTimerToggle');

    if (banner) banner.classList.add('active');
    if (toggleBtn) {
      toggleBtn.innerHTML = '<i class="fa-solid fa-pause"></i> Pause';
      toggleBtn.classList.remove('axg-btn-timer--primary');
    }

    const valWorkoutStatus = document.getElementById('valWorkoutStatus');
    if (valWorkoutStatus) {
      valWorkoutStatus.className = 'axg-discipline-pill__value';
      valWorkoutStatus.style.color = '#00e5ff';
      valWorkoutStatus.textContent = '🔵 IN PROGRESS';
    }

    clearInterval(state.workoutSession.timerInterval);
    state.workoutSession.timerInterval = setInterval(function () {
      state.workoutSession.elapsedSeconds = Math.floor(
        (Date.now() - state.workoutSession.startTime) / 1000
      );
      if (clockEl) {
        clockEl.textContent = formatTime(state.workoutSession.elapsedSeconds);
      }
    }, 1000);
  }

  function pauseWorkoutTimer() {
    if (!state.workoutSession.active || state.workoutSession.paused) return;
    state.workoutSession.paused = true;
    clearInterval(state.workoutSession.timerInterval);

    const banner = document.getElementById('workoutTimerBanner');
    const toggleBtn = document.getElementById('btnWorkoutTimerToggle');

    if (banner) banner.classList.remove('active');
    if (toggleBtn) {
      toggleBtn.innerHTML = '<i class="fa-solid fa-play"></i> Resume';
      toggleBtn.classList.add('axg-btn-timer--primary');
    }
  }

  function toggleWorkoutTimer() {
    if (!state.workoutSession.active || state.workoutSession.paused) {
      startWorkoutTimer();
    } else {
      pauseWorkoutTimer();
    }
  }

  function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // --- 5. RENDER EXERCISE CARDS & SETS ---
  function renderExercises() {
    const container = document.getElementById('exercisesList');
    if (!container) return;

    container.innerHTML = '';

    state.exercises.forEach(function (ex, index) {
      const card = document.createElement('div');
      card.className = `axg-exercise-card ${ex.completed ? 'completed' : ''}`;
      card.id = `exerciseCard-${ex.id}`;

      let setsHtml = '';
      ex.sets.forEach(function (set, sIdx) {
        setsHtml += createSetRowHtml(ex.id, sIdx + 1, set.weight, set.reps);
      });

      card.innerHTML = `
        <div class="axg-exercise-card__header">
          <div class="axg-exercise-info">
            <div class="axg-exercise-idx">${(index + 1).toString().padStart(2, '0')}</div>
            <div>
              <h3 class="axg-exercise-name">${ex.name}</h3>
              <div class="axg-exercise-target">
                <i class="fa-solid fa-bullseye"></i> Target: <span>${ex.target}</span>
              </div>
            </div>
          </div>
          <button type="button" class="axg-exercise-complete-btn ${ex.completed ? 'active' : ''}" data-ex-id="${ex.id}">
            <i class="fa-solid ${ex.completed ? 'fa-check' : 'fa-circle-check'}"></i>
            <span>${ex.completed ? 'Completed' : 'Complete'}</span>
          </button>
        </div>

        <div class="axg-sets-container" id="setsContainer-${ex.id}">
          ${setsHtml}
        </div>

        <button type="button" class="axg-btn-add-set" data-ex-id="${ex.id}">
          <i class="fa-solid fa-plus"></i> Add Set
        </button>
      `;

      container.appendChild(card);
    });

    bindExerciseEvents();
    updateCompletionStats();
    updatePerformanceStats();
  }

  function createSetRowHtml(exId, setNum, weight, reps) {
    return `
      <div class="axg-set-row" data-ex-id="${exId}" data-set-num="${setNum}">
        <span class="axg-set-badge">Set ${setNum}</span>
        <div class="axg-input-field-wrap">
          <input type="number" step="0.5" min="0" class="axg-set-input input-weight" value="${weight}" placeholder="0" data-ex-id="${exId}" data-set-idx="${setNum - 1}" />
          <span class="axg-input-suffix">KG</span>
        </div>
        <div class="axg-input-field-wrap">
          <input type="number" step="1" min="0" class="axg-set-input input-reps" value="${reps}" placeholder="0" data-ex-id="${exId}" data-set-idx="${setNum - 1}" />
          <span class="axg-input-suffix">REPS</span>
        </div>
        <button type="button" class="axg-btn-remove-set" data-ex-id="${exId}" data-set-idx="${setNum - 1}" title="Remove set">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;
  }

  function bindExerciseEvents() {
    document.querySelectorAll('.axg-exercise-complete-btn').forEach(function (btn) {
      btn.onclick = function () {
        const exId = this.getAttribute('data-ex-id');
        const ex = state.exercises.find((e) => e.id === exId);
        if (ex) {
          ex.completed = !ex.completed;
          renderExercises();
        }
      };
    });

    document.querySelectorAll('.axg-btn-add-set').forEach(function (btn) {
      btn.onclick = function () {
        const exId = this.getAttribute('data-ex-id');
        const ex = state.exercises.find((e) => e.id === exId);
        if (ex) {
          const lastSet = ex.sets[ex.sets.length - 1] || { weight: 20, reps: 10 };
          ex.sets.push({ weight: lastSet.weight, reps: lastSet.reps });
          renderExercises();
        }
      };
    });

    document.querySelectorAll('.axg-btn-remove-set').forEach(function (btn) {
      btn.onclick = function () {
        const exId = this.getAttribute('data-ex-id');
        const setIdx = parseInt(this.getAttribute('data-set-idx') || '0', 10);
        const ex = state.exercises.find((e) => e.id === exId);
        if (ex && ex.sets.length > 1) {
          ex.sets.splice(setIdx, 1);
          renderExercises();
        }
      };
    });

    document.querySelectorAll('.axg-set-input').forEach(function (input) {
      input.oninput = function () {
        const exId = this.getAttribute('data-ex-id');
        const setIdx = parseInt(this.getAttribute('data-set-idx') || '0', 10);
        const isWeight = this.classList.contains('input-weight');
        const ex = state.exercises.find((e) => e.id === exId);

        if (ex && ex.sets[setIdx]) {
          const val = parseFloat(this.value) || 0;
          if (isWeight) {
            ex.sets[setIdx].weight = val;
          } else {
            ex.sets[setIdx].reps = Math.floor(val);
          }
          updatePerformanceStats();
        }
      };
    });
  }

  function updateCompletionStats() {
    const total = state.exercises.length;
    const done = state.exercises.filter((e) => e.completed).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    const countDisplay = document.getElementById('exerciseCountDisplay');
    if (countDisplay) {
      countDisplay.innerHTML = `<span>${done}</span> / ${total} Completed`;
    }

    const compText = document.getElementById('exerciseCompletionText');
    if (compText) {
      compText.textContent = `${done} / ${total} Exercises Completed (${pct}%)`;
    }

    const compFill = document.getElementById('exerciseCompletionFill');
    if (compFill) {
      compFill.style.width = `${pct}%`;
    }

    const finishBtn = document.getElementById('btnFinishWorkout');
    if (finishBtn) {
      if (done === total && total > 0) {
        finishBtn.disabled = false;
        finishBtn.classList.add('ready');
      } else {
        finishBtn.disabled = done === 0;
        finishBtn.classList.remove('ready');
      }
    }
  }

  function updatePerformanceStats() {
    let totalSets = 0;
    let totalReps = 0;
    let totalVolume = 0;

    state.exercises.forEach(function (ex) {
      ex.sets.forEach(function (s) {
        totalSets += 1;
        totalReps += s.reps;
        totalVolume += s.weight * s.reps;
      });
    });

    const perfSets = document.getElementById('perfTotalSets');
    if (perfSets) perfSets.textContent = String(totalSets);

    const perfReps = document.getElementById('perfTotalReps');
    if (perfReps) perfReps.textContent = String(totalReps);

    const perfVol = document.getElementById('perfTotalVolume');
    if (perfVol) perfVol.textContent = `${totalVolume.toLocaleString()} kg`;
  }

  // --- 6. REST TIMER ---
  function initRestTimer() {
    const clockEl = document.getElementById('restClockDisplay');
    const startBtn = document.getElementById('btnRestStart');
    const pauseBtn = document.getElementById('btnRestPause');
    const resetBtn = document.getElementById('btnRestReset');
    const alarmMsg = document.getElementById('restAlarmMsg');

    function updateClock(secs) {
      const m = Math.floor(secs / 60).toString().padStart(2, '0');
      const s = (secs % 60).toString().padStart(2, '0');
      if (clockEl) clockEl.textContent = `${m}:${s}`;
    }

    function tick() {
      if (state.restTimer.remaining > 0) {
        state.restTimer.remaining -= 1;
        updateClock(state.restTimer.remaining);
      } else {
        clearInterval(state.restTimer.interval);
        state.restTimer.running = false;
        if (alarmMsg) alarmMsg.classList.add('active');
        playAlertBeep();
      }
    }

    if (startBtn) {
      startBtn.onclick = function () {
        if (state.restTimer.running) return;
        if (alarmMsg) alarmMsg.classList.remove('active');
        state.restTimer.running = true;
        state.restTimer.interval = setInterval(tick, 1000);
      };
    }

    if (pauseBtn) {
      pauseBtn.onclick = function () {
        state.restTimer.running = false;
        clearInterval(state.restTimer.interval);
      };
    }

    if (resetBtn) {
      resetBtn.onclick = function () {
        state.restTimer.running = false;
        clearInterval(state.restTimer.interval);
        state.restTimer.remaining = state.restTimer.duration;
        updateClock(state.restTimer.remaining);
        if (alarmMsg) alarmMsg.classList.remove('active');
      };
    }

    document.querySelectorAll('.axg-preset-chip').forEach(function (chip) {
      chip.onclick = function () {
        document.querySelectorAll('.axg-preset-chip').forEach((c) => c.classList.remove('active'));
        this.classList.add('active');

        if (this.dataset.custom) {
          const userSec = prompt('Enter rest duration in seconds:', '90');
          const parsed = parseInt(userSec || '60', 10);
          state.restTimer.duration = isNaN(parsed) ? 60 : parsed;
        } else {
          state.restTimer.duration = parseInt(this.dataset.seconds, 10);
        }

        state.restTimer.remaining = state.restTimer.duration;
        updateClock(state.restTimer.remaining);
        clearInterval(state.restTimer.interval);
        state.restTimer.running = false;
        if (alarmMsg) alarmMsg.classList.remove('active');
      };
    });
  }

  // --- 7. 1RM CALCULATOR ---
  function init1RMCalculator() {
    const calcBtn = document.getElementById('btnCalculate1RM');
    const weightInput = document.getElementById('calcWeightInput');
    const repsInput = document.getElementById('calcRepsInput');
    const resultVal = document.getElementById('calcResultVal');

    if (!calcBtn || !weightInput || !repsInput) return;

    function calculate() {
      const w = parseFloat(weightInput.value) || 0;
      const r = parseInt(repsInput.value, 10) || 1;
      if (w <= 0 || r <= 0) return;

      const oneRm = w * (1 + r / 30);
      if (resultVal) resultVal.textContent = `${oneRm.toFixed(1)} kg`;

      const p95 = document.getElementById('pct95');
      const p85 = document.getElementById('pct85');
      const p75 = document.getElementById('pct75');
      const p65 = document.getElementById('pct65');

      if (p95) p95.textContent = `${(oneRm * 0.95).toFixed(1)} kg`;
      if (p85) p85.textContent = `${(oneRm * 0.85).toFixed(1)} kg`;
      if (p75) p75.textContent = `${(oneRm * 0.75).toFixed(1)} kg`;
      if (p65) p65.textContent = `${(oneRm * 0.65).toFixed(1)} kg`;
    }

    calcBtn.onclick = calculate;
    weightInput.oninput = calculate;
    repsInput.oninput = calculate;
  }

  // --- 8. PERSONAL RECORDS RENDERER ---
  function renderPersonalRecords() {
    const prContainer = document.getElementById('prListContainer');
    if (!prContainer) return;

    prContainer.innerHTML = '';
    const records = state.personalRecords;

    Object.keys(records).forEach(function (name) {
      const rec = records[name];
      const row = document.createElement('div');
      row.className = 'axg-pr-row';
      row.innerHTML = `
        <span class="axg-pr-exercise-name">${name}</span>
        <span class="axg-pr-value">${rec.weight} kg × ${rec.reps} reps</span>
      `;
      prContainer.appendChild(row);
    });
  }

  // --- 9. FINISH WORKOUT SUBMISSION ---
  function initFinishWorkout() {
    const finishBtn = document.getElementById('btnFinishWorkout');
    const modal = document.getElementById('confirmFinishModal');
    const cancelBtn = document.getElementById('btnConfirmFinishCancel');
    const yesBtn = document.getElementById('btnConfirmFinishYes');
    const celebrationModal = document.getElementById('celebrationModal');
    const closeCelebBtn = document.getElementById('btnCloseCelebration');

    if (finishBtn) {
      finishBtn.onclick = function () {
        if (!currentClient) {
          showClientAuthModal();
          return;
        }
        if (modal) modal.style.display = 'flex';
      };
    }

    if (cancelBtn) {
      cancelBtn.onclick = function () {
        if (modal) modal.style.display = 'none';
      };
    }

    if (yesBtn) {
      yesBtn.onclick = async function () {
        if (modal) modal.style.display = 'none';

        pauseWorkoutTimer();

        let totalSets = 0;
        let totalReps = 0;
        let totalVolume = 0;
        const exerciseLogs = [];

        state.exercises.forEach((ex) => {
          ex.sets.forEach((s, sIdx) => {
            totalSets += 1;
            totalReps += s.reps;
            totalVolume += s.weight * s.reps;

            exerciseLogs.push({
              exerciseId: ex.id,
              setNumber: sIdx + 1,
              weightUsed: s.weight,
              repsCompleted: s.reps,
            });
          });
        });

        const elapsedSecs = state.workoutSession.elapsedSeconds || 2202;
        const finalDuration = formatTime(elapsedSecs);

        const token = localStorage.getItem('axg_client_token');

        // Submit completion to PostgreSQL via Prisma REST API strictly with client token
        if (currentParticipant && currentParticipant.id && state.currentWorkoutDayId) {
          try {
            const finishRes = await fetch(getApiUrl('/api/public/workout/finish'), {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({
                participantId: currentParticipant.id,
                workoutDayId: state.currentWorkoutDayId,
                durationSeconds: elapsedSecs,
                exerciseLogs,
              }),
            });

            if (finishRes.ok) {
              console.log('✅ Workout completion saved to athlete record!');
            }
          } catch (e) {
            console.warn('Could not submit completion:', e);
          }
        }

        // Populate celebration modal
        const durEl = document.getElementById('celebDuration');
        const setsEl = document.getElementById('celebSets');
        const repsEl = document.getElementById('celebReps');
        const volEl = document.getElementById('celebVolume');

        if (durEl) durEl.textContent = finalDuration;
        if (setsEl) setsEl.textContent = `${totalSets} sets`;
        if (repsEl) repsEl.textContent = String(totalReps);
        if (volEl) volEl.textContent = `${totalVolume.toLocaleString()} kg`;

        if (celebrationModal) celebrationModal.style.display = 'flex';
        playAlertBeep();

        const valWorkoutStatus = document.getElementById('valWorkoutStatus');
        if (valWorkoutStatus) {
          valWorkoutStatus.className = 'axg-discipline-pill__value text-green';
          valWorkoutStatus.textContent = '✅ COMPLETED';
        }

        // Refresh stats
        await loadAuthenticatedClientSession();
      };
    }

    if (closeCelebBtn) {
      closeCelebBtn.onclick = function () {
        if (celebrationModal) celebrationModal.style.display = 'none';
      };
    }
  }

  // --- 10. DAILY DISCIPLINE AUDIT ---
  function renderAttendanceDiscipline(attendance) {
    const valAttendanceStatus = document.getElementById('valAttendanceStatus');
    const subAttendanceDetail = document.getElementById('subAttendanceDetail');
    const iconAttendance = document.getElementById('iconAttendance');

    if (attendance && attendance.status && attendance.status.toUpperCase() === 'PRESENT') {
      if (valAttendanceStatus) {
        valAttendanceStatus.className = 'axg-discipline-pill__value text-green';
        valAttendanceStatus.textContent = '🟢 PRESENT';
      }
      if (subAttendanceDetail) {
        const checkInTime = attendance.checkInAt ? ` at ${attendance.checkInAt}` : '';
        subAttendanceDetail.textContent = `Verified${checkInTime} • Dynamic QR + GPS Geofence`;
      }
      if (iconAttendance) {
        iconAttendance.className = 'axg-discipline-pill__icon green';
      }
    } else {
      if (valAttendanceStatus) {
        valAttendanceStatus.className = 'axg-discipline-pill__value';
        valAttendanceStatus.style.color = '#90a4ae';
        valAttendanceStatus.textContent = '⚪ NOT CHECKED IN';
      }
      if (subAttendanceDetail) {
        subAttendanceDetail.innerHTML =
          `<a href="${getApiUrl('/checkin')}" style="color: var(--red); font-weight: 700; text-decoration: underline;"><i class="fa-solid fa-qrcode"></i> Scan Gym QR to Check In</a>`;
      }
      if (iconAttendance) {
        iconAttendance.className = 'axg-discipline-pill__icon gray';
      }
    }
  }

  async function initDisciplineAudit() {
    const dateDisplay = document.getElementById('disciplineDateDisplay');
    if (dateDisplay) {
      try {
        const todayStr = new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Kolkata',
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }).format(new Date());
        dateDisplay.textContent = `${todayStr} • Session`;
      } catch (e) {
        dateDisplay.textContent = "Today's Protocol";
      }
    }

    const subWorkoutDetail = document.getElementById('subWorkoutDetail');
    if (subWorkoutDetail) {
      subWorkoutDetail.textContent = `${state.currentDayTitle} • ${state.exercises.length} Exercises`;
    }
  }

  // --- 11. INITIALIZATION ON DOM READY ---
  document.addEventListener('DOMContentLoaded', async function () {
    // 1. Load Authenticated Client Profile strictly from server-side JWT
    await loadAuthenticatedClientSession();

    // 2. Fetch Prescribed Workout Day & Exercises
    await loadPrescribedWorkout();

    // 3. Initialize Interactive Widgets
    renderPersonalRecords();
    initRestTimer();
    init1RMCalculator();
    initFinishWorkout();
    initDisciplineAudit();

    // 4. Bind Sign Out Button
    const signOutBtn = document.getElementById('btnClientSignOut');
    if (signOutBtn) {
      signOutBtn.onclick = clientSignOut;
    }

    const heroStartBtn = document.getElementById('btnHeroStartWorkout');
    if (heroStartBtn) {
      heroStartBtn.onclick = function (e) {
        e.preventDefault();
        startWorkoutTimer();
        const workoutSection = document.getElementById('workoutSection');
        if (workoutSection) {
          workoutSection.scrollIntoView({ behavior: 'smooth' });
        }
      };
    }

    const timerToggleBtn = document.getElementById('btnWorkoutTimerToggle');
    if (timerToggleBtn) {
      timerToggleBtn.onclick = toggleWorkoutTimer;
    }
  });
})();
