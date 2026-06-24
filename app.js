/**
 * WATER METER READER — APP.JS
 * OCR-powered water meter reading using Tesseract.js
 */

'use strict';

// ─── STATE ────────────────────────────────────────────────────────────────────
const State = {
  readings: JSON.parse(localStorage.getItem('wm_readings') || '[]'),
  currentImageDataURL: null,
  worker: null,
  workerReady: false,
};

// ─── DOM REFS ─────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const els = {
  splash: $('splash'),
  app: $('app'),
  // Topbar
  btnHistory: $('btnHistory'),
  // Pages
  pageScan: $('pageScan'),
  pageHistory: $('pageHistory'),
  // DateTime
  displayDate: $('displayDate'),
  displayTime: $('displayTime'),
  // Field
  meterId: $('meterId'),
  // Capture
  captureArea: $('captureArea'),
  capturePlaceholder: $('capturePlaceholder'),
  captureCorners: $('captureCorners'),
  capturedImage: $('capturedImage'),
  cameraInput: $('cameraInput'),
  galleryInput: $('galleryInput'),
  btnCameraLabel: $('btnCameraLabel'),
  // Result
  resultArea: $('resultArea'),
  processingState: $('processingState'),
  resultState: $('resultState'),
  errorState: $('errorState'),
  resultNumber: $('resultNumber'),
  manualNumber: $('manualNumber'),
  resultConfidence: $('resultConfidence'),
  btnSave: $('btnSave'),
  btnSaveManual: $('btnSaveManual'),
  btnRetry: $('btnRetry'),
  btnRetryError: $('btnRetryError'),
  successToast: $('successToast'),
  toastMsg: $('toastMsg'),
  // History
  historyList: $('historyList'),
  historyEmpty: $('historyEmpty'),
  statTotal: $('statTotal'),
  statLastRead: $('statLastRead'),
  statPelanggan: $('statPelanggan'),
  btnExportCSV: $('btnExportCSV'),
  btnClearAll: $('btnClearAll'),
  // Nav
  navScan: $('navScan'),
  navHistory: $('navHistory'),
  // Modal
  confirmModal: $('confirmModal'),
  modalCancel: $('modalCancel'),
  modalConfirm: $('modalConfirm'),
};

// ─── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  updateDateTime();
  setInterval(updateDateTime, 1000);

  // Preload Tesseract worker in background
  initTesseractWorker();

  // Bind events
  bindEvents();

  // Show splash then app
  setTimeout(() => {
    els.splash.classList.add('fade-out');
    setTimeout(() => {
      els.splash.classList.add('hidden');
      els.app.classList.remove('hidden');
    }, 500);
  }, 2000);
}

// ─── TESSERACT WORKER ─────────────────────────────────────────────────────────
async function initTesseractWorker() {
  try {
    State.worker = await Tesseract.createWorker('eng', 1, {
      logger: () => {},
    });
    await State.worker.setParameters({
      tessedit_char_whitelist: '0123456789.,',
      tessedit_pageseg_mode: '6',
    });
    State.workerReady = true;
  } catch (e) {
    console.warn('Tesseract init failed, will init on demand:', e);
  }
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

  const navMap = { pageScan: 'navScan', pageHistory: 'navHistory' };
  if (navMap[pageId]) $(navMap[pageId]).classList.add('active');

  if (pageId === 'pageHistory') renderHistory();
}

// ─── IMAGE PROCESSING ─────────────────────────────────────────────────────────
function handleImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataURL = e.target.result;
    State.currentImageDataURL = dataURL;
    showImagePreview(dataURL);
    startOCR(dataURL);
  };
  reader.readAsDataURL(file);
}

function showImagePreview(dataURL) {
  els.capturePlaceholder.classList.add('hidden');
  els.capturedImage.src = dataURL;
  els.capturedImage.classList.remove('hidden');
  els.captureArea.classList.add('has-image');
  // Show result area with processing state
  els.resultArea.classList.remove('hidden');
  showProcessingState();
}

// ─── OCR ──────────────────────────────────────────────────────────────────────
async function startOCR(dataURL) {
  showProcessingState();

  try {
    // Pre-process image for better OCR
    const processedDataURL = await preprocessImage(dataURL);

    let worker = State.worker;
    if (!worker || !State.workerReady) {
      // Create worker on demand if not ready
      worker = await Tesseract.createWorker('eng', 1, { logger: () => {} });
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789.,',
        tessedit_pageseg_mode: '6',
      });
    }

    const result = await worker.recognize(processedDataURL);
    const rawText = result.data.text;
    const confidence = result.data.confidence;

    const extracted = extractMeterNumber(rawText);

    if (extracted) {
      showResultState(extracted, confidence);
    } else {
      // Try with original image if preprocessed failed
      const result2 = await worker.recognize(dataURL);
      const extracted2 = extractMeterNumber(result2.data.text);
      if (extracted2) {
        showResultState(extracted2, result2.data.confidence);
      } else {
        showErrorState();
      }
    }
  } catch (err) {
    console.error('OCR Error:', err);
    showErrorState();
  }
}

