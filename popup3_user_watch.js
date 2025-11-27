// popup3_user_watch.js v1.2.2 前半

// ============================================================
// グローバル状態
// ============================================================

let watchList = [];
let selectedUserId = null;
let selectedUserIds = new Set();
let currentLanguage = 'ja';
let currentTheme = 'dark';
let isProcessing = false;
let deleteTarget = null;
let worldSortOrder = 'updated';
let userSortOrder = 'updated';
let globalNotificationSettings = { worldUpdate: true, newWorld: true };
let unreadNotifications = new Map();

let expandedWorldsCache = new Map();

// ============================================================
// 翻訳辞書
// ============================================================

const translations = {
  ja: {
    // ヘッダー
    title: '👤 ユーザーウォッチリスト',
    urlInputPlaceholder: 'ユーザーID https://vrchat.com/home/user/usr_xxxxx または ワールドID https://vrchat.com/home/world/wrld_xxxxx',
    addButton: '追加',
    importButton: '📥 インポート',
    exportButton: '📤 エクスポート',

    // コントロール
    selectAll: '全選択',
    sortUpdated: '最終更新日順',
    sortPublication: '新規作成日順',
    sortName: 'ユーザー名順',
    sortAdded: '登録日順',
    updateCount: '更新: {count}件',
    newCount: '新規: {count}件',

    // アクション
    deleteButton: '🗑 削除',
    manualCheckButton: '🔄 手動更新',
    clearAllUnreadButton: '✓ 未読クリア',
    selectionCount: '選択中: {count}件',
    importProgress: '追加中: {current}/{total}',

    // 空状態
    noUsers: 'ユーザーが登録されていません',
    selectUserPrompt: '左側からユーザーを選択してください',
    noWorldsForUser: 'このユーザーはワールドを作成していません',

    // モーダル
    deleteConfirmTitle: '🗑️ 削除確認',
    deleteConfirmSingle: '「{name}」をウォッチリストから削除しますか?',
    deleteConfirmMultiple: '選択中の{count}人のユーザーをウォッチリストから削除しますか?',
    confirmDelete: '削除',
    cancel: 'キャンセル',

    // 通知
    addUserSuccess: '{name} を追加しました',
    deleteUserSuccess: 'ユーザーを削除しました',
    deleteMultipleSuccess: '{count}人のユーザーを削除しました',
    clearAllUnreadSuccess: 'すべての未読をクリアしました',
    manualCheckSuccess: '更新完了: {count}件',
    manualCheckWithUnread: '更新完了: {count}件 - {unread}件の新しい更新があります',
    manualCheckNoUnread: '更新完了: {count}件 - 新しい更新はありません',
    importComplete: '完了: {success}件追加',
    importWithSkip: '完了: {success}件追加, {skip}件スキップ',
    importWithError: '完了: {success}件追加, {skip}件スキップ, {error}件エラー',
    exportSuccess: 'エクスポートしました',
    refetchSuccess: 'ユーザー情報を更新しました',
    refetchFullSuccess: 'ユーザー情報を取得しました',
    expandWorldsSuccess: '{count}件のワールドを表示しました',
    addWorldSuccess: '「{world}」を「{folder}」に追加しました',
    globalNotificationOn: '{type}をONにしました',
    globalNotificationOff: '{type}をOFFにしました',

    // エラー
    errorInputUrl: 'URLを入力してください',
    errorProcessing: '処理中です...',
    errorInvalidUrl: '有効なVRChat URLを入力してください',
    errorWorldNotFound: 'ワールドが見つかりませんでした',
    errorAlreadyAdded: '既に登録されています',
    errorAddUserFailed: 'ユーザーの追加に失敗しました',
    errorDeleteFailed: '削除に失敗しました',
    errorRefetchFailed: '更新に失敗しました',
    errorManualCheckFailed: 'チェックに失敗しました',
    errorClearUnreadFailed: '未読のクリアに失敗しました',
    errorImportFailed: 'CSVの読み込みに失敗しました',
    errorExportFailed: 'エクスポートに失敗しました',
    errorExpandWorldsFailed: 'ワールド情報の取得に失敗しました',
    errorAddWorldFailed: '保存に失敗しました',
    errorNoValidIds: '有効なIDが見つかりませんでした',
    errorUserNotFound: 'ユーザーが見つかりません',
    errorInvalidUserId: 'ユーザーIDが無効です',
    errorNoSelection: '削除するユーザーが選択されていません',
    errorGeneric: 'エラーが発生しました',
    errorFoldersFailed: 'フォルダ情報の取得に失敗しました',
    errorPageHelpersNotLoaded: 'エラー: page-helpers-shared.js が読み込まれていません',

    // 進捗メッセージ
    progressDetectedIds: '{count}件のIDを検出しました',
    progressAddingUser: '追加中: {current}/{total}',
    progressAddingWithSkip: '追加中: {current}/{total} (スキップ: {skip})',
    progressFetchingWorld: 'ワールド情報を取得中...',
    progressFetchingUser: 'ユーザー情報を取得中...',
    progressRefetchingUser: 'ユーザー情報を更新中...',
    progressRefetchingFull: 'ユーザー情報を完全取得中...',
    progressFetchingAllWorlds: '全ワールド情報を取得中...',
    progressFetchingFolders: 'フォルダ情報を取得中...',
    progressSavingWorld: 'ワールドを保存中...',
    progressManualCheckPrepare: '更新準備中...',
    progressManualCheckUpdating: '更新中: {current}/{total} - {name}',

    // ワールド詳細
    worldSortUpdated: '更新日順',
    worldSortPublication: '公開日順',
    worldRefetchButton: '🔄',
    worldAddButton: '+ 追加',
    worldFavorites: '⭐ {count}',
    worldLabsBadge: '🧪',
    worldUpdatedAt: '更新日: {date}',
    worldPublicationDate: '公開日: {date}',
    worldPublicationLabs: '公開日: Labs',
    worldCreatedAt: '作成日: {date}',
    worldExpandButton: 'さらに表示',
    worldExpandCount: '+{count}件',

    // ユーザーカード
    userWorksCount: '{count}作品',
    userMissingInfo: '🔥 情報未取得',
    userNotifyOn: '通知ON',
    userNotifyOff: '通知OFF',
    userUpdateLabel: '[更新]{date}',
    userNewLabel: '[新規]{date}',

    // ユーザー詳細統計
    userStatsWorlds: '公開ワールド: {count}件',
    userStatsUpdate: '更新: {date}',
    userStatsNew: '新規: {date}',

    // 日付表示
    dateToday: '今日',
    dateYesterday: '昨日',
    dateFuture: '未来',
    dateDaysAgo: '{days}日前',
    dateNone: '-',

    // その他
    notificationType_worldUpdate: '更新通知',
    notificationType_newWorld: '新規通知',
    folderSelectTitle: '📁 保存先フォルダを選択',
    folderSelectDescription: '「{world}」を保存するフォルダを選択してください',
    folderNone: '未分類'
  },
  en: {
    // Header
    title: '👤 User Watch List',
    urlInputPlaceholder: 'User ID https://vrchat.com/home/user/usr_xxxxx or World ID https://vrchat.com/home/world/wrld_xxxxx',
    addButton: 'Add',
    importButton: '📥 Import',
    exportButton: '📤 Export',

    // Controls
    selectAll: 'Select All',
    sortUpdated: 'Last Updated',
    sortPublication: 'Publication Date',
    sortName: 'User Name',
    sortAdded: 'Added Date',
    updateCount: 'Updates: {count}',
    newCount: 'New: {count}',

    // Actions
    deleteButton: '🗑 Delete',
    manualCheckButton: '🔄 Update',
    clearAllUnreadButton: '✓ Clear Unread',
    selectionCount: 'Selected: {count}',
    importProgress: 'Adding: {current}/{total}',

    // Empty states
    noUsers: 'No users registered',
    selectUserPrompt: 'Select a user from the left',
    noWorldsForUser: 'This user has not created any worlds',

    // Modal
    deleteConfirmTitle: '🗑️ Confirm Deletion',
    deleteConfirmSingle: 'Remove "{name}" from watch list?',
    deleteConfirmMultiple: 'Remove {count} selected users from watch list?',
    confirmDelete: 'Delete',
    cancel: 'Cancel',

    // Notifications
    addUserSuccess: 'Added {name}',
    deleteUserSuccess: 'User deleted',
    deleteMultipleSuccess: '{count} users deleted',
    clearAllUnreadSuccess: 'All unread cleared',
    manualCheckSuccess: 'Update complete: {count}',
    manualCheckWithUnread: 'Update complete: {count} - {unread} new updates',
    manualCheckNoUnread: 'Update complete: {count} - No new updates',
    importComplete: 'Complete: {success} added',
    importWithSkip: 'Complete: {success} added, {skip} skipped',
    importWithError: 'Complete: {success} added, {skip} skipped, {error} errors',
    exportSuccess: 'Exported',
    refetchSuccess: 'User info updated',
    refetchFullSuccess: 'User info retrieved',
    expandWorldsSuccess: '{count} worlds displayed',
    addWorldSuccess: '"{world}" added to "{folder}"',
    globalNotificationOn: '{type} turned ON',
    globalNotificationOff: '{type} turned OFF',

    // Errors
    errorInputUrl: 'Please enter a URL',
    errorProcessing: 'Processing...',
    errorInvalidUrl: 'Please enter a valid VRChat URL',
    errorWorldNotFound: 'World not found',
    errorAlreadyAdded: 'Already registered',
    errorAddUserFailed: 'Failed to add user',
    errorDeleteFailed: 'Failed to delete',
    errorRefetchFailed: 'Failed to update',
    errorManualCheckFailed: 'Check failed',
    errorClearUnreadFailed: 'Failed to clear unread',
    errorImportFailed: 'Failed to read CSV',
    errorExportFailed: 'Failed to export',
    errorExpandWorldsFailed: 'Failed to get world info',
    errorAddWorldFailed: 'Failed to save',
    errorNoValidIds: 'No valid IDs found',
    errorUserNotFound: 'User not found',
    errorInvalidUserId: 'Invalid user ID',
    errorNoSelection: 'No users selected for deletion',
    errorGeneric: 'An error occurred',
    errorFoldersFailed: 'Failed to get folder info',
    errorPageHelpersNotLoaded: 'Error: page-helpers-shared.js not loaded',

    // Progress messages
    progressDetectedIds: '{count} IDs detected',
    progressAddingUser: 'Adding: {current}/{total}',
    progressAddingWithSkip: 'Adding: {current}/{total} (Skipped: {skip})',
    progressFetchingWorld: 'Fetching world info...',
    progressFetchingUser: 'Fetching user info...',
    progressRefetchingUser: 'Updating user info...',
    progressRefetchingFull: 'Fully fetching user info...',
    progressFetchingAllWorlds: 'Fetching all world info...',
    progressFetchingFolders: 'Fetching folder info...',
    progressSavingWorld: 'Saving world...',
    progressManualCheckPrepare: 'Preparing update...',
    progressManualCheckUpdating: 'Updating: {current}/{total} - {name}',

    // World details
    worldSortUpdated: 'Updated Date',
    worldSortPublication: 'Publication Date',
    worldRefetchButton: '🔄',
    worldAddButton: '+ Add',
    worldFavorites: '⭐ {count}',
    worldLabsBadge: '🧪',
    worldUpdatedAt: 'Updated: {date}',
    worldPublicationDate: 'Published: {date}',
    worldPublicationLabs: 'Published: Labs',
    worldCreatedAt: 'Created: {date}',
    worldExpandButton: 'Show More',
    worldExpandCount: '+{count}',

    // User card
    userWorksCount: '{count} works',
    userMissingInfo: '🔥 Info not fetched',
    userNotifyOn: 'Notify ON',
    userNotifyOff: 'Notify OFF',
    userUpdateLabel: '[Updated]{date}',
    userNewLabel: '[New]{date}',

    // User detail stats
    userStatsWorlds: 'Public Worlds: {count}',
    userStatsUpdate: 'Updated: {date}',
    userStatsNew: 'New: {date}',

    // Date display
    dateToday: 'Today',
    dateYesterday: 'Yesterday',
    dateFuture: 'Future',
    dateDaysAgo: '{days}d ago',
    dateNone: '-',

    // Others
    notificationType_worldUpdate: 'update notification',
    notificationType_newWorld: 'new world notification',
    folderSelectTitle: '📁 Select Destination Folder',
    folderSelectDescription: 'Select a folder to save "{world}"',
    folderNone: 'Uncategorized'
  }
};

