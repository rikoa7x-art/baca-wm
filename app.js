/**
 * WATER METER READER v3 — app.js
 * Powered by NVIDIA NIM API (OpenAI-compatible) + Vision Model
 */

'use strict';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const NVIDIA_BASE_URL    = 'https://integrate.api.nvidia.com/v1';
const NVIDIA_MODEL       = 'meta/llama-3.2-11b-vision-instruct';
const DEFAULT_API_KEY    = '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';
const LS_KEY_APIKEY      = 'wm_nvidia_key';
const LS_KEY_DATA        = 'wm_readings';
const SS_KEY_LOGIN       = 'wm_session';   // sessionStorage — auto-clear saat tab ditutup
// Kredensial login (hardcoded)
const LOGIN_USER         = 'riko';
const LOGIN_PASS         = '12345';
// CORS proxy — dibutuhkan karena NVIDIA API tidak support request langsung dari browser
const CORS_PROXY         = 'https://corsproxy.io/?url=';

// ─── STATE ────────────────────────────────────────────────────────────────────
const State = {
  readings:             JSON.parse(localStorage.getItem(LS_KEY_DATA) || '[]'),
  currentImageDataURL:  null,
  currentImageBase64:   null,
  currentImageMime:     'image/jpeg',
  apiKey:               localStorage.getItem(LS_KEY_APIKEY) || DEFAULT_API_KEY,
  cropper:              null,
  gpsCoords:            null,
  gpsWatchId:           null,
};

// ─── DOM REFS ─────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const els = {
  splash:             $('splash'),
  loginScreen:        $('loginScreen'),
  loginUsername:      $('loginUsername'),
  loginPassword:      $('loginPassword'),
  btnLoginToggleVis:  $('btnLoginToggleVis'),
  btnLogin:           $('btnLogin'),
  loginError:         $('loginError'),
  apiGate:            $('apiGate'),
  app:                $('app'),
  // API Gate
  apiKeyInput:        $('apiKeyInput'),
  btnToggleVis:       $('btnToggleVis'),
  btnSaveApiKey:      $('btnSaveApiKey'),
  apiKeyError:        $('apiKeyError'),
  // Topbar
  btnHistory:         $('btnHistory'),
  btnSettings:        $('btnSettings'),
  // Pages
  pageScan:           $('pageScan'),
  pageHistory:        $('pageHistory'),
  pageSettings:       $('pageSettings'),
  // DateTime
  displayDate:        $('displayDate'),
  displayTime:        $('displayTime'),
  // Meter field
  meterId:            $('meterId'),
  // Capture
  captureArea:        $('captureArea'),
  capturePlaceholder: $('capturePlaceholder'),
  capturedImage:      $('capturedImage'),
  cameraInput:        $('cameraInput'),
  // Result
  resultArea:         $('resultArea'),
  processingState:    $('processingState'),
  processingSubText:  $('processingSubText'),
  resultState:        $('resultState'),
  errorState:         $('errorState'),
  resultNumber:       $('resultNumber'),
  manualNumber:       $('manualNumber'),
  resultAiInfo:       $('resultAiInfo'),
  errorText:          $('errorText'),
  btnSave:            $('btnSave'),
  btnSaveManual:      $('btnSaveManual'),
  btnRetry:           $('btnRetry'),
  btnRetryError:      $('btnRetryError'),
  successToast:       $('successToast'),
  toastMsg:           $('toastMsg'),
  // History
  historyList:        $('historyList'),
  historyEmpty:       $('historyEmpty'),
  statTotal:          $('statTotal'),
  statLastRead:       $('statLastRead'),
  statPelanggan:      $('statPelanggan'),
  btnExportCSV:       $('btnExportCSV'),
  btnClearAll:        $('btnClearAll'),
  // Nav
  navScan:            $('navScan'),
  navHistory:         $('navHistory'),
  navSettings:        $('navSettings'),
  // Settings
  settingsApiKey:     $('settingsApiKey'),
  settingsToggleVis:  $('settingsToggleVis'),
  btnUpdateApiKey:    $('btnUpdateApiKey'),
  settingsTotalData:  $('settingsTotalData'),
  settingsUsername:   $('settingsUsername'),
  btnLogout:          $('btnLogout'),
  // Modal
  confirmModal:       $('confirmModal'),
  modalCancel:        $('modalCancel'),
  modalConfirm:       $('modalConfirm'),
  // Crop Modal
  cropModal:          $('cropModal'),
  cropImage:          $('cropImage'),
  btnCropRotateLeft:  $('btnCropRotateLeft'),
  btnCropRotateRight: $('btnCropRotateRight'),
  btnCropCancel:      $('btnCropCancel'),
  btnCropApply:       $('btnCropApply'),
  // Photo Modal
  photoModal:         $('photoModal'),
  btnPhotoClose:      $('btnPhotoClose'),
  modalViewImage:     $('modalViewImage'),
};

