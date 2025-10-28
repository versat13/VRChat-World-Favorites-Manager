// ========================================
// popup2_vrc_bridge.js
// ========================================

// 翻訳データ (popup_core.js のデータと統合)
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
    'fetchingGroups': '📋 VRCフォルダ情報を取得中...',
    'fetchingFolder': '📁 フォルダ「{name}」を取得中...',
    'fetchingDetails': '🖼️ ワールド詳細情報を取得中...',
    'applyingChanges': '💾 ローカルデータベースに反映中...',
    'syncComplete': '✓ 同期完了',
    'removingWorlds': '🗑️ 削除中 ({current}/{total})...',
    'movingWorlds': '📦 移動中 ({current}/{total})...',
    'addingWorlds': '➕ 追加中 ({current}/{total})...',
    'updatingRecords': '🔄 レコードID更新中...',

    // 🔥 bg_vrc_api_service.js から送られる可能性のある進捗メッセージキー (日本語)
    'VRCフォルダ情報を取得中...': 'VRCフォルダ情報を取得中...',
    'VRCフォルダ情報取得完了': 'VRCフォルダ情報取得完了',
    '件のワールドを取得': '件のワールドを取得',
    'ワールド詳細情報を取得中...': 'ワールド詳細情報を取得中...',
    'ワールド詳細取得中...': 'ワールド詳細取得中...',
    '差分を計算中...': '差分を計算中...',
    'データベースに反映中...': 'データベースに反映中...',
    '新規ワールドを追加中...': '新規ワールドを追加中...',
    '取得完了': '取得完了',
    '同期完了': '同期完了',
    '同期処理を開始...': '同期処理を開始...', 
    '同期処理が完了しました。': '同期処理が完了しました。',
    // ⚠ 動的メッセージに含まれる可能性のある固定文字列を追加
    '件のワールドを削除中...': '件のワールドを削除中...',
    '件のワールドを移動中...': '件のワールドを移動中...',
    '件のワールドを追加中...': '件のワールドを追加中...',
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
    'fetchingGroups': '📋 Fetching VRC folder information...',
    'fetchingFolder': '📁 Fetching folder "{name}"...',
    'fetchingDetails': '🖼️ Fetching world details...',
    'applyingChanges': '💾 Applying to local database...',
    'syncComplete': '✓ Sync completed',
    'removingWorlds': '🗑️ Removing ({current}/{total})...',
    'movingWorlds': '📦 Moving ({current}/{total})...',
    'addingWorlds': '➕ Adding ({current}/{total})...',
    'updatingRecords': '🔄 Updating record IDs...',

    // 🔥 bg_vrc_api_service.js からの進捗メッセージの英語翻訳
    'VRCフォルダ情報を取得中...': 'Fetching VRC folder information...',
    'VRCフォルダ情報取得完了': 'VRC folder information fetched',
    '件のワールドを取得': ' worlds fetched',
    'ワールド詳細情報を取得中...': 'Fetching world details...',
    'ワールド詳細取得中...': 'Fetching details...',
    '差分を計算中...': 'Calculating differences...',
    'データベースに反映中...': 'Applying to database...',
    '新規ワールドを追加中...': 'Adding new worlds...',
    '取得完了': 'Fetch complete',
    '同期完了': 'Sync complete',
    '同期処理を開始...': 'Starting sync process...', 
    '同期処理が完了しました。': 'Sync process completed.',
    // ⚠ 動的メッセージに含まれる可能性のある固定文字列を追加
    '件のワールドを削除中...': ' worlds removing...',
    '件のワールドを移動中...': ' worlds moving...',
    '件のワールドを追加中...': ' worlds adding...',
  }
};

let currentSettings = { theme: 'dark', language: 'ja' };

