// background.js
console.log('[Background] VRChat World Favorites Manager v1.1.0 (Modular) loaded');

// ========================================
// モジュール読み込み
// ========================================
try {
  importScripts(
    'bg_constants.js',
    'bg_error_handler.js',
    'bg_utils.js',
    'bg_storage_service.js',
    'bg_world_data_model.js',
    'bg_vrc_api_service.js',
    'bg_import_export_service.js'
  );
} catch (e) {
  console.error('[Background] Failed to import scripts:', e);
}

// ========================================
// コンテキストメニュー初期化・管理
// ========================================

/**
 * コンテキストメニューを初期化
 * 設定に応じてメニュー項目を作成
 */
async function initializeContextMenus() {
  try {
    // 既存のメニューをクリア
    await chrome.contextMenus.removeAll();

    // 設定を読み込み
    const result = await chrome.storage.sync.get(['settings']);
    const settings = result.settings || {};

    // enableContextMenu設定の取得（デフォルト: true）
    const contextMenuEnabled = settings.enableContextMenu !== false;

    logAction('CONTEXT_MENU_INIT', { 
      enabled: contextMenuEnabled,
      source: 'settings.enableContextMenu'
    });
    
    if (!contextMenuEnabled) {
      logAction('CONTEXT_MENU_DISABLED', 'Context menu is disabled by settings');
      return;
    }

    // コンテキストメニューを作成
    // どのサイトでも、リンクを右クリックした時に表示
    // ただし、リンク先がVRChatのワールドURLの場合のみ有効
    
    // 案A: 未分類に直接追加
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

    // 案B: フォルダ選択して追加
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
    logError('CONTEXT_MENU_INIT_ERROR', error);
  }
}

// ========================================
// URLからワールドIDを抽出
// ========================================
function extractWorldIdFromUrl(url) {
  if (!url) return null;

  // パターン1: /home/world/wrld_xxx
  const worldMatch = url.match(/\/world\/(wrld_[a-f0-9-]+)/);
  if (worldMatch) return worldMatch[1];

  // パターン2: ?worldId=wrld_xxx
  const instanceMatch = url.match(/worldId=(wrld_[a-f0-9-]+)/);
  if (instanceMatch) return instanceMatch[1];

  return null;
}


// ========================================
// 案A: 未分類に直接追加
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

    // ワールド詳細を取得
    const details = await getSingleWorldDetailsInternal(worldId); 
    if (!details) {
      logError('CONTEXT_MENU_FETCH_FAILED', 'Failed to fetch world details', { worldId });
      showNotification('ワールド情報の取得に失敗しました', 'error');
      return;
    }

    // 既存チェック
    const allWorlds = await getAllWorldsInternal(); 
    const existing = allWorlds.find(w => w.id === worldId);
    if (existing) {
      // 既に存在する場合は通知のみ
      let folderName = '未分類';
      if (existing.folderId !== 'none') {
        if (existing.folderId.startsWith('worlds')) {
          folderName = `VRC ${existing.folderId.replace('worlds', '')}`;
        } else {
          // カスタムフォルダ名を取得
          const sync = await chrome.storage.sync.get(['folders']);
          const folder = (sync.folders || []).find(f => f.id === existing.folderId);
          folderName = folder ? folder.name : existing.folderId;
        }
      }

      showNotification(`「${details.name}」は既に「${folderName}」に登録済みです`, 'info');
      logAction('CONTEXT_MENU_ALREADY_EXISTS', { worldId, folderId: existing.folderId });
      return;
    }

    // 未分類フォルダに追加
    const addResult = await addWorldToFolder({ 
      ...details,
      folderId: 'none',
    });

    if (addResult.success) {
      showNotification(`「${details.name}」を未分類に追加しました`, 'success');
      logAction('CONTEXT_MENU_QUICK_ADD_SUCCESS', { worldId });
    } else {
      const errorMessage =
        addResult.reason === 'sync_limit_exceeded'
          ? '共有ストレージが上限に達しています'
          : addResult.reason === 'sync_bytes_exceeded'
          ? '共有ストレージの容量上限を超えています'
          : `追加に失敗しました: ${addResult.reason || addResult.error}`;

      showNotification(errorMessage, 'error');
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
// 案B: フォルダ選択
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

    // worldIdをローカルストレージに保存
    await chrome.storage.local.set({ pendingWorldIdFromContext: worldId });

    // ポップアップウィンドウを開く
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
// 通知ヘルパー関数
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
    // notifications APIが使えない場合はログのみ
    logError('NOTIFICATION_ERROR', error, { message, type });
  }
}

// ========================================
// 初期化処理
// ========================================
chrome.runtime.onInstalled.addListener(async () => {
  logAction('EXTENSION_INSTALLED', 'Initializing extension');
  
  // ストレージ初期化
  await initializeStorage();
  
  // コンテキストメニュー初期化
  await initializeContextMenus();
});

// 起動時にもコンテキストメニューを初期化（重要！）
chrome.runtime.onStartup.addListener(async () => {
  logAction('EXTENSION_STARTUP', 'Extension started');
  await initializeContextMenus();
});

// ========================================
// コンテキストメニュークリックイベント
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
// VRChat連携ブリッジ用 進捗通知ヘルパー
// ========================================

/**
 * VRC同期ブリッジウィンドウに進捗状況を通知する
 * @param {number} windowId - 対象のウィンドウID (popup2_vrc_bridge.jsが起動しているウィンドウ)
 * @param {string} action - 'VRC_ACTION_PROGRESS' or 'VRC_ACTION_COMPLETE' or 'VRC_ACTION_ERROR'
 * @param {object} payload - 通知内容
 */
