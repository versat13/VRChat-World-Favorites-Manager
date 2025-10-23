// background.js - v8.2 (前半: 初期化～基本操作)

console.log('[Background] VRChat World Favorites Manager v8.2 loaded');

// ========================================
// 定数定義（追加）
// ========================================
const SYNC_WORLD_LIMIT = 800;
const VRC_FOLDER_LIMIT = 150;
const VRC_FOLDER_SYNC_LIMIT = 100;
const API_BASE = 'https://vrchat.com/api/1';
const DETAILS_CHUNK_SIZE = 50; // worldDetails分割保存用

// バッチサイズ（安全重視）
const BATCH_SIZE = {
  sync: 50,   // syncストレージ: 50件ずつ
  local: 50  // localストレージ: 50件ずつ
};

// レート制限対策
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
    title: 'このワールドをお気に入りに追加',
    contexts: ['link'],
    targetUrlPatterns: [
      'https://vrchat.com/home/world/*',
      'https://vrchat.com/home/launch*'
    ]
  });

  initializeStorage();
});

// ストレージ初期化
async function initializeStorage() {
  const sync = await chrome.storage.sync.get(['folders', 'worlds', 'vrcFolderData']);
  const local = await chrome.storage.local.get(['vrcWorlds', 'worldDetails']);

  if (!sync.folders) await chrome.storage.sync.set({ folders: [] });
  if (!sync.worlds) await chrome.storage.sync.set({ worlds: [] });
  if (!local.vrcWorlds) await chrome.storage.local.set({ vrcWorlds: [] });

  // 旧形式のworldDetailsが存在する場合、分割形式に移行
  if (local.worldDetails && Object.keys(local.worldDetails).length > 0) {
    logAction('MIGRATE_WORLD_DETAILS', { count: Object.keys(local.worldDetails).length });
    await saveWorldDetailsBatch(local.worldDetails);
    await chrome.storage.local.remove(['worldDetails']);
  }

  // vrcFolderDataは初回はundefinedだが、fetchAllVRCFoldersで自動更新されるため
  // ここでは固定値を設定しない
  if (!sync.vrcFolderData) {
    await chrome.storage.sync.set({ vrcFolderData: {} });
  }
}

// ========================================
// コンテキストメニュー
// ========================================
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if ((info.menuItemId === 'vrchat-fav-add' || info.menuItemId === 'vrchat-fav-add-link') && tab) {
    let worldUrl = info.pageUrl || info.linkUrl;
    const worldMatch = worldUrl.match(/\/world\/(wrld_[a-f0-9-]+)/);
    const instanceMatch = worldUrl.match(/worldId=(wrld_[a-f0-9-]+)/);

    const worldId = worldMatch ? worldMatch[1] : (instanceMatch ? instanceMatch[1] : null);

    if (worldId && tab.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'openAddWorldModalFromContext',
          worldId: worldId
        });
      } catch (e) {
        console.log('[Background] Tab message failed:', e);
      }
    }
  }
});