/**
 * 翻訳関数
 * @param {string} key - 翻訳キー
 * @param {object} params - 置換パラメータ
 * @returns {string} 翻訳されたテキスト
 */
function t(key, params = {}) {
  const dict = translations[currentLanguage] || translations['ja'];
  let text = dict[key] || key;

  // パラメータ置換
  Object.keys(params).forEach(param => {
    text = text.replace(`{${param}}`, params[param]);
  });

  return text;
}

// ============================================================
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
});

// ============================================================
// 設定読み込み
// ============================================================

async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    if (result.settings) {
      currentLanguage = result.settings.language || 'ja';
      currentTheme = result.settings.theme || 'dark';
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
// インポート・エクスポート
// ============================================================

async function handleImport() {
  try {
    const file = await selectFile('.csv');
    if (!file) return;

    await importFromCSV(file);
  } catch (error) {
    console.error('Import failed:', error);
    showNotification(t('errorImportFailed'), 'error');
  }
}

async function handleExport() {
  try {
    const csv = generateWatchListCSV(watchList);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `watchlist_${timestamp}.csv`;
    downloadCSV(csv, filename);
    showNotification(t('exportSuccess'), 'success');
  } catch (error) {
    console.error('Export failed:', error);
    showNotification(t('errorExportFailed'), 'error');
  }
}

function selectFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = (e) => {
      const file = e.target.files[0];
      resolve(file || null);
    };
    input.click();
  });
}

function generateWatchListCSV(watchList) {
  let csv = '';

  watchList.forEach(user => {
    const worldCount = user.totalWorldCount || (user.worlds ? user.worlds.length : 0);
    csv += [
      user.userId,
      escapeCSV(user.displayName),
      worldCount
    ].join(',') + '\n';
  });

  return csv;
}

