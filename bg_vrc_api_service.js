// bg_vrc_api_service.js v1.2.0 (前半)
console.log('[VrcApiService] Loaded');

// ========================================
// 🔥 中断チェックヘルパー関数
// ========================================

function checkAborted(windowId) {
  if (typeof isVRCActionAborted === 'function') {
    return isVRCActionAborted(windowId);
  }
  return false;
}

// ========================================
// 🔥 VRChatシンクロプロセスのメインエントリーポイント
// ========================================

async function startVRChatSyncProcess(actionType, windowId, progressCallback) {
  logAction('START_VRC_SYNC_PROCESS', { actionType, windowId });

  if (actionType === 'FETCH') {
    return new Promise((resolve, reject) => {
      fetchAllVRCFolders(
        (response) => {
          if (response.success || response.cancelled) {
            resolve(response);
          } else {
            reject(new Error(response.error || 'Fetch failed'));
          }
        },
        progressCallback,
        windowId
      );
    });
  } else if (actionType === 'REFLECT') {
    return new Promise((resolve, reject) => {
      syncAllFavorites(
        (response) => {
          if (response.success || response.cancelled) {
            resolve(response);
          } else {
            reject(new Error(response.error || 'Sync failed'));
          }
        },
        progressCallback,
        windowId
      );
    });
  } else {
    throw new Error(`Unknown actionType: ${actionType}`);
  }
}

// ========================================
// VRChat API (基礎関数)
// ========================================

async function fetchVRChatFavoriteGroups() {
  logAction('API_FETCH_GROUPS_START', {});
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
  logAction('API_FETCH_GROUPS_SUCCESS', { count: worldGroups.length });
  return worldGroups;
}

async function fetchVRChatFavoritesByTag(tag) {
  const n = 100;
  logAction('API_FETCH_FAVORITES_START', { tag });
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
  logAction('API_FETCH_FAVORITES_SUCCESS', { tag, count: favorites.length });
  return favorites;
}

async function fetchWorldDetailsBatch(worldIds) {
  const detailsMap = {};
  const PARALLEL_LIMIT = 8;

  const chunks = [];
  for (let i = 0; i < worldIds.length; i += PARALLEL_LIMIT) {
    chunks.push(worldIds.slice(i, i + PARALLEL_LIMIT));
  }

  for (const chunk of chunks) {
    const promises = chunk.map(async (worldId) => {
      try {
        const response = await fetch(`${API_BASE}/worlds/${worldId}`, {
          method: 'GET',
          credentials: 'include'
        });

        if (!response.ok) {
          logError('API_FETCH_DETAILS_ERROR', `Status ${response.status}`, { worldId });
          return null;
        }

        const world = await response.json();
        return {
          id: world.id,
          details: {
            name: world.name,
            authorName: world.authorName,
            releaseStatus: world.releaseStatus,
            thumbnailImageUrl: world.thumbnailImageUrl
          }
        };
      } catch (e) {
        logError('API_FETCH_DETAILS_EXCEPTION', e, { worldId });
        return null;
      }
    });

    const results = await Promise.all(promises);

    results.forEach(result => {
      if (result) {
        detailsMap[result.id] = result.details;
      }
    });

    await sleep(80);
  }

  logAction('API_FETCH_DETAILS_BATCH_COMPLETE', {
    requested: worldIds.length,
    fetched: Object.keys(detailsMap).length
  });
  return detailsMap;
}

async function fetchWorldDetailsBatchWithProgress(worldIds, progressCallback) {
  const detailsMap = {};
  const PARALLEL_LIMIT = 8;

  const chunks = [];
  for (let i = 0; i < worldIds.length; i += PARALLEL_LIMIT) {
    chunks.push(worldIds.slice(i, i + PARALLEL_LIMIT));
  }

  let processed = 0;
  const total = worldIds.length;

  for (const chunk of chunks) {
    const promises = chunk.map(async (worldId) => {
      try {
        const response = await fetch(`${API_BASE}/worlds/${worldId}`, {
          method: 'GET',
          credentials: 'include'
        });

        if (!response.ok) {
          logError('API_FETCH_DETAILS_ERROR', `Status ${response.status}`, { worldId });
          return null;
        }

        const world = await response.json();
        return {
          id: world.id,
          details: {
            name: world.name,
            authorName: world.authorName,
            releaseStatus: world.releaseStatus,
            thumbnailImageUrl: world.thumbnailImageUrl
          }
        };
      } catch (e) {
        logError('API_FETCH_DETAILS_EXCEPTION', e, { worldId });
        return null;
      }
    });

    const results = await Promise.all(promises);

    results.forEach(result => {
      if (result) {
        detailsMap[result.id] = result.details;
      }
    });

    processed += chunk.length;

    if (progressCallback) {
      progressCallback(processed, total);
    }

    await sleep(80);
  }

  logAction('API_FETCH_DETAILS_BATCH_COMPLETE', {
    requested: worldIds.length,
    fetched: Object.keys(detailsMap).length
  });
  return detailsMap;
}