function notifyBridgeWindow(windowId, action, payload = {}) {
  if (!windowId) {
    logError('NOTIFY_BRIDGE_WINDOW', 'windowId is not provided', { action, payload });
    return;
  }
  
  logAction('NOTIFY_BRIDGE_WINDOW', { windowId, action, payloadKeys: Object.keys(payload) });
  
  // chrome.runtime.sendMessage で全てのリスナーに送信
  // popup2_vrc_bridge.js側でwindowIdをチェックしてフィルタリング
  chrome.runtime.sendMessage({
    windowId: windowId, // フィルタリング用
    action: action,
    ...payload
  }, (response) => {
    if (chrome.runtime.lastError) {
      // ウィンドウが閉じられた場合などは警告レベル
      logError('NOTIFY_BRIDGE_SEND_FAILED', chrome.runtime.lastError.message, { windowId, action });
    }
  });
}


// ========================================
// メッセージハンドラ (ルーター)
// ========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  logAction('MESSAGE_RECEIVED', { type: request.type });

  switch (request.type) {
    // === World Data Model ===
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
      commitBuffer(request, sendResponse);
      return true;
    case 'detectDuplicates':
      detectDuplicates(sendResponse);
      return true;

    // === Folder Data Model ===
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

    // === Storage Service ===
    case 'getStorageStats':
      getStorageStats(sendResponse);
      return true;

    // === VRC API Service (ブリッジウィンドウからの新規エントリポイント) ===
    case 'START_VRC_ACTION':
      handleVRCAction(request, sendResponse);
      return true;
      
    // === Settings ===
    case 'getSettings':
      getSettings(sendResponse);
      return true;
    case 'saveSettings':
      saveSettings(request.settings, sendResponse);
      return true;
    
    // === Context Menu ===
    case 'updateContextMenus': 
      initializeContextMenus().then(() => sendResponse({ success: true }));
      return true;
    
    // === Data Reset ===
    case 'resetAllData':
      resetAllData(sendResponse);
      return true;

    // === VRC API Service (旧/単発呼び出し用 - 非推奨化) ===
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

    // === Import/Export Service ===
    case 'batchImportWorlds':
      batchImportWorlds(request, sendResponse);
      return true;
    case 'getWorldDetailsForExport':
      getAllWorldDetailsForExport(sendResponse);
      return true;

    default:
      logError('UNKNOWN_MESSAGE', 'Unknown message type', { type: request.type });
      sendResponse({ error: 'Unknown message type' });
  }
});

// ========================================
// VRCアクションハンドラ (修正版)
// ========================================

/**
 * VRChatブリッジウィンドウからのアクション開始要求を処理
 * @param {object} request - { type: 'START_VRC_ACTION', actionType: 'FETCH'|'REFLECT', windowId: number }
 * @param {Function} sendResponse - レスポンス送信関数
 */
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
  
  // 即座にレスポンスを返して、その後は notifyBridgeWindow でブリッジに通知
  sendResponse({ success: true, message: 'Processing started' });
  
  // 非同期処理は別の関数として実行（sendResponseの後に実行される）
  startVRCActionAsync(actionType, windowId);
}

/**
 * 非同期VRCアクション処理（分離版）
 * @param {string} actionType - 'FETCH' または 'REFLECT'
 * @param {number} windowId - ブリッジウィンドウのID
 */
async function startVRCActionAsync(actionType, windowId) {
  try {
    // startVRChatSyncProcess は bg_vrc_api_service.js で定義されているはず
    await startVRChatSyncProcess( 
      actionType,
      (action, payload) => notifyBridgeWindow(windowId, action, payload)
    );
  } catch (error) {
    logError('VRC_ACTION_FAILED', error, { actionType, windowId });
    notifyBridgeWindow(windowId, 'VRC_ACTION_ERROR', { 
      error: error.message || 'Unknown error' 
    });
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
    sendResponse({ success: false, error: error.message });
  }
}

async function saveSettings(settings, sendResponse) {
  try {
    await chrome.storage.sync.set({ settings });
    sendResponse({ success: true });
  } catch (error) {
    logError('SAVE_SETTINGS', error);
    sendResponse({ success: false, error: error.message });
  }
}

// ========================================
// Data Reset
// ========================================

/**
 * すべてのワールドとフォルダデータをリセット
 * 設定は保持する
 * @param {Function} sendResponse - レスポンス送信関数
 */
async function resetAllData(sendResponse) {
  try {
    logAction('RESET_ALL_DATA_START', 'Starting data reset');
    
    // chrome.storage.sync からワールドとフォルダを削除
    const syncKeys = await chrome.storage.sync.get(null);
    const keysToRemove = [];
    
    for (const key in syncKeys) {
      // 'settings' 以外のキーを削除
      if (key !== 'settings') {
        keysToRemove.push(key);
      }
    }
    
    if (keysToRemove.length > 0) {
      await chrome.storage.sync.remove(keysToRemove);
    }
    
    // chrome.storage.local も完全クリア
    await chrome.storage.local.clear();
    
    logAction('RESET_ALL_DATA_SUCCESS', { 
      syncKeysRemoved: keysToRemove.length,
      localCleared: true
    });
    
    sendResponse({ success: true });
  } catch (error) {
    logError('RESET_ALL_DATA_ERROR', error);
    sendResponse({ success: false, error: error.message });
  }
}