// ─── INIT ─────────────────────────────────────────────────────────────────────
function init() {
  updateDateTime();
  setInterval(updateDateTime, 1000);
  bindEvents();
  startGpsTracking();

  // Pastikan default key tersimpan
  if (!localStorage.getItem(LS_KEY_APIKEY)) {
    localStorage.setItem(LS_KEY_APIKEY, DEFAULT_API_KEY);
  }

  setTimeout(() => {
    els.splash.classList.add('fade-out');
    setTimeout(() => {
      els.splash.classList.add('hidden');
      // Cek apakah sudah login di sesi ini
      const session = sessionStorage.getItem(SS_KEY_LOGIN);
      if (session) {
        // Sudah login — langsung masuk
        if (State.apiKey) showApp();
        else showApiGate();
      } else {
        // Belum login — tampilkan halaman login
        showLogin();
      }
    }, 500);
  }, 2000);
}

function showApp() {
  els.loginScreen.classList.add('hidden');
  els.apiGate.classList.add('hidden');
  els.app.classList.remove('hidden');
  if (els.settingsApiKey) els.settingsApiKey.value = State.apiKey;
}

function showApiGate() {
  els.loginScreen.classList.add('hidden');
  els.app.classList.add('hidden');
  els.apiGate.classList.remove('hidden');
  // Pre-fill dengan default key
  if (els.apiKeyInput) els.apiKeyInput.value = DEFAULT_API_KEY;
}

function showLogin() {
  els.app.classList.add('hidden');
  els.apiGate.classList.add('hidden');
  els.loginScreen.classList.remove('hidden');
  if (els.loginUsername) els.loginUsername.focus();
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────────────
function handleLogin() {
  const user = els.loginUsername.value.trim();
  const pass = els.loginPassword.value;

  if (user === LOGIN_USER && pass === LOGIN_PASS) {
    // Login berhasil — simpan sesi
    sessionStorage.setItem(SS_KEY_LOGIN, user);
    els.loginError.classList.add('hidden');
    // Animasi hilang lalu masuk app
    els.loginScreen.style.transition = 'opacity 0.4s ease';
    els.loginScreen.style.opacity = '0';
    setTimeout(() => {
      els.loginScreen.style.opacity = '';
      els.loginScreen.style.transition = '';
      if (State.apiKey) showApp();
      else showApiGate();
    }, 400);
  } else {
    // Login gagal — tampilkan error dan animasi shake
    els.loginError.classList.remove('hidden');
    // Reset animasi shake
    els.loginError.style.animation = 'none';
    els.loginError.offsetHeight; // trigger reflow
    els.loginError.style.animation = '';
    els.loginPassword.value = '';
    els.loginPassword.focus();
  }
}

function logout() {
  sessionStorage.removeItem(SS_KEY_LOGIN);
  // Reset tampilan login
  if (els.loginUsername) els.loginUsername.value = '';
  if (els.loginPassword) els.loginPassword.value = '';
  if (els.loginError) els.loginError.classList.add('hidden');
  showLogin();
  showToast('👋 Anda telah keluar dari aplikasi');
}

// ─── DATETIME ─────────────────────────────────────────────────────────────────
function updateDateTime() {
  const now = new Date();
  els.displayDate.textContent = now.toLocaleDateString('id-ID', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });
  els.displayTime.textContent = now.toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  $(pageId).classList.add('active');
  const navMap = { pageScan: 'navScan', pageHistory: 'navHistory', pageSettings: 'navSettings' };
  if (navMap[pageId]) $(navMap[pageId]).classList.add('active');
  if (pageId === 'pageHistory') renderHistory();
  if (pageId === 'pageSettings') renderSettings();
}

