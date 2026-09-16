/**
 * ALPHA X GYM — CLIENT CHECK-IN CONTROLLER
 * Handles Google OAuth, Token Preservation, and Member Verification
 */

(function () {
  'use strict';

  // DOM Elements
  const authSection = document.getElementById('authSection');
  const memberSection = document.getElementById('memberSection');
  const memberAvatar = document.getElementById('memberAvatar');
  const memberName = document.getElementById('memberName');
  const memberEmail = document.getElementById('memberEmail');
  const btnSignOut = document.getElementById('btnSignOut');
  const tokenBanner = document.getElementById('tokenBanner');
  const tokenStatusText = document.getElementById('tokenStatusText');
  const tokenStatusIcon = document.getElementById('tokenStatusIcon');
  const checkinAlert = document.getElementById('checkinAlert');
  const alertText = document.getElementById('alertText');
  const btnGoogleSignIn = document.getElementById('btnGoogleSignIn');
  const btnDemoLogin = document.getElementById('btnDemoLogin');
  const proceedStepMsg = document.getElementById('proceedStepMsg');

  // 1. Capture and preserve QR token from URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  let currentQrToken = urlParams.get('token');

  if (currentQrToken) {
    sessionStorage.setItem('axg_pending_qr_token', currentQrToken);
  } else {
    currentQrToken = sessionStorage.getItem('axg_pending_qr_token');
  }

  function getApiUrl(path) {
    const isFile = window.location.protocol === 'file:';
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isNotPort3000 = window.location.port && window.location.port !== '3000';
    const base = (isFile || (isLocal && isNotPort3000)) ? 'http://localhost:3000' : '';
    return `${base}${path}`;
  }

  function showAlert(msg) {
    if (checkinAlert && alertText) {
      alertText.textContent = msg;
      checkinAlert.style.display = 'flex';
    }
  }

  function hideAlert() {
    if (checkinAlert) checkinAlert.style.display = 'none';
  }

  /**
   * Check if token is present and valid on server
   */
  async function inspectTokenStatus() {
    if (!tokenBanner || !tokenStatusText || !tokenStatusIcon) return;

    if (!currentQrToken) {
      tokenBanner.className = 'token-status-banner invalid';
      tokenStatusIcon.className = 'fa-solid fa-triangle-exclamation token-status-icon';
      tokenStatusText.innerHTML = '<strong>No QR token detected.</strong> Please point your camera at the current gym display screen.';
      if (btnVerifyLocation) {
        btnVerifyLocation.disabled = true;
        btnVerifyLocation.style.opacity = '0.5';
      }
      return;
    }

    try {
      const res = await fetch(getApiUrl(`/api/attendance/token-status?token=${encodeURIComponent(currentQrToken)}`));
      const data = await res.json();

      if (data.isValid) {
        tokenBanner.className = 'token-status-banner valid';
        tokenStatusIcon.className = 'fa-solid fa-circle-check token-status-icon';
        tokenStatusText.innerHTML = '<strong>Dynamic QR Token Verified.</strong> Server signed and ready for attendance check.';
        if (proceedStepMsg) proceedStepMsg.style.display = 'block';
        if (btnVerifyLocation) {
          btnVerifyLocation.disabled = false;
          btnVerifyLocation.style.opacity = '1';
        }
      } else {
        tokenBanner.className = 'token-status-banner invalid';
        tokenStatusIcon.className = 'fa-solid fa-circle-xmark token-status-icon';
        tokenStatusText.innerHTML = `<strong>QR Code Expired:</strong> ${data.rejectionReason || 'Please scan the current gym QR code.'}`;
        if (proceedStepMsg) proceedStepMsg.style.display = 'none';
        if (btnVerifyLocation) {
          btnVerifyLocation.disabled = true;
          btnVerifyLocation.style.opacity = '0.5';
        }
      }
    } catch (e) {
      tokenBanner.className = 'token-status-banner invalid';
      tokenStatusIcon.className = 'fa-solid fa-triangle-exclamation token-status-icon';
      tokenStatusText.innerHTML = '<strong>QR Verification Pending.</strong> Checking status with gym server...';
    }
  }

  /**
   * Authenticate with Google Credential
   */
  async function submitGoogleAuth(payload) {
    hideAlert();
    try {
      const res = await fetch(getApiUrl('/api/attendance/auth/google'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Google authentication failed');
      }

      // Persist client session
      localStorage.setItem('axg_client_token', data.token);
      localStorage.setItem('axg_client_profile', JSON.stringify(data.client));

      renderAuthenticatedState(data.client);
      inspectTokenStatus();
    } catch (err) {
      console.error('Google sign-in error:', err);
      showAlert(err.message || 'Authentication failed. Please try again.');
    }
  }

  /**
   * Render state when member is logged in
   */
  function renderAuthenticatedState(client) {
    if (authSection) authSection.style.display = 'none';
    if (memberSection) memberSection.style.display = 'block';

    if (memberName) memberName.textContent = client.name || 'Alpha Athlete';
    if (memberEmail) memberEmail.textContent = client.email || 'Verified Google Account';
    if (memberAvatar) {
      memberAvatar.src = client.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150';
    }
  }

  /**
   * Render state when member is NOT logged in
   */
  function renderUnauthenticatedState() {
    if (authSection) authSection.style.display = 'block';
    if (memberSection) memberSection.style.display = 'none';
  }

  /**
   * Log out client completely
   */
  function signOut() {
    localStorage.removeItem('axg_client_token');
    localStorage.removeItem('axg_client_profile');
    localStorage.removeItem('axg_current_client');
    localStorage.removeItem('axg_current_participant');
    localStorage.removeItem('axg_today_attendance');
    localStorage.removeItem('axg_today_challenge');
    sessionStorage.removeItem('axg_pending_qr_token');
    renderUnauthenticatedState();
    inspectTokenStatus();
  }

  const FALLBACK_GOOGLE_CLIENT_ID = '661072520427-ntrkjvfob7eptc9fvnaaga087agikupr.apps.googleusercontent.com';

  /**
   * Initialize Official Google Identity Services SDK with polling and fallback
   */
  async function initGoogleOAuth(retryCount = 0) {
    // If Google Identity script is still downloading (async defer), wait and retry
    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
      if (retryCount < 25) {
        setTimeout(() => initGoogleOAuth(retryCount + 1), 200);
        return;
      }
    }

    let clientId = FALLBACK_GOOGLE_CLIENT_ID;
    try {
      const res = await fetch(getApiUrl('/api/registration/config'));
      if (res.ok) {
        const config = await res.json();
        if (config && config.googleClientId) {
          clientId = config.googleClientId;
        }
      }
    } catch (cfgErr) {
      console.warn('Backend config fetch notice, using fallback client ID:', cfgErr);
    }

    try {
      if (window.google && window.google.accounts && window.google.accounts.id && clientId) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response) => {
            submitGoogleAuth({ credential: response.credential });
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        const target = document.getElementById('googleSignInCheckinBtn');
        if (target) {
          target.innerHTML = '';
          window.google.accounts.id.renderButton(target, {
            theme: 'filled_black',
            size: 'large',
            width: 320,
            text: 'continue_with',
            shape: 'pill',
          });
          if (btnGoogleSignIn) btnGoogleSignIn.style.display = 'none';
        }
      }
    } catch (e) {
      console.warn('Google client initialization note:', e);
    }
  }

  // Google Login click handler
  if (btnGoogleSignIn) {
    btnGoogleSignIn.addEventListener('click', () => {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        window.google.accounts.id.prompt();
      } else {
        showAlert('Google Sign-In is unavailable. Please check your internet connection or reload.');
      }
    });
  }

  if (btnSignOut) {
    btnSignOut.addEventListener('click', signOut);
  }

  // ==============================================
  // GPS GEOFENCE VERIFICATION
  // ==============================================
  const btnVerifyLocation = document.getElementById('btnVerifyLocation');
  const gpsStatusBox = document.getElementById('gpsStatusBox');
  const gpsStatusIcon = document.getElementById('gpsStatusIcon');
  const gpsStatusText = document.getElementById('gpsStatusText');

  /**
   * Submit check-in to server with full 8-point security validation
   */
  async function submitCheckinToServer(lat, lng, accuracy) {
    const token = localStorage.getItem('axg_client_token');
    if (!token) {
      showAlert('Please log in with Google first.');
      return;
    }

    if (!currentQrToken) {
      showAlert('No valid QR token detected. Please scan the current gym screen.');
      return;
    }

    if (gpsStatusBox) {
      gpsStatusBox.className = 'gps-status-box';
      gpsStatusIcon.className = 'fa-solid fa-radar fa-spin';
      gpsStatusIcon.style.color = 'var(--yellow-alert)';
      gpsStatusText.textContent = 'Server performing 8-point security validation & geofence check...';
    }

    try {
      const res = await fetch(getApiUrl('/api/attendance/checkin'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          token: currentQrToken,
          latitude: lat,
          longitude: lng,
          accuracy: accuracy,
          timestamp: new Date().toISOString(),
        }),
      });

      const data = await res.json();

      // Check if already checked in today (409)
      if (res.status === 409 || data.alreadyCheckedIn) {
        renderResultScreen(data.attendance, data.todayChallenge, true);
        return;
      }

      if (!res.ok || !data.success) {
        if (gpsStatusBox) {
          gpsStatusBox.className = 'gps-status-box outside';
          gpsStatusIcon.className = 'fa-solid fa-circle-xmark';
          gpsStatusIcon.style.color = 'var(--red-primary)';
          gpsStatusText.innerHTML = `<strong>Check-In Rejected:</strong> ${data.error || 'Validation failed.'}`;
        }
        showAlert(data.error || 'Validation failed. Please scan current QR from inside the gym.');
        return;
      }

      // Check-in Successfully Recorded!
      renderResultScreen(data.attendance, data.todayChallenge, false);

    } catch (err) {
      console.error('Server checkin validation error:', err);
      if (gpsStatusBox) {
        gpsStatusBox.className = 'gps-status-box outside';
        gpsStatusIcon.className = 'fa-solid fa-circle-exclamation';
        gpsStatusText.textContent = 'Could not reach gym server. Please try again.';
      }
      showAlert('Network error validating check-in. Please try again.');
    }
  }

  /**
   * Render Attendance Result Screen
   */
  function renderResultScreen(attendance, todayChallenge, isDuplicate = false) {
    if (authSection) authSection.style.display = 'none';
    if (memberSection) memberSection.style.display = 'none';

    const resultSection = document.getElementById('resultSection');
    if (resultSection) resultSection.style.display = 'block';

    if (attendance) {
      localStorage.setItem('axg_today_attendance', JSON.stringify(attendance));
    }
    if (todayChallenge) {
      localStorage.setItem('axg_today_challenge', JSON.stringify(todayChallenge));
    }

    const resultCheckinTime = document.getElementById('resultCheckinTime');
    const resultLocationText = document.getElementById('resultLocationText');
    const resultDateText = document.getElementById('resultDateText');
    const resChallengeDays = document.getElementById('resChallengeDays');
    const resWorkoutTitle = document.getElementById('resWorkoutTitle');
    const resWorkoutStatus = document.getElementById('resWorkoutStatus');
    const btnStartTodayWorkout = document.getElementById('btnStartTodayWorkout');

    if (resultCheckinTime) {
      resultCheckinTime.textContent = attendance?.checkInAt || 'Verified Today';
    }
    if (resultLocationText) {
      resultLocationText.textContent = '✅ Gym location verified';
    }
    if (resultDateText) {
      resultDateText.textContent = isDuplicate ? 'Already Recorded Today' : 'Today\'s Session';
    }

    if (todayChallenge) {
      if (resChallengeDays) {
        resChallengeDays.textContent = `Day ${todayChallenge.dayNumber} / ${todayChallenge.totalDays}`;
      }
      if (resWorkoutTitle) {
        resWorkoutTitle.textContent = todayChallenge.workoutTitle || 'Daily Workout Protocol';
      }
      if (resWorkoutStatus) {
        if (todayChallenge.workoutStatus === 'COMPLETED') {
          resWorkoutStatus.className = 'pill-value text-green';
          resWorkoutStatus.textContent = '✅ COMPLETED';
        } else if (todayChallenge.workoutStatus === 'IN PROGRESS') {
          resWorkoutStatus.className = 'pill-value' ;
          resWorkoutStatus.style.color = '#38bdf8';
          resWorkoutStatus.textContent = '🔵 IN PROGRESS';
        } else {
          resWorkoutStatus.className = 'pill-value text-yellow';
          resWorkoutStatus.textContent = '🟡 NOT STARTED';
        }
      }
      if (btnStartTodayWorkout && todayChallenge.workoutUrl) {
        btnStartTodayWorkout.href = todayChallenge.workoutUrl;
      }
    }

    if (isDuplicate) {
      showAlert('You are already marked PRESENT today.');
    } else {
      hideAlert();
    }
  }

  /**
   * Request device GPS with high accuracy
   */
  function requestDeviceLocation() {
    if (!navigator.geolocation) {
      showAlert('Geolocation is not supported by your browser.');
      return;
    }

    if (gpsStatusBox) {
      gpsStatusBox.className = 'gps-status-box';
      gpsStatusIcon.className = 'fa-solid fa-satellite fa-bounce';
      gpsStatusIcon.style.color = 'var(--yellow-alert)';
      gpsStatusText.textContent = 'Acquiring high-accuracy satellite GPS coordinates from your device...';
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        submitCheckinToServer(latitude, longitude, accuracy);
      },
      (error) => {
        let msg = 'Failed to acquire location.';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            msg = 'Please enable location access to check in.';
            break;
          case error.POSITION_UNAVAILABLE:
            msg = 'Location information is unavailable. Please enable GPS and try again.';
            break;
          case error.TIMEOUT:
            msg = 'Location request timed out. Please try again near the gym entrance.';
            break;
        }
        if (gpsStatusBox) {
          gpsStatusBox.className = 'gps-status-box outside';
          gpsStatusIcon.className = 'fa-solid fa-location-pin-lock';
          gpsStatusIcon.style.color = 'var(--red-primary)';
          gpsStatusText.innerHTML = `<strong>GPS Unavailable:</strong> ${msg}`;
        }
        showAlert(msg);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }

  if (btnVerifyLocation) {
    btnVerifyLocation.addEventListener('click', requestDeviceLocation);
  }

  // Check initial login state
  const storedToken = localStorage.getItem('axg_client_token');
  const storedProfile = localStorage.getItem('axg_client_profile');

  if (storedToken && storedProfile) {
    try {
      const client = JSON.parse(storedProfile);
      renderAuthenticatedState(client);
    } catch (e) {
      renderUnauthenticatedState();
    }
  } else {
    renderUnauthenticatedState();
  }

  inspectTokenStatus();
  initGoogleOAuth();

})();
