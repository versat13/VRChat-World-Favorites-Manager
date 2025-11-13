// popup2_vrc_bridge.js - v1.2.0

// ========================================
// 翻訳データ
// ========================================
const translations = {
  ja: {
    // ヘッダー
    bridgeHeader: '🔄 VRChat公式同期メニュー',
    bridgeDescription: '最初の同期には数分間ほど時間がかかります。',

    // ボタン
    fetchButtonText: 'VRChatからデータ取得',
    reflectButtonText: 'VRChatへ上書き',

    // ステータス
    statusWaiting: '実行待ち...',
    statusProcessing: '処理中...',
    statusComplete: '完了',
    statusCancelled: 'キャンセルされました',
    statusError: 'エラーが発生しました',

    // アラート
    alertWarningText: '⚠️ 処理中です。このウィンドウを閉じないでください。',

    // 進捗メッセージ (Phase 0)
    phase0_fetchingGroups: 'VRCフォルダ情報を取得中...',
    phase0_groupsComplete: 'フォルダ情報取得完了',
    phase0_fetchingVRCStatus: 'VRC側のワールドを取得中...',
    phase0_fetchingFolder: '{name} を取得中...',
    phase0_calculating: '差分を計算中...',
    phase0_calculationComplete: '差分計算完了 (削除: {toRemove}件, 移動: {toMove}件, 追加: {toAdd}件)',
    phase0_noChanges: '変更はありませんでした',

    // 進捗メッセージ (Phase 1)
    phase1_removing: '削除中 ({current}/{total})',
    phase1_complete: '削除完了 ({count}/{total}件)',

    // 進捗メッセージ (Phase 2)
    phase2_moving: '移動中 ({current}/{total})',
    phase2_complete: '移動完了 ({count}/{total}件)',
    phase2_forceWait: 'API反映待機中 ({waitSeconds}秒)...',

    // 進捗メッセージ (Phase 3)
    phase3_adding: '追加中 ({current}/{total})',
    phase3_complete: '追加完了 ({count}/{total}件)',

    // 進捗メッセージ (Phase 4)
    phase4_updating: 'レコードIDを更新中...',
    phase4_complete: 'レコードID更新完了',
    phase4_skipped: 'レコードID更新スキップ',

    // 進捗メッセージ (Phase 5)
    phase5_verifying: '同期結果を検証中 (待機: {waitSeconds}秒, 試行: {retry}回目)...',
    phase5_retrying: '再試行中 ({current}/{max}) - 追加: {addCount}件, 削除: {removeCount}件, 移動: {moveCount}件',
    phase5_retrying_remove: '削除漏れを再処理中 ({current}/{total})',
    phase5_retrying_move: '移動漏れを再処理中 ({current}/{total})',
    phase5_retrying_add: '追加漏れを再処理中 ({current}/{total})',
    phase5_complete: '検証完了',

    // 進捗メッセージ (Phase 6)
    phase6_complete: '同期処理完了',

    // レート制限
    rateLimitWaiting: 'レート制限 - {waitSeconds}秒待機中...',

    // Fetch関連
    fetch_phase0_fetchingGroups: 'VRCフォルダ情報を取得中...',
    fetch_phase0_groupsComplete: 'フォルダ情報取得完了',
    fetch_phase1_fetchingFolder: '{name} を取得中...',
    fetch_phase1_worldsFetched: 'ワールド取得完了 ({count}件)',
    fetch_phase2_fetchingDetails: 'ワールド詳細を取得中...',
    fetch_phase2_detailsProgress: '詳細取得中 ({current}/{total})',
    fetch_phase3_calculating: '差分を計算中...',
    fetch_phase4_applying: '変更を適用中...',
    fetch_phase5_addingNew: '新規ワールドを追加中...',
    fetch_phase6_complete: '取得完了',

    // 完了メッセージ
    fetchComplete: '取得完了: {addedCount}件追加 / 全{totalFolders}フォルダ',
    reflectComplete: '反映完了: {removedCount}件削除 / {movedCount}件移動 / {addedCount}件追加',
    reflectCompleteWithUncategorized: '反映完了: {removedCount}件削除 / {movedCount}件移動 / {addedCount}件追加 / {movedToUncategorizedCount}件を未分類へ',

    // エラーメッセージ
    errorOccurred: 'エラーが発生しました',
    syncFailed: '同期に失敗しました',
    fetchFailed: '取得に失敗しました',
    errorDetails: 'エラー詳細: {error}',
    partialSuccess: '一部のワールドの処理に失敗しました ({count}件のエラー)',
    notLoggedIn: 'VRChatにログインしていません。vrchat.comでログインしてから再度お試しください。',

    // 自動クローズ関連
    autoCloseIn: '{seconds}秒後に自動的に閉じます',
    manualClose: '(クリックで手動終了)',
    closeWindow: 'このメッセージをクリックしてウィンドウを閉じてください'
  },

  en: {
    // Header
    bridgeHeader: '🔄 VRChat Official Sync Menu',
    bridgeDescription: 'The first sync may take several minutes.',

    // Buttons
    fetchButtonText: 'Fetch from VRChat',
    reflectButtonText: 'Overwrite to VRChat',

    // Status
    statusWaiting: 'Waiting...',
    statusProcessing: 'Processing...',
    statusComplete: 'Complete',
    statusCancelled: 'Cancelled',
    statusError: 'Error occurred',

    // Alert
    alertWarningText: '⚠️ Processing. Do not close this window.',

    // Progress Messages (Phase 0)
    phase0_fetchingGroups: 'Fetching VRC folder info...',
    phase0_groupsComplete: 'Folder info fetched',
    phase0_fetchingVRCStatus: 'Fetching VRC worlds...',
    phase0_fetchingFolder: 'Fetching {name}...',
    phase0_calculating: 'Calculating differences...',
    phase0_calculationComplete: 'Diff calculated (Remove: {toRemove}, Move: {toMove}, Add: {toAdd})',
    phase0_noChanges: 'No changes detected',

    // Progress Messages (Phase 1)
    phase1_removing: 'Removing ({current}/{total})',
    phase1_complete: 'Remove complete ({count}/{total})',

    // Progress Messages (Phase 2)
    phase2_moving: 'Moving ({current}/{total})',
    phase2_complete: 'Move complete ({count}/{total})',
    phase2_forceWait: 'Waiting for API sync ({waitSeconds}s)...',

    // Progress Messages (Phase 3)
    phase3_adding: 'Adding ({current}/{total})',
    phase3_complete: 'Add complete ({count}/{total})',

    // Progress Messages (Phase 4)
    phase4_updating: 'Updating record IDs...',
    phase4_complete: 'Record ID update complete',
    phase4_skipped: 'Record ID update skipped',

    // Progress Messages (Phase 5)
    phase5_verifying: 'Verifying sync results (wait: {waitSeconds}s, attempt: {retry})...',
    phase5_retrying: 'Retrying ({current}/{max}) - Add: {addCount}, Remove: {removeCount}, Move: {moveCount}',
    phase5_retrying_remove: 'Retrying deletions ({current}/{total})',
    phase5_retrying_move: 'Retrying moves ({current}/{total})',
    phase5_retrying_add: 'Retrying additions ({current}/{total})',
    phase5_complete: 'Verification complete',

    // Progress Messages (Phase 6)
    phase6_complete: 'Sync process complete',

    // Rate Limit
    rateLimitWaiting: 'Rate limited - waiting {waitSeconds}s...',

    // Fetch related
    fetch_phase0_fetchingGroups: 'Fetching VRC folder info...',
    fetch_phase0_groupsComplete: 'Folder info fetched',
    fetch_phase1_fetchingFolder: 'Fetching {name}...',
    fetch_phase1_worldsFetched: 'Worlds fetched ({count})',
    fetch_phase2_fetchingDetails: 'Fetching world details...',
    fetch_phase2_detailsProgress: 'Details ({current}/{total})',
    fetch_phase3_calculating: 'Calculating differences...',
    fetch_phase4_applying: 'Applying changes...',
    fetch_phase5_addingNew: 'Adding new worlds...',
    fetch_phase6_complete: 'Fetch complete',

    // Completion Messages
    fetchComplete: 'Fetch complete: {addedCount} added / {totalFolders} folders total',
    reflectComplete: 'Reflect complete: {removedCount} removed / {movedCount} moved / {addedCount} added',
    reflectCompleteWithUncategorized: 'Reflect complete: {removedCount} removed / {movedCount} moved / {addedCount} added / {movedToUncategorizedCount} to uncategorized',

    // Error Messages
    errorOccurred: 'An error occurred',
    syncFailed: 'Sync failed',
    fetchFailed: 'Fetch failed',
    errorDetails: 'Error: {error}',
    partialSuccess: 'Some worlds failed ({count} errors)',
    notLoggedIn: 'Not logged in to VRChat. Please log in at vrchat.com and try again.',

    // Auto-close related
    autoCloseIn: 'Auto-closing in {seconds} seconds',
    manualClose: '(Click to close manually)',
    closeWindow: 'Click this message to close the window'
  }
};