// Pre-process image: enhance contrast/brightness for better OCR
function preprocessImage(dataURL) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Scale to optimal size for OCR
      const maxDim = 1200;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // Draw original
      ctx.drawImage(img, 0, 0, width, height);

      // Enhance: increase contrast
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const factor = 1.4; // contrast factor

      for (let i = 0; i < data.length; i += 4) {
        // Grayscale
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        // Enhance contrast
        const enhanced = Math.min(255, Math.max(0, factor * (gray - 128) + 128));
        // Threshold for cleaner text
        const threshold = enhanced > 130 ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = threshold;
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = dataURL;
  });
}

// Extract the most likely meter reading from OCR text
function extractMeterNumber(text) {
  if (!text) return null;

  // Clean text: remove non-numeric except dots/commas
  const cleaned = text.replace(/[^0-9.,\s]/g, ' ').trim();

  // Find all number sequences
  const numbers = cleaned.match(/\d[\d.,]*/g);
  if (!numbers || numbers.length === 0) return null;

  // Filter: meter readings are usually 4–8 digits
  const candidates = numbers
    .map(n => n.replace(/[.,]/g, ''))
    .filter(n => n.length >= 3 && n.length <= 9)
    .sort((a, b) => b.length - a.length); // prefer longer numbers

  if (candidates.length === 0) return null;

  // Return best candidate
  return parseInt(candidates[0], 10).toString();
}

// ─── UI STATES ────────────────────────────────────────────────────────────────
function showProcessingState() {
  els.processingState.classList.remove('hidden');
  els.resultState.classList.add('hidden');
  els.errorState.classList.add('hidden');
}

function showResultState(number, confidence) {
  els.processingState.classList.add('hidden');
  els.errorState.classList.add('hidden');
  els.resultState.classList.remove('hidden');
  els.resultNumber.value = number;

  // Confidence badge
  const confInt = Math.round(confidence);
  let confClass = 'conf-low';
  let confLabel = 'Rendah';
  if (confInt >= 75) { confClass = 'conf-high'; confLabel = 'Tinggi'; }
  else if (confInt >= 50) { confClass = 'conf-mid'; confLabel = 'Sedang'; }

  els.resultConfidence.innerHTML = `
    Keyakinan OCR: <span class="conf-badge ${confClass}">${confLabel} (${confInt}%)</span>
    <br/><small style="margin-top:4px;display:block;">Periksa dan edit jika diperlukan</small>
  `;
}

function showErrorState() {
  els.processingState.classList.add('hidden');
  els.resultState.classList.add('hidden');
  els.errorState.classList.remove('hidden');
  els.manualNumber.value = '';
}

// ─── RESET SCAN ───────────────────────────────────────────────────────────────
function resetScan() {
  State.currentImageDataURL = null;
  els.capturedImage.src = '';
  els.capturedImage.classList.add('hidden');
  els.capturePlaceholder.classList.remove('hidden');
  els.captureArea.classList.remove('has-image');
  els.resultArea.classList.add('hidden');
  els.cameraInput.value = '';
  els.galleryInput.value = '';
}