function escapeCSV(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function downloadCSV(csv, filename) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function importFromCSV(file) {
  try {
    const text = await file.text();
    const ids = extractIdsFromText(text);

    if (ids.length === 0) {
      showNotification(t('errorNoValidIds'), 'error');
      return;
    }

    showNotification(t('progressDetectedIds', { count: ids.length }), 'info');

    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    // 進捗表示を開始
    const progressEl = document.getElementById('importProgress');
    progressEl.textContent = t('progressAddingUser', { current: 0, total: ids.length });
    progressEl.style.display = 'block';

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];

      try {
        let userId = null;

        // ユーザーIDの場合
        if (id.startsWith('usr_')) {
          userId = id;
        }
        // ワールドIDの場合は作者IDを取得
        else if (id.startsWith('wrld_')) {
          const worldResponse = await chrome.runtime.sendMessage({
            type: 'getWorldInfo',
            worldId: id
          });

          if (!worldResponse.success) {
            errorCount++;
            continue;
          }

          userId = worldResponse.world.authorId;
        }

        if (!userId) {
          errorCount++;
          continue;
        }

        // 既に登録済みかチェック
        if (watchList.some(u => u.userId === userId)) {
          skipCount++;
          // 進捗更新(スキップ時も表示を更新)
          if (skipCount > 0) {
            progressEl.textContent = t('progressAddingWithSkip', { current: successCount, total: ids.length, skip: skipCount });
          }
          continue;
        }

        // ユーザー追加
        const addResponse = await chrome.runtime.sendMessage({
          type: 'addUserToWatchList',
          userId: userId
        });

        if (addResponse.success) {
          successCount++;
          await loadWatchList();
          renderUserList();
          updateStats();

          // 進捗更新
          if (skipCount > 0) {
            progressEl.textContent = t('progressAddingWithSkip', { current: successCount, total: ids.length, skip: skipCount });
          } else {
            progressEl.textContent = t('progressAddingUser', { current: successCount, total: ids.length });
          }

          // 描画待機(UIの更新を確実にする)
          await new Promise(resolve => requestAnimationFrame(resolve));
        } else {
          errorCount++;
        }

        // APIレート制限対策(1秒待機)
        await sleep(1000);

      } catch (error) {
        console.error('Failed to add:', id, error);
        errorCount++;
      }
    }

    // 進捗表示を非表示
    progressEl.style.display = 'none';

    // 最終的なリスト更新
    renderUserList();
    updateStats();

    // 最終結果を通知(1回のみ)
    let message;
    if (skipCount > 0 && errorCount > 0) {
      message = t('importWithError', { success: successCount, skip: skipCount, error: errorCount });
    } else if (skipCount > 0) {
      message = t('importWithSkip', { success: successCount, skip: skipCount });
    } else {
      message = t('importComplete', { success: successCount });
    }

    showNotification(message, successCount > 0 ? 'success' : 'info');

  } catch (error) {
    console.error('CSV import error:', error);

    // エラー時も進捗を非表示
    const progressEl = document.getElementById('importProgress');
    if (progressEl) {
      progressEl.style.display = 'none';
    }

    showNotification(t('errorImportFailed'), 'error');
  }
}

function extractIdsFromText(text) {
  const ids = new Set();

  // usr_xxx 形式のユーザーIDを抽出
  const userMatches = text.matchAll(/usr_[a-f0-9-]+/gi);
  for (const match of userMatches) {
    ids.add(match[0].toLowerCase());
  }

  // wrld_xxx 形式のワールドIDを抽出
  const worldMatches = text.matchAll(/wrld_[a-f0-9-]+/gi);
  for (const match of worldMatches) {
    ids.add(match[0].toLowerCase());
  }

  return Array.from(ids);
}

// ============================================================
// 【v1.2.2 修正】手動チェック(全ユーザー更新)
// 連打防止・進捗表示改善
// ============================================================

async function handleManualCheck() {
  try {
    if (isProcessing) {
      showNotification(t('errorProcessing'), 'error');
      return;
    }

    isProcessing = true;

    // 手動更新ボタンを無効化
    const manualCheckBtn = document.getElementById('manualCheckBtn');
    if (manualCheckBtn) {
      manualCheckBtn.disabled = true;
    }

    // 進捗表示を開始
    const progressEl = document.getElementById('importProgress');
    progressEl.textContent = t('progressManualCheckPrepare');
    progressEl.style.display = 'block';

    showNotification(t('progressManualCheckUpdating', { current: 0, total: watchList.length, name: '' }), 'info');

    // 進捗更新用のリスナーを追加
    const progressListener = (message) => {
      if (message.type === 'manualCheckProgress') {
        const { current, total, displayName } = message.data;
        progressEl.textContent = t('progressManualCheckUpdating', { current, total, name: displayName });
      }
    };
    chrome.runtime.onMessage.addListener(progressListener);

    const response = await chrome.runtime.sendMessage({ type: 'manualCheckUpdates' });

    // リスナーを削除
    chrome.runtime.onMessage.removeListener(progressListener);

    // 進捗表示を非表示
    progressEl.style.display = 'none';

    if (response && response.success) {
      await loadUnreadNotifications();
      await loadWatchList();
      renderUserList();

      let message;
      if (response.totalUnread > 0) {
        message = t('manualCheckWithUnread', { count: response.refreshedCount || 0, unread: response.totalUnread });
      } else {
        message = t('manualCheckNoUnread', { count: response.refreshedCount || 0 });
      }

      if (response.errorCount > 0) {
        message += ` (${t('errorGeneric')}: ${response.errorCount})`;
      }

      showNotification(message, 'success');
    } else {
      showNotification(t('errorManualCheckFailed'), 'error');
    }
  } catch (error) {
    console.error('Manual check failed:', error);
    showNotification(t('errorGeneric'), 'error');

    // エラー時も進捗を非表示
    const progressEl = document.getElementById('importProgress');
    if (progressEl) {
      progressEl.style.display = 'none';
    }
  } finally {
    isProcessing = false;

    // 手動更新ボタンを有効化
    const manualCheckBtn = document.getElementById('manualCheckBtn');
    if (manualCheckBtn) {
      manualCheckBtn.disabled = false;
    }
  }
}

// ============================================================
// 未読クリア
// ============================================================

async function handleClearAllUnread() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'clearAllNotifications' });

    if (response && response.success) {
      unreadNotifications.clear();
      await loadWatchList();
      renderUserList();
      showNotification(t('clearAllUnreadSuccess'), 'success');
    } else {
      showNotification(t('errorClearUnreadFailed'), 'error');
    }
  } catch (error) {
    console.error('Clear all unread failed:', error);
    showNotification(t('errorGeneric'), 'error');
  }
}

// ============================================================
// 全選択
// ============================================================

function toggleSelectAll() {
  const filtered = getFilteredUsers();

  if (selectedUserIds.size === filtered.length && filtered.length > 0) {
    selectedUserIds.clear();
  } else {
    filtered.forEach(user => selectedUserIds.add(user.userId));
  }

  renderUserList();
}

