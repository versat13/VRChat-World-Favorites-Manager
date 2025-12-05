// bg_vrc_api_service.js v1.3.0 (前半)

// モジュール読み込みログ（開発時のみ）
if (INFO_LOG) console.log('[VrcApiService] Loaded v1.3.0');

// ========================================
// 中断チェックヘルパー関数
// ========================================

function checkAborted(windowId) {
  if (typeof isVRCActionAborted === 'function') {
    return isVRCActionAborted(windowId);
  }
  return false;
}

// ========================================
// VRChatシンクロプロセスのメインエントリーポイント
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
            // 未ログインエラーは静かに返す
            if (response.notLoggedIn) {
              resolve(response);
            } else {
              reject(new Error(response.error || 'Fetch failed'));
            }
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
            // 未ログインエラーは静かに返す
            if (response.notLoggedIn) {
              resolve(response);
            } else {
              reject(new Error(response.error || 'Sync failed'));
            }
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

    await sleep(300);
  }

  logAction('API_FETCH_DETAILS_BATCH_COMPLETE', {
    requested: worldIds.length,
    fetched: Object.keys(detailsMap).length
  });
  return detailsMap;
}

async function fetchSingleWorldDetails(worldId) {
  try {
    const response = await fetch(`${API_BASE}/worlds/${worldId}`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          id: worldId,
          name: worldId,
          authorName: 'Unknown',
          releaseStatus: 'deleted',
          thumbnailImageUrl: null
        };
      }
      throw new Error(`Failed to fetch world details: ${response.status}`);
    }

    const world = await response.json();
    return {
      id: world.id,
      name: world.name,
      authorName: world.authorName,
      releaseStatus: world.releaseStatus,
      thumbnailImageUrl: world.thumbnailImageUrl
    };
  } catch (error) {
    logError('API_FETCH_SINGLE_WORLD_ERROR', error, { worldId });
    return null;
  }
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

    if (data.length === 0) {
      logAction('API_GET_FAV_INFO_NOT_FOUND', { worldId });
      sendResponse(createSuccessResponse({
        favorited: false
      }));
      return;
    }

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

      // 400 = 既に追加済み（正常ケース）
      if (response.status === 400) {
        logAction('API_ADD_VRC_FAV_ALREADY_EXISTS', { worldId });
        sendResponse({
          success: false,
          error: `400: ${errorDetail}`,
          alreadyFavorited: true
        });
        return;
      }

      // 403 = プライベートワールド（正常ケース）
      if (response.status === 403) {
        logAction('API_ADD_VRC_FAV_PRIVATE', { worldId });
        sendResponse({
          success: false,
          error: `403: private`,
          privateWorld: true
        });
        return;
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

      // 404/400 = 既に削除済み（正常ケース）
      if ([400, 404].includes(response.status)) {
        const errorText = await response.text().catch(() => '');
        if (response.status === 400 && errorText.includes('not found')) {
          logAction('API_DELETE_VRC_FAV_NOT_FOUND', { favoriteRecordId });
        } else {
          logAction('API_DELETE_VRC_FAV_ALREADY_DELETED', { favoriteRecordId, status: response.status });
        }
        sendResponse(createSuccessResponse({ alreadyDeleted: true }));
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
// VRC同期 (メタデータ管理)
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
// bg_vrc_api_service.js v1.3.0 (後半)

// ========================================
// VRC Action Handler (background.js から呼び出される)
// ========================================

/**
 * START_VRC_ACTION メッセージのハンドラ
 * background.js のメッセージルーターから呼び出される
 * 
 * @param {Object} request - リクエストオブジェクト
 * @param {string} request.actionType - 'FETCH' または 'REFLECT'
 * @param {number} request.windowId - Bridge ウィンドウID
 * @param {Function} sendResponse - レスポンスコールバック
 */
function handleVRCAction(request, sendResponse) {
  const { actionType, windowId } = request;

  // パラメータ検証
  if (!actionType || !windowId) {
    sendResponse({
      success: false,
      error: 'Invalid request: actionType and windowId are required'
    });
    return;
  }

  // サポートされているアクションタイプの検証
  if (actionType !== 'FETCH' && actionType !== 'REFLECT') {
    sendResponse({
      success: false,
      error: `Invalid actionType: ${actionType}. Must be 'FETCH' or 'REFLECT'`
    });
    return;
  }

  logAction('VRC_ACTION_START', { actionType, windowId });

  // activeVRCProcesses に登録 (background.js で定義されている)
  if (typeof activeVRCProcesses !== 'undefined') {
    activeVRCProcesses.set(windowId, { aborted: false });
  }

  // 即座にレスポンスを返す (非同期処理は別スレッドで実行)
  sendResponse({ success: true, message: 'Processing started' });

  // 非同期処理を開始
  startVRCActionAsync(actionType, windowId);
}

/**
 * VRC 同期処理の非同期実行
 * 
 * @param {string} actionType - 'FETCH' または 'REFLECT'
 * @param {number} windowId - Bridge ウィンドウID
 */
async function startVRCActionAsync(actionType, windowId) {
  try {
    // 進捗コールバックを定義
    const progressCallback = (action, payload) => {
      // background.js の notifyBridgeWindow を呼び出す
      if (typeof notifyBridgeWindow === 'function') {
        notifyBridgeWindow(windowId, action, payload);
      }
    };

    // startVRChatSyncProcess を呼び出して同期処理を実行
    const result = await startVRChatSyncProcess(
      actionType,
      windowId,
      progressCallback
    );

    // 中断されていなければ完了通知を送信
    if (!checkAborted(windowId)) {
      progressCallback('VRC_ACTION_COMPLETE', result);
    }

  } catch (error) {
    logError('VRC_ACTION_FAILED', error, { actionType, windowId });

    // 中断されていなければエラー通知を送信
    if (!checkAborted(windowId)) {
      const progressCallback = (action, payload) => {
        if (typeof notifyBridgeWindow === 'function') {
          notifyBridgeWindow(windowId, action, payload);
        }
      };

      progressCallback('VRC_ACTION_ERROR', {
        error: error.message || 'Unknown error'
      });
    }

  } finally {
    // クリーンアップ (background.js の関数を呼び出す)
    if (typeof cleanupVRCAction === 'function') {
      cleanupVRCAction(windowId);
    }
  }
}

// ========================================
// 定数
// ========================================
const SYNC_DELAY = 600;
const ERROR_DELAY = 2000;
const RATE_LIMIT_WAIT = 10000;
const VERIFICATION_WAIT = 3000;
const MAX_RETRIES = 2;
const CONCURRENCY_DELETE = 8;
const CONCURRENCY_ADD = 1;

// ========================================
// 未分類フォルダIDの取得（背景スクリプト用）
// ========================================
async function getUncategorizedFolderId() {
  try {
    const result = await chrome.storage.local.get(['folders']);
    const folders = result.folders || [];

    // isUncategorized: true のフォルダを検索
    const uncategorizedFolder = folders.find(f => f.isUncategorized === true);

    if (uncategorizedFolder) {
      return uncategorizedFolder.id;
    }

    // 見つからない場合は 'none' を返す（UIの未分類フォルダID）
    return 'none';
  } catch (error) {
    logError('GET_UNCATEGORIZED_FOLDER_ERROR', error);
    return 'none';
  }
}

// ========================================
// ユーティリティ関数
// ========================================

function calculateProgress(current, total, phaseStart, phaseEnd) {
  if (total === 0) return phaseStart;
  return phaseStart + Math.floor((current / total) * (phaseEnd - phaseStart));
}

async function safePromiseAll(promises, onRateLimitHit) {
  try {
    return await Promise.all(promises);
  } catch (error) {
    if (error.message === 'RATE_LIMIT') {
      if (onRateLimitHit) onRateLimitHit();
      throw error;
    }
    throw error;
  }
}

// ========================================
// fetchAllVRCFolders (FETCHå‡¦ç†)
// ========================================

async function fetchAllVRCFolders(sendResponse, progressCallback = null, windowId = null) {
  try {
    const notifyProgress = (message, percent, params = {}) => {
      if (progressCallback) {
        progressCallback('VRC_ACTION_PROGRESS', { message, percent, ...params });
      }
    };

    notifyProgress('fetch_phase0_fetchingGroups', 5);

    if (windowId && checkAborted(windowId)) {
      sendResponse({ success: false, cancelled: true });
      return;
    }

    let worldGroups;
    try {
      worldGroups = await fetchVRChatFavoriteGroups();
    } catch (error) {
      if (error.message.includes('ログインしていません')) {
        logError('FETCH_NOT_LOGGED_IN', 'Not logged in to VRChat');
        sendResponse({
          success: false,
          error: 'VRChatにログインしていません',
          notLoggedIn: true
        });
        return;
      }
      throw error;
    }

    await updateVRCFolderData(worldGroups);

    notifyProgress('fetch_phase0_groupsComplete', 10);

    if (windowId && checkAborted(windowId)) {
      sendResponse({ success: false, cancelled: true });
      return;
    }

    const allVRCWorlds = [];
    const folderIds = ['worlds1', 'worlds2', 'worlds3', 'worlds4'];

    for (let i = 0; i < worldGroups.length && i < 4; i++) {
      if (windowId && checkAborted(windowId)) {
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
              favoriteRecordId: fav.id
            });
          }
        }
        await sleep(300);
      } catch (error) {
        logError('FETCH_VRC_FOLDER_ERROR', error, { folder: group.name });
      }
    }

    notifyProgress('fetch_phase1_worldsFetched', 30, { count: allVRCWorlds.length });

    if (windowId && checkAborted(windowId)) {
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
        const progress = calculateProgress(current, total, 35, 85);
        notifyProgress('fetch_phase2_detailsProgress', progress, { current, total });
      }
    );

    if (windowId && checkAborted(windowId)) {
      sendResponse({ success: false, cancelled: true });
      return;
    }

    // 取得した詳細情報をworldDetails_*に保存
    if (Object.keys(worldDetailsMap).length > 0) {
      logAction('VRC_FETCH_SAVING_DETAILS', { count: Object.keys(worldDetailsMap).length });
      await saveWorldDetailsBatch(worldDetailsMap);
    }

    // Phase 4: 差分計算とバッチ準備
    notifyProgress('fetch_phase4_calculating', 85);

    const allExisting = await getAllWorldsInternal();
    const existingMap = new Map(allExisting.map(w => [w.id, w]));

    const syncWorldsToAdd = [];
    const vrcWorldsToAdd = [];
    const worldsToMove = [];

    for (const vrcWorld of allVRCWorlds) {
      const existing = existingMap.get(vrcWorld.id);
      if (existing) {
        if (existing.folderId !== vrcWorld.folderId) {
          worldsToMove.push({
            worldId: vrcWorld.id,
            fromFolder: existing.folderId,
            toFolder: vrcWorld.folderId,
            favoriteRecordId: existing.favoriteRecordId
          });
        }
      } else {
        const details = worldDetailsMap[vrcWorld.id];
        const worldData = {
          id: vrcWorld.id,
          name: details?.name || vrcWorld.id,
          authorName: details?.authorName || null,
          releaseStatus: details?.releaseStatus || null,
          thumbnailImageUrl: details?.thumbnailImageUrl || null,
          folderId: vrcWorld.folderId,
          favoriteRecordId: vrcWorld.favoriteRecordId
        };

        // VRCフォルダか判定して振り分け
        if (vrcWorld.folderId.startsWith('worlds')) {
          vrcWorldsToAdd.push(worldData);
        } else {
          syncWorldsToAdd.push(worldData);
        }
      }
    }

    // 書き込み回数の事前計算
    let estimatedWrites = 0;

    // 移動処理の書き込み回数
    if (worldsToMove.length > 0) {
      const moveToSync = worldsToMove.filter(m => m.fromFolder.startsWith('worlds') && !m.toFolder.startsWith('worlds')).length;
      const moveToVRC = worldsToMove.filter(m => !m.fromFolder.startsWith('worlds') && m.toFolder.startsWith('worlds')).length;
      const moveSyncToSync = worldsToMove.filter(m => !m.fromFolder.startsWith('worlds') && !m.toFolder.startsWith('worlds')).length;
      const moveVRCToVRC = worldsToMove.filter(m => m.fromFolder.startsWith('worlds') && m.toFolder.startsWith('worlds')).length;

      // Sync側の書き込み（チャンク数）
      if (moveToSync > 0 || moveToVRC > 0 || moveSyncToSync > 0) {
        const currentSyncWorlds = await loadWorldsChunked();
        const afterMoveCount = currentSyncWorlds.length + moveToSync - moveToVRC;
        const chunksNeeded = Math.ceil(afterMoveCount / WORLDS_CHUNK_SIZE);
        estimatedWrites += chunksNeeded + 1; // チャンク保存 + 古いチャンク削除
      }

      // VRC側の書き込み
      if (moveToVRC > 0 || moveVRCToVRC > 0 || moveToSync > 0) {
        estimatedWrites += 1; // vrcWorlds保存
      }
    }

    // 新規追加の書き込み回数
    if (syncWorldsToAdd.length > 0) {
      const currentSyncWorlds = await loadWorldsChunked();
      const afterAddCount = currentSyncWorlds.length + syncWorldsToAdd.length;
      const chunksNeeded = Math.ceil(afterAddCount / WORLDS_CHUNK_SIZE);
      estimatedWrites += chunksNeeded + 1;
    }

    if (vrcWorldsToAdd.length > 0) {
      estimatedWrites += 1; // vrcWorlds保存
    }

    logAction('FETCH_ESTIMATED_WRITES', {
      estimatedWrites,
      moveCount: worldsToMove.length,
      syncAddCount: syncWorldsToAdd.length,
      vrcAddCount: vrcWorldsToAdd.length,
      currentRateLimiterCount: rateLimiter.writeCount
    });

    // レート制限チェック
    const availableWrites = 100 - rateLimiter.writeCount;
    if (estimatedWrites > availableWrites) {
      const waitTime = rateLimiter.getWaitTimeInSeconds();
      logAction('FETCH_RATE_LIMIT_PRECHECK', {
        estimatedWrites,
        availableWrites,
        willWaitSeconds: waitTime
      });

      // 事前に待機
      if (waitTime > 0) {
        notifyProgress('fetch_phase4_rate_limit_wait', 87, { waitSeconds: waitTime });
        await rateLimiter.checkAndWaitWithProgress((progress) => {
          if (progressCallback) {
            progressCallback('VRC_ACTION_PROGRESS', progress);
          }
        });
      }
    }

    // Phase 5: 移動処理（バッチ）
    notifyProgress('fetch_phase5_applying_moves', 90);

    let movedCount = 0;
    if (worldsToMove.length > 0) {
      const moveResponse = await new Promise((resolve) => {
        batchUpdateWorlds({ movedWorlds: worldsToMove, deletedWorlds: [] }, resolve);
      });
      movedCount = moveResponse.movedCount || 0;
    }

    if (windowId && checkAborted(windowId)) {
      sendResponse({ success: false, cancelled: true });
      return;
    }

    // Phase 6: 新規追加（バッチ）
    notifyProgress('fetch_phase6_adding_new', 95);

    let addedCount = 0;

    // Sync側の一括追加
    if (syncWorldsToAdd.length > 0) {
      const syncWorlds = await loadWorldsChunked();
      for (const world of syncWorldsToAdd) {
        syncWorlds.push({ id: world.id, folderId: world.folderId });
      }
      await saveWorldsChunked(syncWorlds);

      // 詳細情報は既に保存済み（Phase 2で完了）
      addedCount += syncWorldsToAdd.length;
    }

    // VRC側の一括追加
    if (vrcWorldsToAdd.length > 0) {
      const local = await chrome.storage.local.get(['vrcWorlds']);
      const vrcWorlds = local.vrcWorlds || [];

      for (const world of vrcWorldsToAdd) {
        vrcWorlds.push({
          id: world.id,
          folderId: world.folderId,
          favoriteRecordId: world.favoriteRecordId
        });
      }

      await chrome.storage.local.set({ vrcWorlds });
      addedCount += vrcWorldsToAdd.length;
    }

    notifyProgress('fetch_phase7_complete', 100);

    logAction('FETCH_COMPLETE', {
      movedCount,
      addedCount,
      totalFolders: worldGroups.length,
      actualWrites: rateLimiter.writeCount
    });

    sendResponse({
      success: true,
      movedCount,
      addedCount,
      totalFolders: worldGroups.length
    });

  } catch (error) {
    logError('FETCH_ALL_VRC_ERROR', error);
    sendResponse(createGenericError(error.message));
  }
}

