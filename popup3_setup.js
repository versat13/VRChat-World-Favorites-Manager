// popup3_setup.js - 初期化・イベントリスナー
// popup3_user_watch.js から機能分離(v1.4.0時点でのリファクタリング)

// 初期化
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadGlobalNotificationSettings();
  await loadUnreadNotifications();
  await loadWatchList();
  applyTheme();
  applyTranslations();
  setupEventListeners();
  renderUserList();
  updateStats();

  // 【v1.4.0追加】「全件更新」の進捗を受け取る常時リスナー。
  // ここで登録しておくことで、このポップアップ自身が実行を開始した場合と、
  // 既に裏側で実行中だった巡回を後から引き継いで表示する場合の両方に対応する。
  setupManualCheckProgressListener();

  // 【v1.4.0追加】ポップアップを開いた時点で、既に裏側で巡回(全件更新・
  // 軽量チェックいずれか)が実行中であれば、その進捗をそのまま復元して表示する。
  await restoreManualCheckProgressIfRunning();

  // 【v1.5.0変更】ポップアップを開くたびの軽量自動チェックは廃止した。
  // 自動巡回は定期実行(chrome.alarms)/起動時チェックの設定のみで行う。
});

/**
 * 【v1.5.0変更】ポップアップを開くたびに軽量自動チェックを実行する機能は
 * 廃止した。定期実行(chrome.alarms)と起動時チェックの設定だけで
 * 自動巡回が完結する設計にする(ポップアップは結果を見る・手動操作する
 * ための画面であり、開くたびに毎回チェックが走るのは不要かつ煩雑という
 * 判断)。この関数はもう呼び出さない(呼び出し元も削除済み)。
 */
async function triggerLightCheckOnOpen_DEPRECATED() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'lightCheckUpdates' });
    if (response && response.success && !response.skipped) {
      // 未読状況が変わった可能性があるため再読込して反映する
      await loadUnreadNotifications();
      await loadWatchList();
      renderUserList();
      updateStats();
    }
    // 【v1.4.0追加】ポップアップを開いた直後の自動チェックが未ログインで
    // 打ち切られた場合も、静かに失敗させず気づけるようにする。
    if (response && response.authRequired) {
      showNotLoggedInBanner();
    }
  } catch (error) {
    // ポップアップが既に閉じられている等は無視してよい
    console.warn('Light check on open failed:', error);
  }
}

// ============================================================
// 設定読み込み
// ============================================================

async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    if (result.settings) {
      currentLanguage = result.settings.language || 'ja';
      currentTheme = result.settings.theme || 'light';
    }

    // ソート設定の読み込み
    const sortSettings = await chrome.storage.local.get(['userSortOrder', 'worldSortOrder']);
    if (sortSettings.userSortOrder) {
      userSortOrder = sortSettings.userSortOrder;
    }
    if (sortSettings.worldSortOrder) {
      worldSortOrder = sortSettings.worldSortOrder;
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

async function loadGlobalNotificationSettings() {
  try {
    const result = await chrome.storage.sync.get('globalNotificationSettings');
    if (result.globalNotificationSettings) {
      globalNotificationSettings = result.globalNotificationSettings;
    } else {
      globalNotificationSettings = { worldUpdate: true, newWorld: true };
    }
    updateGlobalToggleUI();
    applyNotificationStyles();
  } catch (error) {
    console.error('Failed to load global notification settings:', error);
    globalNotificationSettings = { worldUpdate: true, newWorld: true };
  }
}

// ============================================================
// 未読通知読み込み
// ============================================================

async function loadUnreadNotifications() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getUnreadNotifications' });
    if (response && response.success) {
      unreadNotifications.clear();
      response.notifications.forEach(notif => {
        unreadNotifications.set(notif.userId, {
          type: notif.type,
          count: notif.count,
          latestDate: notif.latestDate,
          displayName: notif.displayName
        });
      });
    }
  } catch (error) {
    console.error('Failed to load unread notifications:', error);
  }
}