// ─── API KEY ──────────────────────────────────────────────────────────────────
function saveApiKey(key) {
  key = key.trim();
  if (!key || (!key.startsWith('nvapi-') && !key.startsWith('sk-'))) {
    if (els.apiKeyError) els.apiKeyError.textContent = '⚠️ API Key tidak valid. Harus dimulai dengan "nvapi-"';
    return false;
  }
  State.apiKey = key;
  localStorage.setItem(LS_KEY_APIKEY, key);
  if (els.apiKeyError) els.apiKeyError.textContent = '';
  return true;
}

// ─── GEOLOCATION ──────────────────────────────────────────────────────────────
function startGpsTracking() {
  if (State.gpsWatchId) return; // Sudah berjalan

  if (navigator.geolocation) {
    State.gpsCoords = 'GPS: Mengambil lokasi...';
    State.gpsWatchId = navigator.geolocation.watchPosition(
      (position) => {
        State.gpsCoords = `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
        console.log('[GPS] Lokasi diperbarui:', State.gpsCoords);
      },
      (error) => {
        console.warn('Geolocation error:', error);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            State.gpsCoords = 'GPS: Izin Ditolak';
            break;
          case error.POSITION_UNAVAILABLE:
            State.gpsCoords = 'GPS: Tidak Tersedia';
            break;
          case error.TIMEOUT:
            State.gpsCoords = 'GPS: Waktu Habis';
            break;
          default:
            State.gpsCoords = 'GPS: Tidak Aktif';
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  } else {
    State.gpsCoords = 'GPS: Tidak Didukung';
  }
}

// ─── IMAGE HANDLING ───────────────────────────────────────────────────────────
function handleImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  State.currentImageMime = file.type || 'image/jpeg';

  startGpsTracking();

  const url = URL.createObjectURL(file);
  openCropModal(url);
}

function openCropModal(imageSrc) {
  // Hancurkan instance cropper lama jika ada
  if (State.cropper) {
    State.cropper.destroy();
    State.cropper = null;
  }

  // Reset src lama agar event onload terpicu ulang untuk gambar baru
  els.cropImage.src = '';
  
  // Tampilkan modal dulu agar elemen/container memiliki dimensi (lebar/tinggi) di DOM
  els.cropModal.classList.remove('hidden');

  // Tunggu gambar benar-benar selesai dimuat sebelum inisialisasi Cropper
  els.cropImage.onload = () => {
    State.cropper = new Cropper(els.cropImage, {
      viewMode: 1,
      dragMode: 'move',
      autoCropArea: 0.8,
      restore: false,
      guides: true,
      center: true,
      highlight: false,
      cropBoxMovable: true,
      cropBoxResizable: true,
      toggleDragModeOnDblclick: false,
      background: false
    });
  };

  els.cropImage.src = imageSrc;
}

function closeCropModal() {
  els.cropModal.classList.add('hidden');
  if (State.cropper) {
    State.cropper.destroy();
    State.cropper = null;
  }
  if (els.cropImage.src.startsWith('blob:')) {
    URL.revokeObjectURL(els.cropImage.src);
  }
  els.cropImage.onload = null;
  els.cropImage.src = '';
  els.cameraInput.value = '';
}

function openPhotoModal(imgSrc) {
  if (els.modalViewImage) els.modalViewImage.src = imgSrc;
  if (els.photoModal) els.photoModal.classList.remove('hidden');
}

function closePhotoModal() {
  if (els.photoModal) els.photoModal.classList.add('hidden');
  if (els.modalViewImage) els.modalViewImage.src = '';
}

function applyCrop() {
  if (!State.cropper) return;

  // Dapatkan cropped canvas dasar
  const croppedCanvas = State.cropper.getCroppedCanvas({
    maxWidth: 600,
    maxHeight: 600,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high'
  });

  if (!croppedCanvas) {
    showToast('⚠️ Gagal memotong gambar.');
    closeCropModal();
    return;
  }

  const w = croppedCanvas.width;
  const h = croppedCanvas.height;

  // Tentukan ukuran font dan tinggi banner secara dinamis agar proporsional
  const fontSize = Math.max(12, Math.round(h * 0.035));
  const padding = Math.max(6, Math.round(h * 0.02));
  const bannerHeight = (fontSize * 2) + (padding * 3);

  // Buat canvas baru yang diperluas tinggi bawahnya untuk menampung teks watermark
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = w;
  finalCanvas.height = h + bannerHeight;

  const ctx = finalCanvas.getContext('2d');

  // 1. Gambar foto terpotong di bagian atas
  ctx.drawImage(croppedCanvas, 0, 0);

  // 2. Gambar background banner hitam di bagian bawah yang baru diperluas
  ctx.fillStyle = '#080d1a';
  ctx.fillRect(0, h, w, bannerHeight);

  // Garis pemisah tipis antara foto dan watermark
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(w, h);
  ctx.stroke();

  // 3. Gambar teks watermark (tanpa emoji agar kompatibel di semua Canvas/Android)
  ctx.fillStyle = '#ffffff';
  ctx.font = `600 ${fontSize}px 'Inter', sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // Dapatkan data waktu, ID, dan GPS
  const now = new Date();
  const dateStr = now.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const customerId = els.meterId.value.trim() || 'Tanpa ID';
  const gpsStr = State.gpsCoords || 'GPS: Mengambil lokasi...';

  // Baris 1: ID Pelanggan (teks biasa, tanpa emoji)
  ctx.fillText(`ID: ${customerId}`, padding, h + padding);

  // Baris 2: Waktu & GPS
  ctx.fillStyle = '#8899bb'; // warna text secondary
  ctx.font = `400 ${Math.max(10, Math.round(fontSize * 0.85))}px 'Inter', sans-serif`;
  ctx.fillText(`${dateStr} ${timeStr} | ${gpsStr}`, padding, h + (padding * 2) + fontSize);

  const mime = 'image/jpeg';
  const dataURL = finalCanvas.toDataURL(mime, 0.85);
  const base64 = dataURL.split(',')[1];

  State.currentImageDataURL = dataURL;
  State.currentImageBase64 = base64;
  State.currentImageMime = mime;

  closeCropModal();
  showImagePreview(dataURL);
  analyzeWithNvidia();
}

function showImagePreview(dataURL) {
  els.capturePlaceholder.classList.add('hidden');
  els.capturedImage.src = dataURL;
  els.capturedImage.classList.remove('hidden');
  els.captureArea.classList.add('has-image');
  els.resultArea.classList.remove('hidden');
  showProcessingState('Mempersiapkan gambar…');
}

// ─── NVIDIA API CALL ──────────────────────────────────────────────────────────
async function analyzeWithNvidia() {
  if (!State.apiKey) {
    showErrorState('API Key belum diset. Buka tab Pengaturan.');
    return;
  }

  if (location.protocol === 'file:') {
    console.warn('[WARN] Membuka via file:// — CORS proxy mungkin tidak berfungsi sempurna.');
    // Tetap lanjutkan, biarkan error muncul jika memang gagal
  }

  const prompt = `Analyze this water meter. Return ONLY: {"reading": "12345", "description": "short description"}`;

  try {
    showProcessingState('Menghubungi NVIDIA AI…');
    const response = await fetch(`${CORS_PROXY}${encodeURIComponent(NVIDIA_BASE_URL + '/chat/completions')}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${State.apiKey}`
      },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: `data:${State.currentImageMime};base64,${State.currentImageBase64}` }
            }
          ]
        }],
        max_tokens: 300,
        temperature: 0.1,
        stream: false
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      const errMsg  = errData?.detail || errData?.error?.message || `HTTP ${response.status}`;
      if (response.status === 401) throw new Error('API Key tidak valid atau kadaluarsa.');
      if (response.status === 429) throw new Error('Batas permintaan tercapai. Coba beberapa detik lagi.');
      if (response.status === 413) throw new Error('Gambar terlalu besar. Gunakan foto dengan resolusi lebih kecil.');
      throw new Error(errMsg);
    }

    const data    = await response.json();
    const rawText = data?.choices?.[0]?.message?.content || '';

    const parsed = parseAIResponse(rawText);

    if (parsed && parsed.reading !== null && parsed.reading !== undefined) {
      const cleanReading = String(parsed.reading).replace(/[^0-9.,]/g, '');
      showResultState(cleanReading, parsed.description || '');
    } else {
      showErrorState(`AI: ${parsed?.description || 'Tidak terdeteksi sebagai water meter'}`);
    }

  } catch (err) {
    console.error('NVIDIA API Error:', err);
    showErrorState(err.message || 'Gagal menghubungi NVIDIA AI');
  }
}

