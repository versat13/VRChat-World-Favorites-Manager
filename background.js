// background.js - v8.0 (前半: 初期化〜基本操作)

console.log('[Background] VRChat World Favorites Manager v8.0 loaded');

// ========================================
// 定数定義
// ========================================
const SYNC_WORLD_LIMIT = 800;
const VRC_FOLDER_LIMIT = 150;
const VRC_FOLDER_SYNC_LIMIT = 100;
const API_BASE = 'https://vrchat.com/api/1';

// バッチサイズ（安全重視）
const BATCH_SIZE = {
  sync: 50,   // syncストレージ: 50件ずつ
  local: 100  // localストレージ: 100件ずつ
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
  if (!local.worldDetails) await chrome.storage.local.set({ worldDetails: {} });
  
  if (!sync.vrcFolderData) {
    await chrome.storage.sync.set({ 
      vrcFolderData: {
        worlds1: { name: 'worlds1', displayName: 'Favorite World 1' },
        worlds2: { name: 'worlds2', displayName: 'Favorite World 2' },
        worlds3: { name: 'worlds3', displayName: 'Favorite World 3' },
        worlds4: { name: 'worlds4', displayName: 'Favorite World 4' }
      }
    });
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
    case 'fetchVRCFolder':
      fetchVRCFolder(request.folderId, sendResponse);
      return true;
    case 'syncToVRCFolder':
      syncToVRCFolder(request.folderId, sendResponse);
      return true;
    case 'fetchAllVRCFolders':
      fetchAllVRCFolders(sendResponse);
      return true;
    case 'syncAllFavorites':
      syncAllFavorites(sendResponse);
      return true;
    case 'detectDuplicates':
      detectDuplicates(sendResponse);
      return true;
    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

// ========================================
// 全ワールド取得
// ========================================
async function getAllWorlds(sendResponse) {
  try {
    const sync = await chrome.storage.sync.get(['worlds']);
    const local = await chrome.storage.local.get(['vrcWorlds', 'worldDetails']);
    
    const syncWorlds = sync.worlds || [];
    const vrcWorlds = local.vrcWorlds || [];
    const details = local.worldDetails || {};
    
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
    console.error('[Background] Error getting worlds:', error);
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
// ワールド追加（重複チェック付き）
// ========================================
async function addWorld(world, sendResponse) {
  try {
    if (!world || !world.id || !world.name) {
      sendResponse({ success: false, error: 'Invalid world data' });
      return;
    }

    const folderId = world.folderId || 'none';
    
    // グローバル重複チェック
    const allWorlds = await getAllWorldsInternal();
    const existing = allWorlds.find(w => w.id === world.id);
    
    if (existing) {
      if (existing.folderId === folderId) {
        sendResponse({ success: false, reason: 'already_exists_same_folder' });
        return;
      }
      
      // 他のフォルダに存在 → 自動移動
      sendResponse({ 
        success: false, 
        reason: 'already_exists_different_folder',
        existingFolder: existing.folderId,
        worldName: world.name
      });
      return;
    }
    
    // VRCフォルダへの追加制限
    if (folderId.startsWith('worlds')) {
      // プライベート/削除済みチェック
      if (world.releaseStatus === 'private' || world.releaseStatus === 'deleted') {
        sendResponse({ success: false, reason: 'private_world', worldName: world.name });
        return;
      }
      
      // 上限チェック
      const vrcWorlds = await getVRCFolderWorlds(folderId);
      if (vrcWorlds.length >= VRC_FOLDER_LIMIT) {
        sendResponse({ success: false, reason: 'vrc_limit_exceeded' });
        return;
      }
      
      // VRCフォルダに追加
      const local = await chrome.storage.local.get(['vrcWorlds']);
      const vrcWorldsList = local.vrcWorlds || [];
      vrcWorldsList.push({
        id: world.id,
        name: world.name,
        authorName: world.authorName || null,
        releaseStatus: world.releaseStatus || null,
        thumbnailImageUrl: world.thumbnailImageUrl || null,
        folderId: folderId,
        favoriteId: world.favoriteId || null
      });
      await chrome.storage.local.set({ vrcWorlds: vrcWorldsList });
      
    } else {
      // 通常フォルダに追加
      const sync = await chrome.storage.sync.get(['worlds']);
      const syncWorlds = sync.worlds || [];
      
      if (syncWorlds.length >= SYNC_WORLD_LIMIT) {
        sendResponse({ success: false, reason: 'sync_limit_exceeded' });
        return;
      }
      
      syncWorlds.push({ id: world.id, folderId: folderId });
      await chrome.storage.sync.set({ worlds: syncWorlds });
      
      const local = await chrome.storage.local.get(['worldDetails']);
      const details = local.worldDetails || {};
      details[world.id] = {
        name: world.name,
        authorName: world.authorName || null,
        releaseStatus: world.releaseStatus || null,
        thumbnailImageUrl: world.thumbnailImageUrl || null
      };
      await chrome.storage.local.set({ worldDetails: details });
    }
    
    console.log('[Background] World added:', world.id);
    sendResponse({ success: true });
  } catch (error) {
    console.error('[Background] Error adding world:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// ========================================
// ワールド削除
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
      
      const local = await chrome.storage.local.get(['worldDetails']);
      const details = local.worldDetails || {};
      delete details[worldId];
      await chrome.storage.local.set({ worldDetails: details });
    }
    
    console.log('[Background] World removed:', worldId);
    sendResponse({ success: true });
  } catch (error) {
    console.error('[Background] Error removing world:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// ========================================
// ワールド更新（詳細情報のみ）
// ========================================
async function updateWorld(world, sendResponse) {
  try {
    if (!world || !world.id) {
      sendResponse({ success: false, error: 'Invalid world data' });
      return;
    }

    const folderId = world.folderId;
    
    if (folderId.startsWith('worlds')) {
      // VRCフォルダの場合
      const local = await chrome.storage.local.get(['vrcWorlds']);
      const vrcWorlds = local.vrcWorlds || [];
      const index = vrcWorlds.findIndex(w => w.id === world.id);
      
      if (index !== -1) {
        // 既存のreleaseStatusを保持（プライベート/削除済みでも残す）
        vrcWorlds[index] = {
          ...vrcWorlds[index],
          name: world.name || vrcWorlds[index].name,
          authorName: world.authorName !== undefined ? world.authorName : vrcWorlds[index].authorName,
          releaseStatus: world.releaseStatus !== undefined ? world.releaseStatus : vrcWorlds[index].releaseStatus,
          thumbnailImageUrl: world.thumbnailImageUrl !== undefined ? world.thumbnailImageUrl : vrcWorlds[index].thumbnailImageUrl,
          favoriteId: world.favoriteId !== undefined ? world.favoriteId : vrcWorlds[index].favoriteId
        };
        await chrome.storage.local.set({ vrcWorlds });
      }
      
    } else {
      // 通常フォルダの場合
      const local = await chrome.storage.local.get(['worldDetails']);
      const details = local.worldDetails || {};
      details[world.id] = {
        name: world.name,
        authorName: world.authorName || null,
        releaseStatus: world.releaseStatus || null,
        thumbnailImageUrl: world.thumbnailImageUrl || null
      };
      await chrome.storage.local.set({ worldDetails: details });
    }
    
    console.log('[Background] World updated:', world.id);
    sendResponse({ success: true });
  } catch (error) {
    console.error('[Background] Error updating world:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// ========================================
// ワールド移動（個別）
// ========================================
async function moveWorld(worldId, fromFolder, toFolder, newFavoriteId, sendResponse) {
  try {
    if (fromFolder === toFolder) {
      sendResponse({ success: true });
      return;
    }

    const allWorlds = await getAllWorldsInternal();
    const world = allWorlds.find(w => w.id === worldId);
    
    if (!world) {
      sendResponse({ success: false, error: 'World not found' });
      return;
    }
    
    // プライベート/削除済みワールドの移動制限
    const isVRCToVRC = fromFolder.startsWith('worlds') && toFolder.startsWith('worlds');
    const isToVRC = toFolder.startsWith('worlds');
    
    if ((isVRCToVRC || isToVRC) && 
        (world.releaseStatus === 'private' || world.releaseStatus === 'deleted')) {
      sendResponse({ 
        success: false, 
        reason: 'private_world_move_restricted', 
        worldName: world.name 
      });
      return;
    }
    
    // 移動実行
    await removeWorldFromFolder(worldId, fromFolder);
    
    const worldToAdd = { 
      ...world, 
      folderId: toFolder,
      favoriteId: newFavoriteId || world.favoriteId
    };
    
    const addResult = await addWorldToFolder(worldToAdd);
    
    if (!addResult.success) {
      sendResponse(addResult);
      return;
    }
    
    console.log('[Background] World moved:', worldId, fromFolder, '->', toFolder);
    sendResponse({ success: true });
  } catch (error) {
    console.error('[Background] Error moving world:', error);
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
// background.js - v8.0 (後半: バッチ処理・VRC API・ヘルパー関数)

// ========================================
// バッチ処理（書き込み回数削減の核心）
// ========================================
async function batchUpdateWorlds(changes, sendResponse) {
  try {
    const { movedWorlds = [], deletedWorlds = [] } = changes;
    
    if (movedWorlds.length === 0 && deletedWorlds.length === 0) {
      sendResponse({ success: true, movedCount: 0, deletedCount: 0 });
      return;
    }
    
    console.log(`[Background] Batch update: ${movedWorlds.length} moves, ${deletedWorlds.length} deletes`);
    
    let successCount = 0;
    let errorCount = 0;
    const errors = [];
    
    // syncとlocalに分類
    const syncChanges = [];
    const localChanges = [];
    
    for (const move of movedWorlds) {
      const isSyncChange = !move.fromFolder.startsWith('worlds') || !move.toFolder.startsWith('worlds');
      if (isSyncChange) {
        syncChanges.push({ type: 'move', ...move });
      } else {
        localChanges.push({ type: 'move', ...move });
      }
    }
    
    for (const deletion of deletedWorlds) {
      if (deletion.folderId.startsWith('worlds')) {
        localChanges.push({ type: 'delete', ...deletion });
      } else {
        syncChanges.push({ type: 'delete', ...deletion });
      }
    }
    
    // Syncストレージをバッチ処理（50件ずつ）
    for (let i = 0; i < syncChanges.length; i += BATCH_SIZE.sync) {
      const batch = syncChanges.slice(i, i + BATCH_SIZE.sync);
      const result = await processSyncBatch(batch);
      successCount += result.success;
      errorCount += result.errors;
      errors.push(...result.errorMessages);
      await sleep(500); // レート制限対策
    }
    
    // Localストレージをバッチ処理（100件ずつ）
    for (let i = 0; i < localChanges.length; i += BATCH_SIZE.local) {
      const batch = localChanges.slice(i, i + BATCH_SIZE.local);
      const result = await processLocalBatch(batch);
      successCount += result.success;
      errorCount += result.errors;
      errors.push(...result.errorMessages);
      await sleep(100);
    }
    
    console.log(`[Background] Batch complete: ${successCount} success, ${errorCount} errors`);
    
    sendResponse({ 
      success: errorCount === 0, 
      movedCount: successCount,
      errorCount: errorCount,
      errors: errors.length > 0 ? errors : null
    });
  } catch (error) {
    console.error('[Background] Batch update error:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// Syncストレージバッチ処理
async function processSyncBatch(batch) {
  try {
    const sync = await chrome.storage.sync.get(['worlds']);
    const local = await chrome.storage.local.get(['worldDetails']);
    
    let syncWorlds = sync.worlds || [];
    let worldDetails = local.worldDetails || {};
    
    let successCount = 0;
    const errorMessages = [];
    
    for (const change of batch) {
      try {
        if (change.type === 'delete') {
          syncWorlds = syncWorlds.filter(w => w.id !== change.worldId);
          delete worldDetails[change.worldId];
          successCount++;
        } else if (change.type === 'move') {
          const index = syncWorlds.findIndex(w => w.id === change.worldId);
          if (index !== -1) {
            syncWorlds[index].folderId = change.toFolder;
            successCount++;
          }
        }
      } catch (e) {
        errorMessages.push(`${change.worldId}: ${e.message}`);
      }
    }
    
    // 1回の書き込み
    await chrome.storage.sync.set({ worlds: syncWorlds });
    await chrome.storage.local.set({ worldDetails });
    
    return { success: successCount, errors: batch.length - successCount, errorMessages };
  } catch (error) {
    console.error('[Background] Sync batch error:', error);
    return { success: 0, errors: batch.length, errorMessages: [error.message] };
  }
}

// Localストレージバッチ処理
async function processLocalBatch(batch) {
  try {
    const local = await chrome.storage.local.get(['vrcWorlds']);
    let vrcWorlds = local.vrcWorlds || [];
    
    let successCount = 0;
    const errorMessages = [];
    
    for (const change of batch) {
      try {
        if (change.type === 'delete') {
          vrcWorlds = vrcWorlds.filter(w => w.id !== change.worldId);
          successCount++;
        } else if (change.type === 'move') {
          const index = vrcWorlds.findIndex(w => w.id === change.worldId);
          if (index !== -1) {
            vrcWorlds[index].folderId = change.toFolder;
            successCount++;
          }
        }
      } catch (e) {
        errorMessages.push(`${change.worldId}: ${e.message}`);
      }
    }
    
    // 1回の書き込み
    await chrome.storage.local.set({ vrcWorlds });
    
    return { success: successCount, errors: batch.length - successCount, errorMessages };
  } catch (error) {
    console.error('[Background] Local batch error:', error);
    return { success: 0, errors: batch.length, errorMessages: [error.message] };
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
// VRChat API関連
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
  const sync = await chrome.storage.sync.get(['vrcFolderData']);
  const vrcFolderData = sync.vrcFolderData || {};
  
  const folderIds = ['worlds1', 'worlds2', 'worlds3', 'worlds4'];
  
  folderIds.forEach((id, index) => {
    if (worldGroups[index]) {
      vrcFolderData[id] = {
        name: worldGroups[index].name,
        displayName: worldGroups[index].displayName
      };
    } else if (!vrcFolderData[id]) {
      vrcFolderData[id] = {
        name: id,
        displayName: `Favorite World ${index + 1}`
      };
    }
  });
  
  await chrome.storage.sync.set({ vrcFolderData });
  console.log('[API] VRC folder data updated');
  return vrcFolderData;
}

// VRCフォルダから取得（重複チェック付き・最適化版）
async function fetchVRCFolder(folderId, sendResponse) {
  try {
    const worldGroups = await fetchVRChatFavoriteGroups();
    const vrcFolderData = await updateVRCFolderData(worldGroups);
    
    const folderData = vrcFolderData[folderId];
    if (!folderData) {
      sendResponse({ success: false, error: 'フォルダデータが見つかりません' });
      return;
    }
    
    const apiName = folderData.name;
    const favorites = await fetchVRChatFavoritesByTag(apiName);
    const folderWorlds = favorites.filter(fav => fav.favoriteId);
    
    // グローバル重複チェック
    const allWorlds = await getAllWorldsInternal();
    const existingMap = new Map(allWorlds.map(w => [w.id, w]));
    
    const results = {
      toAdd: [],
      alreadyExists: [],
      differentFolder: []
    };
    
    for (const fav of folderWorlds) {
      const worldId = fav.favoriteId;
      const existing = existingMap.get(worldId);
      
      if (!existing) {
        results.toAdd.push({
          id: worldId,
          name: fav.name,
          authorName: fav.authorName || null,
          releaseStatus: fav.releaseStatus || null,
          thumbnailImageUrl: fav.thumbnailImageUrl || null,
          folderId: folderId,
          favoriteId: fav.id
        });
      } else if (existing.folderId === folderId) {
        results.alreadyExists.push(worldId);
      } else {
        results.differentFolder.push({
          worldId: worldId,
          currentFolder: existing.folderId,
          worldName: fav.name
        });
      }
    }
    
    // バッチ追加
    if (results.toAdd.length > 0) {
      const local = await chrome.storage.local.get(['vrcWorlds']);
      const vrcWorldsList = [...(local.vrcWorlds || []), ...results.toAdd];
      await chrome.storage.local.set({ vrcWorlds: vrcWorldsList });
    }
    
    sendResponse({ 
      success: true, 
      addedCount: results.toAdd.length,
      totalCount: folderWorlds.length,
      alreadyExists: results.alreadyExists.length,
      differentFolder: results.differentFolder,
      folderName: folderData.displayName
    });
  } catch (error) {
    console.error('[Background] Error fetching VRC folder:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// VRCフォルダに同期
async function syncToVRCFolder(folderId, sendResponse) {
  try {
    const vrcWorlds = await getVRCFolderWorlds(folderId);
    
    if (vrcWorlds.length === 0) {
      sendResponse({ success: false, error: 'フォルダにワールドがありません' });
      return;
    }
    
    if (vrcWorlds.length > VRC_FOLDER_SYNC_LIMIT) {
      sendResponse({ success: false, error: `フォルダが${VRC_FOLDER_SYNC_LIMIT}件を超えています` });
      return;
    }
    
    const worldGroups = await fetchVRChatFavoriteGroups();
    const vrcFolderData = await updateVRCFolderData(worldGroups);
    
    const folderData = vrcFolderData[folderId];
    if (!folderData) {
      sendResponse({ success: false, error: 'フォルダデータが見つかりません' });
      return;
    }
    
    const apiName = folderData.name;
    const currentFavorites = await fetchVRChatFavoritesByTag(apiName);
    const currentFolderFavorites = currentFavorites.filter(fav => fav.favoriteId);
    
    const currentIds = new Set(currentFolderFavorites.map(fav => fav.favoriteId));
    const extensionIds = new Set(vrcWorlds.map(w => w.id));
    
    let addedCount = 0;
    let removedCount = 0;
    let errors = [];
    const updatedWorlds = [...vrcWorlds];
    
    // 追加処理
    for (const world of vrcWorlds) {
      if (!currentIds.has(world.id)) {
        try {
          const addResponse = await fetch(`${API_BASE}/favorites`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'world',
              favoriteId: world.id,
              tags: [apiName]
            })
          });
          
          if (addResponse.ok) {
            const result = await addResponse.json();
            const worldIndex = updatedWorlds.findIndex(w => w.id === world.id);
            if (worldIndex !== -1) {
              updatedWorlds[worldIndex].favoriteId = result.id;
            }
            addedCount++;
          } else {
            errors.push(`${world.name}: ${addResponse.status}`);
          }
          
          await sleep(500);
        } catch (error) {
          errors.push(`${world.name}: ${error.message}`);
        }
      }
    }
    
    // 削除処理
    for (const fav of currentFolderFavorites) {
      if (!extensionIds.has(fav.favoriteId)) {
        try {
          const deleteResponse = await fetch(`${API_BASE}/favorites/${fav.id}`, {
            method: 'DELETE',
            credentials: 'include'
          });
          
          if (deleteResponse.ok) {
            removedCount++;
          } else {
            errors.push(`削除失敗 ${fav.name}: ${deleteResponse.status}`);
          }
          
          await sleep(500);
        } catch (error) {
          errors.push(`削除失敗 ${fav.name}: ${error.message}`);
        }
      }
    }
    
    // バッチ保存
    const allVrcWorlds = await chrome.storage.local.get(['vrcWorlds']);
    const finalVrcWorlds = (allVrcWorlds.vrcWorlds || []).map(w => {
      const updated = updatedWorlds.find(vw => vw.id === w.id);
      return updated || w;
    });
    await chrome.storage.local.set({ vrcWorlds: finalVrcWorlds });
    
    sendResponse({ 
      success: true, 
      addedCount,
      removedCount,
      errors: errors.length > 0 ? errors : null
    });
  } catch (error) {
    console.error('[Background] Error syncing to VRC folder:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// 全VRCフォルダから取得
async function fetchAllVRCFolders(sendResponse) {
  try {
    const worldGroups = await fetchVRChatFavoriteGroups();
    const vrcFolderData = await updateVRCFolderData(worldGroups);
    
    const folderIds = ['worlds1', 'worlds2', 'worlds3', 'worlds4'];
    const allNewWorlds = [];
    let totalAdded = 0;
    let fetchErrors = [];
    
    // グローバル重複チェック用
    const allWorlds = await getAllWorldsInternal();
    const existingMap = new Map(allWorlds.map(w => [w.id, w]));
    
    for (const folderId of folderIds) {
      try {
        const folderData = vrcFolderData[folderId];
        const apiName = folderData.name;
        
        const favorites = await fetchVRChatFavoritesByTag(apiName);
        const folderWorlds = favorites.filter(fav => fav.favoriteId);
        
        let addedCount = 0;
        for (const fav of folderWorlds) {
          const worldId = fav.favoriteId;
          const existing = existingMap.get(worldId);
          
          // 完全に新規のみ追加（他のフォルダにある場合はスキップ）
          if (!existing) {
            allNewWorlds.push({
              id: worldId,
              name: fav.name,
              authorName: fav.authorName || null,
              releaseStatus: fav.releaseStatus || null,
              thumbnailImageUrl: fav.thumbnailImageUrl || null,
              folderId: folderId,
              favoriteId: fav.id
            });
            existingMap.set(worldId, { folderId }); // 次のフォルダで重複しないように
            addedCount++;
          }
        }
        
        totalAdded += addedCount;
        console.log(`[API] Folder ${folderId}: ${addedCount} added`);
        
        await sleep(250);
      } catch (e) {
        console.error(`Failed to fetch ${folderId}:`, e);
        fetchErrors.push(`${folderId}: ${e.message}`);
      }
    }
    
    // バッチ保存
    if (allNewWorlds.length > 0) {
      const local = await chrome.storage.local.get(['vrcWorlds']);
      const vrcWorldsList = [...(local.vrcWorlds || []), ...allNewWorlds];
      await chrome.storage.local.set({ vrcWorlds: vrcWorldsList });
    }
    
    if (fetchErrors.length > 0) {
      sendResponse({ 
        success: false, 
        error: fetchErrors.join('\n'),
        addedCount: totalAdded
      });
      return;
    }
    
    sendResponse({ 
      success: true, 
      addedCount: totalAdded,
      totalFolders: folderIds.length
    });
  } catch (error) {
    console.error('[Background] Error fetching all VRC folders:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// 完全同期（3段階処理で重複エラーを防止）
async function syncAllFavorites(sendResponse) {
  try {
    console.log('[Sync] Starting 3-phase synchronization...');
    
    const worldGroups = await fetchVRChatFavoriteGroups();
    const vrcFolderData = await updateVRCFolderData(worldGroups);
    
    const folderIds = ['worlds1', 'worlds2', 'worlds3', 'worlds4'];
    const vrcCurrentState = [];
    
    // VRC公式の現在の状態を取得
    console.log('[Sync] Fetching current VRC state...');
    for (const folderId of folderIds) {
      const folderData = vrcFolderData[folderId];
      const apiName = folderData.name;
      const favorites = await fetchVRChatFavoritesByTag(apiName);
      
      for (const fav of favorites) {
        if (fav.favoriteId) {
          vrcCurrentState.push({
            worldId: fav.favoriteId,
            folder: folderId,
            favoriteId: fav.id
          });
        }
      }
      
      await sleep(250);
    }
    
    console.log(`[Sync] VRC current state: ${vrcCurrentState.length} worlds`);
    
    // 拡張機能の理想状態を取得
    const local = await chrome.storage.local.get(['vrcWorlds']);
    const localIdealState = (local.vrcWorlds || []).map(w => ({
      worldId: w.id,
      folder: w.folderId
    }));
    
    console.log(`[Sync] Extension ideal state: ${localIdealState.length} worlds`);
    
    const vrcMap = new Map(vrcCurrentState.map(w => [w.worldId, { favoriteId: w.favoriteId, folder: w.folder }]));
    const localMap = new Map(localIdealState.map(w => [w.worldId, { folder: w.folder }]));
    
    // Phase 1: 削除対象を特定（拡張機能に存在しないワールド）
    const toRemove = [];
    for (const [worldId, vrcData] of vrcMap.entries()) {
      if (!localMap.has(worldId)) {
        toRemove.push({ worldId, favoriteId: vrcData.favoriteId, folder: vrcData.folder });
      }
    }
    
    // Phase 2: 移動対象を特定（存在するがフォルダが違うワールド）
    const toMove = [];
    for (const [worldId, localData] of localMap.entries()) {
      const vrcData = vrcMap.get(worldId);
      if (vrcData && vrcData.folder !== localData.folder) {
        toMove.push({
          worldId,
          currentFavoriteId: vrcData.favoriteId,
          fromFolder: vrcData.folder,
          toFolder: localData.folder
        });
      }
    }
    
    // Phase 3: 追加対象を特定（拡張機能に存在するが、VRCに存在しないワールド）
    const toAdd = [];
    for (const [worldId, localData] of localMap.entries()) {
      if (!vrcMap.has(worldId)) {
        const folderData = vrcFolderData[localData.folder];
        toAdd.push({ worldId, folder: localData.folder, apiName: folderData.name });
      }
    }
    
    let successRemove = 0;
    let successMove = 0;
    let successAdd = 0;
    let errors = [];
    
    console.log(`[Sync] Phase 1: Removing ${toRemove.length} worlds`);
    console.log(`[Sync] Phase 2: Moving ${toMove.length} worlds`);
    console.log(`[Sync] Phase 3: Adding ${toAdd.length} worlds`);
    
    // Phase 1: 削除実行（スペース確保）
    for (const item of toRemove) {
      try {
        console.log(`[Sync] Removing ${item.worldId} from ${item.folder}`);
        const response = await fetch(`${API_BASE}/favorites/${item.favoriteId}`, {
          method: 'DELETE',
          credentials: 'include'
        });
        if (response.ok) {
          successRemove++;
          console.log(`[Sync] ✓ Removed: ${item.worldId}`);
        } else {
          const errorText = await response.text();
          errors.push(`削除失敗 (${item.worldId}): ${response.status} ${errorText}`);
          console.error(`[Sync] ✗ Remove failed: ${item.worldId} - ${response.status}`);
        }
      } catch (e) {
        errors.push(`削除エラー (${item.worldId}): ${e.message}`);
        console.error(`[Sync] ✗ Remove error: ${item.worldId}`, e);
      }
      await sleep(500);
    }
    
    // Phase 2: 移動実行（削除してから追加なので重複しない）
    for (const item of toMove) {
      try {
        console.log(`[Sync] Moving ${item.worldId}: ${item.fromFolder} → ${item.toFolder}`);
        
        // 2-1: 古いフォルダから削除
        const deleteResponse = await fetch(`${API_BASE}/favorites/${item.currentFavoriteId}`, {
          method: 'DELETE',
          credentials: 'include'
        });
        
        if (!deleteResponse.ok) {
          const errorText = await deleteResponse.text();
          errors.push(`移動削除失敗 (${item.worldId}): ${deleteResponse.status} ${errorText}`);
          console.error(`[Sync] ✗ Move delete failed: ${item.worldId} - ${deleteResponse.status}`);
          await sleep(500);
          continue;
        }
        
        console.log(`[Sync] ✓ Deleted from ${item.fromFolder}: ${item.worldId}`);
        await sleep(500);
        
        // 2-2: 新しいフォルダに追加
        const folderData = vrcFolderData[item.toFolder];
        const addResponse = await fetch(`${API_BASE}/favorites`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'world',
            favoriteId: item.worldId,
            tags: [folderData.name]
          })
        });
        
        if (addResponse.ok) {
          successMove++;
          console.log(`[Sync] ✓ Moved: ${item.worldId} (${item.fromFolder} → ${item.toFolder})`);
        } else {
          const errorText = await addResponse.text();
          errors.push(`移動追加失敗 (${item.worldId}): ${addResponse.status} ${errorText}`);
          console.error(`[Sync] ✗ Move add failed: ${item.worldId} - ${addResponse.status}`, errorText);
        }
      } catch (e) {
        errors.push(`移動エラー (${item.worldId}): ${e.message}`);
        console.error(`[Sync] ✗ Move error: ${item.worldId}`, e);
      }
      await sleep(500);
    }
    
    // Phase 3: 追加実行（整合性が取れた状態で新規追加）
    for (const item of toAdd) {
      try {
        console.log(`[Sync] Adding ${item.worldId} to ${item.folder}`);
        const response = await fetch(`${API_BASE}/favorites`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'world',
            favoriteId: item.worldId,
            tags: [item.apiName]
          })
        });
        
        if (response.ok) {
          successAdd++;
          console.log(`[Sync] ✓ Added: ${item.worldId} to ${item.folder}`);
        } else {
          const errorText = await response.text();
          errors.push(`追加失敗 (${item.worldId}): ${response.status} ${errorText}`);
          console.error(`[Sync] ✗ Add failed: ${item.worldId} - ${response.status}`, errorText);
        }
      } catch (e) {
        errors.push(`追加エラー (${item.worldId}): ${e.message}`);
        console.error(`[Sync] ✗ Add error: ${item.worldId}`, e);
      }
      await sleep(500);
    }
    
    console.log(`[Sync] Complete: Removed ${successRemove}/${toRemove.length}, Moved ${successMove}/${toMove.length}, Added ${successAdd}/${toAdd.length}`);
    
    if (errors.length > 0) {
      console.error('[Sync] Errors:', errors);
    }
    
    sendResponse({
      success: true,
      removed: successRemove,
      moved: successMove,
      added: successAdd,
      totalRemove: toRemove.length,
      totalMove: toMove.length,
      totalAdd: toAdd.length,
      errors: errors.length > 0 ? errors : null
    });
  } catch (error) {
    console.error('[Background] Error syncing all favorites:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// ========================================
// 内部ヘルパー関数
// ========================================

async function getAllWorldsInternal() {
  const sync = await chrome.storage.sync.get(['worlds']);
  const local = await chrome.storage.local.get(['vrcWorlds', 'worldDetails']);
  
  const syncWorlds = sync.worlds || [];
  const vrcWorlds = local.vrcWorlds || [];
  const details = local.worldDetails || {};
  
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

async function getVRCFolderWorlds(folderId) {
  const local = await chrome.storage.local.get(['vrcWorlds']);
  return (local.vrcWorlds || []).filter(w => w.folderId === folderId);
}

async function removeWorldFromFolder(worldId, folderId) {
  if (folderId.startsWith('worlds')) {
    const local = await chrome.storage.local.get(['vrcWorlds']);
    const vrcWorlds = (local.vrcWorlds || []).filter(w => w.id !== worldId);
    await chrome.storage.local.set({ vrcWorlds });
  } else {
    const sync = await chrome.storage.sync.get(['worlds']);
    const syncWorlds = (sync.worlds || []).filter(w => w.id !== worldId);
    await chrome.storage.sync.set({ worlds: syncWorlds });
  }
}

async function addWorldToFolder(world) {
  try {
    const folderId = world.folderId;
    
    if (folderId.startsWith('worlds')) {
      if (world.releaseStatus === 'private' || world.releaseStatus === 'deleted') {
        return { success: false, reason: 'private_world', worldName: world.name };
      }
      
      const vrcWorlds = await getVRCFolderWorlds(folderId);
      if (vrcWorlds.length >= VRC_FOLDER_LIMIT) {
        return { success: false, reason: 'vrc_limit_exceeded' };
      }
      
      const local = await chrome.storage.local.get(['vrcWorlds']);
      const vrcWorldsList = local.vrcWorlds || [];
      vrcWorldsList.push({ 
        ...world, 
        folderId,
        favoriteId: world.favoriteId || null
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
      
      const local = await chrome.storage.local.get(['worldDetails']);
      const details = local.worldDetails || {};
      details[world.id] = {
        name: world.name,
        authorName: world.authorName || null,
        releaseStatus: world.releaseStatus || null,
        thumbnailImageUrl: world.thumbnailImageUrl || null
      };
      await chrome.storage.local.set({ worldDetails: details });
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ========================================
// VRC同期デバッグヘルパー
// 開発者コンソールで実行してください
// ========================================

// 1. 拡張機能内のVRCワールド状態を確認
async function debugExtensionVRCState() {
  const local = await chrome.storage.local.get(['vrcWorlds']);
  const vrcWorlds = local.vrcWorlds || [];
  
  console.log('===== Extension VRC Worlds =====');
  console.log('Total:', vrcWorlds.length);
  
  const byFolder = {
    worlds1: vrcWorlds.filter(w => w.folderId === 'worlds1'),
    worlds2: vrcWorlds.filter(w => w.folderId === 'worlds2'),
    worlds3: vrcWorlds.filter(w => w.folderId === 'worlds3'),
    worlds4: vrcWorlds.filter(w => w.folderId === 'worlds4')
  };
  
  console.log('worlds1:', byFolder.worlds1.length);
  console.log('worlds2:', byFolder.worlds2.length);
  console.log('worlds3:', byFolder.worlds3.length);
  console.log('worlds4:', byFolder.worlds4.length);
  
  // 詳細表示
  Object.entries(byFolder).forEach(([folder, worlds]) => {
    if (worlds.length > 0) {
      console.log(`\n${folder}:`);
      worlds.forEach(w => {
        console.log(`  - ${w.name} (${w.id})`);
      });
    }
  });
  
  return byFolder;
}

// 2. VRC公式の状態を確認
async function debugVRCOfficialState() {
  const API_BASE = 'https://vrchat.com/api/1';
  
  // フォルダグループ取得
  const groupsResponse = await fetch(`${API_BASE}/favorite/groups`, {
    method: 'GET',
    credentials: 'include'
  });
  const groups = await groupsResponse.json();
  const worldGroups = groups.filter(g => g.type === 'world');
  
  console.log('===== VRC Official State =====');
  console.log('World Groups:', worldGroups.length);
  
  const vrcState = {};
  
  for (let i = 0; i < worldGroups.length && i < 4; i++) {
    const group = worldGroups[i];
    const folderId = `worlds${i + 1}`;
    
    const favResponse = await fetch(`${API_BASE}/favorites?n=100&type=world&tag=${group.name}`, {
      method: 'GET',
      credentials: 'include'
    });
    const favorites = await favResponse.json();
    
    vrcState[folderId] = favorites.filter(f => f.favoriteId);
    
    console.log(`${folderId} (${group.displayName}):`, vrcState[folderId].length);
    
    if (vrcState[folderId].length > 0) {
      console.log(`  Worlds:`);
      vrcState[folderId].forEach(f => {
        console.log(`    - ${f.name} (${f.favoriteId})`);
      });
    }
    
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  
  return vrcState;
}

// 3. 差分を比較
async function debugSyncDiff() {
  console.log('===== Sync Difference Analysis =====\n');
  
  const extensionState = await debugExtensionVRCState();
  console.log('\n');
  const vrcState = await debugVRCOfficialState();
  
  console.log('\n===== Difference Summary =====');
  
  const folderIds = ['worlds1', 'worlds2', 'worlds3', 'worlds4'];
  
  for (const folderId of folderIds) {
    const extWorlds = new Set((extensionState[folderId] || []).map(w => w.id));
    const vrcWorlds = new Set((vrcState[folderId] || []).map(f => f.favoriteId));
    
    const toAdd = [...extWorlds].filter(id => !vrcWorlds.has(id));
    const toRemove = [...vrcWorlds].filter(id => !extWorlds.has(id));
    
    console.log(`\n${folderId}:`);
    console.log(`  Extension: ${extWorlds.size} worlds`);
    console.log(`  VRC:       ${vrcWorlds.size} worlds`);
    
    if (toAdd.length > 0) {
      console.log(`  ➕ To Add (${toAdd.length}):`);
      toAdd.forEach(id => {
        const world = extensionState[folderId].find(w => w.id === id);
        console.log(`    - ${world?.name || id}`);
      });
    }
    
    if (toRemove.length > 0) {
      console.log(`  ➖ To Remove (${toRemove.length}):`);
      toRemove.forEach(id => {
        const fav = vrcState[folderId].find(f => f.favoriteId === id);
        console.log(`    - ${fav?.name || id}`);
      });
    }
    
    if (toAdd.length === 0 && toRemove.length === 0) {
      console.log(`  ✓ In sync`);
    }
  }
}

// 4. 移動を検出
async function debugMoveDetection() {
  console.log('===== Move Detection =====\n');
  
  const local = await chrome.storage.local.get(['vrcWorlds']);
  const extensionWorlds = local.vrcWorlds || [];
  
  const API_BASE = 'https://vrchat.com/api/1';
  const groupsResponse = await fetch(`${API_BASE}/favorite/groups`, {
    method: 'GET',
    credentials: 'include'
  });
  const groups = await groupsResponse.json();
  const worldGroups = groups.filter(g => g.type === 'world');
  
  const vrcWorldLocations = new Map(); // worldId -> folder
  
  for (let i = 0; i < worldGroups.length && i < 4; i++) {
    const group = worldGroups[i];
    const folderId = `worlds${i + 1}`;
    
    const favResponse = await fetch(`${API_BASE}/favorites?n=100&type=world&tag=${group.name}`, {
      method: 'GET',
      credentials: 'include'
    });
    const favorites = await favResponse.json();
    
    favorites.forEach(f => {
      if (f.favoriteId) {
        vrcWorldLocations.set(f.favoriteId, folderId);
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  
  const moves = [];
  
  for (const world of extensionWorlds) {
    const vrcFolder = vrcWorldLocations.get(world.id);
    if (vrcFolder && vrcFolder !== world.folderId) {
      moves.push({
        worldId: world.id,
        worldName: world.name,
        extensionFolder: world.folderId,
        vrcFolder: vrcFolder
      });
    }
  }
  
  if (moves.length === 0) {
    console.log('✓ No moves detected');
  } else {
    console.log(`Found ${moves.length} worlds that need to be moved:\n`);
    moves.forEach(m => {
      console.log(`  ${m.worldName}`);
      console.log(`    Extension: ${m.extensionFolder}`);
      console.log(`    VRC:       ${m.vrcFolder}`);
      console.log(`    Action:    Move from ${m.vrcFolder} to ${m.extensionFolder}\n`);
    });
  }
  
  return moves;
}

// 5. テスト用：1つだけ追加してみる
async function testAddOneWorld(worldId, targetFolder = 'worlds1') {
  const API_BASE = 'https://vrchat.com/api/1';
  
  // フォルダグループ取得
  const groupsResponse = await fetch(`${API_BASE}/favorite/groups`, {
    method: 'GET',
    credentials: 'include'
  });
  const groups = await groupsResponse.json();
  const worldGroups = groups.filter(g => g.type === 'world');
  
  const folderIndex = parseInt(targetFolder.replace('worlds', '')) - 1;
  const targetGroup = worldGroups[folderIndex];
  
  if (!targetGroup) {
    console.error('Target folder not found');
    return;
  }
  
  console.log(`Testing add: ${worldId} to ${targetFolder} (${targetGroup.displayName})`);
  
  try {
    const response = await fetch(`${API_BASE}/favorites`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'world',
        favoriteId: worldId,
        tags: [targetGroup.name]
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✓ Success!');
      console.log('Result:', result);
    } else {
      const errorText = await response.text();
      console.error('✗ Failed:', response.status);
      console.error('Error:', errorText);
    }
  } catch (e) {
    console.error('✗ Error:', e);
  }
}

// ========================================
// 使用方法
// ========================================
/*
// 開発者コンソールで実行:

// 1. 拡張機能の状態を確認
await debugExtensionVRCState();

// 2. VRC公式の状態を確認
await debugVRCOfficialState();

// 3. 差分を比較
await debugSyncDiff();

// 4. 移動が必要なワールドを検出
await debugMoveDetection();

// 5. テスト追加（1つだけ）
await testAddOneWorld('wrld_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', 'worlds1');

*/