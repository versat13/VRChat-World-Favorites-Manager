// background.js v1.3.0

// ========================================
// Module Loading
// ========================================
importScripts(
  'bg_constants.js',
  'bg_error_handler.js',
  'bg_utils.js',
  'bg_storage_service.js',
  'bg_world_data_model.js',
  'bg_vrc_api_service.js',
  'bg_import_export_service.js',
  'bg_user_service.js',
  'bg_user_watch_notification.js', // 【新規追加】
  // 【v1.4.0リファクタリング】メッセージハンドラーを機能グループ別に分離
  'bg_msg_world_folder.js',
  'bg_msg_vrc_sync.js',
  'bg_msg_user_info.js',
  'bg_msg_watchlist.js'
);

// ========================================
// Global State - Edit Buffer Management
// ========================================
let isEditingList = false;
let editingBuffer = {
  movedWorlds: [],
  deletedWorlds: []
};

// ========================================
// VRC Action Abort Management
// ========================================
const activeVRCProcesses = new Map();

function abortVRCAction(windowId) {
  if (activeVRCProcesses.has(windowId)) {
    activeVRCProcesses.get(windowId).aborted = true;
    activeVRCProcesses.delete(windowId);
    logAction('VRC_ACTION_ABORTED', { windowId });
  }
}

function isVRCActionAborted(windowId) {
  const process = activeVRCProcesses.get(windowId);
  return process && process.aborted;
}

function cleanupVRCAction(windowId) {
  if (activeVRCProcesses.has(windowId)) {
    activeVRCProcesses.delete(windowId);
    logAction('VRC_ACTION_CLEANUP', { windowId });
  }
}

// ========================================
// Context Menu Initialization & Management
// ========================================

let isInitializingContextMenus = false;

async function initializeContextMenus() {
  if (isInitializingContextMenus) {
    logAction('CONTEXT_MENU_INIT_SKIP', 'Already initializing');
    return;
  }

  try {
    isInitializingContextMenus = true;

    await chrome.contextMenus.removeAll();
    logAction('CONTEXT_MENU_REMOVED_ALL', 'Cleared all existing context menus');

    const result = await chrome.storage.sync.get(['settings']);
    const settings = result.settings || {};
    const contextMenuEnabled = settings.enableContextMenu !== false;

    const lang = settings.language || 'ja';

    logAction('CONTEXT_MENU_INIT', {
      enabled: contextMenuEnabled,
      language: lang,
      source: 'settings.enableContextMenu'
    });

    if (!contextMenuEnabled) {
      logAction('CONTEXT_MENU_DISABLED', 'Context menu is disabled by settings');
      return;
    }

    chrome.contextMenus.create({
      id: 'vrchat-fav-add-quick',
      title: getBgTranslation('contextQuickAdd', lang),
      contexts: ['link'],
      targetUrlPatterns: [
        'https://vrchat.com/home/world/*',
        'https://vrchat.com/home/launch?*worldId=wrld_*'
      ]
    });
    logAction('CONTEXT_MENU_CREATED', { id: 'vrchat-fav-add-quick' });

    chrome.contextMenus.create({
      id: 'vrchat-fav-add-select',
      title: getBgTranslation('contextFolderSelect', lang),
      contexts: ['link'],
      targetUrlPatterns: [
        'https://vrchat.com/home/world/*',
        'https://vrchat.com/home/launch?*worldId=wrld_*'
      ]
    });
    logAction('CONTEXT_MENU_CREATED', { id: 'vrchat-fav-add-select' });

  } catch (error) {
    await chrome.contextMenus.removeAll().catch(() => { });
    logError('CONTEXT_MENU_INIT_ERROR', error);
  } finally {
    isInitializingContextMenus = false;
  }
}

// ========================================
// Extract World ID from URL
// ========================================
function extractWorldIdFromUrl(url) {
  if (!url) return null;

  const worldMatch = url.match(/\/world\/(wrld_[a-f0-9-]+)/);
  if (worldMatch) return worldMatch[1];

  const instanceMatch = url.match(/worldId=(wrld_[a-f0-9-]+)/);
  if (instanceMatch) return instanceMatch[1];

  return null;
}