// ========================================
// グローバル変数
// ========================================
let currentLang = 'ja';
let currentTheme = 'dark';
let isProcessing = false;
let currentWindowId = null;
let autoCloseTimer = null;

// ========================================
// 初期化
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
  currentWindowId = chrome.windows.WINDOW_ID_CURRENT;

  await loadSettings();
  applyTheme();
  applyLanguage();
  setupEventListeners();

  console.log('[Bridge] Initialized with windowId:', currentWindowId);
});

// ========================================
// 設定読み込み
// ========================================
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    if (result.settings) {
      currentLang = result.settings.language || 'ja';
      currentTheme = result.settings.theme || 'dark';
    }
  } catch (error) {
    console.error('[Bridge] Failed to load settings:', error);
  }
}

// ========================================
// テーマ適用
// ========================================
function applyTheme() {
  if (currentTheme === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }
}

// ========================================
// 言語適用
// ========================================
function applyLanguage() {
  document.documentElement.lang = currentLang;

  // 静的要素の翻訳
  const elements = {
    bridgeHeader: document.getElementById('bridgeHeader'),
    bridgeDescription: document.getElementById('bridgeDescription'),
    fetchButtonText: document.getElementById('fetchButtonText'),
    reflectButtonText: document.getElementById('reflectButtonText'),
    statusWaiting: document.getElementById('statusWaiting'),
    alertWarningText: document.getElementById('alertWarningText')
  };

  Object.keys(elements).forEach(key => {
    if (elements[key] && translations[currentLang][key]) {
      elements[key].textContent = translations[currentLang][key];
    }
  });
}

