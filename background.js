// background.js v1.2.2 (ブロードキャスト修正版)

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
  'bg_import_export_service.js'
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

    logAction('CONTEXT_MENU_INIT', {
      enabled: contextMenuEnabled,
      source: 'settings.enableContextMenu'
    });

    if (!contextMenuEnabled) {
      logAction('CONTEXT_MENU_DISABLED', 'Context menu is disabled by settings');
      return;
    }

    chrome.contextMenus.create({
      id: 'vrchat-fav-add-quick',
      title: 'このワールドを未分類に追加',
      contexts: ['link'],
      targetUrlPatterns: [
        'https://vrchat.com/home/world/*',
        'https://vrchat.com/home/launch?*worldId=wrld_*'
      ]
    });
    logAction('CONTEXT_MENU_CREATED', { id: 'vrchat-fav-add-quick' });

    chrome.contextMenus.create({
      id: 'vrchat-fav-add-select',
      title: 'このワールドをフォルダに保存...',
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
  try {
    const worldUrl = info.linkUrl || info.pageUrl;
    const worldId = extractWorldIdFromUrl(worldUrl);

    if (!worldId) {
      logError('CONTEXT_MENU_INVALID_URL', 'Invalid world URL', { url: worldUrl });
      showNotification('ワールドIDを取得できませんでした', 'error');
      return;
    }

    logAction('CONTEXT_MENU_QUICK_ADD_START', { worldId });

    const details = await getSingleWorldDetailsInternal(worldId);
    if (!details) {
      logError('CONTEXT_MENU_FETCH_FAILED', 'Failed to fetch world details', { worldId });
      showNotification('ワールド情報の取得に失敗しました', 'error');
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

      showNotification(`「${details.name}」は既に「${folderName}」に登録済みです`, 'info');
      logAction('CONTEXT_MENU_ALREADY_EXISTS', { worldId, folderId: existing.folderId });
      return;
    }

    const addResult = await addWorldToFolder({
      ...details,
      folderId: 'none',
    });

    if (addResult.success) {
      showNotification(`「${details.name}」を未分類に追加しました`, 'success');
      logAction('CONTEXT_MENU_QUICK_ADD_SUCCESS', { worldId });
    } else {
      const errorMsg = addResult.userMessage || addResult.message || '追加に失敗しました';
      showNotification(errorMsg, 'error');
      logError('CONTEXT_MENU_QUICK_ADD_FAILED', addResult.reason || addResult.error, { worldId });
    }

  } catch (e) {
    logError('CONTEXT_MENU_QUICK_ADD_ERROR', e, {
      worldId: extractWorldIdFromUrl(info.linkUrl || info.pageUrl)
    });
    showNotification('エラーが発生しました', 'error');
  }
}

// ========================================
// Case B: Folder Selection
// ========================================
async function handleFolderSelect(info, tab) {
  try {
    const worldUrl = info.linkUrl || info.pageUrl;
    const worldId = extractWorldIdFromUrl(worldUrl);

    if (!worldId) {
      logError('CONTEXT_MENU_INVALID_URL', 'Invalid world URL', { url: worldUrl });
      showNotification('ワールドIDを取得できませんでした', 'error');
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

  } catch (e) {
    logError('CONTEXT_MENU_FOLDER_SELECT_ERROR', e, {
      worldId: extractWorldIdFromUrl(info.linkUrl || info.pageUrl)
    });
    showNotification('エラーが発生しました', 'error');
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
  await initializeContextMenus();
});

chrome.runtime.onStartup.addListener(async () => {
  logAction('EXTENSION_STARTUP', 'Extension started');
  await initializeContextMenus();
});

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
        return;
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
        // ★シンプル化: chrome.runtime.sendMessage() だけで全popupに配信される
        chrome.runtime.sendMessage(progress, (response) => {
          // 受信側がない場合のエラーは無視
          if (chrome.runtime.lastError) {
            // エラーログは出さない（正常動作）
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
      console.warn('[Background] Deprecated: fetchAllVRCFolders called. Use START_VRC_ACTION.');
      fetchAllVRCFolders(sendResponse);
      return true;

    case 'syncAllFavorites':
      console.warn('[Background] Deprecated: syncAllFavorites called. Use START_VRC_ACTION.');
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
      // ★追加: エラーメッセージを全popupにブロードキャスト
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

    default:
      logError('UNKNOWN_MESSAGE', 'Unknown message type', { type: request.type });
      sendResponse({ error: 'Unknown message type' });
  }
});

// ========================================
// VRC Action Handler
// ========================================

function handleVRCAction(request, sendResponse) {
  const { actionType, windowId } = request;

  if (!actionType || !windowId) {
    sendResponse({
      success: false,
      error: 'Invalid request: actionType and windowId are required'
    });
    return;
  }

  logAction('VRC_ACTION_START', { actionType, windowId });

  activeVRCProcesses.set(windowId, { aborted: false });

  sendResponse({ success: true, message: 'Processing started' });

  startVRCActionAsync(actionType, windowId);
}

async function startVRCActionAsync(actionType, windowId) {
  try {
    const result = await startVRChatSyncProcess(
      actionType,
      windowId,
      (action, payload) => notifyBridgeWindow(windowId, action, payload)
    );

    if (!isVRCActionAborted(windowId)) {
      notifyBridgeWindow(windowId, 'VRC_ACTION_COMPLETE', result);
    }
  } catch (error) {
    logError('VRC_ACTION_FAILED', error, { actionType, windowId });

    if (!isVRCActionAborted(windowId)) {
      notifyBridgeWindow(windowId, 'VRC_ACTION_ERROR', {
        error: error.message || 'Unknown error'
      });
    }
  } finally {
    cleanupVRCAction(windowId);
  }
}

// ========================================
// Settings Management
// ========================================

async function getSettings(sendResponse) {
  try {
    const result = await chrome.storage.sync.get(['settings']);
    sendResponse({
      success: true,
      settings: result.settings || {
        theme: 'dark',
        language: 'ja',
        enableVrcSiteIntegration: true,
        enableContextMenu: true
      }
    });
  } catch (error) {
    logError('GET_SETTINGS', error);
    sendResponse(createGenericError(error.message));
  }
}

async function saveSettings(settings, sendResponse) {
  try {
    await chrome.storage.sync.set({ settings });
    sendResponse(createSuccessResponse());
  } catch (error) {
    logError('SAVE_SETTINGS', error);
    sendResponse(createGenericError(error.message));
  }
}

// ========================================
// Data Reset
// ========================================

async function resetAllData(sendResponse) {
  try {
    logAction('RESET_ALL_DATA_START', 'Starting data reset');

    const syncKeys = await chrome.storage.sync.get(null);
    const keysToRemove = [];

    for (const key in syncKeys) {
      if (key !== 'settings') {
        keysToRemove.push(key);
      }
    }

    if (keysToRemove.length > 0) {
      await chrome.storage.sync.remove(keysToRemove);
    }

    await chrome.storage.local.clear();

    logAction('RESET_ALL_DATA_SUCCESS', {
      syncKeysRemoved: keysToRemove.length,
      localCleared: true
    });

    sendResponse(createSuccessResponse());
  } catch (error) {
    logError('RESET_ALL_DATA_ERROR', error);
    sendResponse(createGenericError(error.message));
  }
}