// ========================================
// VRChat API (ページ操作用)
// ========================================

async function getVRCFavoriteInfo(worldId, sendResponse) {
  try {
    logAction('API_GET_FAV_INFO', { worldId });
    
    const response = await fetch(`${API_BASE}/favorites?type=world&favoriteId=${worldId}`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 401) {
        sendResponse(createAuthError());
        return;
      }
      sendResponse(createApiError(response.status));
      return;
    }

    const data = await response.json();

    // 🔥 修正: 配列が空、またはfavoriteIdが一致しない場合は「未登録」として扱う
    if (data.length === 0) {
      logAction('API_GET_FAV_INFO_NOT_FOUND', { worldId });
      sendResponse(createSuccessResponse({
        favorited: false
      }));
      return;
    }

    // 🔥 重要: 返ってきた結果のfavoriteIdが、リクエストしたworldIdと完全一致するか確認
    const matchingFavorite = data.find(fav => fav.favoriteId === worldId);

    if (!matchingFavorite) {
      logAction('API_GET_FAV_INFO_NO_MATCH', { 
        worldId, 
        foundIds: data.map(f => f.favoriteId).join(', ')
      });
      sendResponse(createSuccessResponse({
        favorited: false
      }));
      return;
    }

    // 完全一致する結果が見つかった場合のみ「登録済み」として扱う
    logAction('API_GET_FAV_INFO_FOUND', { 
      worldId, 
      favoriteRecordId: matchingFavorite.id 
    });
    
    sendResponse(createSuccessResponse({
      favorited: true,
      favoriteRecordId: matchingFavorite.id,
      folderId: matchingFavorite.tags?.[0] || 'worlds1' 
    }));

  } catch (error) {
    logError('API_GET_FAV_INFO_ERROR', error, { worldId });
    sendResponse(createGenericError(error.message));
  }
}

async function moveVRCWorldFolder(worldId, favoriteRecordId, fromFolder, toFolder, sendResponse) {
  try {
    logAction('API_MOVE_VRC_START', { worldId, fromFolder, toFolder });
    if (fromFolder === toFolder) {
      sendResponse(createSuccessResponse({ message: '同じフォルダです' }));
      return;
    }

    const deleteResponse = await fetch(`${API_BASE}/favorites/${favoriteRecordId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!deleteResponse.ok) {
      sendResponse(createApiError(deleteResponse.status, { operation: 'delete' }));
      return;
    }
    await sleep(300);

    const addResponse = await fetch(`${API_BASE}/favorites`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'world', favoriteId: worldId, tags: [toFolder] })
    });

    if (!addResponse.ok) {
      logError('API_MOVE_VRC_ADD_FAILED', `Status ${addResponse.status}`, { worldId });
      const rollbackResponse = await fetch(`${API_BASE}/favorites`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'world', favoriteId: worldId, tags: [fromFolder] })
      });

      if (rollbackResponse.ok) {
        const rollbackData = await rollbackResponse.json();
        sendResponse({
          success: false,
          error: `移動先への追加に失敗しましたが、元のフォルダに復元しました`,
          rolledBack: true,
          newFavoriteRecordId: rollbackData.id
        });
      } else {
        sendResponse({
          success: false,
          error: `移動失敗。ワールドは削除されましたが復元もできませんでした`,
          rolledBack: false
        });
      }
      return;
    }

    const addData = await addResponse.json();
    logAction('API_MOVE_VRC_SUCCESS', { worldId, newId: addData.id });
    sendResponse(createSuccessResponse({ newFavoriteRecordId: addData.id }));

  } catch (error) {
    logError('API_MOVE_VRC_ERROR', error, { worldId });
    sendResponse(createGenericError(error.message));
  }
}

async function addVRCFavorite(worldId, folderId, sendResponse) {
  try {
    await ensureVRCTagMapInitialized();
    const officialTag = getOfficialTagFromLocalFolderId(folderId);

    logAction('API_ADD_VRC_FAV', { worldId, folderId, officialTag });

    const response = await fetch(`${API_BASE}/favorites`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'world',
        favoriteId: worldId,
        tags: [officialTag]
      })
    });

    if (!response.ok) {
      if (response.status === 401) {
        sendResponse(createAuthError());
        return;
      }

      let errorDetail = '';
      try {
        const errorData = await response.json();
        errorDetail = errorData.error?.message || JSON.stringify(errorData);
      } catch (e) {
        errorDetail = await response.text();
      }

      logError('API_ADD_VRC_FAV_FAILED', `Status ${response.status}: ${errorDetail}`, {
        worldId,
        folderId,
        officialTag
      });

      sendResponse(createApiError(response.status, { detail: errorDetail }));
      return;
    }

    const data = await response.json();

    logAction('API_ADD_VRC_FAV_SUCCESS', {
      worldId,
      favoriteRecordId: data.id,
      folderId: officialTag
    });

    sendResponse(createSuccessResponse({ favoriteRecordId: data.id }));
  } catch (error) {
    logError('API_ADD_VRC_FAV_ERROR', error, { worldId, folderId });
    sendResponse(createGenericError(error.message));
  }
}

async function deleteVRCFavorite(favoriteRecordId, sendResponse) {
  try {
    if (!favoriteRecordId) {
      sendResponse(createGenericError('favoriteRecordIdが指定されていません', 'missing_parameter'));
      return;
    }

    logAction('API_DELETE_VRC_FAV', { favoriteRecordId });

    const response = await fetch(`${API_BASE}/favorites/${favoriteRecordId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 401) {
        sendResponse(createAuthError());
        return;
      }
      if (response.status === 404) {
        logAction('API_DELETE_VRC_FAV_ALREADY_DELETED', { favoriteRecordId });
        sendResponse(createSuccessResponse());
        return;
      }

      let errorDetail = '';
      try {
        const errorData = await response.json();
        errorDetail = errorData.error?.message || JSON.stringify(errorData);
      } catch (e) {
        errorDetail = await response.text();
      }

      logError('API_DELETE_VRC_FAV_FAILED', `Status ${response.status}: ${errorDetail}`, {
        favoriteRecordId
      });

      sendResponse(createApiError(response.status, { detail: errorDetail }));
      return;
    }

    logAction('API_DELETE_VRC_FAV_SUCCESS', { favoriteRecordId });
    sendResponse(createSuccessResponse());
  } catch (error) {
    logError('API_DELETE_VRC_FAV_ERROR', error, { favoriteRecordId });
    sendResponse(createGenericError(error.message));
  }
}