// ========================================
// Case A: Quick Add to Uncategorized
// ========================================
async function handleQuickAdd(info, tab) {
  const { settings } = await chrome.storage.sync.get(['settings']);
  const lang = settings?.language || 'ja';

  try {
    const worldUrl = info.linkUrl || info.pageUrl;
    const worldId = extractWorldIdFromUrl(worldUrl);

    if (!worldId) {
      logError('CONTEXT_MENU_INVALID_URL', 'Invalid world URL', { url: worldUrl });
      showNotification(getBgTranslation('worldIdNotFound', lang), 'error');
      return;
    }

    logAction('CONTEXT_MENU_QUICK_ADD_START', { worldId });

    const details = await getSingleWorldDetailsInternal(worldId);
    if (!details) {
      logError('CONTEXT_MENU_FETCH_FAILED', 'Failed to fetch world details', { worldId });
      showNotification(getBgTranslation('worldDetailsFailed', lang), 'error');
      return;
    }

    const allWorlds = await getAllWorldsInternal();
    const existing = allWorlds.find(w => w.id === worldId);
    if (existing) {
      let folderName = getBgTranslation('uncategorized', lang);
      if (existing.folderId !== 'none') {
        if (existing.folderId.startsWith('worlds')) {
          folderName = `VRC ${existing.folderId.replace('worlds', '')}`;
        } else {
          const sync = await chrome.storage.sync.get(['folders']);
          const folder = (sync.folders || []).find(f => f.id === existing.folderId);
          folderName = folder ? folder.name : existing.folderId;
        }
      }

      showNotification(getBgTranslation('alreadyRegistered', lang, { name: details.name, folder: folderName }), 'info');
      logAction('CONTEXT_MENU_ALREADY_EXISTS', { worldId, folderId: existing.folderId });
      return;
    }

    const addResult = await addWorldToFolder({
      ...details,
      folderId: 'none',
    });

    if (addResult.success) {
      showNotification(getBgTranslation('addedToUncategorized', lang, { name: details.name }), 'success');
      logAction('CONTEXT_MENU_QUICK_ADD_SUCCESS', { worldId });
    } else {
      const errorMsg = addResult.userMessage || addResult.message || getBgTranslation('addFailed', lang);
      showNotification(errorMsg, 'error');
      logError('CONTEXT_MENU_QUICK_ADD_FAILED', addResult.reason || addResult.error, { worldId });
    }

  } catch (error) {
    logError('CONTEXT_MENU_QUICK_ADD_ERROR', error, {
      worldId: extractWorldIdFromUrl(info.linkUrl || info.pageUrl)
    });
    showNotification(getBgTranslation('errorOccurred', lang), 'error');
  }
}

// ========================================
// Case B: Folder Selection
// ========================================
async function handleFolderSelect(info, tab) {
  const { settings } = await chrome.storage.sync.get(['settings']);
  const lang = settings?.language || 'ja';

  try {
    const worldUrl = info.linkUrl || info.pageUrl;
    const worldId = extractWorldIdFromUrl(worldUrl);

    if (!worldId) {
      logError('CONTEXT_MENU_INVALID_URL', 'Invalid world URL', { url: worldUrl });
      showNotification(getBgTranslation('worldIdNotFound', lang), 'error');
      return;
    }

    logAction('CONTEXT_MENU_FOLDER_SELECT_START', { worldId });

    await chrome.storage.local.set({ pendingWorldIdFromContext: worldId });

    await chrome.windows.create({
      url: chrome.runtime.getURL('popup.html'),
      type: 'popup',
      width: 720,
      height: 620,
    });

    logAction('CONTEXT_MENU_FOLDER_SELECT_POPUP_OPENED', { worldId });

  } catch (error) {
    logError('CONTEXT_MENU_FOLDER_SELECT_ERROR', error, {
      worldId: extractWorldIdFromUrl(info.linkUrl || info.pageUrl)
    });
    showNotification(getBgTranslation('errorOccurred', lang), 'error');
  }
}

// ========================================
// Notification Helper
// ========================================
function showNotification(message, type = 'info') {
  try {
    const iconUrl = 'icons/icon128.png';
    const title = 'VRChat World Manager';

    chrome.notifications.create({
      type: 'basic',
      iconUrl: iconUrl,
      title: title,
      message: message,
      priority: type === 'error' ? 2 : 0
    });
  } catch (error) {
    logError('NOTIFICATION_ERROR', error, { message, type });
  }
}