function updateSelectAllCheckbox() {
  const checkbox = document.getElementById('selectAllCheckbox');
  const filtered = getFilteredUsers();

  if (filtered.length === 0) {
    checkbox.classList.remove('checked');
    return;
  }

  const allSelected = filtered.every(user => selectedUserIds.has(user.userId));

  if (allSelected) {
    checkbox.classList.add('checked');
  } else {
    checkbox.classList.remove('checked');
  }
}

// ============================================================
// URL解析とユーザー追加
// ============================================================

async function handleAddUser() {
  const urlInput = document.getElementById('urlInput');
  const url = urlInput.value.trim();

  if (!url) {
    showNotification(t('errorInputUrl'), 'error');
    return;
  }

  if (isProcessing) {
    showNotification(t('errorProcessing'), 'error');
    return;
  }

  isProcessing = true;

  try {
    const parsed = parseVRChatUrl(url);

    if (!parsed) {
      showNotification(t('errorInvalidUrl'), 'error');
      isProcessing = false;
      return;
    }

    let userId;

    if (parsed.type === 'user') {
      userId = parsed.userId;
    } else if (parsed.type === 'world') {
      showNotification(t('progressFetchingWorld'), 'info');
      const worldResponse = await chrome.runtime.sendMessage({
        type: 'getWorldInfo',
        worldId: parsed.worldId
      });

      if (!worldResponse.success) {
        showNotification(t('errorWorldNotFound'), 'error');
        isProcessing = false;
        return;
      }

      userId = worldResponse.world.authorId;
    }

    if (watchList.some(u => u.userId === userId)) {
      showNotification(t('errorAlreadyAdded'), 'error');
      isProcessing = false;
      return;
    }

    showNotification(t('progressFetchingUser'), 'info');
    const addResponse = await chrome.runtime.sendMessage({
      type: 'addUserToWatchList',
      userId: userId
    });

    if (!addResponse.success) {
      showNotification(addResponse.userMessage || t('errorAddUserFailed'), 'error');
      isProcessing = false;
      return;
    }

    await loadWatchList();
    renderUserList();
    updateStats();

    urlInput.value = '';
    showNotification(t('addUserSuccess', { name: addResponse.user.displayName }), 'success');

  } catch (error) {
    console.error('Add user error:', error);
    showNotification(t('errorGeneric'), 'error');
  } finally {
    isProcessing = false;
  }
}

function parseVRChatUrl(url) {
  if (url.match(/^usr_[a-f0-9-]+$/i)) {
    return { type: 'user', userId: url };
  }

  if (url.match(/^wrld_[a-f0-9-]+$/i)) {
    return { type: 'world', worldId: url };
  }

  const userMatch = url.match(/vrchat\.com\/home\/user\/(usr_[a-f0-9-]+)/i);
  if (userMatch) return { type: 'user', userId: userMatch[1] };

  const worldMatch = url.match(/vrchat\.com\/home\/world\/(wrld_[a-f0-9-]+)/i);
  if (worldMatch) return { type: 'world', worldId: worldMatch[1] };

  const launchMatch = url.match(/vrchat\.com\/home\/launch.*[?&]worldId=(wrld_[a-f0-9-]+)/i);
  if (launchMatch) return { type: 'world', worldId: launchMatch[1] };

  return null;
}

// ============================================================
// フィルター済みユーザー取得
// ============================================================

function getFilteredUsers() {
  return [...watchList];
}

// ============================================================
// ユーザーリスト描画
// ============================================================

function renderUserList() {
  const userListEl = document.getElementById('userList');
  const sortSelect = document.getElementById('sortSelect');

  // ソート設定を反映
  sortSelect.value = userSortOrder;

  let filtered = getFilteredUsers();

  filtered.sort((a, b) => {
    switch (userSortOrder) {
      case 'updated':
        return new Date(b.lastUpdatedAt) - new Date(a.lastUpdatedAt);
      case 'publication':
        return new Date(b.latestPublicationDate || 0) - new Date(a.latestPublicationDate || 0);
      case 'name':
        return a.displayName.localeCompare(b.displayName);
      case 'added':
        return new Date(b.addedAt) - new Date(a.addedAt);
      default:
        return 0;
    }
  });

  if (filtered.length === 0) {
    userListEl.innerHTML = `
      <div class="user-card empty-state">
        <div class="empty-state-icon">🔭</div>
        <div class="empty-state-text">
          ${t('noUsers')}
        </div>
      </div>
    `;
    updateSelectionActions();
    updateSelectAllCheckbox();
    updateSummaryBadges();
    return;
  }

  userListEl.innerHTML = filtered.map(user => {
    const unreadNotif = unreadNotifications.get(user.userId);
    const unreadCount = unreadNotif ? unreadNotif.count : 0;
    const isSelected = user.userId === selectedUserId;
    const isChecked = selectedUserIds.has(user.userId);
    const worldCount = user.totalWorldCount || (user.worlds ? user.worlds.length : 0);
    const missing = isMissingDetails(user);

    const notifyEnabled = user.notificationEnabled !== false;

    const lastUpdateDate = user.lastUpdatedAt ? getRelativeTime(user.lastUpdatedAt) : '-';

    // 新規日の計算(Labs対応)
    let lastNewDate = '-';
    if (user.latestPublicationDate &&
      user.latestPublicationDate !== 'none' &&
      user.latestPublicationDate !== 'null' &&
      !isNaN(new Date(user.latestPublicationDate).getTime())) {
      // 有効なpublicationDateがある場合
      lastNewDate = getRelativeTime(user.latestPublicationDate);
    } else if (user.worlds && user.worlds.length > 0) {
      // publicationDateが無効な場合、ワールドから探す
      const validPublicationDates = user.worlds
        .map(w => w.publicationDate)
        .filter(d => d && d !== 'none' && d !== 'null' && !isNaN(new Date(d).getTime()))
        .sort((a, b) => new Date(b) - new Date(a));

      if (validPublicationDates.length > 0) {
        // 有効なpublicationDateが見つかった
        lastNewDate = getRelativeTime(validPublicationDates[0]);
      } else {
        // 全てLabs中の場合、最新のupdatedAtを使用
        const validUpdatedDates = user.worlds
          .map(w => w.updatedAt)
          .filter(d => d && d !== 'none' && d !== 'null' && !isNaN(new Date(d).getTime()))
          .sort((a, b) => new Date(b) - new Date(a));

        if (validUpdatedDates.length > 0) {
          lastNewDate = getRelativeTime(validUpdatedDates[0]);
        }
      }
    }

    return `
      <div class="user-card ${isSelected ? 'selected' : ''}" data-user-id="${user.userId}">
        <div class="user-checkbox ${isChecked ? 'checked' : ''}" data-user-id="${user.userId}"></div>
        <img src="${user.profilePicUrl || 'icons/icon128.png'}" alt="${user.displayName}" class="user-avatar">
        <div class="user-info">
          <div class="user-name" style="${missing ? 'color: var(--text-tertiary);' : ''}">${escapeHtml(user.displayName)}</div>
          <div class="user-meta">
            ${missing ? `<span style="color: var(--error);">${t('userMissingInfo')}</span>` : `
              <span>${t('userWorksCount', { count: worldCount })}</span>
            `}
          </div>
        </div>
        ${!missing ? `
          <div class="user-date-badges">
            <span class="date-badge update-badge">${t('userUpdateLabel', { date: lastUpdateDate })}</span>
            <span class="date-badge new-badge">${t('userNewLabel', { date: lastNewDate })}</span>
          </div>
        ` : ''}
        <div class="user-actions">
          <button class="icon-btn ${notifyEnabled ? 'notify-on' : 'notify-off'}" 
                  data-action="toggle-notify" 
                  data-user-id="${user.userId}" 
                  title="${notifyEnabled ? t('userNotifyOn') : t('userNotifyOff')}">
            ${notifyEnabled ? '🔔' : '🔕'}
          </button>
        </div>
        ${unreadCount > 0 ? `<span class="badge">${unreadCount}</span>` : ''}
      </div>
    `;
  }).join('');

  userListEl.querySelectorAll('.user-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.user-checkbox')) {
        return;
      }
      if (!e.target.closest('.user-actions')) {
        const userId = card.dataset.userId;
        selectUser(userId);
      }
    });
  });

  userListEl.querySelectorAll('.user-checkbox').forEach(checkbox => {
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      const userId = checkbox.dataset.userId;
      toggleUserSelection(userId);
    });
  });

  userListEl.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const userId = btn.dataset.userId;

      if (action === 'toggle-notify') {
        await toggleNotification(userId);
      }
    });
  });

  updateSelectionActions();
  updateSelectAllCheckbox();
  updateSummaryBadges();
  applyNotificationStyles();
}