// ========================================
// 翻訳関数
// ========================================
function t(key, params = {}) {
  let text = translations[currentLang][key] || translations['ja'][key] || key;

  // パラメータ置換
  Object.keys(params).forEach(param => {
    text = text.replace(new RegExp(`\\{${param}\\}`, 'g'), params[param]);
  });

  return text;
}

// ========================================
// イベントリスナー設定
// ========================================
function setupEventListeners() {
  document.getElementById('fetch-button').addEventListener('click', () => {
    startVRCAction('FETCH');
  });

  document.getElementById('reflect-button').addEventListener('click', () => {
    startVRCAction('REFLECT');
  });

  // メッセージリスナー
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.windowId && message.windowId !== currentWindowId) {
      return;
    }

    handleMessage(message);
  });

  // ウィンドウクローズ時の処理
  window.addEventListener('beforeunload', () => {
    if (isProcessing) {
      chrome.runtime.sendMessage({
        type: 'CANCEL_VRC_ACTION',
        windowId: currentWindowId
      });
    }
  });
}

// ========================================
// VRCアクション開始
// ========================================
async function startVRCAction(actionType) {
  if (isProcessing) {
    console.log('[Bridge] Already processing');
    return;
  }

  console.log('[Bridge] Starting action:', actionType);

  // 既存のカウントダウンタイマーをクリア
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }

  isProcessing = true;
  setButtonsDisabled(true);
  showAlert(true);
  setStatus(t('statusProcessing'));
  setProgress(0);
  clearError();

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'START_VRC_ACTION',
      actionType: actionType,
      windowId: currentWindowId
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to start action');
    }

    console.log('[Bridge] Action started successfully');

  } catch (error) {
    console.error('[Bridge] Failed to start action:', error);
    handleError(error.message);
  }
}

// ========================================
// メッセージハンドラー
// ========================================
function handleMessage(message) {
  console.log('[Bridge] Received message:', message.action);

  switch (message.action) {
    case 'VRC_ACTION_PROGRESS':
      handleProgress(message);
      break;

    case 'VRC_ACTION_COMPLETE':
      handleComplete(message);
      break;

    case 'VRC_ACTION_ERROR':
      handleError(message.error);
      break;

    default:
      console.log('[Bridge] Unknown action:', message.action);
  }
}

// ========================================
// 進捗ハンドラー
// ========================================
function handleProgress(data) {
  const { message: msgKey, percent, ...params } = data;

  // 翻訳してステータス更新
  const translatedMessage = t(msgKey, params);
  setStatus(translatedMessage);
  setProgress(percent);

  console.log(`[Bridge] Progress: ${percent}% - ${translatedMessage}`);
}