// ─── PARSE AI RESPONSE ────────────────────────────────────────────────────────
function parseAIResponse(text) {
  if (!text) return null;
  try {
    const trimmed = text.trim();
    // Direct JSON
    if (trimmed.startsWith('{')) return JSON.parse(trimmed);
    // JSON in markdown block
    const mdMatch = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (mdMatch) return JSON.parse(mdMatch[1]);
    // Raw JSON object anywhere in text
    const objMatch = trimmed.match(/\{[\s\S]*?\}/);
    if (objMatch) return JSON.parse(objMatch[0]);
  } catch (_) { /* ignore */ }
  // Fallback: grab any standalone number sequence
  const numMatch = text.match(/\b(\d{3,9}(?:[.,]\d+)?)\b/);
  if (numMatch) return { reading: numMatch[1], description: 'Angka diekstrak dari respons AI' };
  return null;
}

// ─── UI STATES ────────────────────────────────────────────────────────────────
function showProcessingState(subText = 'Menganalisis gambar meter…') {
  els.processingState.classList.remove('hidden');
  els.resultState.classList.add('hidden');
  els.errorState.classList.add('hidden');
  els.processingSubText.textContent = subText;
}

function showResultState(reading, description) {
  els.processingState.classList.add('hidden');
  els.errorState.classList.add('hidden');
  els.resultState.classList.remove('hidden');
  els.resultNumber.value = reading;

  els.resultAiInfo.innerHTML = description
    ? `<strong style="color:var(--accent-1)">🤖 Catatan AI:</strong> ${escapeHtml(description)}`
    : '';
  els.resultAiInfo.style.display = description ? 'block' : 'none';
}