function updateGlobalToggleUI() {
  const updateToggle = document.getElementById('globalToggleUpdate');
  const newToggle = document.getElementById('globalToggleNew');

  if (updateToggle) {
    if (globalNotificationSettings.worldUpdate) {
      updateToggle.classList.add('on');
      updateToggle.classList.remove('off');
    } else {
      updateToggle.classList.add('off');
      updateToggle.classList.remove('on');
    }
  }

  if (newToggle) {
    if (globalNotificationSettings.newWorld) {
      newToggle.classList.add('on');
      newToggle.classList.remove('off');
    } else {
      newToggle.classList.add('off');
      newToggle.classList.remove('on');
    }
  }
  applyNotificationStyles();
}

function applyTheme() {
  if (currentTheme === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }
}

/**
 * 翻訳をHTML要素に適用
 */
function applyTranslations() {
  // data-i18n属性を持つ要素のテキストを翻訳
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });

  // data-i18n-placeholder属性を持つ要素のplaceholderを翻訳
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key);
  });

  // data-i18n-title属性を持つ要素のtitleを翻訳
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    el.title = t(key);
  });
}

/**
 * 通知設定に応じて関連UIをグレーアウトする
 */
function applyNotificationStyles() {
  const updateEnabled = globalNotificationSettings.worldUpdate;
  const newEnabled = globalNotificationSettings.newWorld;

  // サマリーバッジ
  const updateBadge = document.getElementById('updateCountBadge');
  const newBadge = document.getElementById('newCountBadge');

  if (updateBadge) {
    updateBadge.classList.toggle('notify-off', !updateEnabled);
  }
  if (newBadge) {
    newBadge.classList.toggle('notify-off', !newEnabled);
  }

  // ユーザーリストの日付バッジ
  document.querySelectorAll('.user-date-badges .update-badge').forEach(el => {
    el.classList.toggle('notify-off', !updateEnabled);
  });
  document.querySelectorAll('.user-date-badges .new-badge').forEach(el => {
    el.classList.toggle('notify-off', !newEnabled);
  });

  // ワールド詳細の統計
  document.querySelector('.worlds-stats .stat-update')?.classList.toggle('notify-off', !updateEnabled);
  document.querySelector('.worlds-stats .stat-new')?.classList.toggle('notify-off', !newEnabled);
}

// ============================================================
// ウォッチリスト読み込み
// ============================================================

async function loadWatchList() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'loadWatchList' });
    if (response.success) {
      watchList = response.watchList || [];
    } else {
      watchList = [];
    }
  } catch (error) {
    console.error('Failed to load watch list:', error);
    watchList = [];
  }
}

// ============================================================
// イベントリスナー
// ============================================================

function setupEventListeners() {
  document.getElementById('addUserBtn').addEventListener('click', handleAddUser);
  document.getElementById('urlInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAddUser();
  });

  document.getElementById('selectAllWrapper').addEventListener('click', toggleSelectAll);
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    userSortOrder = e.target.value;
    chrome.storage.local.set({ userSortOrder });
    renderUserList();
  });

  // v1.2.2 新規ボタン
  const importBtn = document.getElementById('importBtn');
  const exportBtn = document.getElementById('exportBtn');
  if (importBtn) importBtn.addEventListener('click', handleImport);
  if (exportBtn) exportBtn.addEventListener('click', handleExport);

  document.getElementById('deleteSelectedBtn').addEventListener('click', handleDeleteSelected);

  document.getElementById('manualCheckBtn').addEventListener('click', handleManualCheck);
  document.getElementById('abortCheckBtn').addEventListener('click', handleAbortCheck);
  const clearAllUnreadBtn = document.getElementById('clearAllUnreadBtn');
  if (clearAllUnreadBtn) {
    clearAllUnreadBtn.addEventListener('click', handleClearAllUnread);
  }

  document.getElementById('globalToggleUpdate').addEventListener('click', () => handleGlobalToggle('worldUpdate'));
  document.getElementById('globalToggleNew').addEventListener('click', () => handleGlobalToggle('newWorld'));

  document.getElementById('deleteCancelBtn').addEventListener('click', closeDeleteModal);
  document.getElementById('deleteConfirmBtn').addEventListener('click', confirmDelete);

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'watchListProgress') {
      updateProgressBar(message.data);
    }
  });
}

// ============================================================