// ============================================================
// v1.2.2 サマリーバッジ更新
// ============================================================

function updateSummaryBadges() {
  const updateBadge = document.getElementById('updateCountBadge');
  const newBadge = document.getElementById('newCountBadge');

  let updateCount = 0;
  let newCount = 0;

  unreadNotifications.forEach(notif => {
    if (notif.type === 'updated') updateCount += notif.count;
    if (notif.type === 'new') newCount += notif.count;
  });

  if (updateBadge) {
    updateBadge.textContent = t('updateCount', { count: updateCount });
    if (updateCount > 0) {
      updateBadge.classList.add('active');
      updateBadge.classList.remove('inactive');
    } else {
      updateBadge.classList.add('inactive');
      updateBadge.classList.remove('active');
    }
  }

  if (newBadge) {
    newBadge.textContent = t('newCount', { count: newCount });
    if (newCount > 0) {
      newBadge.classList.add('active');
      newBadge.classList.remove('inactive');
    } else {
      newBadge.classList.add('inactive');
      newBadge.classList.remove('active');
    }
  }
}

// ============================================================
// ユーザー選択
// ============================================================

async function selectUser(userId) {
  selectedUserId = userId;

  await markAsChecked(userId);
  await clearUserNotifications(userId);

  await updateUserWorldCount(userId);
  renderUserList();
  renderWorlds(userId);
}

// ============================================================
// 未読クリア
// ============================================================

async function clearUserNotifications(userId) {
  try {
    await chrome.runtime.sendMessage({
      type: 'clearUserNotifications',
      userId: userId
    });

    unreadNotifications.delete(userId);
  } catch (error) {
    console.error('Failed to clear user notifications:', error);
  }
}

async function updateUserWorldCount(userId) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'fetchUserWorldCount',
      userId: userId
    });

    if (response.success) {
      const user = watchList.find(u => u.userId === userId);
      if (user) {
        user.totalWorldCount = response.totalCount;

        const local = await chrome.storage.local.get(['watchListDetails']);
        const detailsMap = local.watchListDetails || {};
        if (detailsMap[userId]) {
          detailsMap[userId].totalWorldCount = response.totalCount;
          await chrome.storage.local.set({ watchListDetails: detailsMap });
        }

        renderUserList();
      }
    }
  } catch (error) {
    console.error('Failed to update world count:', error);
  }
}

function toggleUserSelection(userId) {
  if (selectedUserIds.has(userId)) {
    selectedUserIds.delete(userId);
  } else {
    selectedUserIds.add(userId);
  }
  renderUserList();
}

function updateSelectionActions() {
  const selectionCount = document.getElementById('selectionCount');

  if (selectedUserIds.size > 0) {
    selectionCount.textContent = t('selectionCount', { count: selectedUserIds.size });
    selectionCount.style.display = 'block';
  } else {
    selectionCount.textContent = t('selectionCount', { count: 0 });
    selectionCount.style.display = 'none';
  }
}

// ============================================================
// グローバル通知トグル
// ============================================================

async function handleGlobalToggle(settingKey) {
  const currentState = globalNotificationSettings[settingKey];
  const newState = !currentState;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'updateGlobalNotificationSetting',
      setting: settingKey,
      enabled: newState
    });

    if (response.success) {
      globalNotificationSettings[settingKey] = newState;

      const settingName = t('notificationType_' + settingKey);
      const stateText = newState ? 'ON' : 'OFF';
      const notifKey = newState ? 'globalNotificationOn' : 'globalNotificationOff';
      showNotification(t(notifKey, { type: settingName }), 'success');
    }
  } catch (error) {
    console.error('Failed to update global notification:', error);
    showNotification(t('errorGeneric'), 'error');
  }

  // 状態変更後にUIを更新
  updateGlobalToggleUI();
}

// ============================================================
// 日付フォーマット
// ============================================================