// 簡易翻訳関数
function t(key, params = {}) {
  const lang = currentSettings.language || 'ja';
  const dict = translations[lang] || translations['ja'];
  
  // 1. 指定された言語の辞書から翻訳を取得
  let translatedText = dict[key];
  
  // 2. 翻訳が見つからなかった場合、かつ現在の言語が日本語でない場合、
  //    日本語キー（元のメッセージ）が英語辞書にキーとして登録されているか確認し、翻訳を取得
  if (!translatedText && lang !== 'ja') {
     translatedText = translations['en'][key];
  }

  // 3. それでも翻訳が見つからなければ、キー自体をそのまま使用（通常は日本語メッセージ）
  if (!translatedText) translatedText = key;

  // 4. パラメータの置換
  Object.keys(params).forEach(param => {
    const placeholder = `{${param}}`;
    translatedText = translatedText.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), params[param]);
  });

  return translatedText;
}

// 翻訳適用
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

// テーマ適用
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

// 設定読み込み
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

// グローバル変数
let FETCH_BUTTON, REFLECT_BUTTON, STATUS_MESSAGE, PROGRESS_FILL, ERROR_MESSAGE, ALERT_MESSAGE;
let bridgeWindowId = null;
let autoCloseTimer = null;

// DOMContentLoaded
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
    console.log('[Bridge] Window ID:', bridgeWindowId);
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

    console.log('[Bridge] Received message:', request.action, request);
    switch (request.action) {
      case 'VRC_ACTION_PROGRESS':
        // 🔥 進捗ログの翻訳対応: request.messageが日本語キーとして送られてきた場合、現在の言語に翻訳します。
        const translatedMessage = t(request.message, request); 
        updateStatus(translatedMessage, false);
        updateProgress(request.percent || 0);
        break;
      case 'VRC_ACTION_COMPLETE':
        handleComplete(request.result || {});
        break;
      case 'VRC_ACTION_ERROR':
        handleError(request.error || t('unknownError'));
        break;
    }

    sendResponse({ received: true });
    return true;
  });
});

/**
 * 🔥 VRChat連携アクションを開始
 */
function startVrcAction(type) {
  console.log('[Bridge] Starting action:', type);
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
      console.error('[Bridge] Runtime error:', chrome.runtime.lastError);
      handleError(t('actionErrorStart') + chrome.runtime.lastError.message);
      return;
    }
    if (response && response.error) {
      console.error('[Bridge] Action error:', response.error);
      handleError(response.error);
      return;
    }
    console.log('[Bridge] Action started successfully');
  });
}

/** 🔥 UIの状態を更新 */
function setUIBusy(isBusy) {
  FETCH_BUTTON.disabled = isBusy;
  REFLECT_BUTTON.disabled = isBusy;
  ALERT_MESSAGE.style.display = isBusy ? 'block' : 'none';
  if (!isBusy) {
    ERROR_MESSAGE.textContent = '';
    ERROR_MESSAGE.style.display = 'none';
  }
}

/** 🔥 ステータスメッセージを更新 */
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

/** 🔥 プログレスバーを更新 */
function updateProgress(percent) {
  const clamped = Math.max(0, Math.min(100, percent));
  PROGRESS_FILL.style.width = clamped + '%';
  PROGRESS_FILL.textContent = Math.round(clamped) + '%';
  if (clamped === 100) PROGRESS_FILL.classList.add('complete');
  else PROGRESS_FILL.classList.remove('complete');
}

/** 🔥 処理完了時の処理 */
function handleComplete(result) {
  console.log('[Bridge] Action completed:', result);
  setUIBusy(false);
  updateProgress(100);

  let message = t('actionComplete');
  if (result.addedCount !== undefined || result.movedCount !== undefined) {
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
  scheduleAutoClose();
}

/** 🔥 エラー発生時の処理 */
function handleError(error) {
  console.error('[Bridge] Action error:', error);
  setUIBusy(false);
  updateProgress(0);
  updateStatus(t('actionError'), true, error);
}

/** 🔥 自動クローズをスケジュール */
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

/** 🔥 ウィンドウを閉じる */
function closeWindow() {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }
  try {
    window.close();
  } catch (e) {
    console.warn('[Bridge] Failed to close window:', e);
    ERROR_MESSAGE.textContent = t('closeWindow');
    ERROR_MESSAGE.style.display = 'block';
    ERROR_MESSAGE.style.color = 'var(--accent-primary)';
    ERROR_MESSAGE.style.cursor = 'pointer';
  }
}