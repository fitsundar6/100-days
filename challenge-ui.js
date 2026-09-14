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

  // Athlete Local Storage reference (remembers athlete across visits)
  let currentParticipant = JSON.parse(localStorage.getItem('axg_current_participant') || 'null');

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

  // --- AUDIO SYNTHESIZER (NO EXTERNAL AUDIO FILES NEEDED) ---
  function playAlertBeep() {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
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

  // --- 1. FETCH CHALLENGE & PRESCRIBED WORKOUT FROM POSTGRESQL ---
  async function loadChallengeAndWorkout() {
    try {
      // 1. Fetch Challenge Info
      const chalRes = await fetch(`/api/public/challenge/${state.challenge.id}`);
      if (chalRes.ok) {
        const chalData = await chalRes.json();
        if (chalData.success && chalData.challenge) {
          const c = chalData.challenge;
          state.challenge.id = c.id;
          state.challenge.title = c.name || c.title;
          state.challenge.totalDays = c.totalDays || 100;
          if (!urlParams.get('day')) {
            state.challenge.currentDay = c.currentDay || 1;
          }
        }
      }

      // 2. Fetch Prescribed Workout Day & Exercises
      const workoutRes = await fetch(
        `/api/public/challenge/${state.challenge.id}/workout/${state.challenge.currentDay}`
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
      console.warn('API fetch failed, falling back to cached state:', err);
    }

    updateHeroUI();
    renderExercises();
  }

  function updateHeroUI() {
    // Update Hero Stats
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

    // Athlete badge
    const athleteNameEl = document.getElementById('clientNameHeader');
    if (athleteNameEl && currentParticipant && currentParticipant.name) {
      athleteNameEl.textContent = currentParticipant.name;
    }
  }

  // --- 2. WORKOUT TIMER / STOPWATCH ---
  async function startWorkoutTimer() {
    if (state.workoutSession.active && !state.workoutSession.paused) return;

    // Ensure we have an active participant record (auto-enroll as guest if needed)
    if (!currentParticipant) {
      try {
        const joinRes = await fetch(getApiUrl('/api/public/join'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            challengeId: state.challenge.id,
            name: 'Alpha Athlete',
            phone: '+919876543210',
          }),
        });
        if (joinRes.ok) {
          const jData = await joinRes.json();
          if (jData.success && jData.participant) {
            currentParticipant = jData.participant;
            localStorage.setItem('axg_current_participant', JSON.stringify(currentParticipant));
          }
        }
      } catch (e) {
        // fallback participant
        currentParticipant = { id: 'part_guest_' + Date.now(), name: 'Athlete Mode' };
      }
    }

    // Call API: start workout session
    if (currentParticipant && currentParticipant.id) {
      try {
        const startRes = await fetch(getApiUrl('/api/public/workout/start'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
        console.warn('API start workout failed, running offline timer:', e);
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

    // Update daily discipline workout status
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

  // --- 3. RENDER EXERCISE CARDS & SETS ---
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

    document.querySelectorAll('.input-weight').forEach(function (inp: any) {
      inp.oninput = function () {
        const exId = this.getAttribute('data-ex-id');
        const setIdx = parseInt(this.getAttribute('data-set-idx') || '0', 10);
        const ex = state.exercises.find((e) => e.id === exId);
        if (ex && ex.sets[setIdx]) {
          ex.sets[setIdx].weight = parseFloat(this.value) || 0;
          checkPersonalRecords(ex.name, ex.sets[setIdx].weight, ex.sets[setIdx].reps);
          updatePerformanceStats();
        }
      };
    });

    document.querySelectorAll('.input-reps').forEach(function (inp: any) {
      inp.oninput = function () {
        const exId = this.getAttribute('data-ex-id');
        const setIdx = parseInt(this.getAttribute('data-set-idx') || '0', 10);
        const ex = state.exercises.find((e) => e.id === exId);
        if (ex && ex.sets[setIdx]) {
          ex.sets[setIdx].reps = parseInt(this.value, 10) || 0;
          checkPersonalRecords(ex.name, ex.sets[setIdx].weight, ex.sets[setIdx].reps);
          updatePerformanceStats();
        }
      };
    });
  }

  function updateCompletionStats() {
    const total = state.exercises.length;
    const completed = state.exercises.filter((e) => e.completed).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    const countBadge = document.getElementById('exerciseCountDisplay');
    const barFill = document.getElementById('exerciseCompletionFill');
    const barText = document.getElementById('exerciseCompletionText');
    const finishBtn: any = document.getElementById('btnFinishWorkout');

    if (countBadge) countBadge.innerHTML = `<span>${completed}</span> / ${total} Completed`;
    if (barFill) barFill.style.width = `${pct}%`;
    if (barText) barText.textContent = `${completed} / ${total} Exercises Completed (${pct}%)`;

    if (finishBtn) {
      finishBtn.disabled = completed === 0;
    }
  }

  function updatePerformanceStats() {
    let totalSets = 0;
    let totalReps = 0;
    let totalWeightVolume = 0;

    state.exercises.forEach(function (ex) {
      ex.sets.forEach(function (set) {
        totalSets += 1;
        totalReps += set.reps;
        totalWeightVolume += set.weight * set.reps;
      });
    });

    const setsEl = document.getElementById('perfTotalSets');
    const repsEl = document.getElementById('perfTotalReps');
    const volEl = document.getElementById('perfTotalVolume');

    if (setsEl) setsEl.textContent = String(totalSets);
    if (repsEl) repsEl.textContent = String(totalReps);
    if (volEl) volEl.textContent = `${totalWeightVolume.toLocaleString()} kg`;
  }

  function checkPersonalRecords(exerciseName, weight, reps) {
    if (!state.personalRecords[exerciseName]) {
      state.personalRecords[exerciseName] = { weight, reps };
      renderPersonalRecords();
      return;
    }
    const current = state.personalRecords[exerciseName];
    if (weight > current.weight || (weight === current.weight && reps > current.reps)) {
      state.personalRecords[exerciseName] = { weight, reps };
      renderPersonalRecords();
    }
  }

  function renderPersonalRecords() {
    const container = document.getElementById('prListContainer');
    if (!container) return;

    container.innerHTML = '';
    Object.keys(state.personalRecords).forEach(function (name) {
      const record = state.personalRecords[name];
      const item = document.createElement('div');
      item.className = 'axg-pr-item';
      item.innerHTML = `
        <span class="axg-pr-exercise">${name}</span>
        <span class="axg-pr-badge">${record.weight} kg × ${record.reps}</span>
      `;
      container.appendChild(item);
    });
  }

  // --- 4. REST TIMER LOGIC ---
  function initRestTimer() {
    const clockEl = document.getElementById('restClockDisplay');
    const startBtn = document.getElementById('btnRestStart');
    const pauseBtn = document.getElementById('btnRestPause');
    const resetBtn = document.getElementById('btnRestReset');
    const alarmMsg = document.getElementById('restAlarmMsg');
    const card = document.getElementById('restTimerCard');

    function updateDisplay() {
      const mins = Math.floor(state.restTimer.remaining / 60);
      const secs = state.restTimer.remaining % 60;
      if (clockEl) {
        clockEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
    }

    if (startBtn) {
      startBtn.onclick = function () {
        if (state.restTimer.running) return;
        state.restTimer.running = true;
        if (alarmMsg) alarmMsg.style.display = 'none';
        if (card) card.classList.remove('alarm');
        if (clockEl) clockEl.classList.add('running');

        clearInterval(state.restTimer.interval);
        state.restTimer.interval = setInterval(function () {
          if (state.restTimer.remaining > 0) {
            state.restTimer.remaining -= 1;
            updateDisplay();
          } else {
            clearInterval(state.restTimer.interval);
            state.restTimer.running = false;
            if (clockEl) clockEl.classList.remove('running');
            if (alarmMsg) alarmMsg.style.display = 'inline-flex';
            if (card) card.classList.add('alarm');

            playAlertBeep();
            if (navigator.vibrate) {
              navigator.vibrate([200, 100, 200, 100, 300]);
            }
          }
        }, 1000);
      };
    }

    if (pauseBtn) {
      pauseBtn.onclick = function () {
        clearInterval(state.restTimer.interval);
        state.restTimer.running = false;
        if (clockEl) clockEl.classList.remove('running');
      };
    }

    if (resetBtn) {
      resetBtn.onclick = function () {
        clearInterval(state.restTimer.interval);
        state.restTimer.running = false;
        state.restTimer.remaining = state.restTimer.duration;
        if (alarmMsg) alarmMsg.style.display = 'none';
        if (card) card.classList.remove('alarm');
        if (clockEl) clockEl.classList.remove('running');
        updateDisplay();
      };
    }

    document.querySelectorAll('.axg-preset-chip').forEach(function (chip: any) {
      chip.onclick = function () {
        document.querySelectorAll('.axg-preset-chip').forEach((c) => c.classList.remove('active'));
        this.classList.add('active');

        const sec = parseInt(this.getAttribute('data-seconds') || '0', 10);
        if (!isNaN(sec) && sec > 0) {
          state.restTimer.duration = sec;
          state.restTimer.remaining = sec;
          clearInterval(state.restTimer.interval);
          state.restTimer.running = false;
          if (alarmMsg) alarmMsg.style.display = 'none';
          if (card) card.classList.remove('alarm');
          if (clockEl) clockEl.classList.remove('running');
          updateDisplay();
        } else if (this.getAttribute('data-custom') === 'true') {
          const userSec = prompt('Enter custom rest time in seconds (e.g. 75):', '75');
          const parsed = parseInt(userSec || '0', 10);
          if (!isNaN(parsed) && parsed > 0) {
            state.restTimer.duration = parsed;
            state.restTimer.remaining = parsed;
            clearInterval(state.restTimer.interval);
            state.restTimer.running = false;
            updateDisplay();
          }
        }
      };
    });

    updateDisplay();
  }

  // --- 5. 1RM CALCULATOR (EPLEY FORMULA) ---
  function init1RMCalculator() {
    const weightInput: any = document.getElementById('calcWeightInput');
    const repsInput: any = document.getElementById('calcRepsInput');
    const calcBtn = document.getElementById('btnCalculate1RM');
    const resultVal = document.getElementById('calcResultVal');

    function calculate() {
      const weight = parseFloat(weightInput?.value) || 0;
      const reps = parseInt(repsInput?.value, 10) || 0;

      if (weight <= 0 || reps <= 0) {
        if (resultVal) resultVal.textContent = '0.0 kg';
        return;
      }

      const oneRM = reps === 1 ? weight : weight * (1 + reps / 30);
      if (resultVal) {
        resultVal.textContent = `${oneRM.toFixed(1)} kg`;
      }

      const p95 = document.getElementById('pct95');
      const p85 = document.getElementById('pct85');
      const p75 = document.getElementById('pct75');
      const p65 = document.getElementById('pct65');

      if (p95) p95.textContent = `${(oneRM * 0.95).toFixed(1)} kg`;
      if (p85) p85.textContent = `${(oneRM * 0.85).toFixed(1)} kg`;
      if (p75) p75.textContent = `${(oneRM * 0.75).toFixed(1)} kg`;
      if (p65) p65.textContent = `${(oneRM * 0.65).toFixed(1)} kg`;
    }

    if (calcBtn) calcBtn.onclick = calculate;
    if (weightInput) weightInput.oninput = calculate;
    if (repsInput) repsInput.oninput = calculate;

    calculate();
  }

  // --- 6. FINISH WORKOUT & SUBMIT TO POSTGRESQL ---
  function initFinishWorkout() {
    const finishBtn = document.getElementById('btnFinishWorkout');
    const confirmModal = document.getElementById('confirmFinishModal');
    const celebrationModal = document.getElementById('celebrationModal');
    const btnConfirmYes = document.getElementById('btnConfirmFinishYes');
    const btnConfirmCancel = document.getElementById('btnConfirmFinishCancel');
    const closeCelebBtn = document.getElementById('btnCloseCelebration');

    if (finishBtn) {
      finishBtn.onclick = function () {
        if (confirmModal) confirmModal.style.display = 'flex';
      };
    }

    if (btnConfirmCancel) {
      btnConfirmCancel.onclick = function () {
        if (confirmModal) confirmModal.style.display = 'none';
      };
    }

    if (btnConfirmYes) {
      btnConfirmYes.onclick = async function () {
        if (confirmModal) confirmModal.style.display = 'none';

        pauseWorkoutTimer();

        // Calculate final stats & collect set-by-set exercise logs
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

        // Submit completion to PostgreSQL via Prisma REST API
        if (currentParticipant && currentParticipant.id && state.currentWorkoutDayId) {
          try {
            const finishRes = await fetch(getApiUrl('/api/public/workout/finish'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                participantId: currentParticipant.id,
                workoutDayId: state.currentWorkoutDayId,
                durationSeconds: elapsedSecs,
                exerciseLogs,
              }),
            });

            if (finishRes.ok) {
              console.log('✅ Workout completion saved to PostgreSQL!');
            }
          } catch (e) {
            console.warn('Could not submit completion to PostgreSQL:', e);
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

        // Update daily discipline workout status to completed
        const valWorkoutStatus = document.getElementById('valWorkoutStatus');
        if (valWorkoutStatus) {
          valWorkoutStatus.className = 'axg-discipline-pill__value text-green';
          valWorkoutStatus.textContent = '✅ COMPLETED';
        }
      };
    }

    if (closeCelebBtn) {
      closeCelebBtn.onclick = function () {
        if (celebrationModal) celebrationModal.style.display = 'none';
      };
    }
  }

  // --- 6.5 DAILY DISCIPLINE AUDIT: ATTENDANCE & WORKOUT STATUS SYNC ---
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

    const valAttendanceStatus = document.getElementById('valAttendanceStatus');
    const subAttendanceDetail = document.getElementById('subAttendanceDetail');
    const iconAttendance = document.getElementById('iconAttendance');
    const subWorkoutDetail = document.getElementById('subWorkoutDetail');

    if (subWorkoutDetail) {
      subWorkoutDetail.textContent = `${state.currentDayTitle} • ${state.exercises.length} Exercises`;
    }

    // Check saved attendance or server /auth/me endpoint
    let attendance = null;
    try {
      const saved = localStorage.getItem('axg_today_attendance');
      if (saved) attendance = JSON.parse(saved);
    } catch (e) {}

    const token = localStorage.getItem('axg_client_token');
    if (token) {
      try {
        const res = await fetch(getApiUrl('/api/attendance/auth/me'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success && data.attendanceToday && data.attendanceToday.recorded) {
          attendance = data.attendanceToday;
        }
      } catch (e) {}
    }

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

  // --- 7. INITIALIZATION ON DOM READY ---
  document.addEventListener('DOMContentLoaded', function () {
    loadChallengeAndWorkout();
    renderPersonalRecords();
    initRestTimer();
    init1RMCalculator();
    initFinishWorkout();
    initDisciplineAudit();

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