// ========================================
// syncAllFavorites
// ========================================

async function syncAllFavorites(sendResponse, progressCallback = null, windowId = null) {
  let removedCount = 0;
  let addedCount = 0;
  let movedToUncategorizedCount = 0;
  let totalRemove = 0;
  let totalMove = 0;
  let totalAdd = 0;
  const errors = [];
  const worldsToMoveToUncategorized = new Map();

  const UNCATEGORIZED_FOLDER = await getUncategorizedFolderId();

  const notifyProgress = (message, percent, params = {}) => {
    if (progressCallback) {
      progressCallback('VRC_ACTION_PROGRESS', { message, percent, ...params });
    }
  };

  const _fetchCurrentVRCState = async () => {
    const freshVrcMap = new Map();
    const folderIds = ['worlds1', 'worlds2', 'worlds3', 'worlds4'];

    const groupPromises = folderIds.map((mappedFolderId) => (async () => {
      if (windowId && checkAborted(windowId)) return;

      const officialTag = getOfficialTagFromLocalFolderId(mappedFolderId);
      if (!officialTag) return;

      try {
        const favorites = await fetchVRChatFavoritesByTag(officialTag);
        for (const fav of favorites) {
          if (fav.favoriteId) {
            freshVrcMap.set(fav.favoriteId, {
              folderId: mappedFolderId,
              favoriteRecordId: fav.id,
              name: fav.name || fav.favoriteId,
              releaseStatus: fav.releaseStatus || 'unknown'
            });
          }
        }
      } catch (e) {
        if (e.message.includes('ログインしていません')) {
          throw e;
        }
        logError('SYNC_VERIFY_FETCH_ERROR', e, { folder: officialTag });
        errors.push(`検証中のフォルダ取得失敗 (${officialTag}): ${e.message}`);
      }
    })());

    await Promise.all(groupPromises);
    return freshVrcMap;
  };

  const _calculateDiff = (localMap, vrcMap) => {
    const toRemove = [];
    const toMove = [];
    const toAdd = [];

    for (const [worldId, vrcData] of vrcMap) {
      if (!localMap.has(worldId)) {
        toRemove.push({
          worldId,
          favoriteRecordId: vrcData.favoriteRecordId,
          folderId: vrcData.folderId,
          name: vrcData.name
        });
      }
    }

    for (const [worldId, localData] of localMap) {
      if (localData.folderId === UNCATEGORIZED_FOLDER) continue;

      const vrcData = vrcMap.get(worldId);
      if (vrcData) {
        if (vrcData.folderId !== localData.folderId) {
          toMove.push({
            worldId,
            oldFavoriteRecordId: vrcData.favoriteRecordId,
            fromFolder: vrcData.folderId,
            toFolder: localData.folderId,
            releaseStatus: localData.releaseStatus,
            name: localData.name
          });
        }
      } else {
        toAdd.push({
          worldId,
          folderId: localData.folderId,
          releaseStatus: localData.releaseStatus,
          name: localData.name
        });
      }
    }

    return {
      toRemove,
      toMove,
      toAdd,
      hasDifferences: (toRemove.length + toMove.length + toAdd.length) > 0
    };
  };

  try {
    notifyProgress('phase0_fetchingGroups', 5);

    if (windowId && checkAborted(windowId)) {
      sendResponse({ success: false, cancelled: true });
      return;
    }

    VRC_TAG_MAP = await ensureVRCTagMapInitialized();

    notifyProgress('phase0_fetchingVRCStatus', 10);

    let vrcMap;
    try {
      vrcMap = await _fetchCurrentVRCState();
    } catch (error) {
      if (error.message.includes('ログインしていません')) {
        logError('SYNC_NOT_LOGGED_IN', 'Not logged in to VRChat');
        sendResponse({
          success: false,
          error: 'VRChatにログインしていません',
          notLoggedIn: true
        });
        return;
      }
      throw error;
    }

    const local = await chrome.storage.local.get(['vrcWorlds']);
    const localVRCWorlds = local.vrcWorlds || [];

    // 詳細情報をworldDetails_*から取得
    const worldDetailsMap = await getAllWorldDetailsInternal();

    const localMap = new Map();
    for (const world of localVRCWorlds) {
      const details = worldDetailsMap[world.id];
      localMap.set(world.id, {
        folderId: world.folderId,
        releaseStatus: details?.releaseStatus || null,
        name: details?.name || world.id
      });
    }

    notifyProgress('phase0_calculating', 25);

    if (windowId && checkAborted(windowId)) {
      sendResponse({ success: false, cancelled: true });
      return;
    }

    const initialDiff = _calculateDiff(localMap, vrcMap);
    const toRemove = initialDiff.toRemove;
    const toMove = initialDiff.toMove;
    const toAdd = initialDiff.toAdd;

    const itemsToDelete = [
      ...toRemove.map(item => ({
        worldId: item.worldId,
        favoriteRecordId: item.favoriteRecordId,
        name: item.name
      })),
      ...toMove.map(item => ({
        worldId: item.worldId,
        favoriteRecordId: item.oldFavoriteRecordId,
        name: item.name
      }))
    ];

    const itemsToAdd = [
      ...toAdd,
      ...toMove.map(item => ({
        worldId: item.worldId,
        folderId: item.toFolder,
        releaseStatus: item.releaseStatus,
        name: item.name
      }))
    ];

    totalRemove = itemsToDelete.length;
    totalAdd = itemsToAdd.length;
    totalMove = toMove.length;

    notifyProgress('phase0_calculationComplete', 30, {
      toRemove: totalRemove,
      toMove: totalMove,
      toAdd: totalAdd
    });

    if (!initialDiff.hasDifferences) {
      notifyProgress('phase0_noChanges', 100);
      sendResponse({
        success: true,
        removedCount: 0,
        movedCount: 0,
        addedCount: 0,
        movedToUncategorizedCount: 0,
        message: '変更はありませんでした'
      });
      return;
    }

    // Phase 1: 削除処理
    if (totalRemove > 0) {
      const deleteChunks = [];
      for (let i = 0; i < totalRemove; i += CONCURRENCY_DELETE) {
        deleteChunks.push(itemsToDelete.slice(i, i + CONCURRENCY_DELETE));
      }

      let processedDeleteCount = 0;
      let rateLimitRetries = 0;
      const MAX_RATE_LIMIT_RETRIES = 5;

      for (let i = 0; i < deleteChunks.length; i++) {
        if (windowId && checkAborted(windowId)) {
          sendResponse({ success: false, cancelled: true });
          return;
        }

        const chunk = deleteChunks[i];
        const progress = calculateProgress(processedDeleteCount, totalRemove, 30, 45);
        notifyProgress('phase1_removing', progress, { current: processedDeleteCount + 1, total: totalRemove });

        const chunkPromises = chunk.map(item => (async () => {
          try {
            const response = await fetch(`${API_BASE}/favorites/${item.favoriteRecordId}`, {
              method: 'DELETE',
              credentials: 'include'
            });

            if (response.status === 429) {
              throw new Error('RATE_LIMIT');
            }

            if (response.ok || [404, 400].includes(response.status)) {
              removedCount++;
              if ([400, 404].includes(response.status)) {
                logAction('DELETE_ALREADY_REMOVED', { favoriteRecordId: item.favoriteRecordId, status: response.status });
              }
            } else {
              errors.push(`削除失敗 (${item.name || item.worldId}): ${response.status}`);
            }
          } catch (error) {
            if (error.message === 'RATE_LIMIT') throw error;
            errors.push(`削除エラー (${item.name || item.worldId}): ${error.message}`);
          }
        })());

        try {
          await safePromiseAll(chunkPromises);
          processedDeleteCount += chunk.length;
          rateLimitRetries = 0;
          await sleep(SYNC_DELAY);
        } catch (error) {
          if (error.message === 'RATE_LIMIT') {
            if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
              errors.push(`レート制限が継続しています。処理を中断します。`);
              break;
            }
            notifyProgress('rateLimitWaiting', progress, { waitSeconds: RATE_LIMIT_WAIT / 1000 });
            await sleep(RATE_LIMIT_WAIT);
            rateLimitRetries++;
            i--;
            continue;
          }
          processedDeleteCount += chunk.length;
          await sleep(ERROR_DELAY);
        }
      }
      notifyProgress('phase1_complete', 45, { count: removedCount, total: totalRemove });
    }

    // Phase 2: 短時間待機
    if (totalRemove > 0) {
      notifyProgress('phase2_forceWait', 47, { waitSeconds: VERIFICATION_WAIT / 1000 });
      await sleep(VERIFICATION_WAIT);
    }

    // Phase 3: 追加処理
    if (totalAdd > 0) {
      const addChunks = [];
      for (let i = 0; i < totalAdd; i += CONCURRENCY_ADD) {
        addChunks.push(itemsToAdd.slice(i, i + CONCURRENCY_ADD));
      }

      let processedAddCount = 0;
      let rateLimitRetries = 0;
      const MAX_RATE_LIMIT_RETRIES = 5;

      for (let i = 0; i < addChunks.length; i++) {
        if (windowId && checkAborted(windowId)) {
          sendResponse({ success: false, cancelled: true });
          return;
        }

        const chunk = addChunks[i];
        const progress = calculateProgress(processedAddCount, totalAdd, 50, 85);
        notifyProgress('phase3_adding', progress, { current: processedAddCount + 1, total: totalAdd });

        const chunkPromises = chunk.map(item => (async () => {
          if (item.releaseStatus === 'private' || item.releaseStatus === 'deleted') {
            worldsToMoveToUncategorized.set(item.worldId, {
              name: item.name,
              releaseStatus: item.releaseStatus
            });
            return;
          }

          try {
            const targetTag = getOfficialTagFromLocalFolderId(item.folderId);
            const response = await fetch(`${API_BASE}/favorites`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'world', favoriteId: item.worldId, tags: [targetTag] })
            });

            if (response.status === 429) {
              throw new Error('RATE_LIMIT');
            }

            if (response.ok) {
              addedCount++;
            } else if (response.status === 400) {
              logAction('ADD_ALREADY_EXISTS', { worldId: item.worldId });
              addedCount++;
            } else if (response.status === 403) {
              logAction('ADD_PRIVATE_WORLD', { worldId: item.worldId });
              const worldDetails = await fetchSingleWorldDetails(item.worldId);
              const statusInfo = worldDetails ? worldDetails.releaseStatus : 'unknown';

              if (statusInfo === 'private' || statusInfo === 'deleted') {
                worldsToMoveToUncategorized.set(item.worldId, {
                  name: item.name,
                  releaseStatus: statusInfo
                });
              } else {
                errors.push(`追加失敗 (${item.name || item.worldId}): 403 (予期しないステータス: ${statusInfo})`);
              }
            } else {
              errors.push(`追加失敗 (${item.name || item.worldId}): ${response.status}`);
            }
          } catch (error) {
            if (error.message === 'RATE_LIMIT') throw error;
            errors.push(`追加エラー (${item.name || item.worldId}): ${error.message}`);
          }
        })());

        try {
          await safePromiseAll(chunkPromises);
          processedAddCount += chunk.length;
          rateLimitRetries = 0;
          await sleep(SYNC_DELAY);
        } catch (error) {
          if (error.message === 'RATE_LIMIT') {
            if (rateLimitRetries >= MAX_RATE_LIMIT_RETRIES) {
              errors.push(`レート制限が継続しています。処理を中断します。`);
              break;
            }
            notifyProgress('rateLimitWaiting', progress, { waitSeconds: RATE_LIMIT_WAIT / 1000 });
            await sleep(RATE_LIMIT_WAIT);
            rateLimitRetries++;
            i--;
            continue;
          }
          processedAddCount += chunk.length;
          await sleep(ERROR_DELAY);
        }
      }
      notifyProgress('phase3_complete', 85, { count: addedCount, total: totalAdd });
    }

    notifyProgress('phase4_skipped', 87);

    // Phase 5: 検証・再試行ループ
    let retryCount = 0;
    let stillMissing = true;
    let finalVrcMap = vrcMap;

    while (stillMissing && retryCount <= MAX_RETRIES) {
      if (windowId && checkAborted(windowId)) {
        sendResponse({ success: false, cancelled: true });
        return;
      }

      const waitTime = Math.min(VERIFICATION_WAIT * Math.pow(2, retryCount), 15000);
      notifyProgress('phase5_verifying', 87 + (retryCount * 4), {
        waitSeconds: Math.round(waitTime / 1000),
        retry: retryCount
      });
      await sleep(waitTime);

      const actualVrcMap = await _fetchCurrentVRCState();
      finalVrcMap = actualVrcMap;

      const diff = _calculateDiff(localMap, actualVrcMap);

      if (!diff.hasDifferences) {
        stillMissing = false;
        break;
      }

      retryCount++;
      if (retryCount > MAX_RETRIES) {
        break;
      }

      notifyProgress('phase5_retrying', 90 + (retryCount * 4), {
        current: retryCount,
        max: MAX_RETRIES,
        addCount: diff.toAdd.length,
        removeCount: diff.toRemove.length,
        moveCount: diff.toMove.length
      });

      const retryResult = await retrySyncMissingItems(
        diff.toAdd,
        diff.toRemove,
        diff.toMove,
        progressCallback,
        windowId,
        worldsToMoveToUncategorized,
        90 + (retryCount * 4)
      );

      errors.push(...retryResult.errors);
    }

    notifyProgress('phase5_complete', 98);

    // Phase 6: ローカルストレージ更新 + 詳細情報の保存
    if (windowId && checkAborted(windowId)) {
      sendResponse({ success: false, cancelled: true });
      return;
    }

    const updatedVRCWorlds = [];
    const detailsToSave = {};

    for (const localWorld of localVRCWorlds) {
      const vrcData = finalVrcMap.get(localWorld.id);

      // 詳細情報を収集
      const details = worldDetailsMap[localWorld.id];
      if (details) {
        detailsToSave[localWorld.id] = {
          name: details.name,
          authorName: details.authorName,
          releaseStatus: details.releaseStatus,
          thumbnailImageUrl: details.thumbnailImageUrl
        };
      }

      if (worldsToMoveToUncategorized.has(localWorld.id)) {
        const unavailableInfo = worldsToMoveToUncategorized.get(localWorld.id);

        // vrcWorldsには最小限のデータのみ
        updatedVRCWorlds.push({
          id: localWorld.id,
          folderId: UNCATEGORIZED_FOLDER,
          favoriteRecordId: null
        });

        // 詳細情報を更新
        detailsToSave[localWorld.id] = {
          name: unavailableInfo.name,
          authorName: detailsToSave[localWorld.id]?.authorName || null,
          releaseStatus: unavailableInfo.releaseStatus,
          thumbnailImageUrl: detailsToSave[localWorld.id]?.thumbnailImageUrl || null
        };

        movedToUncategorizedCount++;
        logAction('MOVED_TO_UNCATEGORIZED', {
          worldId: localWorld.id,
          name: unavailableInfo.name,
          status: unavailableInfo.releaseStatus
        });
      } else if (vrcData) {
        // vrcWorldsには最小限のデータのみ
        updatedVRCWorlds.push({
          id: localWorld.id,
          folderId: localWorld.folderId,
          favoriteRecordId: vrcData.favoriteRecordId
        });
      } else {
        // vrcWorldsには最小限のデータのみ
        updatedVRCWorlds.push({
          id: localWorld.id,
          folderId: localWorld.folderId,
          favoriteRecordId: localWorld.favoriteRecordId || null
        });
      }
    }

    // 詳細情報をworldDetails_*に保存
    if (Object.keys(detailsToSave).length > 0) {
      logAction('SYNC_SAVING_DETAILS', { count: Object.keys(detailsToSave).length });
      await saveWorldDetailsBatch(detailsToSave);
    }

    await chrome.storage.local.set({ vrcWorlds: updatedVRCWorlds });

    notifyProgress('phase6_complete', 100);

    logAction('SYNC_COMPLETE', {
      removed: removedCount,
      moved: totalMove,
      added: addedCount,
      movedToUncategorized: movedToUncategorizedCount,
      errors: errors.length
    });

    const finalSuccess = errors.length === 0 || (removedCount + addedCount + movedToUncategorizedCount) > 0;

    sendResponse({
      success: finalSuccess,
      removedCount,
      movedCount: totalMove,
      addedCount,
      movedToUncategorizedCount,
      totalRemove: totalRemove,
      totalMove: totalMove,
      totalAdd: totalAdd,
      errors: errors.length > 0 ? errors : null
    });

  } catch (error) {
    logError('SYNC_FATAL', error);
    sendResponse({
      success: false,
      error: error.message,
      removedCount,
      movedCount: totalMove,
      addedCount,
      movedToUncategorizedCount,
      errors
    });
  }
}