// ========================================
// メッセージハンドラ
// ========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Background] Message:', request.type);

  switch (request.type) {
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
    case 'detectDuplicates':
      detectDuplicates(sendResponse);
      return true;
    case 'fetchAllVRCFolders':
      fetchAllVRCFolders(sendResponse);
      return true;
    case 'syncAllFavorites':
      syncAllFavorites(sendResponse);
      return true;
    // background_update2で追加
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
      batchImportWorlds(request.worlds, request.targetFolder, sendResponse);
      return true;
    case 'getWorldDetailsForExport':
      getAllWorldDetailsForExport(sendResponse);
      return true;
    // background_update2でここまで追加
    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

// ========================================
// 全ワールド取得（修正）
// ========================================
async function getAllWorlds(sendResponse) {
  try {
    const sync = await chrome.storage.sync.get(['worlds']);
    const local = await chrome.storage.local.get(['vrcWorlds']);

    const syncWorlds = sync.worlds || [];
    const vrcWorlds = local.vrcWorlds || [];
    const details = await getAllWorldDetailsInternal();

    const syncWorldsWithDetails = syncWorlds.map(sw => ({
      id: sw.id,
      name: details[sw.id]?.name || sw.id,
      authorName: details[sw.id]?.authorName || null,
      releaseStatus: details[sw.id]?.releaseStatus || null,
      thumbnailImageUrl: details[sw.id]?.thumbnailImageUrl || null,
      folderId: sw.folderId
    }));

    const allWorlds = [...syncWorldsWithDetails, ...vrcWorlds];
    sendResponse({ worlds: allWorlds });
  } catch (error) {
    logError('GET_ALL_WORLDS', error);
    sendResponse({ error: error.message, worlds: [] });
  }
}

// ========================================
// VRCワールド一覧取得
// ========================================
async function getVRCWorlds(sendResponse) {
  try {
    const local = await chrome.storage.local.get(['vrcWorlds']);
    sendResponse({ vrcWorlds: local.vrcWorlds || [] });
  } catch (error) {
    console.error('[Background] Error getting VRC worlds:', error);
    sendResponse({ error: error.message, vrcWorlds: [] });
  }
}

// ========================================
// ワールド追加（修正）
// ========================================
async function addWorld(world, sendResponse) {
  try {
    if (!world || !world.id || !world.name) {
      sendResponse({ success: false, error: 'Invalid world data' });
      return;
    }

    const folderId = world.folderId || 'none';
    const allWorlds = await getAllWorldsInternal();
    const existing = allWorlds.find(w => w.id === world.id);

    if (existing) {
      if (existing.folderId === folderId) {
        sendResponse({ success: false, reason: 'already_exists_same_folder' });
        return;
      }
      sendResponse({
        success: false,
        reason: 'already_exists_different_folder',
        existingFolder: existing.folderId,
        worldName: world.name
      });
      return;
    }

    if (folderId.startsWith('worlds')) {
      if (world.releaseStatus === 'private' || world.releaseStatus === 'deleted') {
        sendResponse({ success: false, reason: 'private_world', worldName: world.name });
        return;
      }

      const vrcWorlds = await getVRCFolderWorlds(folderId);
      if (vrcWorlds.length >= VRC_FOLDER_LIMIT) {
        sendResponse({ success: false, reason: 'vrc_limit_exceeded' });
        return;
      }

      const local = await chrome.storage.local.get(['vrcWorlds']);
      const vrcWorldsList = local.vrcWorlds || [];
      vrcWorldsList.push({
        id: world.id,
        name: world.name,
        authorName: world.authorName || null,
        releaseStatus: world.releaseStatus || null,
        thumbnailImageUrl: world.thumbnailImageUrl || null,
        folderId: folderId,
        favoriteRecordId: world.favoriteRecordId || null
      });
      await chrome.storage.local.set({ vrcWorlds: vrcWorldsList });

    } else {
      const sync = await chrome.storage.sync.get(['worlds']);
      const syncWorlds = sync.worlds || [];

      if (syncWorlds.length >= SYNC_WORLD_LIMIT) {
        sendResponse({ success: false, reason: 'sync_limit_exceeded' });
        return;
      }

      syncWorlds.push({ id: world.id, folderId: folderId });
      await chrome.storage.sync.set({ worlds: syncWorlds });

      // worldDetails を分割保存
      await saveWorldDetails(world.id, {
        name: world.name,
        authorName: world.authorName || null,
        releaseStatus: world.releaseStatus || null,
        thumbnailImageUrl: world.thumbnailImageUrl || null
      });
    }

    logAction('WORLD_ADDED', { worldId: world.id, folderId });
    sendResponse({ success: true });
  } catch (error) {
    logError('ADD_WORLD', error);
    sendResponse({ success: false, error: error.message });
  }
}

// ========================================
// ワールド削除（修正）
// ========================================
async function removeWorld(worldId, folderId, sendResponse) {
  try {
    if (folderId.startsWith('worlds')) {
      const local = await chrome.storage.local.get(['vrcWorlds']);
      const vrcWorlds = (local.vrcWorlds || []).filter(w => w.id !== worldId);
      await chrome.storage.local.set({ vrcWorlds });
    } else {
      const sync = await chrome.storage.sync.get(['worlds']);
      const syncWorlds = sync.worlds || [];
      const filtered = syncWorlds.filter(w => w.id !== worldId);
      await chrome.storage.sync.set({ worlds: filtered });

      await deleteWorldDetails(worldId);
    }

    logAction('WORLD_REMOVED', { worldId, folderId });
    sendResponse({ success: true });
  } catch (error) {
    logError('REMOVE_WORLD', error);
    sendResponse({ success: false, error: error.message });
  }
}

// ========================================
// ワールド更新（修正）
// ========================================
async function updateWorld(world, sendResponse) {
  try {
    if (!world || !world.id) {
      sendResponse({ success: false, error: 'Invalid world data' });
      return;
    }

    const folderId = world.folderId;

    if (folderId.startsWith('worlds')) {
      const local = await chrome.storage.local.get(['vrcWorlds']);
      const vrcWorlds = local.vrcWorlds || [];
      const index = vrcWorlds.findIndex(w => w.id === world.id);

      if (index !== -1) {
        vrcWorlds[index] = {
          ...vrcWorlds[index],
          name: world.name || vrcWorlds[index].name,
          authorName: world.authorName !== undefined ? world.authorName : vrcWorlds[index].authorName,
          releaseStatus: world.releaseStatus !== undefined ? world.releaseStatus : vrcWorlds[index].releaseStatus,
          thumbnailImageUrl: world.thumbnailImageUrl !== undefined ? world.thumbnailImageUrl : vrcWorlds[index].thumbnailImageUrl,
          favoriteRecordId: world.favoriteRecordId !== undefined ? world.favoriteRecordId : vrcWorlds[index].favoriteRecordId
        };
        await chrome.storage.local.set({ vrcWorlds });
      }

    } else {
      await saveWorldDetails(world.id, {
        name: world.name,
        authorName: world.authorName || null,
        releaseStatus: world.releaseStatus || null,
        thumbnailImageUrl: world.thumbnailImageUrl || null
      });
    }

    logAction('WORLD_UPDATED', { worldId: world.id });
    sendResponse({ success: true });
  } catch (error) {
    logError('UPDATE_WORLD', error);
    sendResponse({ success: false, error: error.message });
  }
}

// ========================================
// ワールド移動（個別 + 100件チェック追加）
// ========================================
async function moveWorld(worldId, fromFolder, toFolder, newFavoriteRecordId, sendResponse) {
  logAction('MOVE_WORLD_START', { worldId, fromFolder, toFolder });

  try {
    if (fromFolder === toFolder) {
      logAction('MOVE_WORLD_SKIP', { worldId, reason: 'same_folder' });
      sendResponse({ success: true });
      return;
    }

    const allWorlds = await getAllWorldsInternal();
    const world = allWorlds.find(w => w.id === worldId);

    if (!world) {
      logError('MOVE_WORLD_NOT_FOUND', worldId);
      sendResponse({ success: false, error: 'World not found' });
      return;
    }

    const isVRCToVRC = fromFolder.startsWith('worlds') && toFolder.startsWith('worlds');
    const isToVRC = toFolder.startsWith('worlds');
    // 注: VRC同期用フォルダ間の移動は、プライベート/削除済みワールドも例外として許可
    // (VRC公式に存在する場合、拡張機能側も完全一致させるため)
    if (isToVRC && !isVRCToVRC &&
      (world.releaseStatus === 'private' || world.releaseStatus === 'deleted')) {
      logError('MOVE_WORLD_RESTRICTED', 'Private/Deleted world', { worldId, releaseStatus: world.releaseStatus });
      sendResponse({
        success: false,
        reason: 'private_world_move_restricted',
        worldName: world.name
      });
      return;
    }

    if (isToVRC) {
      const targetFolderWorlds = await getVRCFolderWorlds(toFolder);
      if (targetFolderWorlds.length >= VRC_FOLDER_LIMIT) {
        logError('MOVE_WORLD_LIMIT', 'VRC folder limit exceeded', { toFolder, count: targetFolderWorlds.length });
        sendResponse({
          success: false,
          reason: 'vrc_limit_exceeded',
          worldName: world.name
        });
        return;
      }
    }

    await removeWorldFromFolder(worldId, fromFolder);

    const worldToAdd = {
      ...world,
      folderId: toFolder,
      favoriteRecordId: newFavoriteRecordId || world.favoriteRecordId
    };

    const addResult = await addWorldToFolder(worldToAdd);

    if (!addResult.success) {
      logError('MOVE_WORLD_ADD_FAILED', addResult, { worldId, toFolder });
      sendResponse(addResult);
      return;
    }

    logAction('MOVE_WORLD_SUCCESS', { worldId, fromFolder, toFolder });
    sendResponse({ success: true });
  } catch (error) {
    logError('MOVE_WORLD_ERROR', error, { worldId, fromFolder, toFolder });
    sendResponse({ success: false, error: error.message });
  }
}

// ========================================
// フォルダ操作
// ========================================
async function getFolders(sendResponse) {
  try {
    const sync = await chrome.storage.sync.get(['folders', 'vrcFolderData']);

    const vrcFolderData = sync.vrcFolderData || {
      worlds1: { name: 'worlds1', displayName: 'Favorite World 1' },
      worlds2: { name: 'worlds2', displayName: 'Favorite World 2' },
      worlds3: { name: 'worlds3', displayName: 'Favorite World 3' },
      worlds4: { name: 'worlds4', displayName: 'Favorite World 4' }
    };

    const vrcFolders = Object.entries(vrcFolderData).map(([id, data]) => ({
      id,
      displayName: data.displayName,
      apiName: data.name
    }));

    sendResponse({
      folders: sync.folders || [],
      vrcFolders: vrcFolders
    });
  } catch (error) {
    console.error('[Background] Error getting folders:', error);
    sendResponse({ error: error.message, folders: [], vrcFolders: [] });
  }
}

async function addFolder(sendResponse) {
  try {
    const sync = await chrome.storage.sync.get(['folders']);
    const folders = sync.folders || [];

    const existingNumbers = folders
      .map(f => parseInt(f.id.replace('folder', '')))
      .filter(n => !isNaN(n));

    let newNumber = 1;
    while (existingNumbers.includes(newNumber)) {
      newNumber++;
    }

    const newFolder = {
      id: `folder${newNumber}`,
      name: `Folder ${newNumber}`
    };

    folders.push(newFolder);
    await chrome.storage.sync.set({ folders });

    console.log('[Background] Folder added:', newFolder.id);
    sendResponse({ success: true, folder: newFolder });
  } catch (error) {
    console.error('[Background] Error adding folder:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function removeFolder(folderId, sendResponse) {
  try {
    const sync = await chrome.storage.sync.get(['folders', 'worlds']);
    const folders = sync.folders || [];
    const worlds = sync.worlds || [];

    const filtered = folders.filter(f => f.id !== folderId);
    await chrome.storage.sync.set({ folders: filtered });

    const updatedWorlds = worlds.map(w =>
      w.folderId === folderId ? { ...w, folderId: 'none' } : w
    );

    await chrome.storage.sync.set({ worlds: updatedWorlds });

    console.log('[Background] Folder removed:', folderId);
    sendResponse({ success: true });
  } catch (error) {
    console.error('[Background] Error removing folder:', error);
    sendResponse({ success: false, error: error.message });
  }
}

async function renameFolder(folderId, newName, sendResponse) {
  try {
    const sync = await chrome.storage.sync.get(['folders']);
    const folders = sync.folders || [];
    const folder = folders.find(f => f.id === folderId);

    if (folder) {
      folder.name = newName;
      await chrome.storage.sync.set({ folders });
      console.log('[Background] Folder renamed:', folderId, '->', newName);
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'Folder not found' });
    }
  } catch (error) {
    console.error('[Background] Error renaming folder:', error);
    sendResponse({ success: false, error: error.message });
  }
}
// background.js - v8.3 (後半: バッチ処理・VRC API・ヘルパー関数)

// ========================================
// バッチ処理（分類ロジック修正）
// ========================================
async function batchUpdateWorlds(changes, sendResponse) {
  logBatch('START', {
    movedCount: changes.movedWorlds?.length || 0,
    deletedCount: changes.deletedWorlds?.length || 0
  });

  try {
    const { movedWorlds = [], deletedWorlds = [] } = changes;

    if (movedWorlds.length === 0 && deletedWorlds.length === 0) {
      logBatch('EMPTY', 'No changes');
      sendResponse({ success: true, movedCount: 0, deletedCount: 0 });
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // すべての変更を一括処理（分類せずに統合バッチで処理）
    const allChanges = [
      ...movedWorlds.map(m => ({ type: 'move', ...m })),
      ...deletedWorlds.map(d => ({ type: 'delete', ...d }))
    ];

    logBatch('CLASSIFIED', { totalChanges: allChanges.length });

    // 統合バッチ処理（50件ずつ）
    for (let i = 0; i < allChanges.length; i += BATCH_SIZE.sync) {
      const batch = allChanges.slice(i, i + BATCH_SIZE.sync);
      logBatch('UNIFIED_BATCH', { batch: i / BATCH_SIZE.sync + 1, size: batch.length });

      const result = await processUnifiedBatch(batch);
      successCount += result.success;
      errorCount += result.errors;
      errors.push(...result.errorMessages);

      await sleep(500);
    }

    logBatch('COMPLETE', { successCount, errorCount });

    sendResponse({
      success: errorCount === 0,
      movedCount: successCount,
      errorCount: errorCount,
      errors: errors.length > 0 ? errors : null
    });
  } catch (error) {
    logError('BATCH_UPDATE_ERROR', error);
    sendResponse({ success: false, error: error.message });
  }
}

// ========================================
// 統合バッチ処理（新規）
// ========================================
async function processUnifiedBatch(batch) {
  logBatch('UNIFIED_BATCH_START', { size: batch.length });

  try {
    const sync = await chrome.storage.sync.get(['worlds']);
    const local = await chrome.storage.local.get(['vrcWorlds']);

    let syncWorlds = sync.worlds || [];
    let vrcWorlds = local.vrcWorlds || [];
    let detailsChanged = false;

    let successCount = 0;
    const errorMessages = [];

    for (const change of batch) {
      try {
        if (change.type === 'delete') {
          const fromIsVRC = change.folderId.startsWith('worlds');

          if (fromIsVRC) {
            // VRCフォルダから削除
            const beforeLength = vrcWorlds.length;
            vrcWorlds = vrcWorlds.filter(w => w.id !== change.worldId);
            if (vrcWorlds.length < beforeLength) {
              successCount++;
              logAction('VRC_DELETE', { worldId: change.worldId });
            } else {
              errorMessages.push(`${change.worldId}: Not found in VRC`);
              logError('VRC_DELETE_NOT_FOUND', change.worldId);
            }
          } else {
            // 通常フォルダから削除
            const beforeLength = syncWorlds.length;
            syncWorlds = syncWorlds.filter(w => w.id !== change.worldId);
            if (syncWorlds.length < beforeLength) {
              await deleteWorldDetails(change.worldId);
              successCount++;
              logAction('SYNC_DELETE', { worldId: change.worldId });
            } else {
              errorMessages.push(`${change.worldId}: Not found in sync`);
              logError('SYNC_DELETE_NOT_FOUND', change.worldId);
            }
          }

        } else if (change.type === 'move') {
          const fromIsVRC = change.fromFolder.startsWith('worlds');
          const toIsVRC = change.toFolder.startsWith('worlds');

          if (fromIsVRC && toIsVRC) {
            // VRC→VRC: vrcWorlds内で移動
            const index = vrcWorlds.findIndex(w => w.id === change.worldId);
            if (index !== -1) {
              vrcWorlds[index].folderId = change.toFolder;
              successCount++;
              logAction('VRC_TO_VRC_MOVE', {
                worldId: change.worldId,
                from: change.fromFolder,
                to: change.toFolder
              });
            } else {
              errorMessages.push(`${change.worldId}: Not found in VRC (from: ${change.fromFolder})`);
              logError('VRC_TO_VRC_NOT_FOUND', change.worldId, { from: change.fromFolder, to: change.toFolder });
            }

          } else if (fromIsVRC && !toIsVRC) {
            // VRC→通常: vrcWorldsから削除、syncに追加
            const vrcIndex = vrcWorlds.findIndex(w => w.id === change.worldId);
            if (vrcIndex !== -1) {
              const vrcWorld = vrcWorlds[vrcIndex];
              vrcWorlds.splice(vrcIndex, 1);

              syncWorlds.push({ id: change.worldId, folderId: change.toFolder });

              await saveWorldDetails(change.worldId, {
                name: vrcWorld.name,
                authorName: vrcWorld.authorName,
                releaseStatus: vrcWorld.releaseStatus,
                thumbnailImageUrl: vrcWorld.thumbnailImageUrl
              });
              detailsChanged = true;

              successCount++;
              logAction('VRC_TO_SYNC_MOVE', { worldId: change.worldId, to: change.toFolder });
            } else {
              errorMessages.push(`${change.worldId}: Not found in VRC (from: ${change.fromFolder})`);
              logError('VRC_TO_SYNC_NOT_FOUND', change.worldId, { from: change.fromFolder });
            }

          } else if (!fromIsVRC && toIsVRC) {
            // 通常→VRC: syncから削除、vrcWorldsに追加
            const syncIndex = syncWorlds.findIndex(w => w.id === change.worldId);
            if (syncIndex !== -1) {
              syncWorlds.splice(syncIndex, 1);

              const details = await getWorldDetails(change.worldId);
              if (details) {
                vrcWorlds.push({
                  id: change.worldId,
                  name: details.name,
                  authorName: details.authorName,
                  releaseStatus: details.releaseStatus,
                  thumbnailImageUrl: details.thumbnailImageUrl,
                  folderId: change.toFolder,
                  favoriteRecordId: null
                });

                successCount++;
                logAction('SYNC_TO_VRC_MOVE', { worldId: change.worldId, to: change.toFolder });
              } else {
                errorMessages.push(`${change.worldId}: Details not found`);
                logError('SYNC_TO_VRC_DETAILS_NOT_FOUND', change.worldId);
              }
            } else {
              errorMessages.push(`${change.worldId}: Not found in sync (from: ${change.fromFolder})`);
              logError('SYNC_TO_VRC_NOT_FOUND', change.worldId, { from: change.fromFolder });
            }

          } else {
            // 通常→通常: sync内で移動
            const index = syncWorlds.findIndex(w => w.id === change.worldId);
            if (index !== -1) {
              syncWorlds[index].folderId = change.toFolder;
              successCount++;
              logAction('SYNC_TO_SYNC_MOVE', { worldId: change.worldId, to: change.toFolder });
            } else {
              errorMessages.push(`${change.worldId}: Not found in sync (from: ${change.fromFolder})`);
              logError('SYNC_TO_SYNC_NOT_FOUND', change.worldId, { from: change.fromFolder });
            }
          }
        }
      } catch (e) {
        errorMessages.push(`${change.worldId || 'unknown'}: ${e.message}`);
        logError('UNIFIED_BATCH_ITEM_ERROR', e, change);
      }
    }

    // 1回の書き込み
    await chrome.storage.sync.set({ worlds: syncWorlds });
    await chrome.storage.local.set({ vrcWorlds });

    logBatch('UNIFIED_BATCH_COMPLETE', { success: successCount, errors: batch.length - successCount });

    return { success: successCount, errors: batch.length - successCount, errorMessages };
  } catch (error) {
    logError('UNIFIED_BATCH_ERROR', error);
    return { success: 0, errors: batch.length, errorMessages: [error.message] };
  }
}

// ========================================
// バッチインポート（修正）
// ========================================
async function batchImportWorlds(worlds, targetFolder, sendResponse) {
  logAction('BATCH_IMPORT_START', { count: worlds.length, targetFolder });

  try {
    const allWorlds = await getAllWorldsInternal();
    const existingIds = new Set(allWorlds.map(w => w.id));

    const toAdd = [];
    const toMove = [];
    const skipped = [];

    for (const world of worlds) {
      const existing = allWorlds.find(w => w.id === world.id);

      if (!existing) {
        toAdd.push({ ...world, folderId: targetFolder });
      } else if (existing.folderId !== targetFolder) {
        toMove.push({
          worldId: world.id,
          fromFolder: existing.folderId,
          toFolder: targetFolder
        });
      } else {
        skipped.push(world.id);
      }
    }

    logAction('BATCH_IMPORT_CLASSIFIED', {
      toAdd: toAdd.length,
      toMove: toMove.length,
      skipped: skipped.length
    });

    let addedCount = 0;
    let movedCount = 0;
    const errors = [];

    if (toAdd.length > 0) {
      const isVRCFolder = targetFolder.startsWith('worlds');

      if (isVRCFolder) {
        const vrcWorlds = await getVRCFolderWorlds(targetFolder);
        if (vrcWorlds.length + toAdd.length > VRC_FOLDER_LIMIT) {
          logError('BATCH_IMPORT_VRC_LIMIT', `Would exceed limit: ${vrcWorlds.length + toAdd.length}`);
          sendResponse({
            success: false,
            reason: 'vrc_limit_exceeded',
            addedCount: 0,
            movedCount: 0,
            skippedCount: skipped.length
          });
          return;
        }

        const local = await chrome.storage.local.get(['vrcWorlds']);
        const vrcWorldsList = local.vrcWorlds || [];

        for (const world of toAdd) {
          if (world.releaseStatus === 'private' || world.releaseStatus === 'deleted') {
            errors.push(`${world.id}: Private/Deleted world`);
            continue;
          }
          vrcWorldsList.push(world);
          addedCount++;
        }

        await chrome.storage.local.set({ vrcWorlds: vrcWorldsList });
        logAction('BATCH_IMPORT_VRC_ADDED', { count: addedCount });

      } else {
        const sync = await chrome.storage.sync.get(['worlds']);
        const syncWorlds = sync.worlds || [];

        if (syncWorlds.length + toAdd.length > SYNC_WORLD_LIMIT) {
          logError('BATCH_IMPORT_SYNC_LIMIT', `Would exceed limit: ${syncWorlds.length + toAdd.length}`);
          sendResponse({
            success: false,
            reason: 'sync_limit_exceeded',
            addedCount: 0,
            movedCount: 0,
            skippedCount: skipped.length
          });
          return;
        }

        // worldDetailsを分割保存用に準備
        const detailsToSave = {};

        for (const world of toAdd) {
          syncWorlds.push({ id: world.id, folderId: targetFolder });
          detailsToSave[world.id] = {
            name: world.name,
            authorName: world.authorName || null,
            releaseStatus: world.releaseStatus || null,
            thumbnailImageUrl: world.thumbnailImageUrl || null
          };
          addedCount++;
        }

        await chrome.storage.sync.set({ worlds: syncWorlds });
        await saveWorldDetailsBatch(detailsToSave);
        logAction('BATCH_IMPORT_SYNC_ADDED', { count: addedCount });
      }
    }

    if (toMove.length > 0) {
      const moveResponse = await new Promise((resolve) => {
        batchUpdateWorlds({ movedWorlds: toMove, deletedWorlds: [] }, resolve);
      });

      if (moveResponse.success) {
        movedCount = moveResponse.movedCount;
        logAction('BATCH_IMPORT_MOVED', { count: movedCount });
      } else {
        errors.push(...(moveResponse.errors || []));
        logError('BATCH_IMPORT_MOVE_FAILED', moveResponse.errors);
      }
    }

    logAction('BATCH_IMPORT_COMPLETE', { addedCount, movedCount, skippedCount: skipped.length });

    sendResponse({
      success: errors.length === 0,
      addedCount,
      movedCount,
      skippedCount: skipped.length,
      errors: errors.length > 0 ? errors : null
    });

  } catch (error) {
    logError('BATCH_IMPORT_ERROR', error);
    sendResponse({ success: false, error: error.message });
  }
}

// ========================================
// 旧バッチ処理関数を削除
// ========================================
// processSyncBatch と processLocalBatch は削除

// ========================================
// エクスポート用の全worldDetails取得（新規）
// ========================================
async function getAllWorldDetailsForExport(sendResponse) {
  try {
    const details = await getAllWorldDetailsInternal();
    sendResponse({ worldDetails: details });
  } catch (error) {
    logError('GET_WORLD_DETAILS_FOR_EXPORT', error);
    sendResponse({ error: error.message, worldDetails: {} });
  }
}


// ========================================
// ストレージ統計
// ========================================
async function getStorageStats(sendResponse) {
  try {
    const syncBytes = await chrome.storage.sync.getBytesInUse();
    const localBytes = await chrome.storage.local.getBytesInUse();

    const sync = await chrome.storage.sync.get(['worlds', 'folders']);
    const local = await chrome.storage.local.get(['vrcWorlds']);

    const syncWorldCount = (sync.worlds || []).length;
    const worlds1Count = (local.vrcWorlds || []).filter(w => w.folderId === 'worlds1').length;
    const worlds2Count = (local.vrcWorlds || []).filter(w => w.folderId === 'worlds2').length;
    const worlds3Count = (local.vrcWorlds || []).filter(w => w.folderId === 'worlds3').length;
    const worlds4Count = (local.vrcWorlds || []).filter(w => w.folderId === 'worlds4').length;

    const stats = {
      sync: {
        bytes: syncBytes,
        maxBytes: chrome.storage.sync.QUOTA_BYTES,
        percentage: ((syncBytes / chrome.storage.sync.QUOTA_BYTES) * 100).toFixed(2),
        worldCount: syncWorldCount,
        maxWorlds: SYNC_WORLD_LIMIT,
        folderCount: (sync.folders || []).length
      },
      local: {
        bytes: localBytes,
        worlds1Count, worlds2Count, worlds3Count, worlds4Count
      }
    };

    console.log('[Background] Storage stats:', stats);
    sendResponse(stats);
  } catch (error) {
    console.error('[Background] Error getting stats:', error);
    sendResponse({ error: error.message });
  }
}

// ========================================
// 重複検出
// ========================================
async function detectDuplicates(sendResponse) {
  try {
    const allWorlds = await getAllWorldsInternal();
    const worldMap = new Map();
    const duplicates = [];

    for (const world of allWorlds) {
      if (worldMap.has(world.id)) {
        const existing = worldMap.get(world.id);
        duplicates.push({
          worldId: world.id,
          worldName: world.name,
          folders: [existing.folderId, world.folderId]
        });
      } else {
        worldMap.set(world.id, world);
      }
    }

    console.log(`[Background] Found ${duplicates.length} duplicates`);
    sendResponse({ duplicates });
  } catch (error) {
    console.error('[Background] Error detecting duplicates:', error);
    sendResponse({ error: error.message, duplicates: [] });
  }
}

// ========================================
// VRChat API関連(基礎関数のみ)
// ========================================

// VRChatフォルダグループ一覧取得
async function fetchVRChatFavoriteGroups() {
  console.log('[API] Fetching favorite groups...');
  const response = await fetch(`${API_BASE}/favorite/groups`, {
    method: 'GET',
    credentials: 'include'
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('VRChatにログインしていません');
    throw new Error(`Group API error: ${response.status}`);
  }

  const groups = await response.json();
  const worldGroups = groups.filter(g => g.type === 'world');
  console.log(`[API] Found ${worldGroups.length} world groups`);
  return worldGroups;
}

// VRChatフォルダ別お気に入り取得
async function fetchVRChatFavoritesByTag(tag) {
  const n = 100;
  console.log(`[API] Fetching favorites for ${tag}...`);
  const response = await fetch(`${API_BASE}/favorites?n=${n}&type=world&tag=${tag}`, {
    method: 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    if (response.status === 401) throw new Error('VRChatにログインしていません');
    throw new Error(`API error (${tag}): ${response.status}`);
  }

  const favorites = await response.json();
  console.log(`[API] Got ${favorites.length} favorites from ${tag}`);
  return favorites;
}

// VRChatフォルダデータを更新
async function updateVRCFolderData(worldGroups) {
  const vrcFolderData = {};

  // VRC公式のフォルダを worlds1~4 の順序でマッピング
  const folderIds = ['worlds1', 'worlds2', 'worlds3', 'worlds4'];
  
  for (let i = 0; i < worldGroups.length && i < 4; i++) {
    const group = worldGroups[i];
    const mappedId = folderIds[i];
    
    vrcFolderData[mappedId] = {
      name: group.name,           // VRC公式の内部名(vrc0等)
      displayName: group.displayName,
      vrcApiName: group.name      // API呼び出し用に保存
    };
  }

  await chrome.storage.sync.set({ vrcFolderData });
  console.log('[API] VRC folder data updated:', vrcFolderData);
  return vrcFolderData;
}

// ========================================
// page-favorites.js用: 単一操作専用
// ========================================

/**
 * VRChatから特定ワールドのお気に入り情報を取得
 * @param {string} worldId - wrld_xxx形式のワールドID
 */
async function getVRCFavoriteInfo(worldId, sendResponse) {
  try {
    console.log(`[VRC API] Getting favorite info for ${worldId}`);

    const response = await fetch(`${API_BASE}/favorites?type=world&favoriteId=${worldId}`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 401) {
        sendResponse({ success: false, error: 'VRChatにログインしていません' });
        return;
      }
      sendResponse({ success: false, error: `API error: ${response.status}` });
      return;
    }

    const data = await response.json();

    if (data.length === 0) {
      // お気に入り未登録
      console.log(`[VRC API] ${worldId} is not favorited`);
      sendResponse({ success: true, favorited: false });
      return;
    }

    // お気に入り登録済み
    const favorite = data[0];
    console.log(`[VRC API] ${worldId} is favorited in ${favorite.tags?.[0]}, ID: ${favorite.id}`);

    sendResponse({
      success: true,
      favorited: true,
      favoriteRecordId: favorite.id,
      folderId: favorite.tags?.[0] || 'worlds1'
    });
  } catch (error) {
    console.error('[Background] Error getting VRC favorite info:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * VRChatお気に入りをフォルダ移動（削除→追加）
 * ロールバック機能付き
 */
async function moveVRCWorldFolder(worldId, favoriteRecordId, fromFolder, toFolder, sendResponse) {
  try {
    console.log(`[VRC Move] ${worldId}: ${fromFolder} → ${toFolder}`);

    // 同じフォルダへの移動は無視
    if (fromFolder === toFolder) {
      sendResponse({ success: true, message: '同じフォルダです' });
      return;
    }

    // Step 1: 削除
    console.log(`[VRC Move] Deleting from ${fromFolder}...`);
    const deleteResponse = await fetch(`${API_BASE}/favorites/${favoriteRecordId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!deleteResponse.ok) {
      throw new Error(`削除失敗: ${deleteResponse.status}`);
    }

    console.log('[VRC Move] Delete success');
    await sleep(300); // レート制限対策

    // Step 2: 新しいフォルダに追加
    console.log(`[VRC Move] Adding to ${toFolder}...`);
    const addResponse = await fetch(`${API_BASE}/favorites`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'world',
        favoriteId: worldId,
        tags: [toFolder]
      })
    });

    if (!addResponse.ok) {
      console.error('[VRC Move] Add failed, attempting rollback...');

      // ロールバック: 元のフォルダに再追加
      const rollbackResponse = await fetch(`${API_BASE}/favorites`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'world',
          favoriteId: worldId,
          tags: [fromFolder]
        })
      });

      if (rollbackResponse.ok) {
        const rollbackData = await rollbackResponse.json();
        console.log('[VRC Move] Rollback success, new ID:', rollbackData.id);
        sendResponse({
          success: false,
          error: `移動先への追加に失敗しましたが、元のフォルダに復元しました`,
          rolledBack: true,
          newFavoriteRecordId: rollbackData.id
        });
      } else {
        console.error('[VRC Move] Rollback failed');
        sendResponse({
          success: false,
          error: `移動失敗。ワールドは削除されましたが復元もできませんでした`,
          rolledBack: false
        });
      }
      return;
    }

    const addData = await addResponse.json();
    console.log('[VRC Move] Move success, new ID:', addData.id);

    sendResponse({
      success: true,
      newFavoriteRecordId: addData.id
    });

  } catch (error) {
    console.error('[Background] Error moving VRC world folder:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * VRChatお気に入りに追加
 */
async function addVRCFavorite(worldId, folderId, sendResponse) {
  try {
    console.log(`[VRC API] Adding ${worldId} to ${folderId}`);

    const response = await fetch(`${API_BASE}/favorites`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'world',
        favoriteId: worldId,
        tags: [folderId]
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        sendResponse({ success: false, error: 'VRChatにログインしていません' });
        return;
      }
      sendResponse({ success: false, error: `追加失敗: ${response.status}` });
      return;
    }

    const data = await response.json();
    console.log(`[VRC API] Add success, ID: ${data.id}`);

    sendResponse({
      success: true,
      favoriteRecordId: data.id
    });

  } catch (error) {
    console.error('[Background] Error adding VRC favorite:', error);
    sendResponse({ success: false, error: error.message });
  }
}

/**
 * VRChatお気に入りから削除
 */
async function deleteVRCFavorite(favoriteRecordId, sendResponse) {
  try {
    console.log(`[VRC API] Deleting ${favoriteRecordId}`);

    const response = await fetch(`${API_BASE}/favorites/${favoriteRecordId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 401) {
        sendResponse({ success: false, error: 'VRChatにログインしていません' });
        return;
      }
      sendResponse({ success: false, error: `削除失敗: ${response.status}` });
      return;
    }

    console.log(`[VRC API] Delete success`);
    sendResponse({ success: true });

  } catch (error) {
    console.error('[Background] Error deleting VRC favorite:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// ========================================
// VRC同期関数(枠組みのみ - 今後実装)
// ========================================

async function fetchAllVRCFolders(sendResponse) {
  try {
    logAction('FETCH_ALL_VRC_START', {});

    // Step 1: VRC公式からフォルダ情報取得
    const worldGroups = await fetchVRChatFavoriteGroups();
    const vrcFolderData = await updateVRCFolderData(worldGroups);
    
    logAction('VRC_GROUPS_FETCHED', { count: worldGroups.length });

    // Step 2: 各フォルダからワールドID取得
    const allVRCWorlds = [];
    const folderIds = ['worlds1', 'worlds2', 'worlds3', 'worlds4'];
    
    for (let i = 0; i < worldGroups.length && i < 4; i++) {
      const group = worldGroups[i];
      const mappedFolderId = folderIds[i];
      
      try {
        const favorites = await fetchVRChatFavoritesByTag(group.name);
        
        for (const fav of favorites) {
          if (fav.favoriteId) {
            allVRCWorlds.push({
              id: fav.favoriteId,
              folderId: mappedFolderId, // worlds1~4 を使用
              favoriteRecordId: fav.id,
              name: null,
              authorName: null,
              releaseStatus: null,
              thumbnailImageUrl: null
            });
          }
        }
        
        await sleep(300);
      } catch (e) {
        logError('FETCH_VRC_FOLDER_ERROR', e, { folder: group.name });
      }
    }

    logAction('VRC_WORLDS_FETCHED', { totalCount: allVRCWorlds.length });

    // Step 2.5: ワールド詳細情報を取得
    const worldIds = allVRCWorlds.map(w => w.id);
    const worldDetailsMap = await fetchWorldDetailsBatch(worldIds);
    
    // 詳細情報をマージ
    for (const world of allVRCWorlds) {
      const details = worldDetailsMap[world.id];
      if (details) {
        world.name = details.name || world.id;
        world.authorName = details.authorName;
        world.releaseStatus = details.releaseStatus;
        world.thumbnailImageUrl = details.thumbnailImageUrl;
      } else {
        world.name = world.id;
      }
    }

    logAction('VRC_WORLD_DETAILS_FETCHED', { totalCount: allVRCWorlds.length });

    // Step 3: 既存ワールドとの差分計算
    const allExisting = await getAllWorldsInternal();
    const existingMap = new Map(allExisting.map(w => [w.id, w]));

    const toMove = [];
    const toAdd = [];

    for (const vrcWorld of allVRCWorlds) {
      const existing = existingMap.get(vrcWorld.id);
      
      if (existing) {
        if (existing.folderId !== vrcWorld.folderId) {
          // 注: プライベート/削除済みワールドも、VRC公式に存在する場合は例外として移動を許可
          toMove.push({
            worldId: vrcWorld.id,
            fromFolder: existing.folderId,
            toFolder: vrcWorld.folderId,
            favoriteRecordId: existing.favoriteRecordId
          });
        }
      } else {
        toAdd.push(vrcWorld);
      }
    }

    logAction('VRC_DIFF_CALCULATED', { toMove: toMove.length, toAdd: toAdd.length });

    // Step 4: 移動処理
    let movedCount = 0;
    if (toMove.length > 0) {
      const moveResponse = await new Promise((resolve) => {
        batchUpdateWorlds({ movedWorlds: toMove, deletedWorlds: [] }, resolve);
      });
      movedCount = moveResponse.movedCount || 0;
      logAction('VRC_MOVE_COMPLETE', { count: movedCount });
    }

    // Step 5: 新規追加処理
    let addedCount = 0;
    const addErrors = [];

    for (const world of toAdd) {
      const result = await addWorldToFolder(world);
      if (result.success) {
        addedCount++;
      } else {
        const errorMsg = `${world.id}: ${result.reason || result.error}`;
        addErrors.push(errorMsg);
      }
      await sleep(100);
    }

    logAction('FETCH_ALL_VRC_COMPLETE', { moved: movedCount, added: addedCount });

    sendResponse({
      success: addErrors.length === 0,
      movedCount,
      addedCount,
      totalFolders: worldGroups.length,
      errors: addErrors.length > 0 ? addErrors : null
    });

  } catch (error) {
    logError('FETCH_ALL_VRC_ERROR', error);
    sendResponse({ success: false, error: error.message });
  }
}
/**
 * ワールド詳細情報をバッチ取得
 * @param {string[]} worldIds - ワールドIDの配列
 * @returns {Promise<Object>} worldId -> details のマップ
 */
async function fetchWorldDetailsBatch(worldIds) {
  const detailsMap = {};
  
  // VRChat APIは個別取得のみ対応している可能性があるため、1件ずつ取得
  for (const worldId of worldIds) {
    try {
      const response = await fetch(`${API_BASE}/worlds/${worldId}`, {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        console.error(`[API] World details error for ${worldId}: ${response.status}`);
        continue;
      }

      const world = await response.json();
      
      detailsMap[world.id] = {
        name: world.name,
        authorName: world.authorName,
        releaseStatus: world.releaseStatus,
        thumbnailImageUrl: world.thumbnailImageUrl
      };
      
      await sleep(200); // レート制限対策
    } catch (e) {
      console.error(`[API] Error fetching world details for ${worldId}:`, e);
    }
  }
  
  console.log(`[API] Fetched details for ${Object.keys(detailsMap).length}/${worldIds.length} worlds`);
  return detailsMap;
}

// 完全同期(枠組みのみ)
async function syncAllFavorites(sendResponse) {
  try {
    console.log('[VRC Sync] syncAllFavorites called - TODO: Implementation');

    // TODO: 3段階同期を実装
    // Phase 0: 状態取得
    // - VRC公式から4フォルダすべてのお気に入りを取得
    // - 拡張機能のvrcWorldsから理想状態を取得

    // Phase 1: 削除(最小削除)
    // - 拡張機能に存在しないワールドをVRCから削除
    // - 容量確保のための最小限の削除
    // - 各削除前に再検証(revalidate)

    // Phase 2: 移動(重複回避)
    // - フォルダが違うワールドを正しいフォルダに移動
    // - 削除→追加の順序を厳守
    // - favoriteRecordIdはフォルダ変更で変わる点に注意

    // Phase 3: 追加(新規登録)
    // - 拡張機能に存在するが、VRCに存在しないワールドを追加
    // - 整合性が取れた状態で安全に追加

    sendResponse({
      success: false,
      error: '未実装: この機能は今後実装予定です',
      removed: 0,
      moved: 0,
      added: 0,
      totalRemove: 0,
      totalMove: 0,
      totalAdd: 0,
      errors: null
    });
  } catch (error) {
    console.error('[Background] Error syncing all favorites:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// ========================================
// worldDetails保存ヘルパー（新規追加）
// ========================================
async function saveWorldDetails(worldId, details) {
  const chunkKey = `worldDetails_${Math.floor(Math.random() * 10000) % 100}`;
  const local = await chrome.storage.local.get([chunkKey]);
  const chunk = local[chunkKey] || {};
  chunk[worldId] = details;
  await chrome.storage.local.set({ [chunkKey]: chunk });
}

async function saveWorldDetailsBatch(detailsMap) {
  const entries = Object.entries(detailsMap);
  const chunks = {};

  for (let i = 0; i < entries.length; i++) {
    const [worldId, details] = entries[i];
    const chunkIndex = i % DETAILS_CHUNK_SIZE;
    const chunkKey = `worldDetails_${chunkIndex}`;

    if (!chunks[chunkKey]) {
      chunks[chunkKey] = {};
    }
    chunks[chunkKey][worldId] = details;
  }

  for (const [chunkKey, chunkData] of Object.entries(chunks)) {
    const local = await chrome.storage.local.get([chunkKey]);
    const existing = local[chunkKey] || {};
    await chrome.storage.local.set({
      [chunkKey]: { ...existing, ...chunkData }
    });
  }
}

async function getWorldDetails(worldId) {
  // 全チャンクを検索
  for (let i = 0; i < DETAILS_CHUNK_SIZE; i++) {
    const chunkKey = `worldDetails_${i}`;
    const local = await chrome.storage.local.get([chunkKey]);
    if (local[chunkKey] && local[chunkKey][worldId]) {
      return local[chunkKey][worldId];
    }
  }

  // 旧形式との互換性
  const legacy = await chrome.storage.local.get(['worldDetails']);
  return legacy.worldDetails?.[worldId] || null;
}

async function getAllWorldDetailsInternal() {
  const allDetails = {};

  // 新形式から取得
  for (let i = 0; i < DETAILS_CHUNK_SIZE; i++) {
    const chunkKey = `worldDetails_${i}`;
    const local = await chrome.storage.local.get([chunkKey]);
    if (local[chunkKey]) {
      Object.assign(allDetails, local[chunkKey]);
    }
  }

  // 旧形式との互換性
  const legacy = await chrome.storage.local.get(['worldDetails']);
  if (legacy.worldDetails) {
    Object.assign(allDetails, legacy.worldDetails);
  }

  return allDetails;
}

async function deleteWorldDetails(worldId) {
  for (let i = 0; i < DETAILS_CHUNK_SIZE; i++) {
    const chunkKey = `worldDetails_${i}`;
    const local = await chrome.storage.local.get([chunkKey]);
    if (local[chunkKey] && local[chunkKey][worldId]) {
      delete local[chunkKey][worldId];
      await chrome.storage.local.set({ [chunkKey]: local[chunkKey] });
      return;
    }
  }
}

// ========================================
// 内部ヘルパー関数（修正）
// ========================================
async function getAllWorldsInternal() {
  const sync = await chrome.storage.sync.get(['worlds']);
  const local = await chrome.storage.local.get(['vrcWorlds']);

  const syncWorlds = sync.worlds || [];
  const vrcWorlds = local.vrcWorlds || [];
  const details = await getAllWorldDetailsInternal();

  const syncWorldsWithDetails = syncWorlds.map(sw => ({
    id: sw.id,
    name: details[sw.id]?.name || sw.id,
    authorName: details[sw.id]?.authorName || null,
    releaseStatus: details[sw.id]?.releaseStatus || null,
    thumbnailImageUrl: details[sw.id]?.thumbnailImageUrl || null,
    folderId: sw.folderId
  }));

  return [...syncWorldsWithDetails, ...vrcWorlds];
}

/**
 * VRCフォルダ内のワールド一覧を取得
 * @param {string} folderId - worlds1~4
 * @returns {Promise<Array>} ワールドの配列
 */
async function getVRCFolderWorlds(folderId) {
  const local = await chrome.storage.local.get(['vrcWorlds']);
  const vrcWorlds = local.vrcWorlds || [];
  return vrcWorlds.filter(w => w.folderId === folderId);
}

async function addWorldToFolder(world) {
  try {
    const folderId = world.folderId;

    if (folderId.startsWith('worlds')) {
      if (world.releaseStatus === 'private' || world.releaseStatus === 'deleted') {
        return { success: false, reason: 'private_world', worldName: world.name };
      }

      const vrcWorlds = await getVRCFolderWorlds(folderId);

      if (vrcWorlds.length >= VRC_FOLDER_SYNC_LIMIT) {
        return { success: false, reason: 'vrc_sync_limit_exceeded' };
      }

      if (vrcWorlds.length >= VRC_FOLDER_LIMIT) {
        return { success: false, reason: 'vrc_limit_exceeded' };
      }

      const local = await chrome.storage.local.get(['vrcWorlds']);
      const vrcWorldsList = local.vrcWorlds || [];
      vrcWorldsList.push({
        ...world,
        folderId,
        favoriteRecordId: world.favoriteRecordId || null
      });
      await chrome.storage.local.set({ vrcWorlds: vrcWorldsList });

    } else {
      const sync = await chrome.storage.sync.get(['worlds']);
      const syncWorlds = sync.worlds || [];

      if (syncWorlds.length >= SYNC_WORLD_LIMIT) {
        return { success: false, reason: 'sync_limit_exceeded' };
      }

      syncWorlds.push({ id: world.id, folderId });
      await chrome.storage.sync.set({ worlds: syncWorlds });

      await saveWorldDetails(world.id, {
        name: world.name,
        authorName: world.authorName || null,
        releaseStatus: world.releaseStatus || null,
        thumbnailImageUrl: world.thumbnailImageUrl || null
      });
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ========================================
// デバッグログ（警告レベル対応版）
// ========================================
const DEBUG_LOG = true;

function logAction(action, data) {
  if (!DEBUG_LOG) return;
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [ACTION] ${action}:`, JSON.stringify(data, null, 2));
}

function logError(action, error, data = null) {
  if (!DEBUG_LOG) return;
  const timestamp = new Date().toISOString();
  // ユーザー起因のエラー（制限超過など）は警告レベル
  if (action.includes('LIMIT') || action.includes('RESTRICTED')) {
    console.warn(`[${timestamp}] [WARN] ${action}:`, error);
  } else {
    console.error(`[${timestamp}] [ERROR] ${action}:`, error);
  }
  if (data) console.log('Data:', data);
}

function logBatch(phase, data) {
  if (!DEBUG_LOG) return;
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [BATCH ${phase}]:`, data);
}