// ========================================
// 完了ハンドラー
// ========================================
function handleComplete(result) {
  console.log('[Bridge] Action completed:', result);

  // UI状態の更新
  isProcessing = false;
  setButtonsDisabled(false);
  showAlert(false);
  setProgress(100);

  // キャンセル、未ログインエラーのチェック
  if (result.cancelled) {
    setStatus(t('statusCancelled'));
    // 即座にメインpopupへ通知
    chrome.runtime.sendMessage({ 
      type: 'VRC_SYNC_COMPLETED',
      result: result
    }).catch(e => console.warn('Failed to send VRC_SYNC_COMPLETED:', e));
    scheduleAutoClose();
    return;
  }

  if (result.notLoggedIn) {
    setStatus(t('statusError'));
    showError(t('notLoggedIn'));
    // 即座にメインpopupへ通知
    chrome.runtime.sendMessage({ 
      type: 'VRC_SYNC_COMPLETED',
      result: result
    }).catch(e => console.warn('Failed to send VRC_SYNC_COMPLETED:', e));
    scheduleAutoClose();
    return;
  }

  // 成功メッセージの構築
  let completionMessage = '';

  if (result.addedCount !== undefined) {
    if (result.totalFolders !== undefined) {
      completionMessage = t('fetchComplete', {
        addedCount: result.addedCount,
        totalFolders: result.totalFolders
      });
    } else {
      if (result.movedToUncategorizedCount && result.movedToUncategorizedCount > 0) {
        completionMessage = t('reflectCompleteWithUncategorized', {
          removedCount: result.removedCount || 0,
          movedCount: result.movedCount || 0,
          addedCount: result.addedCount || 0,
          movedToUncategorizedCount: result.movedToUncategorizedCount || 0
        });
      } else {
        completionMessage = t('reflectComplete', {
          removedCount: result.removedCount || 0,
          movedCount: result.movedCount || 0,
          addedCount: result.addedCount || 0
        });
      }
    }
  }

  setStatus(completionMessage || t('statusComplete'));

  // エラーがある場合は表示
  if (result.errors && result.errors.length > 0) {
    const errorCount = result.errors.length;
    const errorMsg = t('partialSuccess', { count: errorCount });
    showError(`${errorMsg}\n${result.errors.slice(0, 3).join('\n')}`);
  }
  
  // 即座にメインpopupへ通知
  chrome.runtime.sendMessage({ 
    type: 'VRC_SYNC_COMPLETED',
    result: result
  }).catch(e => console.warn('Failed to send VRC_SYNC_COMPLETED:', e));
  
  scheduleAutoClose();
}

// ========================================
// 自動クローズスケジュール
// ========================================
function scheduleAutoClose() {
  let countdown = 5;
  const ERROR_MESSAGE = document.getElementById('error-message');
  
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

// ========================================
// ウィンドウクローズ
// ========================================
function closeWindow() {
  if (autoCloseTimer) {
    clearTimeout(autoCloseTimer);
    autoCloseTimer = null;
  }

  try {
    window.close();
  } catch (e) {
    console.warn('Failed to close window:', e);
    // 閉じられなかった場合のフォールバックUI
    const ERROR_MESSAGE = document.getElementById('error-message');
    ERROR_MESSAGE.textContent = t('closeWindow');
    ERROR_MESSAGE.style.display = 'block';
    ERROR_MESSAGE.style.color = 'var(--accent-primary)';
    ERROR_MESSAGE.style.cursor = 'pointer';
  }
}

// ========================================
// エラーハンドラー
// ========================================
function handleError(error) {
  // 未ログインエラーはWARNレベル、それ以外はERROR
  if (error === 'VRChatにログインしていません' || (typeof error === 'string' && error.includes('ログインしていません'))) {
    console.warn('[Bridge] Not logged in to VRChat:', error);
  } else {
    console.error('[Bridge] Error occurred:', error);
  }

  isProcessing = false;
  setButtonsDisabled(false);
  showAlert(false);
  setStatus(t('statusError'));

  // 未ログインエラーの特別処理
  if (error === 'VRChatにログインしていません' || (typeof error === 'string' && error.includes('ログインしていません'))) {
    showError(t('notLoggedIn'));
    scheduleAutoClose();
    return;
  }

  const errorMsg = t('errorDetails', { error: error || t('errorOccurred') });
  showError(errorMsg);
  scheduleAutoClose();
}

// ========================================
// UI更新関数
// ========================================
function setStatus(message) {
  const statusEl = document.getElementById('status-message');
  if (statusEl) {
    statusEl.textContent = message;
  }
}

function setProgress(percent) {
  const progressFill = document.getElementById('progress-fill');
  if (progressFill) {
    progressFill.style.width = `${percent}%`;
    progressFill.textContent = `${percent}%`;

    if (percent >= 100) {
      progressFill.classList.add('complete');
    } else {
      progressFill.classList.remove('complete');
    }
  }
}

function showError(message) {
  const errorEl = document.getElementById('error-message');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
}

function clearError() {
  const errorEl = document.getElementById('error-message');
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.style.display = 'none';
  }
}

function showAlert(show) {
  const alertEl = document.getElementById('alert-message');
  if (alertEl) {
    alertEl.style.display = show ? 'block' : 'none';
  }
}

function setButtonsDisabled(disabled) {
  document.getElementById('fetch-button').disabled = disabled;
  document.getElementById('reflect-button').disabled = disabled;
}

// ========================================
// 設定変更監視
// ========================================
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.settings) {
    const newSettings = changes.settings.newValue;

    if (newSettings.language && newSettings.language !== currentLang) {
      currentLang = newSettings.language;
      applyLanguage();
    }

    if (newSettings.theme && newSettings.theme !== currentTheme) {
      currentTheme = newSettings.theme;
      applyTheme();
    }
  }
});