// ========================================
// Initialization
// ========================================
chrome.runtime.onInstalled.addListener(async () => {
  logAction('EXTENSION_INSTALLED', 'Initializing extension');
  await initializeStorage();
  await initializeContextMenus(); // コンテキストメニューはインストール時に設定
});

// 【修正】Service Worker起動時にも初期化
chrome.runtime.onStartup.addListener(async () => {
  logAction('EXTENSION_STARTUP', 'Extension started');
  // トップレベルの実行に任せるため、ここでは何もしない
});

// Service Workerが再起動された時の初期化
(async () => {
  logAction('SERVICE_WORKER_START', 'Service worker activated');
  await initializeContextMenus(); // Service Worker起動時にコンテキストメニューを再設定
  await initWatchNotificationService();
})();

// ========================================
// Context Menu Click Event
// ========================================
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuId = info.menuItemId;
  if (menuId === 'vrchat-fav-add-quick') {
    await handleQuickAdd(info, tab);
  } else if (menuId === 'vrchat-fav-add-select') {
    await handleFolderSelect(info, tab);
  }
});

// ========================================
// Settings Change Listener (Language)
// ========================================
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.settings) {
    const newSettings = changes.settings.newValue;
    const oldSettings = changes.settings.oldValue;

    // 言語設定が変更された場合、コンテキストメニューを再初期化
    if (newSettings && (!oldSettings || newSettings.language !== oldSettings.language)) {
      logAction('LANGUAGE_CHANGED', {
        from: oldSettings?.language,
        to: newSettings.language
      });
      initializeContextMenus();
    }

    // 【v1.3.3追加】ウォッチリストのチェック間隔が変更されたらアラームを再設定
    if (newSettings && (!oldSettings ||
      newSettings.watchListCheckIntervalMinutes !== oldSettings.watchListCheckIntervalMinutes)) {
      logAction('WATCH_LIST_INTERVAL_CHANGED', {
        from: oldSettings?.watchListCheckIntervalMinutes,
        to: newSettings.watchListCheckIntervalMinutes
      });
      if (typeof setupWatchListAlarm === 'function') {
        setupWatchListAlarm();
      }
    }
  }
});

// ========================================
// 【v1.3.3追加】ウォッチリスト定期巡回アラーム
// 【v1.5.0変更】軽量チェックと全件更新の所要時間にほとんど差がなく、
// 二重のコードパスがバグの温床になっていたため、自動巡回は
// 常に全件更新(manualCheckUpdates)を行う方式に統一した。
// ========================================
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === NOTIFICATION_SETTINGS.WATCH_LIST_ALARM_NAME) {
    logAction('WATCH_LIST_ALARM_FIRED');
    manualCheckUpdates();
  }
});

// ========================================
// VRC Bridge Progress Notification Helper
// ========================================

function notifyBridgeWindow(windowId, action, payload = {}) {
  if (!windowId) {
    logError('NOTIFY_BRIDGE_WINDOW', 'windowId is not provided', { action, payload });
    return;
  }

  if (isVRCActionAborted(windowId)) {
    return;
  }

  logAction('NOTIFY_BRIDGE_WINDOW', { windowId, action, payloadKeys: Object.keys(payload) });

  chrome.windows.get(windowId, (window) => {
    if (chrome.runtime.lastError) {
      return;
    }

    chrome.runtime.sendMessage({
      windowId: windowId,
      action: action,
      ...payload
    }, (response) => {
      if (chrome.runtime.lastError) {
        // 受信側がない場合のエラーは無視
      }
    });
  });
}

