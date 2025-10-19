// background.js - v7.0 (VRChat API連携強化版 - 前半)

console.log('[Background] VRChat World Favorites Manager v7.0 loaded');

// ストレージ構造:
// chrome.storage.sync (100KB, デバイス間同期):
//   folders: [{ id: "folder1", name: "..." }]
//   worlds: [{ id: "wrld_xxx", folderId: "folder1 or none" }]
//   vrcFolderData: { worlds1: { name: "worlds1", displayName: "Favorite World 1" }, ... }
//
// chrome.storage.local (無制限, ローカル):
//   vrcWorlds: [{ id, name, authorName, releaseStatus, thumbnailImageUrl, folderId: "worlds1~4", favoriteId }]
//   worldDetails: { "wrld_xxx": { name, authorName, ... } }

const SYNC_WORLD_LIMIT = 800;
const VRC_FOLDER_LIMIT = 150;
const VRC_FOLDER_SYNC_LIMIT = 100;
const API_BASE = 'https://vrchat.com/api/1';

// レート制限対策用ヘルパー
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// 拡張機能インストール時
chrome.runtime.onInstalled.addListener(() => {
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

// 初期化
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

// コンテキストメニュー
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

// メッセージハンドラ
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
    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

// 全ワールド取得(統合)
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

// ワールド追加
async function addWorld(world, sendResponse) {
  try {
    if (!world || !world.id || !world.name) {
      sendResponse({ success: false, error: 'Invalid world data' });
      return;
    }

    const folderId = world.folderId || 'none';
    
    const allWorlds = await getAllWorldsInternal();
    if (allWorlds.some(w => w.id === world.id)) {
      sendResponse({ success: false, reason: 'already_exists' });
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
        favoriteId: world.favoriteId || null
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

// ワールド削除
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

// ワールド更新
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
          authorName: world.authorName || vrcWorlds[index].authorName,
          releaseStatus: world.releaseStatus || vrcWorlds[index].releaseStatus,
          thumbnailImageUrl: world.thumbnailImageUrl || vrcWorlds[index].thumbnailImageUrl,
          favoriteId: world.favoriteId !== undefined ? world.favoriteId : vrcWorlds[index].favoriteId
        };
        await chrome.storage.local.set({ vrcWorlds });
      }
      
    } else {
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

// ワールド移動
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
    
    // VRCフォルダ間の移動チェック（プライベート/削除済ワールドは移動不可）
    const isVRCToVRC = fromFolder.startsWith('worlds') && toFolder.startsWith('worlds') && fromFolder !== toFolder;
    if (isVRCToVRC && (world.releaseStatus === 'private' || world.releaseStatus === 'deleted')) {
      sendResponse({ success: false, reason: 'private_world_vrc_move', worldName: world.name });
      return;
    }
    
    if (!isVRCToVRC) {
      if (allWorlds.some(w => w.id === worldId && w.folderId === toFolder)) {
        sendResponse({ success: false, reason: 'already_exists' });
        return;
      }
    }
    
    await removeWorldInternal(worldId, fromFolder);
    
    const worldToAdd = { 
      ...world, 
      folderId: toFolder,
      favoriteId: newFavoriteId || world.favoriteId
    };
    
    const addResult = await addWorldInternal(worldToAdd);
    
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

// フォルダ一覧取得
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

// VRCワールド一覧取得
async function getVRCWorlds(sendResponse) {
  try {
    const local = await chrome.storage.local.get(['vrcWorlds']);
    sendResponse({ vrcWorlds: local.vrcWorlds || [] });
  } catch (error) {
    console.error('[Background] Error getting VRC worlds:', error);
    sendResponse({ error: error.message, vrcWorlds: [] });
  }
}

// フォルダ追加
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

// フォルダ削除
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

// フォルダ名変更
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
// background.js - v7.1 (VRChat API連携強化版 - 後半 - 修正版)

// ストレージ統計
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

// === VRChat API ヘルパー関数 ===

// VRChatフォルダグループ一覧取得
async function fetchVRChatFavoriteGroups() {
  console.log('[API] お気に入りフォルダグループ一覧の取得開始...');
  const response = await fetch(`${API_BASE}/favorite/groups`, {
    method: 'GET',
    credentials: 'include'
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('VRChatにログインしていません');
    throw new Error(`グループ取得APIエラー: ${response.status}`);
  }
  
  const groups = await response.json();
  const worldGroups = groups.filter(g => g.type === 'world');
  console.log(`[API] ワールド用グループを ${worldGroups.length} 件発見`);
  return worldGroups;
}

// VRChatフォルダ別お気に入り取得
async function fetchVRChatFavoritesByTag(tag) {
  const n = 100;
  console.log(`[API] フォルダ ${tag} のワールド一覧取得開始...`);
  const response = await fetch(`${API_BASE}/favorites?n=${n}&type=world&tag=${tag}`, {
    method: 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' }
  });
  
  if (!response.ok) {
    if (response.status === 401) throw new Error('VRChatにログインしていません');
    throw new Error(`APIエラー (${tag}): ${response.status}`);
  }
  
  const favorites = await response.json();
  console.log(`[API] フォルダ ${tag} から ${favorites.length} 件取得`);
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
  console.log('[API] VRCフォルダデータを更新:', vrcFolderData);
  return vrcFolderData;
}

// VRCフォルダ同期状態を記録
async function markVRCFolderAsModified(folderId) {
  const sync = await chrome.storage.sync.get(['vrcFolderStates']);
  const states = sync.vrcFolderStates || {};
  states[folderId] = { needsSync: true, lastModified: Date.now() };
  await chrome.storage.sync.set({ vrcFolderStates: states });
}

// VRCフォルダ同期状態をクリア
async function clearVRCFolderModifiedState(folderId) {
  const sync = await chrome.storage.sync.get(['vrcFolderStates']);
  const states = sync.vrcFolderStates || {};
  if (states[folderId]) {
    delete states[folderId];
    await chrome.storage.sync.set({ vrcFolderStates: states });
  }
}

// VRCフォルダから取得
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
    
    // 修正: favoriteIdの存在チェックのみ（APIから取得時点でtagフィルタ済み）
    const folderWorlds = favorites.filter(fav => fav.favoriteId);
    
    const vrcWorlds = await getVRCFolderWorlds(folderId);
    const existingIds = new Set(vrcWorlds.map(w => w.id));
    
    let addedCount = 0;
    const newWorlds = [];
    
    for (const fav of folderWorlds) {
      const worldId = fav.favoriteId;  // ワールドID
      const favoriteRecordId = fav.id;  // お気に入りレコードID
      
      if (!existingIds.has(worldId)) {
        newWorlds.push({
          id: worldId,
          name: fav.name,
          authorName: fav.authorName || null,
          releaseStatus: fav.releaseStatus || null,
          thumbnailImageUrl: fav.thumbnailImageUrl || null,
          folderId: folderId,
          favoriteId: favoriteRecordId
        });
        addedCount++;
      }
    }
    
    // バッチ保存
    if (newWorlds.length > 0) {
      const local = await chrome.storage.local.get(['vrcWorlds']);
      const vrcWorldsList = [...(local.vrcWorlds || []), ...newWorlds];
      await chrome.storage.local.set({ vrcWorlds: vrcWorldsList });
    }
    
    sendResponse({ 
      success: true, 
      addedCount,
      totalCount: folderWorlds.length,
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
    
    if (vrcWorlds.length > 100) {
      sendResponse({ success: false, error: 'フォルダが100件を超えています' });
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
    
    // 同期完了したのでフラグをクリア
    await clearVRCFolderModifiedState(folderId);
    
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
    
    for (const folderId of folderIds) {
      try {
        const folderData = vrcFolderData[folderId];
        const apiName = folderData.name;
        
        const favorites = await fetchVRChatFavoritesByTag(apiName);
        const folderWorlds = favorites.filter(fav => fav.favoriteId);
        
        const existingWorlds = await getVRCFolderWorlds(folderId);
        const existingIds = new Set(existingWorlds.map(w => w.id));
        
        let addedCount = 0;
        for (const fav of folderWorlds) {
          const worldId = fav.favoriteId;
          const favoriteRecordId = fav.id;
          
          if (!existingIds.has(worldId)) {
            allNewWorlds.push({
              id: worldId,
              name: fav.name,
              authorName: fav.authorName || null,
              releaseStatus: fav.releaseStatus || null,
              thumbnailImageUrl: fav.thumbnailImageUrl || null,
              folderId: folderId,
              favoriteId: favoriteRecordId
            });
            addedCount++;
          }
        }
        
        totalAdded += addedCount;
        console.log(`[API] フォルダ ${folderId}: ${addedCount}件追加`);
        
        await sleep(250);
      } catch (e) {
        console.error(`フォルダ ${folderId} の取得に失敗:`, e);
        fetchErrors.push(`フォルダ ${folderId}: ${e.message}`);
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

// 完全同期 (Diff & Apply)
async function syncAllFavorites(sendResponse) {
  try {
    const worldGroups = await fetchVRChatFavoriteGroups();
    const vrcFolderData = await updateVRCFolderData(worldGroups);
    
    const folderIds = ['worlds1', 'worlds2', 'worlds3', 'worlds4'];
    const vrcCurrentState = [];
    
    for (const folderId of folderIds) {
      const folderData = vrcFolderData[folderId];
      const apiName = folderData.name;
      const favorites = await fetchVRChatFavoritesByTag(apiName);
      
      for (const fav of favorites) {
        if (fav.favoriteId) {
          vrcCurrentState.push({
            worldId: fav.favoriteId,
            folder: folderId,
            favoriteId: fav.id,
            favoriteGroup: fav.favoriteGroup
          });
        }
      }
      
      await sleep(250);
    }
    
    const local = await chrome.storage.local.get(['vrcWorlds']);
    const localIdealState = (local.vrcWorlds || []).map(w => ({
      worldId: w.id,
      folder: w.folderId
    }));
    
    const vrcMap = new Map(vrcCurrentState.map(w => [w.worldId, { favoriteId: w.favoriteId, folder: w.folder, favoriteGroup: w.favoriteGroup }]));
    const localMap = new Map(localIdealState.map(w => [w.worldId, { folder: w.folder }]));
    
    const toRemove = [];
    const toAdd = [];
    
    for (const [worldId, vrcData] of vrcMap.entries()) {
      if (!localMap.has(worldId)) {
        toRemove.push({ worldId, favoriteId: vrcData.favoriteId });
      }
    }
    
    for (const [worldId, localData] of localMap.entries()) {
      if (!vrcMap.has(worldId)) {
        const folderData = vrcFolderData[localData.folder];
        toAdd.push({ worldId, folder: localData.folder, apiName: folderData.name });
      }
    }
    
    let successRemove = 0;
    let successAdd = 0;
    let errors = [];
    
    for (const item of toRemove) {
      try {
        await apiCallWithRetry(async () => {
          const response = await fetch(`${API_BASE}/favorites/${item.favoriteId}`, {
            method: 'DELETE',
            credentials: 'include'
          });
          if (!response.ok) throw new Error(`Delete failed: ${response.status}`);
        });
        successRemove++;
      } catch (e) {
        errors.push(`削除失敗 (World ID: ${item.worldId}): ${e.message}`);
      }
      await sleep(500);
    }
    
    for (const item of toAdd) {
      try {
        await apiCallWithRetry(async () => {
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
          if (!response.ok) throw new Error(`Add failed: ${response.status}`);
        });
        successAdd++;
      } catch (e) {
        errors.push(`追加失敗 (World ID: ${item.worldId}, Folder: ${item.folder}): ${e.message}`);
      }
      await sleep(500);
    }
    
    // 全フォルダの同期状態をクリア
    for (const folderId of folderIds) {
      await clearVRCFolderModifiedState(folderId);
    }
    
    sendResponse({
      success: true,
      removed: successRemove,
      added: successAdd,
      totalRemove: toRemove.length,
      totalAdd: toAdd.length,
      errors: errors.length > 0 ? errors : null
    });
  } catch (error) {
    console.error('[Background] Error syncing all favorites:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// === 内部ヘルパー関数 ===

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

async function removeWorldInternal(worldId, folderId) {
  if (folderId.startsWith('worlds')) {
    const local = await chrome.storage.local.get(['vrcWorlds']);
    const vrcWorlds = (local.vrcWorlds || []).filter(w => w.id !== worldId);
    await chrome.storage.local.set({ vrcWorlds });
    await markVRCFolderAsModified(folderId);
  } else {
    const sync = await chrome.storage.sync.get(['worlds']);
    const syncWorlds = (sync.worlds || []).filter(w => w.id !== worldId);
    await chrome.storage.sync.set({ worlds: syncWorlds });
  }
}

async function addWorldInternal(world) {
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
      await markVRCFolderAsModified(folderId);
      
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

async function getVRCFolderWorlds(folderId) {
  const local = await chrome.storage.local.get(['vrcWorlds']);
  return (local.vrcWorlds || []).filter(w => w.folderId === folderId);
}