function formatDate(dateString) {
  if (!dateString || dateString === '' || dateString === 'none' || dateString === 'null' || dateString === 'undefined') {
    return t('dateNone');
  }

  const date = new Date(dateString);

  if (isNaN(date.getTime())) {
    console.warn('Invalid date:', dateString);
    return t('dateNone');
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

// ============================================================
// ワールド一覧描画
// ============================================================

function renderWorlds(userId) {
  const worldsArea = document.getElementById('worldsArea');
  const user = watchList.find(u => u.userId === userId);

  if (!user) {
    worldsArea.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👈</div>
        <div class="empty-state-text">
          ${t('selectUserPrompt')}
        </div>
      </div>
    `;
    return;
  }

  let worlds = expandedWorldsCache.has(userId)
    ? expandedWorldsCache.get(userId)
    : (user.worlds || []);

  const totalWorldCount = user.totalWorldCount || worlds.length;
  const displayLimit = 6;
  const isExpanded = expandedWorldsCache.has(userId);
  const hasMore = totalWorldCount > displayLimit && !isExpanded;

  if (worldSortOrder === 'publication') {
    worlds = [...worlds].sort((a, b) => {
      const dateA = new Date(a.publicationDate || a.createdAt || 0);
      const dateB = new Date(b.publicationDate || b.createdAt || 0);
      return dateB - dateA;
    });
  } else {
    worlds = [...worlds].sort((a, b) => {
      const dateA = new Date(a.updatedAt || 0);
      const dateB = new Date(b.updatedAt || 0);
      return dateB - dateA;
    });
  }

  const visibleWorlds = isExpanded ? worlds : worlds.slice(0, displayLimit);

  // 最新公開日の計算を修正(Labs対応)
  let latestPublicationDate = null;

  // publicationDateが有効な場合はそれを使用
  if (user.latestPublicationDate &&
    user.latestPublicationDate !== 'none' &&
    user.latestPublicationDate !== 'null' &&
    !isNaN(new Date(user.latestPublicationDate).getTime())) {
    latestPublicationDate = user.latestPublicationDate;
  } else {
    // publicationDateが無効な場合、ワールドから探す
    if (worlds.length > 0) {
      // まず有効なpublicationDateを探す
      const validPublicationDates = worlds
        .map(w => w.publicationDate)
        .filter(d => d && d !== 'none' && d !== 'null' && !isNaN(new Date(d).getTime()))
        .sort((a, b) => new Date(b) - new Date(a));

      if (validPublicationDates.length > 0) {
        latestPublicationDate = validPublicationDates[0];
      } else {
        // publicationDateが全て無効な場合(Labs中)、最新のupdatedAtを使用
        const validUpdatedDates = worlds
          .map(w => w.updatedAt)
          .filter(d => d && d !== 'none' && d !== 'null' && !isNaN(new Date(d).getTime()))
          .sort((a, b) => new Date(b) - new Date(a));

        if (validUpdatedDates.length > 0) {
          latestPublicationDate = validUpdatedDates[0];
        }
      }
    }
  }

  const lastUpdatedAt = user.lastUpdatedAt;

  worldsArea.innerHTML = `
    <div class="worlds-header">
      <div class="worlds-user-info">
        <img src="${user.profilePicUrl || 'icons/icon128.png'}" 
             alt="${user.displayName}" 
             class="worlds-user-avatar"
             data-user-id="${user.userId}">
        <div style="flex: 1; min-width: 0;">
          <div class="worlds-user-name" data-user-id="${user.userId}">${escapeHtml(user.displayName)}</div>
          <div class="worlds-user-id">${user.userId}</div>
          <div class="worlds-stats">
            <div class="worlds-stats-row">
              <span>${t('userStatsWorlds', { count: totalWorldCount })}</span>
            </div>
            <div class="worlds-stats-row">
              <span class="stat-update">${t('userStatsUpdate', { date: getRelativeTime(lastUpdatedAt) })}</span>
              ${latestPublicationDate ? `<span class="stat-new">${t('userStatsNew', { date: getRelativeTime(latestPublicationDate) })}</span>` : ''}
            </div>
          </div>
        </div>
      </div>
      <div class="worlds-header-actions">
        <button id="refetchBtn" class="refetch-btn" title="${t('worldRefetchButton')}">${t('worldRefetchButton')}</button>
        <div class="world-sort-controls">
          <select id="worldSortSelect">
            <option value="updated" ${worldSortOrder === 'updated' ? 'selected' : ''}>${t('worldSortUpdated')}</option>
            <option value="publication" ${worldSortOrder === 'publication' ? 'selected' : ''}>${t('worldSortPublication')}</option>
          </select>
        </div>
      </div>
    </div>
    <div class="worlds-content">
      ${worlds.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">🌍</div>
          <div class="empty-state-text">
            ${t('noWorldsForUser')}
          </div>
        </div>
      ` : `
        <div class="worlds-grid">
          ${visibleWorlds.map(world => {
    const updatedDate = world.updatedAt || '';
    const publicationDate = world.publicationDate || '';
    const createdDate = world.createdAt || '';

    // Labs判定: publicationDateが無効な場合
    const isLabs = !publicationDate ||
      publicationDate === 'none' ||
      publicationDate === 'null' ||
      isNaN(new Date(publicationDate).getTime());

    const isUpdatedRecent = isWithinDays(updatedDate, 7);
    const isPublicationRecent = !isLabs && isWithinDays(publicationDate, 7);
    const isCreatedRecent = isWithinDays(createdDate, 7);

    const isAnyWithin7Days = isUpdatedRecent || isPublicationRecent || isCreatedRecent;
    const isAnyWithin3Days = isWithinDays(updatedDate, 3) ||
      (!isLabs && isWithinDays(publicationDate, 3)) ||
      isWithinDays(createdDate, 3);

    let cardClass = 'world-card';
    if (isAnyWithin3Days) cardClass += ' world-card-highlight-3days';
    else if (isAnyWithin7Days) cardClass += ' world-card-highlight-7days';

    return `
            <div class="${cardClass}" data-world-id="${world.worldId}">
              <div style="position: relative;">
                <img src="${world.thumbnailUrl || world.thumbnailImageUrl || 'icons/icon128.png'}" alt="${world.worldName}" class="world-thumbnail">
                ${isLabs ? `<div class="world-labs-badge">${t('worldLabsBadge')}</div>` : ''}
                <div class="world-favorite-badge">${t('worldFavorites', { count: formatNumber(world.favorites || 0) })}</div>
              </div>
              <div class="world-info">
                <div class="world-name" title="${escapeHtml(world.worldName)}">${escapeHtml(world.worldName)}</div>
                <div class="world-meta">
                  <div class="world-meta-dates">
                    <div class="world-meta-row">
                      <span ${isUpdatedRecent ? 'style="font-weight: bold;"' : ''}>${t('worldUpdatedAt', { date: formatDate(updatedDate) })}</span>
                    </div>
                    <div class="world-meta-row">
                      <span ${isPublicationRecent ? 'style="font-weight: bold;"' : ''}>${isLabs ? t('worldPublicationLabs') : t('worldPublicationDate', { date: formatDate(publicationDate) })}</span>
                    </div>
                    <div class="world-meta-row">
                      <span ${isCreatedRecent ? 'style="font-weight: bold;"' : ''}>${t('worldCreatedAt', { date: formatDate(createdDate) })}</span>
                    </div>
                  </div>
                </div>
                <button class="world-add-btn" data-world-id="${world.worldId}" data-action="add-favorite">${t('worldAddButton')}</button>
              </div>
            </div>
          `;
  }).join('')}
          ${hasMore ? `
            <div class="expand-btn" data-user-id="${userId}">
              <div class="expand-btn-icon">📦</div>
              <div class="expand-btn-text">${t('worldExpandButton')}</div>
              <div class="expand-btn-count">${t('worldExpandCount', { count: totalWorldCount - displayLimit })}</div>
            </div>
          ` : ''}
        </div>
      `}
    </div>
  `;

  // ユーザーアイコン・名前クリックでユーザーページを開く
  const userAvatar = worldsArea.querySelector('.worlds-user-avatar');
  const userName = worldsArea.querySelector('.worlds-user-name');

  if (userAvatar) {
    userAvatar.addEventListener('click', () => {
      const userId = userAvatar.dataset.userId;
      chrome.tabs.create({
        url: `https://vrchat.com/home/user/${userId}`,
        active: false
      });
    });
  }

  if (userName) {
    userName.addEventListener('click', () => {
      const userId = userName.dataset.userId;
      chrome.tabs.create({
        url: `https://vrchat.com/home/user/${userId}`,
        active: false
      });
    });
  }

  // 再取得ボタン
  const refetchBtn = document.getElementById('refetchBtn');
  if (refetchBtn) {
    refetchBtn.addEventListener('click', () => {
      handleRefetchUser(userId);
    });
  }

  const sortSelect = document.getElementById('worldSortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      worldSortOrder = e.target.value;
      chrome.storage.local.set({ worldSortOrder });
      renderWorlds(userId);
    });
  }

  worldsArea.querySelectorAll('.world-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.world-add-btn')) {
        return;
      }
      const worldId = card.dataset.worldId;
      chrome.tabs.create({
        url: `https://vrchat.com/home/world/${worldId}`,
        active: false
      });
    });
  });

  // ワールド追加ボタン
  worldsArea.querySelectorAll('.world-add-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const worldId = btn.dataset.worldId;
      handleAddWorldToFavorites(worldId);
    });
  });

  const expandBtn = worldsArea.querySelector('.expand-btn');
  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      renderWorldsExpanded(userId);
    });
  }
  applyNotificationStyles();
}
// popup3_user_watch.js v1.2.2 後半

