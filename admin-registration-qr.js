/**
 * ALPHA X GYM — ADMIN CLIENT REGISTRATION QR CONTROLLER
 * Fetches permanent registration QR, provides copy, download, print, and kiosk launch.
 * Includes instant-fallback rendering so the QR code NEVER fails to display.
 */

(function () {
  'use strict';

  // DOM Elements
  const navRegistrationQr = document.getElementById('navRegistrationQr');
  const registrationQrSection = document.getElementById('registrationQrSection');
  const qrImg = document.getElementById('adminRegQrImg');
  const qrLoading = document.getElementById('adminRegQrLoading');
  const urlInput = document.getElementById('adminRegUrlInput');
  const btnCopy = document.getElementById('adminRegBtnCopy');
  const btnDownload = document.getElementById('adminRegBtnDownload');
  const btnPrint = document.getElementById('adminRegBtnPrint');
  const btnOpenPage = document.getElementById('adminRegBtnOpenPage');
  const btnLaunchKiosk = document.getElementById('adminRegBtnLaunchKiosk');
  const gymNameBadge = document.getElementById('adminRegGymNameBadge');

  let currentQrDataUrl = '';
  let currentRegistrationUrl = '';

  /**
   * Helper to resolve local vs remote API base path (handles file:// and custom ports)
   */
  function getApiUrl(path) {
    const isFile = window.location.protocol === 'file:';
    const isNotPort3000 = window.location.port && window.location.port !== '3000';
    const base = (isFile || isNotPort3000) ? 'http://localhost:3000' : '';
    return `${base}${path}`;
  }

  /**
   * Resolves the public production registration URL
   */
  function getFallbackRegistrationUrl() {
    if (window.location.protocol.startsWith('http')) {
      return `${window.location.origin}/register`;
    }
    return 'http://localhost:3000/register';
  }

  /**
   * Renders instant fallback QR so the user NEVER sees an empty box or error spinner
   */
  function applyInstantFallbackQr() {
    const fallbackUrl = getFallbackRegistrationUrl();
    const fallbackQrImg = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=10&data=${encodeURIComponent(fallbackUrl)}`;

    currentRegistrationUrl = fallbackUrl;
    currentQrDataUrl = fallbackQrImg;

    if (qrImg) {
      qrImg.src = fallbackQrImg;
    }
    if (qrLoading) {
      qrLoading.style.display = 'none';
    }
    if (urlInput) {
      urlInput.value = fallbackUrl;
    }
    if (btnOpenPage) {
      btnOpenPage.href = fallbackUrl;
    }
  }

  function showToast(message, type = 'success') {
    const existing = document.getElementById('axgRegToast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'axgRegToast';
    toast.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: var(--font-body, sans-serif);
      font-size: 13px;
      font-weight: 700;
      z-index: 999999;
      display: flex;
      align-items: center;
      gap: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.6);
      background: ${type === 'success' ? '#10b981' : '#ef4444'};
      color: #ffffff;
    `;
    const icon = type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 3000);
  }

  // Navigation scroll & active link handler
  if (navRegistrationQr) {
    navRegistrationQr.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.axg-nav-link').forEach((l) => l.classList.remove('axg-nav-link--active'));
      navRegistrationQr.classList.add('axg-nav-link--active');

      const sidebar = document.getElementById('axgSidebar');
      if (sidebar) sidebar.classList.remove('axg-sidebar--open');

      if (registrationQrSection) {
        registrationQrSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        registrationQrSection.classList.remove('axg-pulse-highlight');
        void registrationQrSection.offsetWidth;
        registrationQrSection.classList.add('axg-pulse-highlight');
      }
    });
  }

  // Fetch QR Code from Server with immediate resilient display
  async function loadRegistrationQrData() {
    try {
      const res = await fetch(getApiUrl('/api/registration/qr'));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (!data.success) throw new Error(data.error || 'Failed to generate QR');

      currentQrDataUrl = data.qrDataUrl;
      currentRegistrationUrl = data.registrationUrl;

      if (qrImg) {
        qrImg.src = data.qrDataUrl;
      }
      if (qrLoading) {
        qrLoading.style.display = 'none';
      }
      if (urlInput) {
        urlInput.value = data.registrationUrl;
      }
      if (gymNameBadge && data.gymName) {
        gymNameBadge.textContent = data.gymName;
      }
      if (btnOpenPage) {
        btnOpenPage.href = data.registrationUrl;
      }
    } catch (err) {
      console.warn('Backend registration QR fetch notice (using instant robust fallback):', err.message);
      applyInstantFallbackQr();
      setTimeout(loadRegistrationQrData, 5000);
    }
  }

  // Copy Link
  if (btnCopy) {
    btnCopy.addEventListener('click', async () => {
      if (!currentRegistrationUrl) currentRegistrationUrl = getFallbackRegistrationUrl();
      try {
        await navigator.clipboard.writeText(currentRegistrationUrl);
        showToast('Registration link copied to clipboard!');
      } catch (e) {
        if (urlInput) {
          urlInput.select();
          document.execCommand('copy');
          showToast('Registration link copied to clipboard!');
        }
      }
    });
  }

  // Download High-Res PNG
  if (btnDownload) {
    btnDownload.addEventListener('click', async () => {
      if (!currentQrDataUrl) applyInstantFallbackQr();
      try {
        if (currentQrDataUrl.startsWith('data:')) {
          const a = document.createElement('a');
          a.download = 'AlphaXGym-Client-Registration-QR.png';
          a.href = currentQrDataUrl;
          document.body.appendChild(a);
          a.click();
          a.remove();
        } else {
          const resp = await fetch(currentQrDataUrl);
          const blob = await resp.blob();
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.download = 'AlphaXGym-Client-Registration-QR.png';
          a.href = blobUrl;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(blobUrl);
        }
        showToast('Downloaded High-Res Registration QR PNG');
      } catch (e) {
        window.open(currentQrDataUrl, '_blank');
        showToast('Opened QR in new tab');
      }
    });
  }

  // Print Poster
  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      const printUrl = getApiUrl('/admin/registration-qr');
      const printWindow = window.open(printUrl, '_blank');
      if (printWindow) {
        printWindow.addEventListener('load', () => {
          setTimeout(() => {
            printWindow.print();
          }, 600);
        });
      }
    });
  }

  // Launch Fullscreen Reception Kiosk
  if (btnLaunchKiosk) {
    btnLaunchKiosk.addEventListener('click', () => {
      window.open(getApiUrl('/admin/registration-qr'), '_blank');
    });
  }

  // Initialize immediately
  applyInstantFallbackQr();
  loadRegistrationQrData();

})();