function showErrorState(message = 'Gagal membaca angka secara otomatis') {
  els.processingState.classList.add('hidden');
  els.resultState.classList.add('hidden');
  els.errorState.classList.remove('hidden');
  els.errorText.textContent = message;
  els.manualNumber.value = '';
}

// ─── RESET SCAN ───────────────────────────────────────────────────────────────
function resetScan() {
  State.currentImageDataURL = null;
  State.currentImageBase64  = null;
  els.capturedImage.src     = '';
  els.capturedImage.classList.add('hidden');
  els.capturePlaceholder.classList.remove('hidden');
  els.captureArea.classList.remove('has-image');
  els.resultArea.classList.add('hidden');
  els.cameraInput.value  = '';
}

// ─── SAVE READING ─────────────────────────────────────────────────────────────
function saveReading(value) {
  // Bug fix: gunakan regex global /,/g agar semua koma diganti, bukan hanya yang pertama
  const clean  = String(value).replace(/,/g, '.').trim();
  const numVal = parseFloat(clean);
  if (!clean || isNaN(numVal)) { showToast('⚠️ Masukkan angka yang valid!'); return; }

  const entry = {
    id:           Date.now().toString(),
    meterId:      els.meterId.value.trim() || 'Tanpa ID',
    reading:      numVal,
    timestamp:    new Date().toISOString(),
    imageDataURL: State.currentImageDataURL,
  };

  State.readings.unshift(entry);
  localStorage.setItem(LS_KEY_DATA, JSON.stringify(State.readings));
  showToast(`✅ ${numVal.toLocaleString('id-ID')} m³ berhasil disimpan!`);
  resetScan();
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, duration = 3200) {
  clearTimeout(toastTimer);
  els.toastMsg.textContent = msg;
  els.successToast.classList.remove('hidden');
  toastTimer = setTimeout(() => els.successToast.classList.add('hidden'), duration);
}