// ========================================
// retrySyncMissingItems - 差分実行関数
// ========================================

async function retrySyncMissingItems(
  missingAdds,
  missingRemoves,
  missingMoves,
  progressCallback,
  windowId,
  worldsToMoveToUncategorized,
  baseProgress
) {
  const errors = [];
  let addedCount = 0;
  let removedCount = 0;
  let movedCount = 0;

  const notifyProgress = (message, percent, params = {}) => {
    if (progressCallback) {
      const limitedPercent = Math.min(baseProgress + 8, percent);
      progressCallback('VRC_ACTION_PROGRESS', { message, percent: limitedPercent, ...params });
    }
  };

  // 削除漏れの再処理
  const totalRemove = missingRemoves.length;
  if (totalRemove > 0) {
    const removeChunks = [];
    for (let i = 0; i < totalRemove; i += CONCURRENCY_ADD) {
      removeChunks.push(missingRemoves.slice(i, i + CONCURRENCY_ADD));
    }
    let processedRemoveCount = 0;
    let rateLimitRetries = 0;

    for (let i = 0; i < removeChunks.length; i++) {
      if (windowId && checkAborted(windowId)) break;
      const chunk = removeChunks[i];
      notifyProgress('phase5_retrying_remove', baseProgress, {
        current: processedRemoveCount + 1,
        total: totalRemove
      });

      const chunkPromises = chunk.map(item => (async () => {
        try {
          const response = await fetch(`${API_BASE}/favorites/${item.favoriteRecordId}`, {
            method: 'DELETE',
            credentials: 'include'
          });

          if (response.status === 429) throw new Error('RATE_LIMIT');

          if (response.ok || [404, 400].includes(response.status)) {
            removedCount++;
            if ([400, 404].includes(response.status)) {
              logAction('RETRY_DELETE_ALREADY_REMOVED', { favoriteRecordId: item.favoriteRecordId, status: response.status });
            }
          } else {
            errors.push(`再試行 削除失敗 (${item.name || item.worldId}): ${response.status}`);
          }
        } catch (error) {
          if (error.message === 'RATE_LIMIT') throw error;
          errors.push(`再試行 削除エラー (${item.name || item.worldId}): ${error.message}`);
        }
      })());

      try {
        await safePromiseAll(chunkPromises);
        processedRemoveCount += chunk.length;
        rateLimitRetries = 0;
        await sleep(SYNC_DELAY);
      } catch (error) {
        if (error.message === 'RATE_LIMIT') {
          if (rateLimitRetries >= 3) break;
          notifyProgress('rateLimitWaiting', baseProgress, { waitSeconds: RATE_LIMIT_WAIT / 1000 });
          await sleep(RATE_LIMIT_WAIT);
          rateLimitRetries++;
          i--;
          continue;
        }
        processedRemoveCount += chunk.length;
        await sleep(ERROR_DELAY);
      }
    }
  }

  // 移動漏れの再処理
  const totalMove = missingMoves.length;
  if (totalMove > 0) {
    for (let i = 0; i < totalMove; i++) {
      if (windowId && checkAborted(windowId)) break;
      const item = missingMoves[i];

      if (worldsToMoveToUncategorized.has(item.worldId)) continue;

      notifyProgress('phase5_retrying_move', baseProgress + 2, {
        current: i + 1,
        total: totalMove
      });

      try {
        if (item.releaseStatus === 'private' || item.releaseStatus === 'deleted') {
          worldsToMoveToUncategorized.set(item.worldId, {
            name: item.name,
            releaseStatus: item.releaseStatus
          });
          continue;
        }

        const deleteResponse = await fetch(`${API_BASE}/favorites/${item.oldFavoriteRecordId}`, {
          method: 'DELETE',
          credentials: 'include'
        });

        if (deleteResponse.status === 429) {
          notifyProgress('rateLimitWaiting', baseProgress + 2, { waitSeconds: RATE_LIMIT_WAIT / 1000 });
          await sleep(RATE_LIMIT_WAIT);
          i--;
          continue;
        }

        if (!deleteResponse.ok && ![404, 400].includes(deleteResponse.status)) {
          errors.push(`再試行 移動削除失敗 (${item.name || item.worldId}): ${deleteResponse.status}`);
          await sleep(ERROR_DELAY);
          continue;
        }

        await sleep(SYNC_DELAY);

        const targetTag = getOfficialTagFromLocalFolderId(item.toFolder);
        const addResponse = await fetch(`${API_BASE}/favorites`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'world', favoriteId: item.worldId, tags: [targetTag] })
        });

        if (addResponse.status === 429) {
          notifyProgress('rateLimitWaiting', baseProgress + 2, { waitSeconds: RATE_LIMIT_WAIT / 1000 });
          await sleep(RATE_LIMIT_WAIT);
          i--;
          continue;
        }

        if (addResponse.ok) {
          movedCount++;
          await sleep(SYNC_DELAY);
        } else if (addResponse.status === 400) {
          logAction('RETRY_MOVE_ALREADY_EXISTS', { worldId: item.worldId });
          movedCount++;
          await sleep(SYNC_DELAY);
        } else if (addResponse.status === 403) {
          logAction('RETRY_MOVE_PRIVATE', { worldId: item.worldId });
          const worldDetails = await fetchSingleWorldDetails(item.worldId);
          const statusInfo = worldDetails ? worldDetails.releaseStatus : 'unknown';

          if (statusInfo === 'private' || statusInfo === 'deleted') {
            worldsToMoveToUncategorized.set(item.worldId, {
              name: item.name,
              releaseStatus: statusInfo
            });
          } else {
            errors.push(`再試行 移動追加失敗 (${item.name || item.worldId}): 403 (予期しないステータス: ${statusInfo})`);
          }
          await sleep(ERROR_DELAY);
        } else {
          errors.push(`再試行 移動追加失敗 (${item.name || item.worldId}): ${addResponse.status}`);
          await sleep(ERROR_DELAY);
        }
      } catch (error) {
        errors.push(`再試行 移動エラー (${item.name || item.worldId}): ${error.message}`);
        await sleep(ERROR_DELAY);
      }
    }
  }

  // 追加漏れの再処理
  const totalAdd = missingAdds.length;
  if (totalAdd > 0) {
    const addChunks = [];
    for (let i = 0; i < totalAdd; i += CONCURRENCY_ADD) {
      addChunks.push(missingAdds.slice(i, i + CONCURRENCY_ADD));
    }
    let processedAddCount = 0;
    let rateLimitRetries = 0;

    for (let i = 0; i < addChunks.length; i++) {
      if (windowId && checkAborted(windowId)) break;
      const chunk = addChunks[i];
      notifyProgress('phase5_retrying_add', baseProgress + 4, {
        current: processedAddCount + 1,
        total: totalAdd
      });

      const chunkPromises = chunk.map(item => (async () => {
        if (worldsToMoveToUncategorized.has(item.worldId)) return;

        if (item.releaseStatus === 'private' || item.releaseStatus === 'deleted') {
          worldsToMoveToUncategorized.set(item.worldId, {
            name: item.name,
            releaseStatus: item.releaseStatus
          });
          return;
        }

        try {
          const targetTag = getOfficialTagFromLocalFolderId(item.folderId);
          const response = await fetch(`${API_BASE}/favorites`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'world', favoriteId: item.worldId, tags: [targetTag] })
          });

          if (response.status === 429) throw new Error('RATE_LIMIT');

          if (response.ok) {
            addedCount++;
          } else if (response.status === 400) {
            logAction('RETRY_ADD_ALREADY_EXISTS', { worldId: item.worldId });
            addedCount++;
          } else if (response.status === 403) {
            logAction('RETRY_ADD_PRIVATE', { worldId: item.worldId });
            const worldDetails = await fetchSingleWorldDetails(item.worldId);
            const statusInfo = worldDetails ? worldDetails.releaseStatus : 'unknown';

            if (statusInfo === 'private' || statusInfo === 'deleted') {
              worldsToMoveToUncategorized.set(item.worldId, {
                name: item.name,
                releaseStatus: statusInfo
              });
            } else {
              errors.push(`再試行 追加失敗 (${item.name || item.worldId}): 403 (予期しないステータス: ${statusInfo})`);
            }
          } else {
            errors.push(`再試行 追加失敗 (${item.name || item.worldId}): ${response.status}`);
          }
        } catch (error) {
          if (error.message === 'RATE_LIMIT') throw error;
          errors.push(`再試行 追加エラー (${item.name || item.worldId}): ${error.message}`);
        }
      })());

      try {
        await safePromiseAll(chunkPromises);
        processedAddCount += chunk.length;
        rateLimitRetries = 0;
        await sleep(SYNC_DELAY);
      } catch (error) {
        if (error.message === 'RATE_LIMIT') {
          if (rateLimitRetries >= 3) break;
          notifyProgress('rateLimitWaiting', baseProgress + 4, { waitSeconds: RATE_LIMIT_WAIT / 1000 });
          await sleep(RATE_LIMIT_WAIT);
          rateLimitRetries++;
          i--;
          continue;
        }
        processedAddCount += chunk.length;
        await sleep(ERROR_DELAY);
      }
    }
  }

  return {
    addedCount,
    removedCount,
    movedCount,
    errors
  };
}