// ========================================
// VRC同期 (メインフロー)
// ========================================

async function updateVRCFolderData(worldGroups) {
  const vrcFolderData = {};
  const folderIds = ['worlds1', 'worlds2', 'worlds3', 'worlds4'];

  for (let i = 0; i < worldGroups.length && i < 4; i++) {
    const group = worldGroups[i];
    const mappedId = folderIds[i];
    vrcFolderData[mappedId] = {
      name: group.name,
      displayName: group.displayName,
      vrcApiName: group.name
    };
  }
  await chrome.storage.sync.set({ vrcFolderData });
  logAction('VRC_FOLDER_DATA_UPDATED', vrcFolderData);
  return vrcFolderData;
}

let VRC_TAG_MAP = null;

async function ensureVRCTagMapInitialized() {
  if (VRC_TAG_MAP === null) {
    VRC_TAG_MAP = await getVRCFolderTagMap();
    logAction('VRC_TAG_MAP_INITIALIZED', VRC_TAG_MAP);
  }
  return VRC_TAG_MAP;
}

async function getVRCFolderTagMap() {
  const sync = await chrome.storage.sync.get(['vrcFolderData']);
  const vrcFolderData = sync.vrcFolderData || {};

  const tagMap = {};
  for (const localId in vrcFolderData) {
    if (vrcFolderData[localId].vrcApiName) {
      tagMap[localId] = vrcFolderData[localId].vrcApiName;
    }
  }
  return tagMap;
}

function getOfficialTagFromLocalFolderId(localFolderId) {
  if (VRC_TAG_MAP === null) {
    logError('VRC_TAG_MAP_NOT_INITIALIZED', 'VRC_TAG_MAP is not initialized', { localFolderId });
    return localFolderId;
  }
  return VRC_TAG_MAP[localFolderId] || localFolderId;
}

// ========================================
// シングルワールド詳細取得 (UI用)
// ========================================