// ─── HISTORY ──────────────────────────────────────────────────────────────────
function renderHistory() {
  const r = State.readings;
  els.statTotal.textContent     = r.length;
  els.statLastRead.textContent  = r.length > 0 ? r[0].reading.toLocaleString('id-ID') + ' m³' : '—';
  els.statPelanggan.textContent = new Set(r.map(x => x.meterId)).size;

  Array.from(els.historyList.querySelectorAll('.history-item')).forEach(el => el.remove());

  if (r.length === 0) { els.historyEmpty.classList.remove('hidden'); return; }
  els.historyEmpty.classList.add('hidden');
  r.forEach(entry => els.historyList.insertBefore(createHistoryItem(entry), els.historyEmpty));
}

function createHistoryItem(entry) {
  const div = document.createElement('div');
  div.className  = 'history-item';
  div.dataset.id = entry.id;

  const dt      = new Date(entry.timestamp);
  // Bug fix: gunakan toLocaleString agar tanggal DAN waktu tampil dengan benar
  const dateStr = dt.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const thumbHTML = entry.imageDataURL
    ? `<img class="history-thumb" src="${entry.imageDataURL}" alt="Foto meter" loading="lazy" />`
    : `<div class="history-thumb-ph">💧</div>`;

  div.innerHTML = `
    ${thumbHTML}
    <div class="history-info">
      <div class="history-id">📋 ${escapeHtml(entry.meterId)}</div>
      <div class="history-reading">${entry.reading.toLocaleString('id-ID')}<span>m³</span></div>
      <div class="history-date">🕐 ${dateStr}</div>
    </div>
    <button class="history-del" data-id="${entry.id}" title="Hapus" aria-label="Hapus">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"/>
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        <path d="M10 11v6"/><path d="M14 11v6"/>
      </svg>
    </button>`;

  div.querySelector('.history-del').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteReading(entry.id);
  });

  // Klik item riwayat untuk melihat foto penuh
  div.addEventListener('click', (e) => {
    if (e.target.closest('.history-del')) return;
    if (entry.imageDataURL) {
      openPhotoModal(entry.imageDataURL);
    }
  });

  return div;
}

function deleteReading(id) {
  State.readings = State.readings.filter(r => r.id !== id);
  localStorage.setItem(LS_KEY_DATA, JSON.stringify(State.readings));
  renderHistory();
  showToast('🗑️ Data dihapus');
}