// ============================================================
// v1.2.2 ワールドをお気に入りに追加
// ============================================================

/**
 * ワールドをお気に入りフォルダに追加（デバッグ版）
 * @param {string} worldId - ワールドID
 */
async function handleAddWorldToFavorites(worldId) {
  try {
    if (isProcessing) {
      showNotification(t('errorProcessing'), 'error');
      return;
    }

    isProcessing = true;
    showNotification(t('progressFetchingFolders'), 'info');

    // console.log('[Debug] Starting handleAddWorldToFavorites');
    // console.log('[Debug] worldId:', worldId);
    // console.log('[Debug] PageHelpersShared available:', typeof PageHelpersShared !== 'undefined');

    // 1. フォルダ一覧取得
    // console.log('[Debug] Requesting folders...');
    const foldersResponse = await chrome.runtime.sendMessage({
      type: 'getFolders'
    });

    // console.log('[Debug] Folders response:', foldersResponse);

    // success プロパティがない場合でも、folders が存在すればOK
    if (!foldersResponse || (!foldersResponse.success && !foldersResponse.folders)) {
      console.error('[Debug] Folders error:', foldersResponse?.error || 'No response');
      showNotification(t('errorFoldersFailed') + ': ' + (foldersResponse?.error || 'No response'), 'error');
      isProcessing = false;
      return;
    }

    // console.log('[Debug] Folders count:', foldersResponse.folders?.length || 0);

    // 2. フォルダ一覧を整形（未分類を追加）
    const folders = [
      { id: 'none', name: t('folderNone'), class: 'none' },
      ...(foldersResponse.folders || []).map(f => ({ id: f.id, name: f.name, class: '' }))
    ];

    // console.log('[Debug] Formatted folders:', folders);

    // 3. ワールド情報を取得（ワールド名表示用）
    // console.log('[Debug] Requesting world details...');
    const worldInfoResponse = await chrome.runtime.sendMessage({
      type: 'getSingleWorldDetails',
      worldId: worldId
    });

    // console.log('[Debug] World info response:', worldInfoResponse);

    const worldName = worldInfoResponse && worldInfoResponse.success
      ? worldInfoResponse.world.name
      : 'このワールド';

    // console.log('[Debug] World name:', worldName);

    // 4. フォルダモーダル表示（page-helpers-shared.js使用）
    // console.log('[Debug] Showing folder select modal...');

    // PageHelpersShared が読み込まれていない場合は showNotification にフォールバック
    const notificationFunc = typeof PageHelpersShared !== 'undefined'
      ? PageHelpersShared.showNotification
      : showNotification;

    if (typeof PageHelpersShared === 'undefined') {
      console.error('[Debug] PageHelpersShared is not defined!');
      console.error('[Debug] Please check if page-helpers-shared.js is loaded in HTML');
      notificationFunc(t('errorPageHelpersNotLoaded'), 'error');
      isProcessing = false;
      return;
    }

    PageHelpersShared.showFolderSelectModal({
      title: t('folderSelectTitle'),
      description: t('folderSelectDescription', { world: worldName }),
      folders: folders,
      onConfirm: async (folderId) => {
        try {
          // console.log('[Debug] Folder selected:', folderId);
          showNotification(t('progressSavingWorld'), 'info');

          // 5. ワールドをフォルダに追加
          // console.log('[Debug] Sending addWorldToFolderFromWatch message...');
          const saveResponse = await chrome.runtime.sendMessage({
            type: 'addWorldToFolderFromWatch',
            worldId: worldId,
            folderId: folderId
          });

          // console.log('[Debug] Save response:', saveResponse);

          if (saveResponse && saveResponse.success) {
            const folderName = folderId === 'none' ? t('folderNone') :
              folders.find(f => f.id === folderId)?.name || folderId;

            // console.log('[Debug] Save successful, folder name:', folderName);

            PageHelpersShared.showNotification(
              t('addWorldSuccess', { world: worldName, folder: folderName }),
              'success'
            );
          } else {
            const errorMsg = saveResponse?.userMessage || saveResponse?.message || t('errorAddWorldFailed');
            console.error('[Debug] Save failed:', errorMsg);
            PageHelpersShared.showNotification(errorMsg, 'error');
          }
        } catch (error) {
          console.error('[Debug] Failed to save world:', error);
          PageHelpersShared.showNotification(t('errorGeneric') + ': ' + error.message, 'error');
        } finally {
          isProcessing = false;
        }
      },
      onCancel: () => {
        // console.log('[Debug] User cancelled');
        isProcessing = false;
      }
    });

  } catch (error) {
    console.error('[Debug] Add to favorites error:', error);
    console.error('[Debug] Error stack:', error.stack);
    PageHelpersShared.showNotification(t('errorGeneric') + ': ' + error.message, 'error');
    isProcessing = false;
  }
}

// ============================================================
// 【v1.2.2 修正】ユーザー再取得
// 情報未取得の場合は addUserToWatchList で完全取得
// ============================================================

async function handleRefetchUser(userId) {
  try {
    if (isProcessing) {
      showNotification(t('errorProcessing'), 'error');
      return;
    }

    isProcessing = true;

    const user = watchList.find(u => u.userId === userId);
    if (!user) {
      showNotification(t('errorUserNotFound'), 'error');
      isProcessing = false;
      return;
    }

    // 情報未取得判定
    const isMissing = !user.profilePicUrl ||
      !user.worlds ||
      user.worlds.length === 0 ||
      !user.totalWorldCount;

    if (isMissing) {
      showNotification(t('progressRefetchingFull'), 'info');

      // 完全再取得
      const response = await chrome.runtime.sendMessage({
        type: 'addUserToWatchList',
        userId: userId
      });

      if (response.success) {
        expandedWorldsCache.delete(userId);
        await loadWatchList();
        renderUserList();
        if (selectedUserId === userId) {
          renderWorlds(userId);
        }
        showNotification(t('refetchFullSuccess'), 'success');
      } else {
        showNotification(t('errorRefetchFailed'), 'error');
      }
    } else {
      showNotification(t('progressRefetchingUser'), 'info');

      // 通常のワールド情報更新
      const response = await chrome.runtime.sendMessage({
        type: 'refreshUserWorlds',
        userId: userId
      });

      if (response.success) {
        expandedWorldsCache.delete(userId);
        await loadWatchList();
        renderUserList();
        if (selectedUserId === userId) {
          renderWorlds(userId);
        }
        showNotification(t('refetchSuccess'), 'success');
      } else {
        showNotification(t('errorRefetchFailed'), 'error');
      }
    }
  } catch (error) {
    console.error('Failed to refetch user:', error);
    showNotification(t('errorGeneric'), 'error');
  } finally {
    isProcessing = false;
  }
}

