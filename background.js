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
  'bg_user_watch_notification.js' // 【新規追加】
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
      let folderName = '未分類';
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

  switch (request.type) {
    // ============================================================
    // 既存のメッセージハンドラー
    // ============================================================

    case 'VRC_SYNC_COMPLETED':
      sendResponse({ received: true });
      return true;

    case 'getAllWorlds':
      getAllWorlds(sendResponse);
      return true;

    case 'getVRCWorlds':
      getVRCWorlds(sendResponse);
      return true;

    case 'addWorld':
      addWorld(request.world, sendResponse);
      return true;

    case 'removeWorld':
      removeWorld(request.worldId, request.folderId, sendResponse);
      return true;

    case 'updateWorld':
      updateWorld(request.world, sendResponse);
      return true;

    case 'moveWorld':
      moveWorld(request.worldId, request.fromFolder, request.toFolder, request.newFavoriteId, sendResponse);
      return true;

    case 'batchUpdateWorlds':
      batchUpdateWorlds(request.changes, sendResponse);
      return true;

    case 'COMMIT_BUFFER':
      commitBuffer(request, sendResponse, (progress) => {
        chrome.runtime.sendMessage(progress, (response) => {
          if (chrome.runtime.lastError) {
            // エラーログは出さない(正常動作)
          }
        });
      });
      return true;

    case 'CHECK_RATE_LIMIT':
      const waitMs = rateLimiter.getWaitTime();
      sendResponse({
        needsWait: waitMs > 0,
        waitSeconds: Math.ceil(waitMs / 1000)
      });
      return true;

    case 'detectDuplicates':
      detectDuplicates(sendResponse);
      return true;

    case 'resolveDuplicates':
      resolveDuplicates(request.strategy || 'keep_first', sendResponse);
      return true;

    case 'getFolders':
      getFolders(sendResponse);
      return true;

    case 'addFolder':
      addFolder(sendResponse);
      return true;

    case 'removeFolder':
      removeFolder(request.folderId, sendResponse);
      return true;

    case 'renameFolder':
      renameFolder(request.folderId, request.newName, sendResponse);
      return true;

    case 'getStorageStats':
      getStorageStats(sendResponse);
      return true;

    case 'START_VRC_ACTION':
      handleVRCAction(request, sendResponse);
      return true;

    case 'CANCEL_VRC_ACTION':
      abortVRCAction(request.windowId);
      sendResponse({ success: true });
      return true;

    case 'getSettings':
      getSettings(sendResponse);
      return true;

    case 'saveSettings':
      saveSettings(request.settings, sendResponse);
      return true;

    case 'updateContextMenus':
      initializeContextMenus().then(() => sendResponse({ success: true }));
      return true;

    case 'resetAllData':
      resetAllData(sendResponse);
      return true;

    case 'fetchAllVRCFolders':
      if (WARN_LOG) console.warn('[Background] Deprecated: fetchAllVRCFolders called. Use START_VRC_ACTION.');
      fetchAllVRCFolders(sendResponse);
      return true;

    case 'syncAllFavorites':
      if (WARN_LOG) console.warn('[Background] Deprecated: syncAllFavorites called. Use START_VRC_ACTION.');
      syncAllFavorites(sendResponse);
      return true;

    case 'getSingleWorldDetails':
      getSingleWorldDetails(request.worldId, sendResponse);
      return true;

    case 'getVRCFavoriteInfo':
      getVRCFavoriteInfo(request.worldId, sendResponse);
      return true;

    case 'moveVRCWorldFolder':
      moveVRCWorldFolder(request.worldId, request.favoriteRecordId, request.fromFolder, request.toFolder, sendResponse);
      return true;

    case 'addVRCFavorite':
      addVRCFavorite(request.worldId, request.folderId, sendResponse);
      return true;

    case 'deleteVRCFavorite':
      deleteVRCFavorite(request.favoriteRecordId, sendResponse);
      return true;

    case 'batchImportWorlds':
      batchImportWorlds(request, sendResponse);
      return true;

    case 'getWorldDetailsForExport':
      getAllWorldDetailsForExport(sendResponse);
      return true;

    case 'COMMIT_BUFFER_ERROR':
      chrome.runtime.sendMessage({
        action: 'COMMIT_BUFFER_ERROR',
        error: request.error || 'Unknown error'
      }, (response) => {
        if (chrome.runtime.lastError) {
          // 受信側がない場合は無視
        }
      });
      sendResponse({ received: true });
      return true;

    // ============================================================
    // ユーザー情報取得機能(既存)
    // ============================================================

    case 'getWorldInfo':
      (async () => {
        try {
          const result = await fetchWorldInfo(request.worldId);
          sendResponse(result);
        } catch (error) {
          logError('GET_WORLD_INFO_HANDLER', error);
          sendResponse(createGenericError(error.message));
        }
      })();
      return true;

    case 'fetchUserInfo':
      (async () => {
        try {
          const result = await fetchUserInfo(request.userIdOrName);
          sendResponse(result);
        } catch (error) {
          logError('FETCH_USER_INFO_HANDLER', error);
          sendResponse(createGenericError(error.message));
        }
      })();
      return true;

    case 'fetchUserCreatedWorlds':
      (async () => {
        try {
          const progressCallback = (progress) => {
            chrome.runtime.sendMessage({
              type: 'userCreatedWorldsProgress',
              data: progress
            }).catch(() => {
              // ウィンドウが閉じられている場合はエラーを無視
            });
          };

          const result = await fetchUserCreatedWorlds(
            request.userId,
            progressCallback
          );

          sendResponse(result);
        } catch (error) {
          logError('FETCH_USER_CREATED_WORLDS_HANDLER', error);
          sendResponse(createGenericError(error.message));
        }
      })();
      return true;

    case 'fetchWorldDetailsBatch':
      (async () => {
        try {
          const progressCallback = (progress) => {
            chrome.runtime.sendMessage({
              type: 'userFavoritesProgress',
              data: progress
            }).catch(() => { });
          };

          const result = await fetchWorldDetailsBatch(
            request.worldIds,
            progressCallback
          );

          sendResponse(result);
        } catch (error) {
          logError('FETCH_WORLD_DETAILS_BATCH_HANDLER', error);
          sendResponse(createGenericError(error.message));
        }
      })();
      return true;

    case 'generateFavoritesCSV':
      try {
        const csv = generateFavoritesCSV(
          request.favorites,
          request.worldDetails || {},
          request.includeDetails
        );

        sendResponse({
          success: true,
          csv: csv
        });
      } catch (error) {
        logError('GENERATE_FAVORITES_CSV_HANDLER', error);
        sendResponse(createGenericError(error.message));
      }
      return true;

    case 'generateCreatedWorldsCSV':
      try {
        const csv = generateCreatedWorldsCSV(request.worlds);

        sendResponse({
          success: true,
          csv: csv
        });
      } catch (error) {
        logError('GENERATE_CREATED_WORLDS_CSV_HANDLER', error);
        sendResponse(createGenericError(error.message));
      }
      return true;

    case 'fetchUserWorldCount':
      (async () => {
        try {
          const result = await fetchUserWorldCount(request.userId);
          sendResponse(result);
        } catch (error) {
          logError('FETCH_USER_WORLD_COUNT_HANDLER', error);
          sendResponse(createGenericError(error.message));
        }
      })();
      return true;

    // ============================================================
    // ウォッチリスト管理
    // ============================================================

    case 'loadWatchList':
      (async () => {
        try {
          const watchList = await loadWatchList();
          sendResponse({ success: true, watchList });
        } catch (error) {
          logError('LOAD_WATCH_LIST_HANDLER', error);
          sendResponse(createGenericError(error.message));
        }
      })();
      return true;

    case 'addUserToWatchList':
      (async () => {
        try {
          const progressCallback = (progress) => {
            chrome.runtime.sendMessage({
              type: 'watchListProgress',
              data: progress
            }).catch(() => {
              // ウィンドウが閉じられている場合はエラーを無視
            });
          };

          const result = await addUserToWatchList(
            request.userId,
            progressCallback
          );

          sendResponse(result);
        } catch (error) {
          logError('ADD_USER_TO_WATCH_LIST_HANDLER', error);
          sendResponse(createGenericError(error.message));
        }
      })();
      return true;

    case 'removeUserFromWatchList':
      (async () => {
        try {
          const result = await removeUserFromWatchList(request.userId);
          sendResponse(result);
        } catch (error) {
          logError('REMOVE_USER_FROM_WATCH_LIST_HANDLER', error);
          sendResponse(createGenericError(error.message));
        }
      })();
      return true;

    case 'refreshUserWorlds':
      (async () => {
        try {
          const progressCallback = (progress) => {
            chrome.runtime.sendMessage({
              type: 'watchListProgress',
              data: progress
            }).catch(() => { });
          };

          const result = await refreshUserWorlds(
            request.userId,
            progressCallback
          );

          sendResponse(result);
        } catch (error) {
          logError('REFRESH_USER_WORLDS_HANDLER', error);
          sendResponse(createGenericError(error.message));
        }
      })();
      return true;

    case 'markUserAsChecked':
      (async () => {
        try {
          const result = await markUserAsChecked(request.userId);
          sendResponse(result);
        } catch (error) {
          logError('MARK_USER_AS_CHECKED_HANDLER', error);
          sendResponse(createGenericError(error.message));
        }
      })();
      return true;

    case 'toggleUserNotification':
      (async () => {
        try {
          const result = await toggleUserNotification(request.userId, request.enabled);
          sendResponse(result);
        } catch (error) {
          logError('TOGGLE_USER_NOTIFICATION_HANDLER', error);
          sendResponse(createGenericError(error.message));
        }
      })();
      return true;

    case 'updateNotificationSetting':
      (async () => {
        try {
          const result = await updateNotificationSetting(
            request.userId,
            request.setting,
            request.enabled
          );
          sendResponse(result);
        } catch (error) {
          logError('UPDATE_NOTIFICATION_SETTING_HANDLER', error);
          sendResponse(createGenericError(error.message));
        }
      })();
      return true;

    case 'updateGlobalNotificationSetting':
      (async () => {
        try {
          const result = await updateGlobalNotificationSetting(
            request.setting,
            request.enabled
          );
          sendResponse(result);
        } catch (error) {
          logError('UPDATE_GLOBAL_NOTIFICATION_SETTING_HANDLER', error);
          sendResponse(createGenericError(error.message));
        }
      })();
      return true;

    case 'exportWatchList':
      (async () => {
        try {
          const result = await exportWatchListData();
          sendResponse(result);
        } catch (error) {
          logError('EXPORT_WATCH_LIST_HANDLER', error);
          sendResponse(createGenericError(error.message));
        }
      })();
      return true;

    case 'importWatchList':
      (async () => {
        try {
          const result = await importWatchListData(request.watchListIds);
          sendResponse(result);
        } catch (error) {
          logError('IMPORT_WATCH_LIST_HANDLER', error);
          sendResponse(createGenericError(error.message));
        }
      })();
      return true;


    // 【v1.2.2 新規追加】ウォッチリストからワールドをフォルダに追加
    case 'addWorldToFolderFromWatch':
      (async () => {
        try {
          // 1. ワールド詳細取得
          const details = await getSingleWorldDetailsInternal(request.worldId);

          if (!details) {
            sendResponse(createGenericError('ワールド情報の取得に失敗しました'));
            return;
          }

          // 2. 既存チェック（重複防止）
          const allWorlds = await getAllWorldsInternal();
          const existing = allWorlds.find(w => w.id === request.worldId);

          if (existing) {
            // フォルダ名を取得して通知
            let folderName = '未分類';
            if (existing.folderId !== 'none') {
              if (existing.folderId.startsWith('worlds')) {
                folderName = `VRC ${existing.folderId.replace('worlds', '')}`;
              } else {
                const sync = await chrome.storage.sync.get(['folders']);
                const folder = (sync.folders || []).find(f => f.id === existing.folderId);
                folderName = folder ? folder.name : existing.folderId;
              }
            }

            sendResponse({
              success: false,
              reason: 'already_exists',
              userMessage: `「${details.name}」は既に「${folderName}」に登録済みです`
            });
            return;
          }

          // 3. フォルダに追加（既存関数を利用）
          const result = await addWorldToFolder({
            ...details,
            folderId: request.folderId
          });

          sendResponse(result);
        } catch (error) {
          logError('ADD_WORLD_TO_FOLDER_FROM_WATCH_ERROR', error);
          sendResponse(createGenericError(error.message));
        }
      })();
      return true;

    // ============================================================
    // 【新規追加 v1.2.1】通知関連
    // ============================================================

    case 'getUnreadNotifications':
      try {
        const result = getUnreadNotifications();
        sendResponse(result);
      } catch (error) {
        logError('GET_UNREAD_NOTIFICATIONS_HANDLER', error);
        sendResponse(createGenericError(error.message));
      }
      return true;

    case 'clearUserNotifications':
      (async () => {
        try {
          const result = await clearUserNotifications(request.userId);
          sendResponse(result);
        } catch (error) {
          logError('CLEAR_USER_NOTIFICATIONS_HANDLER', error);
          sendResponse(createGenericError(error.message));
        }
      })();
      return true;

    case 'clearAllNotifications':
      (async () => {
        try {
          const result = await clearAllNotifications();
          sendResponse(result);
        } catch (error) {
          logError('CLEAR_ALL_NOTIFICATIONS_HANDLER', error);
          sendResponse(createGenericError(error.message));
        }
      })();
      return true;

    case 'manualCheckUpdates':
      (async () => {
        try {
          const result = await manualCheckUpdates();
          sendResponse(result || { success: false, error: 'No response from manualCheckUpdates' });
        } catch (error) {
          logError('MANUAL_CHECK_UPDATES_HANDLER', error);
          sendResponse(createGenericError(error.message));
        }
      })();
      return true;

    // ============================================================
    // ウォッチリスト件数取得
    // ============================================================

    case 'getWatchListCount':
      (async () => {
        try {
          const result = await getWatchListCount();
          sendResponse(result);
        } catch (error) {
          logError('GET_WATCH_LIST_COUNT_HANDLER', error);
          sendResponse({ success: false, count: 0, error: error.message });
        }
      })();
      return true;

    // ============================================================
    // ウォッチリスト追加（エイリアス）
    // ============================================================

    case 'addToWatchList':
      (async () => {
        try {
          let userId = request.userId;
          let authorName = request.authorName;

          // worldIdが渡された場合は、まず作者情報を取得
          if (request.worldId && !userId) {
            const worldInfoResponse = await fetchWorldInfo(request.worldId);
            if (!worldInfoResponse.success || !worldInfoResponse.world.authorId) {
              sendResponse({
                success: false,
                reason: 'author_fetch_failed',
                userMessage: '作者情報の取得に失敗しました'
              });
              return;
            }
            userId = worldInfoResponse.world.authorId;
            authorName = worldInfoResponse.world.authorName;
          }

          if (!userId) {
            sendResponse({
              success: false,
              reason: 'no_user_id',
              userMessage: 'ユーザーIDが指定されていません'
            });
            return;
          }

          const result = await addUserToWatchList(userId);

          // 成功レスポンスにauthorNameを追加して返す
          if (result.success) {
            sendResponse({
              ...result,
              authorName: authorName || result.user?.displayName
            });
          } else {
            sendResponse(result);
          }
        } catch (error) {
          logError('ADD_TO_WATCH_LIST_HANDLER', error);
          sendResponse(createGenericError(error.message));
        }
      })();
      return true;

    // ============================================================
    // デフォルト(不明なメッセージ)
    // ============================================================

    default:
      logError('UNKNOWN_MESSAGE', 'Unknown message type', { type: request.type });
      sendResponse({ error: 'Unknown message type' });
  }
});