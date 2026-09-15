/**
 * ALPHA X GYM — DYNAMIC QR DISPLAY CONTROLLER
 * Handles real-time clock, short-lived token rotation, and countdown animations
 */

(function () {
  'use strict';

  // DOM Elements
  const qrImage = document.getElementById('qrImage');
  const qrLoadingOverlay = document.getElementById('qrLoadingOverlay');
  const clockTime = document.getElementById('clockTime');
  const clockDate = document.getElementById('clockDate');
  const countdownSeconds = document.getElementById('countdownSeconds');
  const progressFill = document.getElementById('progressFill');
  const facilityNameDisplay = document.getElementById('facilityName');
  const btnFullscreen = document.getElementById('btnFullscreen');
  const qrCard = document.getElementById('qrCard');

  let countdownInterval = null;
  let currentRemaining = 30;
  let totalTtl = 30;
  let isFetching = false;

  /**
   * Update Real-time Clock (HH:MM:SS AM/PM)
   */
  function updateLiveClock() {
    const now = new Date();
    
    // Time formatted in Asia/Kolkata
    const timeOptions = {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    };
    const dateOptions = {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    };

    try {
      if (clockTime) clockTime.textContent = now.toLocaleTimeString('en-US', timeOptions);
      if (clockDate) clockDate.textContent = `${now.toLocaleDateString('en-GB', dateOptions)} • IST`;
    } catch (e) {
      if (clockTime) clockTime.textContent = now.toLocaleTimeString();
      if (clockDate) clockDate.textContent = now.toDateString();
    }
  }

  function getApiUrl(path) {
    const isFile = window.location.protocol === 'file:';
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isNotPort3000 = window.location.port && window.location.port !== '3000';
    const base = (isFile || (isLocal && isNotPort3000)) ? 'http://localhost:3000' : '';
    return `${base}${path}`;
  }

  /**
   * Fetch a fresh dynamic QR token from the server
   */
  async function fetchNewQrToken() {
    if (isFetching) return;
    isFetching = true;

    try {
      const response = await fetch(getApiUrl('/api/attendance/qr-token'), {
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data.success || !data.qrDataUrl) {
        throw new Error(data.error || 'Invalid QR payload');
      }

      // Update QR visual immediately
      if (qrLoadingOverlay) qrLoadingOverlay.style.display = 'none';
      qrImage.src = data.qrDataUrl;

      if (facilityNameDisplay && data.gym?.name) {
        facilityNameDisplay.textContent = data.gym.name;
      }

      // Calculate remaining TTL
      const expiresAt = new Date(data.expiresAt).getTime();
      const serverTime = data.serverTime ? new Date(data.serverTime).getTime() : Date.now();
      const diffMs = Math.max(0, expiresAt - serverTime);
      const remainingSec = Math.round(diffMs / 1000) || data.expiresInSeconds || 30;

      totalTtl = data.expiresInSeconds || 30;
      currentRemaining = remainingSec;

      // Subtle pulse effect on the card
      if (qrCard) {
        qrCard.style.borderColor = 'var(--red-primary)';
        setTimeout(() => {
          qrCard.style.borderColor = 'var(--border-subtle)';
        }, 600);
      }

      startCountdown();
    } catch (err) {
      console.error('Failed to load dynamic QR token:', err);
      if (qrLoadingOverlay) {
        qrLoadingOverlay.style.display = 'flex';
        const label = qrLoadingOverlay.querySelector('.spinner-label');
        if (label) label.textContent = 'Reconnecting to Gym Server...';
      }
      // Retry in 3 seconds if disconnected
      setTimeout(fetchNewQrToken, 3000);
    } finally {
      isFetching = false;
    }
  }

  /**
   * Run second-by-second countdown
   */
  function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);

    updateCountdownDisplay();

    countdownInterval = setInterval(() => {
      currentRemaining--;

      updateCountdownDisplay();

      // Trigger pre-fetch 1 second before expiration for seamless transition
      if (currentRemaining <= 1) {
        clearInterval(countdownInterval);
        fetchNewQrToken();
      }
    }, 1000);
  }

  /**
   * Update countdown bar & text
   */
  function updateCountdownDisplay() {
    const safeRemaining = Math.max(0, currentRemaining);
    if (countdownSeconds) {
      countdownSeconds.textContent = `${safeRemaining}s`;
    }

    const pct = Math.max(0, Math.min(100, (safeRemaining / totalTtl) * 100));
    if (progressFill) {
      progressFill.style.width = `${pct}%`;

      // Dynamic color shift
      if (pct > 50) {
        progressFill.style.background = 'var(--green-online)';
      } else if (pct > 20) {
        progressFill.style.background = 'var(--yellow-accent)';
      } else {
        progressFill.style.background = 'var(--red-primary)';
      }
    }
  }

  /**
   * Toggle Fullscreen Mode
   */
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('Fullscreen request denied:', err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  // Event Listeners
  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', toggleFullscreen);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') {
      toggleFullscreen();
    }
  });

  // Initialization
  updateLiveClock();
  setInterval(updateLiveClock, 500);

  // Initial fetch
  fetchNewQrToken();

})();