async function renderWorldsExpanded(userId) {
  try {
    const worldsContent = document.querySelector('.worlds-content');
    const scrollTop = worldsContent.scrollTop;

    showNotification(t('progressFetchingAllWorlds'), 'info');

    const response = await chrome.runtime.sendMessage({
      type: 'fetchUserCreatedWorlds',
      userId: userId
    });

    if (!response.success) {
      showNotification(t('errorExpandWorldsFailed'), 'error');
      return;
    }

    expandedWorldsCache.set(userId, response.worlds);
    renderWorlds(userId);

    await nextTick();
    const newWorldsContent = document.querySelector('.worlds-content');
    if (newWorldsContent) {
      newWorldsContent.scrollTop = scrollTop;
    }

    showNotification(t('expandWorldsSuccess', { count: response.worlds.length }), 'success');

  } catch (error) {
    console.error('Failed to expand worlds:', error);
    showNotification(t('errorGeneric'), 'error');
  }
}

function nextTick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// ============================================================
// ユーザーアクション
// ============================================================

async function toggleNotification(userId) {
  const user = watchList.find(u => u.userId === userId);
  if (!user) return;

  const enabled = !(user.notificationEnabled !== false);

  const response = await chrome.runtime.sendMessage({
    type: 'toggleUserNotification',
    userId: userId,
    enabled: enabled
  });

  if (response.success) {
    await loadWatchList();
    renderUserList();
    updateStats();
    if (selectedUserId === userId) renderWorlds(userId);
  }
}

async function markAsChecked(userId) {
  const response = await chrome.runtime.sendMessage({
    type: 'markUserAsChecked',
    userId: userId
  });

  if (response.success) {
    await loadWatchList();
    renderUserList();
    updateStats();
  }
}

// ============================================================
// 削除モーダル
// ============================================================

function showDeleteModal(userId, isMultiple) {
  deleteTarget = isMultiple ? 'multiple' : userId;
  const modal = document.getElementById('deleteModal');
  const modalBody = document.getElementById('deleteModalBody');

  if (isMultiple) {
    modalBody.textContent = t('deleteConfirmMultiple', { count: selectedUserIds.size });
  } else {
    const user = watchList.find(u => u.userId === userId);
    if (!user) {
      console.error('User not found:', userId);
      showNotification(t('errorUserNotFound'), 'error');
      return;
    }
    modalBody.textContent = t('deleteConfirmSingle', { name: user.displayName });
  }

  modal.classList.add('show');
}

function closeDeleteModal() {
  document.getElementById('deleteModal').classList.remove('show');
  deleteTarget = null;
}

async function confirmDelete() {
  const target = deleteTarget;

  if (!target) {
    showNotification(t('errorNoSelection'), 'error');
    return;
  }

  closeDeleteModal();

  if (target === 'multiple') {
    await deleteMultipleUsers();
  } else {
    await deleteSingleUser(target);
  }
}

async function deleteSingleUser(userId) {
  if (!userId || userId === 'null' || userId === 'undefined') {
    showNotification(t('errorInvalidUserId'), 'error');
    console.error('Invalid userId:', userId);
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: 'removeUserFromWatchList',
    userId: userId
  });

  if (response.success) {
    await loadWatchList();

    if (selectedUserId === userId) {
      selectedUserId = null;
      document.getElementById('worldsArea').innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">👈</div>
          <div class="empty-state-text">
            ${t('selectUserPrompt')}
          </div>
        </div>
      `;
    }

    expandedWorldsCache.delete(userId);
    selectedUserIds.delete(userId);
    renderUserList();
    updateStats();
    showNotification(t('deleteUserSuccess'), 'success');
  } else {
    showNotification(response.userMessage || t('errorDeleteFailed'), 'error');
  }
}

async function deleteMultipleUsers() {
  const userIds = Array.from(selectedUserIds);

  if (userIds.length === 0) {
    showNotification(t('errorNoSelection'), 'info');
    return;
  }

  let successCount = 0;

  for (const userId of userIds) {
    const response = await chrome.runtime.sendMessage({
      type: 'removeUserFromWatchList',
      userId: userId
    });

    if (response.success) {
      successCount++;
      expandedWorldsCache.delete(userId);
    }
  }

  await loadWatchList();
  selectedUserIds.clear();

  if (selectedUserId && userIds.includes(selectedUserId)) {
    selectedUserId = null;
    document.getElementById('worldsArea').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👈</div>
        <div class="empty-state-text">
          ${t('selectUserPrompt')}
        </div>
      </div>
    `;
  }

  renderUserList();
  updateStats();
  showNotification(t('deleteMultipleSuccess', { count: successCount }), 'success');
}

// ============================================================
// 選択中のアクション
// ============================================================

function handleDeleteSelected() {
  if (selectedUserIds.size === 0) {
    showNotification(t('errorNoSelection'), 'info');
    return;
  }
  showDeleteModal(null, true);
}

// ============================================================
// 統計更新
// ============================================================

function updateStats() {
  // 統計表示は削除されました
}

// ============================================================
// ユーティリティ
// ============================================================

function isMissingDetails(user) {
  return !user.profilePicUrl ||
    !user.worlds ||
    user.worlds.length === 0 ||
    !user.totalWorldCount;
}

function hasUnread(user) {
  return new Date(user.lastUpdatedAt) > new Date(user.lastCheckedAt);
}

function getUnreadCount(user) {
  if (!hasUnread(user)) return 0;

  const lastChecked = new Date(user.lastCheckedAt);
  return user.worlds.filter(w => new Date(w.updatedAt) > lastChecked).length;
}

function getRelativeTime(dateString) {
  if (!dateString || dateString === '' || dateString === 'none' || dateString === 'null' || dateString === 'undefined') {
    return t('dateNone');
  }

  const date = new Date(dateString);

  if (isNaN(date.getTime())) {
    return t('dateNone');
  }

  const now = new Date();
  const diff = now - date;

  const days = Math.floor(diff / 86400000);

  if (days === 0) return t('dateToday');
  if (days === 1) return t('dateYesterday');
  if (days < 0) return t('dateFuture');
  if (days < 1000) return t('dateDaysAgo', { days });
  return t('dateDaysAgo', { days });
}

function getDaysAgo(dateString) {
  if (!dateString || dateString === '-') return 999;
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  return Math.floor(diff / 86400000);
}

function isWithinDays(dateString, days) {
  return getDaysAgo(dateString) <= days;
}

function formatNumber(num) {
  return num.toLocaleString(currentLanguage === 'ja' ? 'ja-JP' : 'en-US');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showNotification(message, type = 'info') {
  const notification = document.getElementById('notification');
  const notificationMessage = document.getElementById('notificationMessage');

  notification.className = `notification notification-${type} show`;
  notificationMessage.textContent = message;

  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

function updateProgressBar(progress) {
  if (progress.type === 'progress') {
    showNotification(progress.message, 'info');
  } else if (progress.type === 'complete') {
    showNotification(progress.message, 'success');
  } else if (progress.type === 'error') {
    showNotification(progress.message, 'error');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}