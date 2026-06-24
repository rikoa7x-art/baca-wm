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

// ─── STATE ────────────────────────────────────────────────────────────────────
const State = {
  readings:             JSON.parse(localStorage.getItem(LS_KEY_DATA) || '[]'),
  currentImageDataURL:  null,
  currentImageBase64:   null,
  currentImageMime:     'image/jpeg',
  apiKey:               localStorage.getItem(LS_KEY_APIKEY) || DEFAULT_API_KEY,
};

// ─── DOM REFS ─────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const els = {
  splash:             $('splash'),
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
  galleryInput:       $('galleryInput'),
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
  // Modal
  confirmModal:       $('confirmModal'),
  modalCancel:        $('modalCancel'),
  modalConfirm:       $('modalConfirm'),
};

// ─── INIT ─────────────────────────────────────────────────────────────────────
function init() {
  updateDateTime();
  setInterval(updateDateTime, 1000);
  bindEvents();

  // Pastikan default key tersimpan
  if (!localStorage.getItem(LS_KEY_APIKEY)) {
    localStorage.setItem(LS_KEY_APIKEY, DEFAULT_API_KEY);
  }

  setTimeout(() => {
    els.splash.classList.add('fade-out');
    setTimeout(() => {
      els.splash.classList.add('hidden');
      // Langsung masuk app karena sudah ada API key default
      if (State.apiKey) {
        showApp();
      } else {
        showApiGate();
      }
    }, 500);
  }, 2000);
}

function showApp() {
  els.apiGate.classList.add('hidden');
  els.app.classList.remove('hidden');
  if (els.settingsApiKey) els.settingsApiKey.value = State.apiKey;
}

function showApiGate() {
  els.app.classList.add('hidden');
  els.apiGate.classList.remove('hidden');
  // Pre-fill dengan default key
  if (els.apiKeyInput) els.apiKeyInput.value = DEFAULT_API_KEY;
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

// ─── IMAGE HANDLING ───────────────────────────────────────────────────────────
function handleImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  State.currentImageMime = file.type || 'image/jpeg';

  // Kompres gambar sebelum dikirim ke API
  compressImage(file, 1024, 0.85).then(({ dataURL, base64, mime }) => {
    State.currentImageDataURL = dataURL;
    State.currentImageBase64  = base64;
    State.currentImageMime    = mime;
    showImagePreview(dataURL);
    analyzeWithNvidia();
  });
}

// Kompres gambar agar tidak terlalu besar
function compressImage(file, maxDim, quality) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);

      const mime    = 'image/jpeg';
      const dataURL = canvas.toDataURL(mime, quality);
      const base64  = dataURL.split(',')[1];
      resolve({ dataURL, base64, mime });
    };
    img.src = url;
  });
}

function showImagePreview(dataURL) {
  els.capturePlaceholder.classList.add('hidden');
  els.capturedImage.src = dataURL;
  els.capturedImage.classList.remove('hidden');
  els.captureArea.classList.add('has-image');
  els.resultArea.classList.remove('hidden');
  showProcessingState('Mengirim gambar ke NVIDIA AI…');
}

// ─── NVIDIA API CALL ──────────────────────────────────────────────────────────
async function analyzeWithNvidia() {
  showProcessingState('Mengirim gambar ke NVIDIA AI…');

  if (!State.apiKey) {
    showErrorState('API Key belum diset. Buka tab Pengaturan.');
    return;
  }

  const prompt = `You are a water meter reading system. Analyze the image carefully.

Find the number display on the water meter (odometer/digital/analog dial).

Instructions:
1. Read ALL digits shown on the meter display (usually 4-8 digits)
2. Ignore units (m³, L, etc) — only return the number
3. If there are red digits (decimal part), include them with a dot separator
4. Return ONLY a JSON object, no extra text

Response format:
{"reading": "12345", "description": "Brief description of what you see on the meter"}

If you cannot read the meter:
{"reading": null, "description": "Reason why it cannot be read"}`;

  try {
    els.processingSubText.textContent = 'Model AI sedang membaca angka…';

    const response = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${State.apiKey}`,
      },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${State.currentImageMime};base64,${State.currentImageBase64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 300,
        temperature: 0.1,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
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
  els.galleryInput.value = '';
}

// ─── SAVE READING ─────────────────────────────────────────────────────────────
function saveReading(value) {
  const clean  = String(value).replace(',', '.').trim();
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
  const dateStr = dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
function renderSettings() {
  if (els.settingsApiKey)     els.settingsApiKey.value       = State.apiKey;
  if (els.settingsTotalData)  els.settingsTotalData.textContent = `${State.readings.length} bacaan`;
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

  // Camera inputs
  els.cameraInput.addEventListener('change',  (e) => handleImageFile(e.target.files[0]));
  els.galleryInput.addEventListener('change', (e) => handleImageFile(e.target.files[0]));

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
}

// ─── START ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