async function getSingleWorldDetails(worldId, sendResponse) {
  try {
    logAction('API_GET_SINGLE_WORLD', { worldId });
    
    const response = await fetch(`${API_BASE}/worlds/${worldId}`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 401) {
        sendResponse(createAuthError());
        return;
      }
      if (response.status === 404) {
        // 🔥 削除済みワールドとして保存
        const deletedWorld = {
          id: worldId,
          name: worldId,
          authorName: 'Unknown',
          releaseStatus: 'deleted',
          thumbnailImageUrl: null
        };
        await saveWorldDetailToCache(worldId, deletedWorld);
        logAction('API_GET_SINGLE_WORLD_DELETED', { worldId });
        sendResponse(createSuccessResponse({ world: deletedWorld }));
        return;
      }
      sendResponse(createApiError(response.status));
      return;
    }

    const world = await response.json();
    const worldData = {
      id: world.id,
      name: world.name,
      authorName: world.authorName,
      releaseStatus: world.releaseStatus,
      thumbnailImageUrl: world.thumbnailImageUrl
    };
    
    await saveWorldDetailToCache(worldId, worldData);
    logAction('API_GET_SINGLE_WORLD_SUCCESS', { worldId });
    sendResponse(createSuccessResponse({ world: worldData }));

  } catch (error) {
    logError('API_GET_SINGLE_WORLD_ERROR', error, { worldId });
    sendResponse(createGenericError(error.message));
  }
}

// ========================================
// キャッシュヘルパー関数
// ========================================

async function getWorldDetailFromCache(worldId) {
  const chunkIndex = Math.abs(hashCode(worldId)) % DETAILS_CHUNK_SIZE;
  const key = `worldDetails_${chunkIndex}`;
  
  const result = await chrome.storage.local.get([key]);
  const chunk = result[key] || {};
  
  return chunk[worldId] || null;
}

async function saveWorldDetailToCache(worldId, worldData) {
  const chunkIndex = Math.abs(hashCode(worldId)) % DETAILS_CHUNK_SIZE;
  const key = `worldDetails_${chunkIndex}`;
  
  const result = await chrome.storage.local.get([key]);
  const chunk = result[key] || {};
  
  chunk[worldId] = worldData;
  
  await chrome.storage.local.set({ [key]: chunk });
}

// bg_vrc_api_service.js v1.2.0 (後半)
// 前半からの続き

