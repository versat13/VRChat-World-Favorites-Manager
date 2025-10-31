// popup2_vrc_bridge.js v1.2.0
// ========================================
// VRC同期ブリッジウィンドウ
// ========================================

const translations = {
  ja: {
    'bridgeTitle': 'VRChat公式連携ブリッジ',
    'bridgeHeader': '🔄 VRChat公式同期メニュー',
    'bridgeDescription': '最初の同期には数分間ほど時間がかかります。',
    'alertWarningText': '⚠️ 処理中です。このウィンドウを閉じないでください。',
    'fetchButtonText': 'ワールド取得',
    'reflectButtonText': 'VRChatへ上書き',
    'statusWaiting': '実行待ち...',
    'cancel': 'キャンセル',
    'actionComplete': '✓ 処理が完了しました',
    'actionError': '✗ エラーが発生しました',
    'actionErrorStart': '処理開始に失敗: ',
    'actionStartFetch': '📥 ワールド取得を開始...',
    'actionStartReflect': '⬆️ VRChatへの反映を開始...',
    'closeWindow': 'ウィンドウを閉じる',
    'processing': '処理中...',
    'fetchComplete': '✓ 取得完了: {addedCount}件追加 / {movedCount}件移動',
    'reflectComplete': '✓ 反映完了: {removedCount}件削除 / {movedCount}件移動 / {addedCount}件追加',
    'errorDetail': 'エラー詳細: ',
    'autoCloseIn': '{seconds}秒後に自動的に閉じます',
    'manualClose': '(クリックで手動終了)',
    'unknownError': '不明なエラーが発生しました',
    'actionCancelled': '✗ 処理がキャンセルされました',

    'phase0_fetchingGroups': 'VRCフォルダ情報を取得中...',
    'phase0_fetchingVRCStatus': 'VRC側の現在状態を取得中...',
    'phase0_fetchingFolder': 'フォルダ「{name}」を確認中...',
    'phase0_calculating': '差分を計算中...',
    'phase0_calculationComplete': '差分計算完了 (削除:{toRemove} 移動:{toMove} 追加:{toAdd})',
    'phase0_noChanges': '変更なし',
    'phase1_removing': '削除中... ({current}/{total})',
    'phase1_complete': 'Phase 1 完了: {count}/{total}件削除',
    'phase2_moving': '移動中... ({current}/{total})',
    'phase2_complete': 'Phase 2 完了: {count}/{total}件移動',
    'phase3_adding': '追加中... ({current}/{total})',
    'phase3_complete': 'Phase 3 完了: {count}/{total}件追加',
    'phase4_updating': 'レコードIDを更新中...',
    'phase4_complete': '同期完了',
    'sync_start': '同期処理を開始...',

    'fetch_phase0_fetchingGroups': 'VRCフォルダ情報を取得中...',
    'fetch_phase0_groupsComplete': 'VRCフォルダ情報取得完了',
    'fetch_phase1_fetchingFolder': 'フォルダ「{name}」を取得中...',
    'fetch_phase1_worldsFetched': '{count}件のワールドを取得',
    'fetch_phase2_fetchingDetails': 'ワールド詳細情報を取得中...',
    'fetch_phase2_detailsProgress': 'ワールド詳細取得中... ({current}/{total})',
    'fetch_phase3_calculating': '差分を計算中...',
    'fetch_phase4_applying': 'データベースに反映中...',
    'fetch_phase5_addingNew': '新規ワールドを追加中...',
    'fetch_phase6_complete': '取得完了',
  },
  en: {
    'bridgeTitle': 'VRChat Sync Bridge',
    'bridgeHeader': '🔄 VRChat Sync Menu',
    'bridgeDescription': 'The first sync may take several minutes.',
    'alertWarningText': '⚠️ Processing in progress. Do not close this window.',
    'fetchButtonText': 'Fetch Worlds',
    'reflectButtonText': 'Reflect to VRChat',
    'statusWaiting': 'Waiting for execution...',
    'cancel': 'Cancel',
    'actionComplete': '✓ Process completed',
    'actionError': '✗ An error occurred',
    'actionErrorStart': 'Failed to start action: ',
    'actionStartFetch': '📥 Starting world fetch...',
    'actionStartReflect': '⬆️ Starting reflection to VRChat...',
    'closeWindow': 'Close Window',
    'processing': 'Processing...',
    'fetchComplete': '✓ Fetch complete: {addedCount} added / {movedCount} moved',
    'reflectComplete': '✓ Reflect complete: {removedCount} removed / {movedCount} moved / {addedCount} added',
    'errorDetail': 'Error details: ',
    'autoCloseIn': 'Auto-closing in {seconds} seconds',
    'manualClose': '(Click to close manually)',
    'unknownError': 'An unknown error occurred',
    'actionCancelled': '✗ Process was cancelled',

    'phase0_fetchingGroups': 'Fetching VRC folder information...',
    'phase0_fetchingVRCStatus': 'Fetching current VRC status...',
    'phase0_fetchingFolder': 'Checking folder "{name}"...',
    'phase0_calculating': 'Calculating differences...',
    'phase0_calculationComplete': 'Calculation complete (Remove:{toRemove} Move:{toMove} Add:{toAdd})',
    'phase0_noChanges': 'No changes',
    'phase1_removing': 'Removing... ({current}/{total})',
    'phase1_complete': 'Phase 1 complete: {count}/{total} removed',
    'phase2_moving': 'Moving... ({current}/{total})',
    'phase2_complete': 'Phase 2 complete: {count}/{total} moved',
    'phase3_adding': 'Adding... ({current}/{total})',
    'phase3_complete': 'Phase 3 complete: {count}/{total} added',
    'phase4_updating': 'Updating record IDs...',
    'phase4_complete': 'Sync completed',
    'sync_start': 'Starting sync process...',

    'fetch_phase0_fetchingGroups': 'Fetching VRC folder information...',
    'fetch_phase0_groupsComplete': 'VRC folder information fetched',
    'fetch_phase1_fetchingFolder': 'Fetching folder "{name}"...',
    'fetch_phase1_worldsFetched': '{count} worlds fetched',
    'fetch_phase2_fetchingDetails': 'Fetching world details...',
    'fetch_phase2_detailsProgress': 'Fetching details... ({current}/{total})',
    'fetch_phase3_calculating': 'Calculating differences...',
    'fetch_phase4_applying': 'Applying to database...',
    'fetch_phase5_addingNew': 'Adding new worlds...',
    'fetch_phase6_complete': 'Fetch complete',
  }
};