// ========================================
// Message Handler (Router)
// ========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  logAction('MESSAGE_RECEIVED', { type: request.type });

  const handler = MESSAGE_HANDLERS[request.type];
  if (handler) {
    return handler(request, sendResponse);
  }

  logError('UNKNOWN_MESSAGE', 'Unknown message type', { type: request.type });
  sendResponse({ error: 'Unknown message type' });
});
// ========================================
// メッセージハンドラー ディスパッチマップ
// 実体は bg_msg_*.js に機能グループ別で定義されている
// ========================================
const MESSAGE_HANDLERS = {
  'VRC_SYNC_COMPLETED': handleMsg_VRC_SYNC_COMPLETED,
  'getAllWorlds': handleMsg_getAllWorlds,
  'getVRCWorlds': handleMsg_getVRCWorlds,
  'addWorld': handleMsg_addWorld,
  'removeWorld': handleMsg_removeWorld,
  'updateWorld': handleMsg_updateWorld,
  'moveWorld': handleMsg_moveWorld,
  'batchUpdateWorlds': handleMsg_batchUpdateWorlds,
  'COMMIT_BUFFER': handleMsg_COMMIT_BUFFER,
  'CHECK_RATE_LIMIT': handleMsg_CHECK_RATE_LIMIT,
  'detectDuplicates': handleMsg_detectDuplicates,
  'resolveDuplicates': handleMsg_resolveDuplicates,
  'getFolders': handleMsg_getFolders,
  'addFolder': handleMsg_addFolder,
  'removeFolder': handleMsg_removeFolder,
  'renameFolder': handleMsg_renameFolder,
  'getStorageStats': handleMsg_getStorageStats,
  'START_VRC_ACTION': handleMsg_START_VRC_ACTION,
  'CANCEL_VRC_ACTION': handleMsg_CANCEL_VRC_ACTION,
  'getSettings': handleMsg_getSettings,
  'saveSettings': handleMsg_saveSettings,
  'updateContextMenus': handleMsg_updateContextMenus,
  'resetAllData': handleMsg_resetAllData,
  'fetchAllVRCFolders': handleMsg_fetchAllVRCFolders,
  'syncAllFavorites': handleMsg_syncAllFavorites,
  'getSingleWorldDetails': handleMsg_getSingleWorldDetails,
  'getVRCFavoriteInfo': handleMsg_getVRCFavoriteInfo,
  'moveVRCWorldFolder': handleMsg_moveVRCWorldFolder,
  'addVRCFavorite': handleMsg_addVRCFavorite,
  'deleteVRCFavorite': handleMsg_deleteVRCFavorite,
  'batchImportWorlds': handleMsg_batchImportWorlds,
  'getWorldDetailsForExport': handleMsg_getWorldDetailsForExport,
  'COMMIT_BUFFER_ERROR': handleMsg_COMMIT_BUFFER_ERROR,
  'getWorldInfo': handleMsg_getWorldInfo,
  'fetchUserInfo': handleMsg_fetchUserInfo,
  'fetchUserCreatedWorlds': handleMsg_fetchUserCreatedWorlds,
  'fetchWorldDetailsBatch': handleMsg_fetchWorldDetailsBatch,
  'generateFavoritesCSV': handleMsg_generateFavoritesCSV,
  'generateCreatedWorldsCSV': handleMsg_generateCreatedWorldsCSV,
  'fetchUserWorldCount': handleMsg_fetchUserWorldCount,
  'loadWatchList': handleMsg_loadWatchList,
  'addUserToWatchList': handleMsg_addUserToWatchList,
  'addUserIdsBulk': handleMsg_addUserIdsBulk,
  'removeUserFromWatchList': handleMsg_removeUserFromWatchList,
  'removeMultipleUsersFromWatchList': handleMsg_removeMultipleUsersFromWatchList,
  'refreshUserWorlds': handleMsg_refreshUserWorlds,
  'markUserAsChecked': handleMsg_markUserAsChecked,
  'toggleUserNotification': handleMsg_toggleUserNotification,
  'updateNotificationSetting': handleMsg_updateNotificationSetting,
  'updateGlobalNotificationSetting': handleMsg_updateGlobalNotificationSetting,
  'exportWatchList': handleMsg_exportWatchList,
  'importWatchList': handleMsg_importWatchList,
  'addWorldToFolderFromWatch': handleMsg_addWorldToFolderFromWatch,
  'getUnreadNotifications': handleMsg_getUnreadNotifications,
  'clearUserNotifications': handleMsg_clearUserNotifications,
  'clearAllNotifications': handleMsg_clearAllNotifications,
  'manualCheckUpdates': handleMsg_manualCheckUpdates,
  'getManualCheckProgress': handleMsg_getManualCheckProgress,
  'lightCheckUpdates': handleMsg_lightCheckUpdates,
  'abortWatchListCheck': handleMsg_abortWatchListCheck,
  'getWatchListCount': handleMsg_getWatchListCount,
  'addToWatchList': handleMsg_addToWatchList,
};
