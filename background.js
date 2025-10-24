// background.js
console.log('[Background] VRChat World Favorites Manager v1.0.2 (Modular) loaded');

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
// 初期化処理
// ========================================
chrome.runtime.onInstalled.addListener(() => {
  // コンテキストメニュー作成
  chrome.contextMenus.create({
    id: 'vrchat-fav-add',
    title: 'このワールドをお気に入りに追加',
    contexts: ['page', 'link'],
    documentUrlPatterns: [
      'https://vrchat.com/home/world/*',
      'https://vrchat.com/home/launch*'
    ]
  });

  chrome.contextMenus.create({
    id: 'vrchat-fav-add-link',
    title: 'このワールドをChromeに保存',
    contexts: ['link'],
    targetUrlPatterns: [
      'https://vrchat.com/home/world/*',
      'https://vrchat.com/home/launch*'
    ]
  });

  // ストレージ初期化 (bg_storage_service.js)
  initializeStorage();
});

// ========================================
// コンテキストメニュー (修正版)
// ========================================
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if ((info.menuItemId === 'vrchat-fav-add' || info.menuItemId === 'vrchat-fav-add-link') && tab) {
    let worldUrl = info.pageUrl || info.linkUrl;
    const worldMatch = worldUrl.match(/\/world\/(wrld_[a-f0-9-]+)/);
    const instanceMatch = worldUrl.match(/worldId=(wrld_[a-f0-9-]+)/);
    const worldId = worldMatch ? worldMatch[1] : (instanceMatch ? instanceMatch[1] : null);

    if (worldId) {
      try {
        logAction('CONTEXT_MENU_ADD_START', { worldId });
        
        // ワールド詳細を取得
        const details = await getSingleWorldDetailsInternal(worldId);
        
        if (!details) {
          logError('CONTEXT_MENU_FETCH_FAILED', 'Failed to fetch world details', { worldId });
          // 通知を表示（Chrome通知API使用）
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon128.png',
            title: 'VRChat World Manager',
            message: 'ワールド情報の取得に失敗しました'
          });
          return;
        }

        // 既存チェック
        const allWorlds = await getAllWorldsInternal();
        const existing = allWorlds.find(w => w.id === worldId);

        if (existing) {
          // 既に存在する場合は通知のみ
          const folderName = existing.folderId === 'none' ? '未分類' :
            existing.folderId.startsWith('worlds') ? `VRC ${existing.folderId.replace('worlds', '')}` :
            existing.folderId;
          
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon128.png',
            title: 'VRChat World Manager',
            message: `「${details.name}」は既に「${folderName}」に登録済みです`
          });
          logAction('CONTEXT_MENU_ALREADY_EXISTS', { worldId, folderId: existing.folderId });
          return;
        }

        // 未分類フォルダに追加
        const addResult = await addWorldToFolder({
          ...details,
          folderId: 'none'
        });

        if (addResult.success) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon128.png',
            title: 'VRChat World Manager',
            message: `「${details.name}」を未分類に追加しました`
          });
          logAction('CONTEXT_MENU_ADD_SUCCESS', { worldId });
        } else {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon128.png',
            title: 'VRChat World Manager',
            message: `追加に失敗しました: ${addResult.reason || addResult.error}`
          });
          logError('CONTEXT_MENU_ADD_FAILED', addResult.reason || addResult.error, { worldId });
        }

      } catch (e) {
        logError('CONTEXT_MENU_ERROR', e, { worldId });
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon128.png',
          title: 'VRChat World Manager',
          message: 'エラーが発生しました'
        });
      }
    }
  }
});

// ========================================
// 内部ヘルパー関数
// ========================================
async function getSingleWorldDetailsInternal(worldId) {
  try {
    const response = await fetch(`${API_BASE}/worlds/${worldId}`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          id: worldId,
          name: '[Deleted]',
          authorName: null,
          releaseStatus: 'deleted',
          thumbnailImageUrl: null
        };
      }
      return null;
    }

    const data = await response.json();
    return {
      id: data.id,
      name: data.name,
      authorName: data.authorName,
      releaseStatus: data.releaseStatus,
      thumbnailImageUrl: data.thumbnailImageUrl
    };
  } catch (error) {
    logError('GET_WORLD_DETAILS_INTERNAL', error, { worldId });
    return null;
  }
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

    // === VRC API Service ===
    case 'fetchAllVRCFolders':
      fetchAllVRCFolders(sendResponse);
      return true;
    case 'syncAllFavorites':
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