async function fetchAllVRCFolders(sendResponse, progressCallback = null, windowId = null) {
  try {
    logAction('FETCH_ALL_VRC_START', {});

    const notifyProgress = (message, percent, params = {}) => {
      if (progressCallback) {
        progressCallback('VRC_ACTION_PROGRESS', { message, percent, ...params });
      }
    };

    notifyProgress('fetch_phase0_fetchingGroups', 5);

    if (windowId && checkAborted(windowId)) {
      logAction('FETCH_CANCELLED', { phase: 'initial' });
      sendResponse({ success: false, cancelled: true });
      return;
    }

    const worldGroups = await fetchVRChatFavoriteGroups();
    await updateVRCFolderData(worldGroups);

    notifyProgress('fetch_phase0_groupsComplete', 10);

    if (windowId && checkAborted(windowId)) {
      logAction('FETCH_CANCELLED', { phase: 'after_groups' });
      sendResponse({ success: false, cancelled: true });
      return;
    }

    const allVRCWorlds = [];
    const folderIds = ['worlds1', 'worlds2', 'worlds3', 'worlds4'];

    for (let i = 0; i < worldGroups.length && i < 4; i++) {
      if (windowId && checkAborted(windowId)) {
        logAction('FETCH_CANCELLED', { phase: 'folder_loop', progress: i });
        sendResponse({ success: false, cancelled: true });
        return;
      }

      const group = worldGroups[i];
      const mappedFolderId = folderIds[i];

      notifyProgress('fetch_phase1_fetchingFolder', 10 + (i * 5), {
        name: group.displayName
      });

      try {
        const favorites = await fetchVRChatFavoritesByTag(group.name);
        for (const fav of favorites) {
          if (fav.favoriteId) {
            allVRCWorlds.push({
              id: fav.favoriteId,
              folderId: mappedFolderId,
              favoriteRecordId: fav.id,
              name: null,
            });
          }
        }
        await sleep(300);
      } catch (error) {
        logError('FETCH_VRC_FOLDER_ERROR', error, { folder: group.name });
      }
    }

    logAction('VRC_WORLDS_FETCHED', { totalCount: allVRCWorlds.length });
    notifyProgress('fetch_phase1_worldsFetched', 30, { count: allVRCWorlds.length });

    if (windowId && checkAborted(windowId)) {
      logAction('FETCH_CANCELLED', { phase: 'before_details' });
      sendResponse({ success: false, cancelled: true });
      return;
    }

    notifyProgress('fetch_phase2_fetchingDetails', 35);

    const worldIds = allVRCWorlds.map(w => w.id);
    const worldDetailsMap = await fetchWorldDetailsBatchWithProgress(
      worldIds,
      (current, total) => {
        if (windowId && checkAborted(windowId)) {
          return;
        }
        const progress = 35 + Math.floor((current / total) * 50);
        notifyProgress('fetch_phase2_detailsProgress', progress, { current, total });
      }
    );

    if (windowId && checkAborted(windowId)) {
      logAction('FETCH_CANCELLED', { phase: 'after_details' });
      sendResponse({ success: false, cancelled: true });
      return;
    }

    for (const world of allVRCWorlds) {
      const details = worldDetailsMap[world.id];
      world.name = details?.name || world.id;
      world.authorName = details?.authorName;
      world.releaseStatus = details?.releaseStatus;
      world.thumbnailImageUrl = details?.thumbnailImageUrl;
    }

    notifyProgress('fetch_phase3_calculating', 85);

    const allExisting = await getAllWorldsInternal();
    const existingMap = new Map(allExisting.map(w => [w.id, w]));
    const toMove = [];
    const toAdd = [];

    for (const vrcWorld of allVRCWorlds) {
      const existing = existingMap.get(vrcWorld.id);
      if (existing) {
        if (existing.folderId !== vrcWorld.folderId) {
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

    if (windowId && checkAborted(windowId)) {
      logAction('FETCH_CANCELLED', { phase: 'before_apply' });
      sendResponse({ success: false, cancelled: true });
      return;
    }

    notifyProgress('fetch_phase4_applying', 90);

    let movedCount = 0;
    if (toMove.length > 0) {
      const moveResponse = await new Promise((resolve) => {
        batchUpdateWorlds({ movedWorlds: toMove, deletedWorlds: [] }, resolve);
      });
      movedCount = moveResponse.movedCount || 0;
    }

    if (windowId && checkAborted(windowId)) {
      logAction('FETCH_CANCELLED', { phase: 'after_move' });
      sendResponse({ success: false, cancelled: true });
      return;
    }

    notifyProgress('fetch_phase5_addingNew', 95);

    let addedCount = 0;
    const addErrors = [];
    for (const world of toAdd) {
      if (windowId && checkAborted(windowId)) {
        logAction('FETCH_CANCELLED', { phase: 'add_loop', progress: addedCount });
        sendResponse({ success: false, cancelled: true });
        return;
      }

      const result = await addWorldToFolder(world);
      if (result.success) addedCount++;
      else addErrors.push(`${world.id}: ${result.reason || result.error}`);
      await sleep(80);
    }

    notifyProgress('fetch_phase6_complete', 100);

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
    sendResponse(createGenericError(error.message));
  }
}

async function syncAllFavorites(sendResponse, progressCallback = null, windowId = null) {
  const DEBUG = true;
  const SYNC_DELAY = 500;

  let removedCount = 0;
  let movedCount = 0;
  let addedCount = 0;
  let totalRemove = 0;
  let totalMove = 0;
  let totalAdd = 0;
  const errors = [];

  try {
    const notifyProgress = (message, percent, params = {}) => {
      if (progressCallback) {
        progressCallback('VRC_ACTION_PROGRESS', { message, percent, ...params });
      }
    };

    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');
    if (DEBUG) console.log('[SYNC_EXPORT] 完全同期開始');
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');

    notifyProgress('phase0_fetchingGroups', 5);

    if (windowId && checkAborted(windowId)) {
      logAction('SYNC_CANCELLED', { phase: 'initial' });
      sendResponse({ success: false, cancelled: true });
      return;
    }

    VRC_TAG_MAP = await ensureVRCTagMapInitialized();
    if (DEBUG) console.log('[SYNC_EXPORT] VRC Tag Map loaded:', VRC_TAG_MAP);

    const worldGroups = await fetchVRChatFavoriteGroups();
    const vrcMap = new Map();
    const folderIds = ['worlds1', 'worlds2', 'worlds3', 'worlds4'];

    notifyProgress('phase0_fetchingVRCStatus', 10);

    for (let i = 0; i < worldGroups.length && i < 4; i++) {
      if (windowId && checkAborted(windowId)) {
        logAction('SYNC_CANCELLED', { phase: 'fetch_vrc_folders', progress: i });
        sendResponse({ success: false, cancelled: true });
        return;
      }

      const group = worldGroups[i];
      const mappedFolderId = folderIds[i];

      notifyProgress('phase0_fetchingFolder', 10 + (i * 3), {
        name: group.displayName
      });

      try {
        const favorites = await fetchVRChatFavoritesByTag(group.name);
        for (const fav of favorites) {
          if (fav.favoriteId) {
            vrcMap.set(fav.favoriteId, {
              folderId: mappedFolderId,
              favoriteRecordId: fav.id,
              name: fav.name || fav.favoriteId,
              releaseStatus: fav.releaseStatus || 'unknown'
            });
          }
        }
        await sleep(300);
      } catch (error) {
        logError('SYNC_EXPORT_FETCH_VRC_FOLDER', error, { folder: group.name });
        errors.push(`VRCフォルダ取得失敗 (${group.name}): ${error.message}`);
      }
    }

    if (DEBUG) console.log('[SYNC_EXPORT] VRC側ワールド数:', vrcMap.size);

    const local = await chrome.storage.local.get(['vrcWorlds']);
    const localVRCWorlds = local.vrcWorlds || [];

    const localMap = new Map();
    for (const world of localVRCWorlds) {
      localMap.set(world.id, {
        folderId: world.folderId,
        releaseStatus: world.releaseStatus
      });
    }
    if (DEBUG) console.log('[SYNC_EXPORT] ローカル側ワールド数:', localMap.size);

    notifyProgress('phase0_calculating', 25);

    if (windowId && checkAborted(windowId)) {
      logAction('SYNC_CANCELLED', { phase: 'before_diff' });
      sendResponse({ success: false, cancelled: true });
      return;
    }

    const toRemove = [];
    const toMove = [];
    const toAdd = [];

    for (const [worldId, vrcData] of vrcMap) {
      if (!localMap.has(worldId)) {
        toRemove.push({
          worldId,
          favoriteRecordId: vrcData.favoriteRecordId,
          folderId: vrcData.folderId
        });
      }
    }

    for (const [worldId, localData] of localMap) {
      const vrcData = vrcMap.get(worldId);
      if (vrcData && vrcData.folderId !== localData.folderId) {
        toMove.push({
          worldId,
          oldFavoriteRecordId: vrcData.favoriteRecordId,
          fromFolder: vrcData.folderId,
          toFolder: localData.folderId,
          releaseStatus: localData.releaseStatus
        });
      }
    }

    for (const [worldId, localData] of localMap) {
      if (!vrcMap.has(worldId)) {
        toAdd.push({
          worldId,
          folderId: localData.folderId,
          releaseStatus: localData.releaseStatus
        });
      }
    }

    if (DEBUG) console.log('[SYNC_EXPORT] 削除対象:', toRemove.length);
    if (DEBUG) console.log('[SYNC_EXPORT] 移動対象:', toMove.length);
    if (DEBUG) console.log('[SYNC_EXPORT] 追加対象:', toAdd.length);

    totalRemove = toRemove.length;
    totalMove = toMove.length;
    totalAdd = toAdd.length;

    notifyProgress('phase0_calculationComplete', 30, {
      toRemove: totalRemove,
      toMove: totalMove,
      toAdd: totalAdd
    });

    if (totalRemove === 0 && totalMove === 0 && totalAdd === 0) {
      if (DEBUG) console.log('[SYNC_EXPORT] 変更なし');
      notifyProgress('phase0_noChanges', 100);
      sendResponse({
        success: true,
        removedCount: 0,
        movedCount: 0,
        addedCount: 0,
        message: '変更はありませんでした'
      });
      return;
    }

    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');
    if (DEBUG) console.log('[SYNC_EXPORT] Phase 1: 削除処理 (' + totalRemove + '件)');
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');

    const PHASE1_START = 30;
    const PHASE1_END = 45;
    const PHASE1_RANGE = PHASE1_END - PHASE1_START;

    for (let i = 0; i < totalRemove; i++) {
      if (windowId && checkAborted(windowId)) {
        logAction('SYNC_CANCELLED', { phase: 'remove', progress: i });
        sendResponse({ success: false, cancelled: true });
        return;
      }

      const item = toRemove[i];
      const progress = PHASE1_START + Math.floor((i / totalRemove) * PHASE1_RANGE);
      notifyProgress('phase1_removing', progress, { current: i + 1, total: totalRemove });

      try {
        if (DEBUG) console.log(`[SYNC_EXPORT] 削除: ${item.worldId} (${item.folderId})`);

        const response = await fetch(`${API_BASE}/favorites/${item.favoriteRecordId}`, {
          method: 'DELETE',
          credentials: 'include'
        });

        if (response.ok || response.status === 404) {
          removedCount++;
          if (DEBUG) console.log(`[SYNC_EXPORT] ✓ 削除成功: ${item.worldId}`);
        } else {
          const errorText = await response.text();
          logError('SYNC_EXPORT_DELETE_FAILED', `Status ${response.status}`, { worldId: item.worldId, errorText });
          errors.push(`削除失敗 (${item.worldId}): ${response.status}`);
        }

        if ((i + 1) % 10 === 0 || i === totalRemove - 1) {
          await sleep(SYNC_DELAY);
        }
      } catch (error) {
        logError('SYNC_EXPORT_DELETE_EXCEPTION', error, { worldId: item.worldId });
        errors.push(`削除エラー (${item.worldId}): ${error.message}`);
      }
    }

    notifyProgress('phase1_complete', PHASE1_END, { count: removedCount, total: totalRemove });
    if (DEBUG) console.log(`[SYNC_EXPORT] Phase 1 完了: ${removedCount}/${totalRemove}件削除`);

    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');
    if (DEBUG) console.log('[SYNC_EXPORT] Phase 2: 移動処理 (' + totalMove + '件)');
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');

    const PHASE2_START = 45;
    const PHASE2_END = 70;
    const PHASE2_RANGE = PHASE2_END - PHASE2_START;

    for (let i = 0; i < totalMove; i++) {
      if (windowId && checkAborted(windowId)) {
        logAction('SYNC_CANCELLED', { phase: 'move', progress: i });
        sendResponse({ success: false, cancelled: true });
        return;
      }

      const item = toMove[i];
      const progress = PHASE2_START + Math.floor((i / totalMove) * PHASE2_RANGE);
      notifyProgress('phase2_moving', progress, { current: i + 1, total: totalMove });

      try {
        if (item.releaseStatus === 'private' || item.releaseStatus === 'deleted') {
          if (DEBUG) console.log(`[SYNC_EXPORT] ⚠️ スキップ (${item.releaseStatus}): ${item.worldId}`);
          errors.push(`移動スキップ (${item.worldId}): ${item.releaseStatus}のため移動不可`);
          continue;
        }

        if (DEBUG) console.log(`[SYNC_EXPORT] 移動: ${item.worldId} (${item.fromFolder} → ${item.toFolder})`);

        const deleteResponse = await fetch(`${API_BASE}/favorites/${item.oldFavoriteRecordId}`, {
          method: 'DELETE',
          credentials: 'include'
        });

        if (!deleteResponse.ok && deleteResponse.status !== 404) {
          const errorText = await deleteResponse.text();
          logError('SYNC_EXPORT_MOVE_DELETE_FAILED', `Status ${deleteResponse.status}`, { worldId: item.worldId, errorText });
          errors.push(`移動削除失敗 (${item.worldId}): ${deleteResponse.status}`);
          if ((i + 1) % 10 === 0 || i === totalMove - 1) {
            await sleep(SYNC_DELAY);
          }
          continue;
        }

        await sleep(200);

        const targetTag = getOfficialTagFromLocalFolderId(item.toFolder);
        if (DEBUG) console.log(`[SYNC_EXPORT]   => VRC公式タグ: ${targetTag}`);

        const addResponse = await fetch(`${API_BASE}/favorites`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'world',
            favoriteId: item.worldId,
            tags: [targetTag]
          })
        });

        if (addResponse.ok) {
          const addData = await addResponse.json();
          vrcMap.set(item.worldId, {
            folderId: item.toFolder,
            favoriteRecordId: addData.id,
            name: addData.name || item.worldId,
            releaseStatus: addData.releaseStatus
          });
          movedCount++;
          if (DEBUG) console.log(`[SYNC_EXPORT] ✓ 移動成功: ${item.worldId} → ${addData.id}`);
        } else {
          const errorText = await addResponse.text();
          logError('SYNC_EXPORT_MOVE_ADD_FAILED', `Status ${addResponse.status}`, { worldId: item.worldId, errorText });
          errors.push(`移動追加失敗 (${item.worldId}): ${addResponse.status}`);
        }

        if ((i + 1) % 10 === 0 || i === totalMove - 1) {
          await sleep(SYNC_DELAY);
        }
      } catch (error) {
        logError('SYNC_EXPORT_MOVE_EXCEPTION', error, { worldId: item.worldId });
        errors.push(`移動エラー (${item.worldId}): ${error.message}`);
      }
    }

    notifyProgress('phase2_complete', PHASE2_END, { count: movedCount, total: totalMove });
    if (DEBUG) console.log(`[SYNC_EXPORT] Phase 2 完了: ${movedCount}/${totalMove}件移動`);

    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');
    if (DEBUG) console.log('[SYNC_EXPORT] Phase 3: 追加処理 (' + totalAdd + '件)');
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');

    const PHASE3_START = 70;
    const PHASE3_END = 90;
    const PHASE3_RANGE = PHASE3_END - PHASE3_START;

    for (let i = 0; i < totalAdd; i++) {
      if (windowId && checkAborted(windowId)) {
        logAction('SYNC_CANCELLED', { phase: 'add', progress: i });
        sendResponse({ success: false, cancelled: true });
        return;
      }

      const item = toAdd[i];
      const progress = PHASE3_START + Math.floor((i / totalAdd) * PHASE3_RANGE);
      notifyProgress('phase3_adding', progress, { current: i + 1, total: totalAdd });

      try {
        if (item.releaseStatus === 'private' || item.releaseStatus === 'deleted') {
          if (DEBUG) console.log(`[SYNC_EXPORT] ⚠️ スキップ (${item.releaseStatus}): ${item.worldId}`);
          errors.push(`追加スキップ (${item.worldId}): ${item.releaseStatus}のため追加不可`);
          continue;
        }

        if (DEBUG) console.log(`[SYNC_EXPORT] 追加: ${item.worldId} → ${item.folderId}`);

        const targetTag = getOfficialTagFromLocalFolderId(item.folderId);
        if (DEBUG) console.log(`[SYNC_EXPORT]   => VRC公式タグ: ${targetTag}`);

        const response = await fetch(`${API_BASE}/favorites`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'world',
            favoriteId: item.worldId,
            tags: [targetTag]
          })
        });

        if (response.ok) {
          const data = await response.json();
          vrcMap.set(item.worldId, {
            folderId: item.folderId,
            favoriteRecordId: data.id,
            name: data.name || item.worldId,
            releaseStatus: data.releaseStatus
          });
          addedCount++;
          if (DEBUG) console.log(`[SYNC_EXPORT] ✓ 追加成功: ${item.worldId} → ${data.id}`);
        } else {
          const errorText = await response.text();
          logError('SYNC_EXPORT_ADD_FAILED', `Status ${response.status}`, { worldId: item.worldId, errorText });
          errors.push(`追加失敗 (${item.worldId}): ${response.status}`);
        }

        if ((i + 1) % 10 === 0 || i === totalAdd - 1) {
          await sleep(SYNC_DELAY);
        }
      } catch (error) {
        logError('SYNC_EXPORT_ADD_EXCEPTION', error, { worldId: item.worldId });
        errors.push(`追加エラー (${item.worldId}): ${error.message}`);
      }
    }

    notifyProgress('phase3_complete', PHASE3_END, { count: addedCount, total: totalAdd });
    if (DEBUG) console.log(`[SYNC_EXPORT] Phase 3 完了: ${addedCount}/${totalAdd}件追加`);

    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');
    if (DEBUG) console.log('[SYNC_EXPORT] Phase 4: favoriteRecordId 更新');
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');

    notifyProgress('phase4_updating', 92);

    if (windowId && checkAborted(windowId)) {
      logAction('SYNC_CANCELLED', { phase: 'update_records' });
      sendResponse({ success: false, cancelled: true });
      return;
    }

    const updatedVRCWorlds = [];
    let updateCount = 0;

    for (const localWorld of localVRCWorlds) {
      const vrcData = vrcMap.get(localWorld.id);

      if (vrcData) {
        updatedVRCWorlds.push({
          ...localWorld,
          favoriteRecordId: vrcData.favoriteRecordId,
          folderId: localWorld.folderId
        });

        if (localWorld.favoriteRecordId !== vrcData.favoriteRecordId) {
          updateCount++;
          if (DEBUG) console.log(`[SYNC_EXPORT] 更新: ${localWorld.id} → ${vrcData.favoriteRecordId}`);
        }
      } else {
        updatedVRCWorlds.push(localWorld);
        if (DEBUG) console.log(`[SYNC_EXPORT] VRC側未登録(ローカルに保持): ${localWorld.id}`);
        errors.push(`${localWorld.name || localWorld.id}: VRC側への反映が確認できませんでした(次回再試行してください)`);
      }
    }

    await chrome.storage.local.set({ vrcWorlds: updatedVRCWorlds });
    if (DEBUG) console.log(`[SYNC_EXPORT] favoriteRecordId 更新: ${updateCount}件`);

    notifyProgress('phase4_complete', 100);

    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');
    if (DEBUG) console.log('[SYNC_EXPORT] 完全同期完了');
    if (DEBUG) console.log('[SYNC_EXPORT] 削除:', removedCount, '件');
    if (DEBUG) console.log('[SYNC_EXPORT] 移動:', movedCount, '件');
    if (DEBUG) console.log('[SYNC_EXPORT] 追加:', addedCount, '件');
    if (DEBUG) console.log('[SYNC_EXPORT] エラー:', errors.length, '件');
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');

    logAction('SYNC_EXPORT_COMPLETE', {
      removed: removedCount,
      moved: movedCount,
      added: addedCount,
      errors: errors.length
    });

    sendResponse({
      success: errors.length === 0 || (removedCount + movedCount + addedCount) > 0,
      removedCount,
      movedCount,
      addedCount,
      totalRemove: totalRemove,
      totalMove: totalMove,
      totalAdd: totalAdd,
      errors: errors.length > 0 ? errors : null
    });

  } catch (error) {
    logError('SYNC_EXPORT_FATAL', error);
    if (DEBUG) console.error('[SYNC_EXPORT] ✗ 致命的エラー:', error);

    sendResponse({
      success: false,
      error: error.message,
      removedCount,
      movedCount,
      addedCount,
      errors
    });
  }
}