let currentSettings = { theme: 'dark', language: 'ja' };

function t(key, params = {}) {
  const lang = currentSettings.language || 'ja';
  const dict = translations[lang] || translations['ja'];
  
  let translatedText = dict[key];
  
  if (!translatedText) translatedText = key;

  Object.keys(params).forEach(param => {
    const placeholder = `{${param}}`;
    translatedText = translatedText.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), params[param]);
  });

  return translatedText;
}

function applyLanguage() {
  document.title = t('bridgeTitle');
  const map = {
    'bridgeHeader': 'bridgeHeader',
    'bridgeDescription': 'bridgeDescription',
    'alertWarningText': 'alertWarningText',
    'fetchButtonText': 'fetchButtonText',
    'reflectButtonText': 'reflectButtonText',
    'statusWaiting': 'statusWaiting'
  };
  for (const [key, id] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  }
}

function applyTheme() {
  const body = document.body;
  if (currentSettings.theme === 'light') {
    body.classList.remove('dark-theme');
    body.classList.add('light-theme');
  } else {
    body.classList.remove('light-theme');
    body.classList.add('dark-theme');
  }
}

async function loadSettings() {
  try {
    const items = await chrome.storage.sync.get(['settings']);
    if (items && items.settings) {
      currentSettings = {
        theme: items.settings.theme || 'dark',
        language: items.settings.language || 'ja'
      };
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  applyTheme();
  applyLanguage();
}

let FETCH_BUTTON, REFLECT_BUTTON, STATUS_MESSAGE, PROGRESS_FILL, ERROR_MESSAGE, ALERT_MESSAGE;
let bridgeWindowId = null;
let autoCloseTimer = null;

window.addEventListener('beforeunload', () => {
  if (bridgeWindowId !== null) {
    chrome.runtime.sendMessage({
      type: 'CANCEL_VRC_ACTION',
      windowId: bridgeWindowId
    });
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  FETCH_BUTTON = document.getElementById('fetch-button');
  REFLECT_BUTTON = document.getElementById('reflect-button');
  STATUS_MESSAGE = document.getElementById('status-message');
  PROGRESS_FILL = document.getElementById('progress-fill');
  ERROR_MESSAGE = document.getElementById('error-message');
  ALERT_MESSAGE = document.getElementById('alert-message');

  chrome.windows.getCurrent({ populate: false }, (window) => {
    bridgeWindowId = window.id;
  });

  const mode = new URLSearchParams(window.location.search).get('mode');
  if (mode === 'fetch') {
    FETCH_BUTTON.style.fontWeight = 'bold';
    FETCH_BUTTON.style.borderWidth = '3px';
    FETCH_BUTTON.style.transform = 'scale(1.02)';
  } else if (mode === 'reflect') {
    REFLECT_BUTTON.style.fontWeight = 'bold';
    REFLECT_BUTTON.style.borderWidth = '3px';
    REFLECT_BUTTON.style.transform = 'scale(1.02)';
  }

  FETCH_BUTTON.addEventListener('click', () => startVrcAction('FETCH'));
  REFLECT_BUTTON.addEventListener('click', () => startVrcAction('REFLECT'));

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.windowId !== bridgeWindowId) return false;

    switch (request.action) {
      case 'VRC_ACTION_PROGRESS':
        const translatedMessage = t(request.message, request);
        updateStatus(translatedMessage, false);
        updateProgress(request.percent || 0);
        break;
      case 'VRC_ACTION_COMPLETE':
        handleComplete(request);
        break;
      case 'VRC_ACTION_ERROR':
        handleError(request.error || t('unknownError'));
        break;
    }

    sendResponse({ received: true });
    return true;
  });
});