function clearAllReadings() {
  State.readings = [];
  localStorage.setItem(LS_KEY_DATA, JSON.stringify(State.readings));
  renderHistory();
  showToast('🗑️ Semua data dihapus');
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────────────────
function renderSettings() {
  if (els.settingsApiKey)     els.settingsApiKey.value       = State.apiKey;
  if (els.settingsTotalData)  els.settingsTotalData.textContent = `${State.readings.length} bacaan`;
  // Tampilkan username yang sedang login
  const user = sessionStorage.getItem(SS_KEY_LOGIN) || '—';
  if (els.settingsUsername)   els.settingsUsername.textContent  = user;
}

// ─── EXPORT CSV ───────────────────────────────────────────────────────────────
function exportCSV() {
  if (State.readings.length === 0) { showToast('⚠️ Tidak ada data untuk diexport'); return; }
  const header = ['No', 'ID Pelanggan', 'Pembacaan (m³)', 'Tanggal', 'Waktu'];
  const rows   = State.readings.map((r, i) => {
    const dt = new Date(r.timestamp);
    return [i + 1, `"${r.meterId}"`, r.reading, dt.toLocaleDateString('id-ID'), dt.toLocaleTimeString('id-ID')].join(',');
  });
  const csv  = [header.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `bacameter_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 File CSV berhasil diunduh!');
}

// ─── UTILITY ──────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

function togglePasswordVisibility(inputEl, btnEl) {
  const isPass   = inputEl.type === 'password';
  inputEl.type   = isPass ? 'text' : 'password';
  btnEl.style.color = isPass ? 'var(--accent-1)' : '';
}

// ─── EVENT BINDING ────────────────────────────────────────────────────────────
function bindEvents() {
  // API Gate
  if (els.btnToggleVis)  els.btnToggleVis.addEventListener('click',  () => togglePasswordVisibility(els.apiKeyInput, els.btnToggleVis));
  if (els.apiKeyInput)   els.apiKeyInput.addEventListener('keydown',  (e) => { if (e.key === 'Enter') els.btnSaveApiKey.click(); });
  if (els.btnSaveApiKey) els.btnSaveApiKey.addEventListener('click',  () => { if (saveApiKey(els.apiKeyInput.value)) showApp(); });

  // Login Screen
  if (els.btnLogin) els.btnLogin.addEventListener('click', handleLogin);
  if (els.loginPassword) els.loginPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });
  if (els.loginUsername) els.loginUsername.addEventListener('keydown', (e) => { if (e.key === 'Enter') els.loginPassword.focus(); });
  if (els.btnLoginToggleVis) els.btnLoginToggleVis.addEventListener('click', () => togglePasswordVisibility(els.loginPassword, els.btnLoginToggleVis));

  // Camera inputs
  if (els.cameraInput) els.cameraInput.addEventListener('change',  (e) => handleImageFile(e.target.files[0]));

  // Crop Modal
  if (els.btnCropRotateLeft)  els.btnCropRotateLeft.addEventListener('click',  () => { if (State.cropper) State.cropper.rotate(-90); });
  if (els.btnCropRotateRight) els.btnCropRotateRight.addEventListener('click', () => { if (State.cropper) State.cropper.rotate(90); });
  if (els.btnCropCancel)      els.btnCropCancel.addEventListener('click',      closeCropModal);
  if (els.btnCropApply)       els.btnCropApply.addEventListener('click',       applyCrop);

  // Save & retry
  els.btnSave.addEventListener('click',        () => saveReading(els.resultNumber.value));
  els.btnSaveManual.addEventListener('click',  () => saveReading(els.manualNumber.value));
  els.btnRetry.addEventListener('click',       resetScan);
  els.btnRetryError.addEventListener('click',  resetScan);

  // Enter key on inputs
  els.resultNumber.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveReading(els.resultNumber.value); });
  els.manualNumber.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveReading(els.manualNumber.value); });

  // Navigation
  els.navScan.addEventListener('click',     () => showPage('pageScan'));
  els.navHistory.addEventListener('click',  () => showPage('pageHistory'));
  els.navSettings.addEventListener('click', () => showPage('pageSettings'));
  els.btnHistory.addEventListener('click',  () => showPage('pageHistory'));
  els.btnSettings.addEventListener('click', () => showPage('pageSettings'));

  // Settings
  els.settingsToggleVis.addEventListener('click', () => togglePasswordVisibility(els.settingsApiKey, els.settingsToggleVis));
  els.btnUpdateApiKey.addEventListener('click',   () => { if (saveApiKey(els.settingsApiKey.value)) showToast('✅ API Key berhasil diperbarui!'); });
  if (els.btnLogout) els.btnLogout.addEventListener('click', logout);

  // Export / clear
  els.btnExportCSV.addEventListener('click', exportCSV);
  els.btnClearAll.addEventListener('click', () => {
    if (State.readings.length === 0) { showToast('⚠️ Tidak ada data'); return; }
    els.confirmModal.classList.remove('hidden');
  });

  // Modal
  els.modalCancel.addEventListener('click',   () => els.confirmModal.classList.add('hidden'));
  els.modalConfirm.addEventListener('click',  () => { els.confirmModal.classList.add('hidden'); clearAllReadings(); });
  els.confirmModal.addEventListener('click',  (e) => { if (e.target === els.confirmModal) els.confirmModal.classList.add('hidden'); });

  // Photo Modal
  if (els.btnPhotoClose) els.btnPhotoClose.addEventListener('click', closePhotoModal);
  if (els.photoModal) {
    els.photoModal.addEventListener('click', (e) => {
      if (e.target === els.photoModal) closePhotoModal();
    });
  }
}

// ─── START ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