// ─── SAVE READING ─────────────────────────────────────────────────────────────
function saveReading(value) {
  const numVal = parseFloat(value);
  if (isNaN(numVal) || value === '') {
    showToast('⚠️ Masukkan angka yang valid!');
    return;
  }

  const entry = {
    id: Date.now().toString(),
    meterId: els.meterId.value.trim() || 'Tanpa ID',
    reading: numVal,
    timestamp: new Date().toISOString(),
    imageDataURL: State.currentImageDataURL,
  };

  State.readings.unshift(entry);
  localStorage.setItem('wm_readings', JSON.stringify(State.readings));

  showToast(`✅ Pembacaan ${numVal} m³ disimpan!`);
  resetScan();
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
function showToast(msg, duration = 3000) {
  els.toastMsg.textContent = msg;
  els.successToast.classList.remove('hidden');
  setTimeout(() => els.successToast.classList.add('hidden'), duration);
}

// ─── HISTORY ──────────────────────────────────────────────────────────────────
function renderHistory() {
  const readings = State.readings;

  // Stats
  els.statTotal.textContent = readings.length;
  els.statLastRead.textContent = readings.length > 0
    ? readings[0].reading.toLocaleString('id-ID') + ' m³'
    : '—';
  const uniqueIds = new Set(readings.map(r => r.meterId));
  els.statPelanggan.textContent = uniqueIds.size;

  // List
  if (readings.length === 0) {
    els.historyEmpty.classList.remove('hidden');
    // Remove all items except empty placeholder
    Array.from(els.historyList.querySelectorAll('.history-item')).forEach(el => el.remove());
    return;
  }
  els.historyEmpty.classList.add('hidden');

  // Rebuild list
  const existingItems = els.historyList.querySelectorAll('.history-item');
  existingItems.forEach(el => el.remove());

  readings.forEach(entry => {
    const item = createHistoryItem(entry);
    els.historyList.insertBefore(item, els.historyEmpty);
  });
}

function createHistoryItem(entry) {
  const div = document.createElement('div');
  div.className = 'history-item';
  div.dataset.id = entry.id;

  const dt = new Date(entry.timestamp);
  const dateStr = dt.toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  let thumbHTML = '';
  if (entry.imageDataURL) {
    thumbHTML = `<img class="history-thumb" src="${entry.imageDataURL}" alt="Foto meter" loading="lazy" />`;
  } else {
    thumbHTML = `<div class="history-thumb-ph">💧</div>`;
  }

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
    </button>
  `;

  div.querySelector('.history-del').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteReading(entry.id);
  });

  return div;
}

function deleteReading(id) {
  State.readings = State.readings.filter(r => r.id !== id);
  localStorage.setItem('wm_readings', JSON.stringify(State.readings));
  renderHistory();
  showToast('🗑️ Data dihapus');
}

function clearAllReadings() {
  State.readings = [];
  localStorage.setItem('wm_readings', JSON.stringify(State.readings));
  renderHistory();
  showToast('🗑️ Semua data dihapus');
}

// ─── EXPORT CSV ───────────────────────────────────────────────────────────────
function exportCSV() {
  if (State.readings.length === 0) {
    showToast('⚠️ Tidak ada data untuk diexport');
    return;
  }

  const header = ['No', 'ID Pelanggan', 'Pembacaan (m³)', 'Tanggal', 'Waktu'];
  const rows = State.readings.map((r, i) => {
    const dt = new Date(r.timestamp);
    return [
      i + 1,
      `"${r.meterId}"`,
      r.reading,
      dt.toLocaleDateString('id-ID'),
      dt.toLocaleTimeString('id-ID'),
    ].join(',');
  });

  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bacameter_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 File CSV berhasil diunduh!');
}

// ─── UTILITY ──────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// ─── EVENT BINDING ────────────────────────────────────────────────────────────
function bindEvents() {
  // Camera input
  els.cameraInput.addEventListener('change', (e) => handleImageFile(e.target.files[0]));
  els.galleryInput.addEventListener('change', (e) => handleImageFile(e.target.files[0]));

  // Save buttons
  els.btnSave.addEventListener('click', () => saveReading(els.resultNumber.value));
  els.btnSaveManual.addEventListener('click', () => saveReading(els.manualNumber.value));

  // Retry buttons
  els.btnRetry.addEventListener('click', resetScan);
  els.btnRetryError.addEventListener('click', resetScan);

  // Navigation
  els.navScan.addEventListener('click', () => showPage('pageScan'));
  els.navHistory.addEventListener('click', () => showPage('pageHistory'));
  els.btnHistory.addEventListener('click', () => showPage('pageHistory'));

  // Export
  els.btnExportCSV.addEventListener('click', exportCSV);

  // Clear all
  els.btnClearAll.addEventListener('click', () => {
    if (State.readings.length === 0) {
      showToast('⚠️ Tidak ada data untuk dihapus');
      return;
    }
    els.confirmModal.classList.remove('hidden');
  });

  els.modalCancel.addEventListener('click', () => els.confirmModal.classList.add('hidden'));
  els.modalConfirm.addEventListener('click', () => {
    els.confirmModal.classList.add('hidden');
    clearAllReadings();
  });

  // Close modal on overlay click
  els.confirmModal.addEventListener('click', (e) => {
    if (e.target === els.confirmModal) els.confirmModal.classList.add('hidden');
  });

  // Allow Enter on result input to save
  els.resultNumber.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveReading(els.resultNumber.value);
  });
  els.manualNumber.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveReading(els.manualNumber.value);
  });
}

// ─── START ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