function startVrcAction(type) {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }
  
  setUIBusy(true);
  const messageKey = type === 'FETCH' ? 'actionStartFetch' : 'actionStartReflect';
  updateStatus(t(messageKey), false);
  updateProgress(0);

  chrome.runtime.sendMessage({
    type: 'START_VRC_ACTION',
    actionType: type,
    windowId: bridgeWindowId
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Runtime error:', chrome.runtime.lastError);
      handleError(t('actionErrorStart') + chrome.runtime.lastError.message);
      return;
    }
    if (response && response.error) {
      console.error('Action error:', response.error);
      handleError(response.error);
    }
  });
}

function setUIBusy(isBusy) {
  FETCH_BUTTON.disabled = isBusy;
  REFLECT_BUTTON.disabled = isBusy;
  ALERT_MESSAGE.style.display = isBusy ? 'block' : 'none';
  if (!isBusy) {
    ERROR_MESSAGE.textContent = '';
    ERROR_MESSAGE.style.display = 'none';
  }
}

function updateStatus(message, isError, errorDetails = '') {
  STATUS_MESSAGE.textContent = message;
  STATUS_MESSAGE.style.color = isError ? 'var(--error)' : 'var(--text-primary)';
  if (isError && errorDetails) {
    ERROR_MESSAGE.textContent = t('errorDetail') + errorDetails;
    ERROR_MESSAGE.style.display = 'block';
  } else if (isError) {
    ERROR_MESSAGE.style.display = 'none';
  }
}

function updateProgress(percent) {
  const clamped = Math.max(0, Math.min(100, percent));
  PROGRESS_FILL.style.width = clamped + '%';
  PROGRESS_FILL.textContent = Math.round(clamped) + '%';
  if (clamped === 100) PROGRESS_FILL.classList.add('complete');
  else PROGRESS_FILL.classList.remove('complete');
}

function handleComplete(result) {
  setUIBusy(false);
  updateProgress(100);

  if (result.cancelled) {
    updateStatus(t('actionCancelled'), true);
    scheduleAutoClose();
    return;
  }

  let message = t('actionComplete');
  if (result.addedCount !== undefined && result.removedCount === undefined) {
    message = t('fetchComplete', {
      addedCount: result.addedCount || 0,
      movedCount: result.movedCount || 0
    });
  } else if (result.removedCount !== undefined) {
    message = t('reflectComplete', {
      removedCount: result.removedCount || 0,
      movedCount: result.movedCount || 0,
      addedCount: result.addedCount || 0
    });
  }

  updateStatus(message, false);
  
  chrome.runtime.sendMessage({
    type: 'VRC_SYNC_COMPLETED',
    actionType: result.actionType || 'UNKNOWN',
    addedCount: result.addedCount || 0,
    movedCount: result.movedCount || 0,
    removedCount: result.removedCount || 0
  }).catch(err => {
    console.warn('Failed to notify popup:', err);
  });
  
  scheduleAutoClose();
}

function handleError(error) {
  console.error('Action error:', error);
  setUIBusy(false);
  updateProgress(0);
  updateStatus(t('actionError'), true, error);
}

function scheduleAutoClose() {
  let countdown = 5;
  const updateCountdown = () => {
    if (countdown > 0) {
      const msg = t('autoCloseIn', { seconds: countdown }) + ' ' + t('manualClose');
      ERROR_MESSAGE.textContent = msg;
      ERROR_MESSAGE.style.display = 'block';
      ERROR_MESSAGE.style.color = 'var(--text-secondary)';
      ERROR_MESSAGE.style.cursor = 'pointer';
      countdown--;
      autoCloseTimer = setTimeout(updateCountdown, 1000);
    } else {
      closeWindow();
    }
  };

  ERROR_MESSAGE.addEventListener('click', () => {
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer);
      closeWindow();
    }
  }, { once: true });

  updateCountdown();
}

function closeWindow() {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }
  try {
    window.close();
  } catch (e) {
    console.warn('Failed to close window:', e);
    ERROR_MESSAGE.textContent = t('closeWindow');
    ERROR_MESSAGE.style.display = 'block';
    ERROR_MESSAGE.style.color = 'var(--accent-primary)';
    ERROR_MESSAGE.style.cursor = 'pointer';
  }
}