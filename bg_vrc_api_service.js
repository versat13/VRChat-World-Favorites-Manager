// bg_vrc_api_service.js
console.log('[VrcApiService] Loaded');

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

/**
 * ワールド詳細をバッチ取得(並列処理で高速化)
 */
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
      } catch (error) {
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

/**
 * ワールド詳細をバッチ取得(進捗コールバック付き)
 */
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
      } catch (error) {
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

    // 進捗通知
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

/**
 * 特定のワールドがVRChatのお気に入りに追加されているか、およびフォルダ情報を取得
 * @param {string} worldId - ワールドID
 * @param {Function} sendResponse - レスポンスを返す関数
 */
async function getVRCFavoriteInfo(worldId, sendResponse) {
  try {
    logAction('API_GET_FAV_INFO', { worldId });
    
    // API呼び出し: 特定のworldIdを持つお気に入りを検索
    const response = await fetch(`${API_BASE}/favorites?type=world&favoriteId=${worldId}`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error('VRChatにログインしていません');
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    // 取得したお気に入りレコードの配列 (最大1件)
    if (data.length === 0) {
      // 登録されていない場合
      sendResponse({
        success: true,
        favorited: false
      });
    } else {
      // 登録されている場合
      const favorite = data[0];
      sendResponse({
        success: true,
        favorited: true,
        favoriteRecordId: favorite.id,
        // tags配列の最初の要素をfolderIdとして返す (VRChatのお気に入りフォルダは1つのみ)
        folderId: favorite.tags?.[0] || 'worlds1' 
      });
    }
  } catch (error) {
    // ネットワークエラーやその他の例外が発生した場合
    logError('API_GET_FAV_INFO_ERROR', error, { worldId });
    sendResponse({ success: false, error: error.message });
  }
}

// ========================================
// 統合VRChatSync処理 (ブリッジウィンドウ用)
// ========================================

/**
 * VRChatブリッジウィンドウからの統合同期処理
 * @param {string} actionType - 'FETCH' または 'REFLECT'
 * @param {Function} progressCallback - 進捗通知用コールバック (action, payload)
 */
async function startVRChatSyncProcess(actionType, progressCallback) {
  const DEBUG = true;

  try {
    if (DEBUG) console.log(`[VRC_BRIDGE] Starting ${actionType} process`);

    const notifyProgress = (message, percent, params = {}) => {
      if (progressCallback) {
        progressCallback('VRC_ACTION_PROGRESS', { message, percent, ...params });
      }
    };

    const notifyComplete = (result = {}) => {
      if (progressCallback) {
        progressCallback('VRC_ACTION_COMPLETE', { result });
      }
    };

    const notifyError = (error) => {
      if (progressCallback) {
        progressCallback('VRC_ACTION_ERROR', { error });
      }
    };

    if (actionType === 'FETCH') {
      notifyProgress('fetch_phase0_fetchingGroups', 10);

      const result = await new Promise((resolve, reject) => {
        fetchAllVRCFolders(
          (response) => {
            if (response.success || response.addedCount > 0) {
              resolve(response);
            } else {
              reject(new Error(response.error || '取得に失敗しました'));
            }
          },
          // 🔥 fetchAllVRCFoldersからの進捗をそのままブリッジウィンドウへ転送
          (message, percent, params) => {
            notifyProgress(message, percent, params);
          }
        );
      });

      if (result.success || result.addedCount > 0) {
        notifyComplete(result);
      } else {
        notifyError(result.error || '取得に失敗しました');
      }

    } else if (actionType === 'REFLECT') {
      notifyProgress('phase0_fetchingGroups', 10);

      await ensureVRCTagMapInitialized();

      notifyProgress('sync_start', 20);

      // 🔥 v1.0.2修正: syncAllFavoritesに進捗コールバックを渡す
      const result = await new Promise((resolve, reject) => {
        syncAllFavorites(
          (response) => {
            if (response.success || response.removedCount > 0 || response.movedCount > 0 || response.addedCount > 0) {
              resolve(response);
            } else {
              reject(new Error(response.error || '反映に失敗しました'));
            }
          },
          // 🔥 v1.0.2修正: 第2引数として進捗コールバックを渡す
          (message, percent, params) => {
            notifyProgress(message, percent, params);
          }
        );
      });

      if (result.success || result.removedCount > 0 || result.movedCount > 0 || result.addedCount > 0) {
        // 最終的なメッセージはhandleCompleteで処理されるため、ここでは通知しない
        notifyComplete(result);
      } else {
        notifyError(result.error || '反映に失敗しました');
      }

    } else {
      const errorMsg = '不明なアクションタイプ: ' + actionType;
      logError('VRC_BRIDGE_INVALID_ACTION', errorMsg, { actionType });
      notifyError(errorMsg);
    }

  } catch (error) {
    logError('VRC_BRIDGE_FATAL', error, { actionType });
    if (progressCallback) {
      progressCallback('VRC_ACTION_ERROR', { error: error.message });
    }
  }
}

// ========================================
// 単一ワールド詳細取得 (popup.js用)
// ========================================

/**
 * 単一ワールドの詳細情報を取得
 */
async function getSingleWorldDetails(worldId, sendResponse) {
  try {
    logAction('API_GET_SINGLE_WORLD', { worldId });

    const response = await fetch(`${API_BASE}/worlds/${worldId}`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 404) {
        sendResponse({
          success: true,
          status: 404,
          details: {
            id: worldId,
            name: '[Deleted]',
            authorName: null,
            releaseStatus: 'deleted',
            thumbnailImageUrl: null
          }
        });
        return;
      }

      logError('API_GET_SINGLE_WORLD_ERROR', `Status ${response.status}`, { worldId });
      sendResponse({
        success: false,
        error: `API error: ${response.status}`,
        status: response.status
      });
      return;
    }

    const data = await response.json();
    sendResponse({
      success: true,
      details: {
        id: data.id,
        name: data.name,
        authorName: data.authorName,
        releaseStatus: data.releaseStatus,
        thumbnailImageUrl: data.thumbnailImageUrl
      }
    });

    logAction('API_GET_SINGLE_WORLD_SUCCESS', { worldId });
  } catch (error) {
    logError('API_GET_SINGLE_WORLD_EXCEPTION', error, { worldId });
    sendResponse({ success: false, error: error.message });
  }
}

async function moveVRCWorldFolder(worldId, favoriteRecordId, fromFolder, toFolder, sendResponse) {
  try {
    logAction('API_MOVE_VRC_START', { worldId, fromFolder, toFolder });
    if (fromFolder === toFolder) {
      sendResponse({ success: true, message: '同じフォルダです' });
      return;
    }

    // 1: 削除
    const deleteResponse = await fetch(`${API_BASE}/favorites/${favoriteRecordId}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!deleteResponse.ok) throw new Error(`削除失敗: ${deleteResponse.status}`);
    await sleep(300);

    // 2: 追加
    const addResponse = await fetch(`${API_BASE}/favorites`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'world', favoriteId: worldId, tags: [toFolder] })
    });

    if (!addResponse.ok) {
      // 3: ロールバック (失敗)
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
    sendResponse({ success: true, newFavoriteRecordId: addData.id });

  } catch (error) {
    logError('API_MOVE_VRC_ERROR', error, { worldId });
    sendResponse({ success: false, error: error.message });
  }
}

// ========================================
// addVRCFavorite - page-favorite.js関連
// ========================================
async function addVRCFavorite(worldId, folderId, sendResponse) {
  try {
    // 🔥 修正: VRC_TAG_MAPが初期化されていることを確認
    await ensureVRCTagMapInitialized();
    
    // 🔥 修正: 内部ID（worlds1など）をVRC公式タグ名に変換
    const officialTag = getOfficialTagFromLocalFolderId(folderId);
    
    logAction('API_ADD_VRC_FAV', { worldId, folderId, officialTag });
    
    const response = await fetch(`${API_BASE}/favorites`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        type: 'world', 
        favoriteId: worldId, 
        tags: [officialTag]  // 🔥 修正: 変換後のタグを使用
      })
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error('VRChatにログインしていません');
      
      // 🔥 修正: 詳細なエラー情報を取得
      let errorDetail = '';
      try {
        const errorData = await response.json();
        errorDetail = errorData.error?.message || JSON.stringify(errorData);
      } catch (error) {
        errorDetail = await response.text();
      }
      
      logError('API_ADD_VRC_FAV_FAILED', `Status ${response.status}: ${errorDetail}`, { 
        worldId, 
        folderId, 
        officialTag 
      });
      
      throw new Error(`追加失敗: ${response.status} - ${errorDetail}`);
    }

    const data = await response.json();
    
    logAction('API_ADD_VRC_FAV_SUCCESS', { 
      worldId, 
      favoriteRecordId: data.id,
      folderId: officialTag
    });
    
    sendResponse({ success: true, favoriteRecordId: data.id });
  } catch (error) {
    logError('API_ADD_VRC_FAV_ERROR', error, { worldId, folderId });
    sendResponse({ success: false, error: error.message });
  }
}

// ========================================
// deleteVRCFavorite - page-favorite.js関連
// ========================================
async function deleteVRCFavorite(favoriteRecordId, sendResponse) {
  try {
    // 🔥 修正: 入力検証を追加
    if (!favoriteRecordId) {
      throw new Error('favoriteRecordIdが指定されていません');
    }
    
    logAction('API_DELETE_VRC_FAV', { favoriteRecordId });
    
    const response = await fetch(`${API_BASE}/favorites/${favoriteRecordId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error('VRChatにログインしていません');
      if (response.status === 404) {
        // 既に削除されている場合は成功扱い
        logAction('API_DELETE_VRC_FAV_ALREADY_DELETED', { favoriteRecordId });
        sendResponse({ success: true });
        return;
      }
      
      // 🔥 修正: 詳細なエラー情報を取得
      let errorDetail = '';
      try {
        const errorData = await response.json();
        errorDetail = errorData.error?.message || JSON.stringify(errorData);
      } catch (error) {
        errorDetail = await response.text();
      }
      
      logError('API_DELETE_VRC_FAV_FAILED', `Status ${response.status}: ${errorDetail}`, { 
        favoriteRecordId 
      });
      
      throw new Error(`削除失敗: ${response.status} - ${errorDetail}`);
    }

    logAction('API_DELETE_VRC_FAV_SUCCESS', { favoriteRecordId });
    sendResponse({ success: true });
  } catch (error) {
    logError('API_DELETE_VRC_FAV_ERROR', error, { favoriteRecordId });
    sendResponse({ success: false, error: error.message });
  }
}

// ========================================
// VRC同期 (メインフロー)
// ========================================

/**
 * VRChatのフォルダ定義をAPIから取得し、ストレージを更新
 */
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

// 🔥 VRC_TAG_MAPの初期化を明示的に管理
let VRC_TAG_MAP = null;

/**
 * VRC_TAG_MAPを確実に初期化する
 */
async function ensureVRCTagMapInitialized() {
  if (VRC_TAG_MAP === null) {
    VRC_TAG_MAP = await getVRCFolderTagMap();
    logAction('VRC_TAG_MAP_INITIALIZED', VRC_TAG_MAP);
  }
  return VRC_TAG_MAP;
}

/**
 * ストレージからVRChat公式タグとローカルフォルダIDのマップを取得する
 */
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

/**
 * ローカルフォルダIDからVRChatの公式タグ名を取得する
 */
function getOfficialTagFromLocalFolderId(localFolderId) {
  if (VRC_TAG_MAP === null) {
    logError('VRC_TAG_MAP_NOT_INITIALIZED', 'VRC_TAG_MAP is not initialized', { localFolderId });
    return localFolderId;
  }
  return VRC_TAG_MAP[localFolderId] || localFolderId;
}

async function fetchAllVRCFolders(sendResponse, progressCallback = null) {
  try {
    logAction('FETCH_ALL_VRC_START', {});

    // 進捗通知ヘルパー
    // 🔥 fetchAllVRCFoldersは、fetch系の汎用的なメッセージを使用する
    const notifyProgress = (message, percent, params = {}) => {
      if (progressCallback) {
        progressCallback(message, percent, params);
      }
    };

    notifyProgress('fetch_phase0_fetchingGroups', 5);

    // 1: VRCフォルダ情報取得
    const worldGroups = await fetchVRChatFavoriteGroups();
    await updateVRCFolderData(worldGroups);

    notifyProgress('fetch_phase0_groupsComplete', 10);

    // 2: 各フォルダからワールド取得
    const allVRCWorlds = [];
    const folderIds = ['worlds1', 'worlds2', 'worlds3', 'worlds4'];

    for (let i = 0; i < worldGroups.length && i < 4; i++) {
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
        logError('FETCH_VRC_FOLDER_ERROR', e, { folder: group.name });
      }
    }

    logAction('VRC_WORLDS_FETCHED', { totalCount: allVRCWorlds.length });
    notifyProgress('fetch_phase1_worldsFetched', 30, { count: allVRCWorlds.length });

    // 2.5: ワールド詳細情報を取得
    notifyProgress('fetch_phase2_fetchingDetails', 35);

    const worldIds = allVRCWorlds.map(w => w.id);
    const worldDetailsMap = await fetchWorldDetailsBatchWithProgress(
      worldIds,
      (current, total) => {
        const progress = 35 + Math.floor((current / total) * 50); // 35%～85%
        // 🔥 進捗率だけでなく、件数情報も通知する
        notifyProgress('fetch_phase2_detailsProgress', progress, { current, total });
      }
    );

    for (const world of allVRCWorlds) {
      const details = worldDetailsMap[world.id];
      world.name = details?.name || world.id;
      world.authorName = details?.authorName;
      world.releaseStatus = details?.releaseStatus;
      world.thumbnailImageUrl = details?.thumbnailImageUrl;
    }

    notifyProgress('fetch_phase3_calculating', 85);

    // 3: 既存ワールドとの差分計算
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

    notifyProgress('fetch_phase4_applying', 90);

    // 4: 移動処理 (バッチ処理を流用)
    let movedCount = 0;
    if (toMove.length > 0) {
      const moveResponse = await new Promise((resolve) => {
        batchUpdateWorlds({ movedWorlds: toMove, deletedWorlds: [] }, resolve);
      });
      movedCount = moveResponse.movedCount || 0;
    }

    notifyProgress('fetch_phase5_addingNew', 95);

    // 5: 新規追加処理
    let addedCount = 0;
    const addErrors = [];
    for (const world of toAdd) {
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
    sendResponse({ success: false, error: error.message });
  }
}

// ========================================
// VRC同期 (エクスポート)
// ========================================

/**
 * 完全同期: 拡張機能の状態をVRC公式に反映 
 * 🔥 v1.0.2: 進捗バーの粒度を大幅に改善, メッセージを翻訳キー化
 */
async function syncAllFavorites(sendResponse, progressCallback = null) {
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
    // 進捗通知ヘルパー
    // 🔥 メッセージは翻訳キーを使用し、必要なパラメータを渡す
    const notifyProgress = (message, percent, params = {}) => {
      if (progressCallback) {
        progressCallback(message, percent, params);
      }
    };

    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');
    if (DEBUG) console.log('[SYNC_EXPORT] 完全同期開始');
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');

    // ========================================
    // Phase 0: 状態取得
    // ========================================
    if (DEBUG) console.log('[SYNC_EXPORT] Phase 0: 状態取得開始');

    notifyProgress('phase0_fetchingGroups', 5);

    // 🔥 修正: VRC_TAG_MAPを確実に初期化
    VRC_TAG_MAP = await ensureVRCTagMapInitialized();
    if (DEBUG) console.log('[SYNC_EXPORT] VRC Tag Map loaded:', VRC_TAG_MAP);

    // VRC側の状態を取得
    const worldGroups = await fetchVRChatFavoriteGroups();
    const vrcMap = new Map();
    const folderIds = ['worlds1', 'worlds2', 'worlds3', 'worlds4'];

    notifyProgress('phase0_fetchingVRCStatus', 10);

    for (let i = 0; i < worldGroups.length && i < 4; i++) {
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
        logError('SYNC_EXPORT_FETCH_VRC_FOLDER', e, { folder: group.name });
        errors.push(`VRCフォルダ取得失敗 (${group.name}): ${e.message}`);
      }
    }

    if (DEBUG) console.log('[SYNC_EXPORT] VRC側ワールド数:', vrcMap.size);

    // ローカルのVRCワールドを取得
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

    // ========================================
    // 差分計算
    // ========================================
    const toRemove = [];
    const toMove = [];
    const toAdd = [];

    // VRCにあるが拡張機能にないもの → 削除
    for (const [worldId, vrcData] of vrcMap) {
      if (!localMap.has(worldId)) {
        toRemove.push({
          worldId,
          favoriteRecordId: vrcData.favoriteRecordId,
          folderId: vrcData.folderId
        });
      }
    }

    // 両方にあるがフォルダが異なる → 移動
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

    // 拡張機能にあるがVRCにない → 追加
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

    // ========================================
    // Phase 1: 削除 (30% → 45%)
    // ========================================
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');
    if (DEBUG) console.log('[SYNC_EXPORT] Phase 1: 削除処理 (' + totalRemove + '件)');
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');

    const PHASE1_START = 30;
    const PHASE1_END = 45;
    const PHASE1_RANGE = PHASE1_END - PHASE1_START;

    for (let i = 0; i < totalRemove; i++) {
      const item = toRemove[i];
      
      // 🔥 v1.0.2: 個別アイテムごとに進捗を更新
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

        // 🔥 v1.0.2: 10件ごとにのみ待機（効率化）
        if ((i + 1) % 10 === 0 || i === totalRemove - 1) {
          await sleep(SYNC_DELAY);
        }
      } catch (error) {
        logError('SYNC_EXPORT_DELETE_EXCEPTION', e, { worldId: item.worldId });
        errors.push(`削除エラー (${item.worldId}): ${e.message}`);
      }
    }

    notifyProgress('phase1_complete', PHASE1_END, { count: removedCount, total: totalRemove });
    if (DEBUG) console.log(`[SYNC_EXPORT] Phase 1 完了: ${removedCount}/${totalRemove}件削除`);

    // ========================================
    // Phase 2: 移動 (45% → 70%)
    // ========================================
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');
    if (DEBUG) console.log('[SYNC_EXPORT] Phase 2: 移動処理 (' + totalMove + '件)');
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');

    const PHASE2_START = 45;
    const PHASE2_END = 70;
    const PHASE2_RANGE = PHASE2_END - PHASE2_START;

    for (let i = 0; i < totalMove; i++) {
      const item = toMove[i];
      
      // 🔥 v1.0.2: 個別アイテムごとに進捗を更新
      const progress = PHASE2_START + Math.floor((i / totalMove) * PHASE2_RANGE);
      notifyProgress('phase2_moving', progress, { current: i + 1, total: totalMove });

      try {
        // private/deleted は移動不可
        if (item.releaseStatus === 'private' || item.releaseStatus === 'deleted') {
          if (DEBUG) console.log(`[SYNC_EXPORT] ⚠️ スキップ (${item.releaseStatus}): ${item.worldId}`);
          errors.push(`移動スキップ (${item.worldId}): ${item.releaseStatus}のため移動不可`);
          continue;
        }

        if (DEBUG) console.log(`[SYNC_EXPORT] 移動: ${item.worldId} (${item.fromFolder} → ${item.toFolder})`);

        // 1. 削除
        const deleteResponse = await fetch(`${API_BASE}/favorites/${item.oldFavoriteRecordId}`, {
          method: 'DELETE',
          credentials: 'include'
        });

        if (!deleteResponse.ok && deleteResponse.status !== 404) {
          const errorText = await deleteResponse.text();
          logError('SYNC_EXPORT_MOVE_DELETE_FAILED', `Status ${deleteResponse.status}`, { worldId: item.worldId, errorText });
          errors.push(`移動削除失敗 (${item.worldId}): ${deleteResponse.status}`);
          
          // 🔥 v1.0.2: 削除失敗時は次へ（待機は10件ごと）
          if ((i + 1) % 10 === 0 || i === totalMove - 1) {
            await sleep(SYNC_DELAY);
          }
          continue;
        }

        // 🔥 v1.0.2: 削除成功後の短い待機（200ms）
        await sleep(200);

        // 2. 追加
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

        // 🔥 v1.0.2: 10件ごとにのみ待機
        if ((i + 1) % 10 === 0 || i === totalMove - 1) {
          await sleep(SYNC_DELAY);
        }
      } catch (error) {
        logError('SYNC_EXPORT_MOVE_EXCEPTION', e, { worldId: item.worldId });
        errors.push(`移動エラー (${item.worldId}): ${e.message}`);
      }
    }

    notifyProgress('phase2_complete', PHASE2_END, { count: movedCount, total: totalMove });
    if (DEBUG) console.log(`[SYNC_EXPORT] Phase 2 完了: ${movedCount}/${totalMove}件移動`);

    // ========================================
    // Phase 3: 追加 (70% → 90%)
    // ========================================
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');
    if (DEBUG) console.log('[SYNC_EXPORT] Phase 3: 追加処理 (' + totalAdd + '件)');
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');

    const PHASE3_START = 70;
    const PHASE3_END = 90;
    const PHASE3_RANGE = PHASE3_END - PHASE3_START;

    for (let i = 0; i < totalAdd; i++) {
      const item = toAdd[i];
      
      // 🔥 v1.0.2: 個別アイテムごとに進捗を更新
      const progress = PHASE3_START + Math.floor((i / totalAdd) * PHASE3_RANGE);
      notifyProgress('phase3_adding', progress, { current: i + 1, total: totalAdd });

      try {
        // private/deleted は追加不可
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

        // 🔥 v1.0.2: 10件ごとにのみ待機
        if ((i + 1) % 10 === 0 || i === totalAdd - 1) {
          await sleep(SYNC_DELAY);
        }
      } catch (error) {
        logError('SYNC_EXPORT_ADD_EXCEPTION', e, { worldId: item.worldId });
        errors.push(`追加エラー (${item.worldId}): ${e.message}`);
      }
    }

    notifyProgress('phase3_complete', PHASE3_END, { count: addedCount, total: totalAdd });
    if (DEBUG) console.log(`[SYNC_EXPORT] Phase 3 完了: ${addedCount}/${totalAdd}件追加`);

    // ========================================
    // Phase 4: favoriteRecordId の更新 (90% → 100%)
    // ========================================
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');
    if (DEBUG) console.log('[SYNC_EXPORT] Phase 4: favoriteRecordId 更新');
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');

    notifyProgress('phase4_updating', 92);

    const updatedVRCWorlds = [];
    let updateCount = 0;

    for (const localWorld of localVRCWorlds) {
      const vrcData = vrcMap.get(localWorld.id);

      if (vrcData) {
        // VRC側に存在する場合のみ favoriteRecordId を更新
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
        // 🔥 VRC側にない場合でもローカルに保持（Phase 3で失敗した可能性）
        updatedVRCWorlds.push(localWorld);
        if (DEBUG) console.log(`[SYNC_EXPORT] VRC側未登録（ローカルに保持）: ${localWorld.id}`);
        // エラーリストに追加（ユーザーに通知）
        errors.push(`${localWorld.name || localWorld.id}: VRC側への反映が確認できませんでした（次回再試行してください）`);
      }
    }

    await chrome.storage.local.set({ vrcWorlds: updatedVRCWorlds });
    if (DEBUG) console.log(`[SYNC_EXPORT] favoriteRecordId 更新: ${updateCount}件`);

    notifyProgress('phase4_complete', 100);

    // ========================================
    // 完了
    // ========================================
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
