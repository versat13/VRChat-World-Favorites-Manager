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
  const n = 100; // 1フォルダあたりの最大取得数
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
 * ワールド詳細情報をバッチ取得
 */
async function fetchWorldDetailsBatch(worldIds) {
  const detailsMap = {};

  for (const worldId of worldIds) {
    try {
      const response = await fetch(`${API_BASE}/worlds/${worldId}`, {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        logError('API_FETCH_DETAILS_ERROR', `Status ${response.status}`, { worldId });
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
      logError('API_FETCH_DETAILS_EXCEPTION', e, { worldId });
    }
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
      if (response.status === 401) throw new Error('VRChatにログインしていません');
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.length === 0) {
      sendResponse({ success: true, favorited: false });
    } else {
      const favorite = data[0];
      sendResponse({
        success: true,
        favorited: true,
        favoriteRecordId: favorite.id,
        folderId: favorite.tags?.[0] || 'worlds1' // API名
      });
    }
  } catch (error) {
    logError('API_GET_FAV_INFO_ERROR', error, { worldId });
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

async function addVRCFavorite(worldId, folderId, sendResponse) {
  try {
    logAction('API_ADD_VRC_FAV', { worldId, folderId });
    const response = await fetch(`${API_BASE}/favorites`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'world', favoriteId: worldId, tags: [folderId] })
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error('VRChatにログインしていません');
      throw new Error(`追加失敗: ${response.status}`);
    }

    const data = await response.json();
    sendResponse({ success: true, favoriteRecordId: data.id });
  } catch (error) {
    logError('API_ADD_VRC_FAV_ERROR', error, { worldId });
    sendResponse({ success: false, error: error.message });
  }
}

async function deleteVRCFavorite(favoriteRecordId, sendResponse) {
  try {
    logAction('API_DELETE_VRC_FAV', { favoriteRecordId });
    const response = await fetch(`${API_BASE}/favorites/${favoriteRecordId}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error('VRChatにログインしていません');
      throw new Error(`削除失敗: ${response.status}`);
    }

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
    const mappedId = folderIds[i]; // worlds1
    vrcFolderData[mappedId] = {
      name: group.name,           // vrc0
      displayName: group.displayName, // Favorite World 1
      vrcApiName: group.name
    };
  }
  await chrome.storage.sync.set({ vrcFolderData });
  logAction('VRC_FOLDER_DATA_UPDATED', vrcFolderData);
  return vrcFolderData;
}

// グローバルまたはファイルスコープで定義
let VRC_TAG_MAP = {}; 

/**
 * ストレージからVRChat公式タグとローカルフォルダIDのマップを取得する
 * (updateVRCFolderDataで保存されたvrcFolderDataを利用)
 * @returns {Promise<Object>} マッピングオブジェクト { 'worlds1': 'worlds1', 'worlds2': 'vrc0', ... }
 */
async function getVRCFolderTagMap() {
    // vrcFolderDataはchrome.storage.syncに保存されていると想定
    const sync = await chrome.storage.sync.get(['vrcFolderData']);
    const vrcFolderData = sync.vrcFolderData || {}; // { worlds1: {..., vrcApiName: 'worlds1'}, ... }の構造

    const tagMap = {};
    // vrcFolderDataを反復処理し、ローカルIDをキー、VRC API名を値とするマップを作成
    for (const localId in vrcFolderData) {
        // vrcApiNameはupdateVRCFolderDataでグループのname（vrc0など）として保存されている
        if (vrcFolderData[localId].vrcApiName) {
            tagMap[localId] = vrcFolderData[localId].vrcApiName;
        }
    }
    return tagMap;
}

/**
 * ローカルフォルダIDからVRChatの公式タグ名を取得する
 * @param {string} localFolderId 拡張機能の内部フォルダID (例: 'worlds2')
 * @returns {string} VRChat APIが認識する公式タグ名 (例: 'vrc0' または 'worlds2' - マッピングがない場合はフォールバック)
 */
function getOfficialTagFromLocalFolderId(localFolderId) {
    // VRC_TAG_MAP が取得済みであることを前提とする
    return VRC_TAG_MAP[localFolderId] || localFolderId; 
}


async function fetchAllVRCFolders(sendResponse) {
  try {
    logAction('FETCH_ALL_VRC_START', {});

    // 1: VRCフォルダ情報取得
    const worldGroups = await fetchVRChatFavoriteGroups();
    await updateVRCFolderData(worldGroups);

    // 2: 各フォルダからワールド取得
    const allVRCWorlds = [];
    const folderIds = ['worlds1', 'worlds2', 'worlds3', 'worlds4'];

    for (let i = 0; i < worldGroups.length && i < 4; i++) {
      const group = worldGroups[i];
      const mappedFolderId = folderIds[i]; // 'worlds1'

      try {
        const favorites = await fetchVRChatFavoritesByTag(group.name); // 'vrc0'
        for (const fav of favorites) {
          if (fav.favoriteId) {
            allVRCWorlds.push({
              id: fav.favoriteId,
              folderId: mappedFolderId,
              favoriteRecordId: fav.id,
              name: null, // あとで詳細取得
            });
          }
        }
        await sleep(300);
      } catch (e) {
        logError('FETCH_VRC_FOLDER_ERROR', e, { folder: group.name });
      }
    }

    logAction('VRC_WORLDS_FETCHED', { totalCount: allVRCWorlds.length });

    // 2.5: ワールド詳細情報を取得
    const worldIds = allVRCWorlds.map(w => w.id);
    const worldDetailsMap = await fetchWorldDetailsBatch(worldIds);

    for (const world of allVRCWorlds) {
      const details = worldDetailsMap[world.id];
      world.name = details?.name || world.id;
      world.authorName = details?.authorName;
      world.releaseStatus = details?.releaseStatus;
      world.thumbnailImageUrl = details?.thumbnailImageUrl;
    }

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

    // 4: 移動処理 (バッチ処理を流用)
    let movedCount = 0;
    if (toMove.length > 0) {
      const moveResponse = await new Promise((resolve) => {
        batchUpdateWorlds({ movedWorlds: toMove, deletedWorlds: [] }, resolve);
      });
      movedCount = moveResponse.movedCount || 0;
    }

    // 5: 新規追加処理
    let addedCount = 0;
    const addErrors = [];
    for (const world of toAdd) {
      // addWorldToFolderは制限チェックと追加を行う
      const result = await addWorldToFolder(world);
      if (result.success) addedCount++;
      else addErrors.push(`${world.id}: ${result.reason || result.error}`);
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

// VRC同期 (エクスポート)
/**
 * 完全同期: 拡張機能の状態をVRC公式に反映
 * Phase 0: 状態取得
 * Phase 1: 削除 (VRCにあるが拡張機能にないワールド)
 * Phase 2: 移動 (フォルダが異なるワールド)
 * Phase 3: 追加 (拡張機能にあるがVRCにないワールド)
 * Phase 4: favoriteRecordId の更新
 */
async function syncAllFavorites(sendResponse) {
  // 既存のコードからデバッグ定数と変数を再定義
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
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');
    if (DEBUG) console.log('[SYNC_EXPORT] 完全同期開始');
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');
    
    // ========================================
    // Phase 0: 状態取得
    // ========================================
    if (DEBUG) console.log('[SYNC_EXPORT] Phase 0: 状態取得開始');
    
    // 🚨【重要修正箇所: ストレージからマッピング情報を取得】
    VRC_TAG_MAP = await getVRCFolderTagMap();
    if (DEBUG) console.log('[SYNC_EXPORT] VRC Tag Map loaded:', VRC_TAG_MAP);

    // VRC側の状態を取得 (既存のまま)
    const worldGroups = await fetchVRChatFavoriteGroups();
    const vrcMap = new Map(); // worldId → { folderId, favoriteRecordId, details }
    const folderIds = ['worlds1', 'worlds2', 'worlds3', 'worlds4'];
    
    // VRChatからのお気に入り全件取得とvrcMap構築 (既存のまま)
    for (let i = 0; i < worldGroups.length && i < 4; i++) {
      const group = worldGroups[i];
      const mappedFolderId = folderIds[i];
      
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
      } catch (e) {
        logError('SYNC_EXPORT_FETCH_VRC_FOLDER', e, { folder: group.name });
        errors.push(`VRCフォルダ取得失敗 (${group.name}): ${e.message}`);
      }
    }
    
    if (DEBUG) console.log('[SYNC_EXPORT] VRC側ワールド数:', vrcMap.size);
    
    // ローカルのVRCワールドを取得 (既存のまま)
    const local = await chrome.storage.local.get(['vrcWorlds']);
    const localVRCWorlds = local.vrcWorlds || [];
    
    // ... (ローカル重複チェックとlocalMap構築は既存のまま)
    const localMap = new Map();
    for (const world of localVRCWorlds) {
      localMap.set(world.id, {
        folderId: world.folderId,
        releaseStatus: world.releaseStatus
      });
    }
    if (DEBUG) console.log('[SYNC_EXPORT] ローカル側ワールド数:', localMap.size);
    
    // ========================================
    // 差分計算 (既存のまま)
    // ========================================
    // ... (toRemove, toMove, toAdd の計算は既存のまま)
    
    const toRemove = []; // { worldId, favoriteRecordId, folderId }
    const toMove = [];   // { worldId, oldFavoriteRecordId, fromFolder, toFolder }
    const toAdd = [];    // { worldId, folderId }
    
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
    
    if (toRemove.length === 0 && toMove.length === 0 && toAdd.length === 0) {
      if (DEBUG) console.log('[SYNC_EXPORT] 変更なし');
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
    // Phase 1: 削除 (変更なし)
    // ========================================
    // ... (削除処理は既存のまま)
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');
    if (DEBUG) console.log('[SYNC_EXPORT] Phase 1: 削除処理 (' + toRemove.length + '件)');
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');
    
    for (const item of toRemove) {
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
        
        await sleep(SYNC_DELAY);
      } catch (e) {
        logError('SYNC_EXPORT_DELETE_EXCEPTION', e, { worldId: item.worldId });
        errors.push(`削除エラー (${item.worldId}): ${e.message}`);
      }
    }
    
    if (DEBUG) console.log(`[SYNC_EXPORT] Phase 1 完了: ${removedCount}/${toRemove.length}件削除`);
    
    // ========================================
    // Phase 2: 移動
    // ========================================
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');
    if (DEBUG) console.log('[SYNC_EXPORT] Phase 2: 移動処理 (' + toMove.length + '件)');
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');
    
    for (const item of toMove) {
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
          await sleep(SYNC_DELAY);
          continue;
        }
        
        await sleep(SYNC_DELAY);
        
        // 2. 追加
        // 🚨【修正箇所: 公式タグ名への変換】
        const targetTag = getOfficialTagFromLocalFolderId(item.toFolder);
        if (DEBUG) console.log(`[SYNC_EXPORT]   => VRC公式タグ: ${targetTag}`);

        const addResponse = await fetch(`${API_BASE}/favorites`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'world',
            favoriteId: item.worldId,
            tags: [targetTag] // 修正: item.toFolder から targetTag へ
          })
        });
        
        if (addResponse.ok) {
          const addData = await addResponse.json();
          // 新しい favoriteRecordId を記録
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
        
        await sleep(SYNC_DELAY);
      } catch (e) {
        logError('SYNC_EXPORT_MOVE_EXCEPTION', e, { worldId: item.worldId });
        errors.push(`移動エラー (${item.worldId}): ${e.message}`);
      }
    }
    
    if (DEBUG) console.log(`[SYNC_EXPORT] Phase 2 完了: ${movedCount}/${toMove.length}件移動`);
    
    // ========================================
    // Phase 3: 追加
    // ========================================
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');
    if (DEBUG) console.log('[SYNC_EXPORT] Phase 3: 追加処理 (' + toAdd.length + '件)');
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');
    
    for (const item of toAdd) {
      try {
        // private/deleted は追加不可
        if (item.releaseStatus === 'private' || item.releaseStatus === 'deleted') {
          if (DEBUG) console.log(`[SYNC_EXPORT] ⚠️ スキップ (${item.releaseStatus}): ${item.worldId}`);
          errors.push(`追加スキップ (${item.worldId}): ${item.releaseStatus}のため追加不可`);
          continue;
        }
        
        if (DEBUG) console.log(`[SYNC_EXPORT] 追加: ${item.worldId} → ${item.folderId}`);
        
        // 🚨【修正箇所: 公式タグ名への変換】
        const targetTag = getOfficialTagFromLocalFolderId(item.folderId); 
        if (DEBUG) console.log(`[SYNC_EXPORT]   => VRC公式タグ: ${targetTag}`);

        const response = await fetch(`${API_BASE}/favorites`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'world',
            favoriteId: item.worldId,
            tags: [targetTag] // 修正: item.folderId から targetTag へ
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          // 新しい favoriteRecordId を記録
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
        
        await sleep(SYNC_DELAY);
      } catch (e) {
        logError('SYNC_EXPORT_ADD_EXCEPTION', e, { worldId: item.worldId });
        errors.push(`追加エラー (${item.worldId}): ${e.message}`);
      }
    }
    
    if (DEBUG) console.log(`[SYNC_EXPORT] Phase 3 完了: ${addedCount}/${toAdd.length}件追加`);
    
    // ========================================
    // Phase 4: favoriteRecordId の更新 (既存のまま)
    // ========================================
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');
    if (DEBUG) console.log('[SYNC_EXPORT] Phase 4: favoriteRecordId 更新');
    if (DEBUG) console.log('[SYNC_EXPORT] ========================================');
    
    const updatedVRCWorlds = [];
    let updateCount = 0;
    
    for (const localWorld of localVRCWorlds) {
      const vrcData = vrcMap.get(localWorld.id);
      
      if (vrcData) {
        // VRCに存在する → favoriteRecordId を更新
        updatedVRCWorlds.push({
          ...localWorld,
          favoriteRecordId: vrcData.favoriteRecordId,
          // localWorldのfolderIdはローカルで整合が取れているはずなので、vrcData.folderIdで上書きしない
          // vrcData.folderIdはVRC側の最新情報だが、ローカルの最新情報（localWorld.folderId）を維持する
          folderId: localWorld.folderId // localWorldのfolderIdを維持
        });
        
        if (localWorld.favoriteRecordId !== vrcData.favoriteRecordId) {
          updateCount++;
          if (DEBUG) console.log(`[SYNC_EXPORT] 更新: ${localWorld.id} → ${vrcData.favoriteRecordId}`);
        }
      } else {
        // VRCに存在しない（削除された） → localVRCWorldsからは削除するべき
        // ここではvrcMapに存在しないものは追加しないことで、ローカルからも削除される
        if (DEBUG) console.log(`[SYNC_EXPORT] 削除済み: ${localWorld.id}`);
      }
    }
    
    await chrome.storage.local.set({ vrcWorlds: updatedVRCWorlds });
    if (DEBUG) console.log(`[SYNC_EXPORT] favoriteRecordId 更新: ${updateCount}件`);
    
    // ========================================
    // 完了 (既存のまま)
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
      totalRemove: toRemove.length,
      totalMove: toMove.length,
      totalAdd: toAdd.length,
      errors: errors.length > 0 ? errors : null
    });
    
  } catch (error) {
    logError('SYNC_EXPORT_FATAL', error);
    if (DEBUG) console.error('[SYNC_EXPORT] ❌ 致命的エラー:', error);
    
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
// ========================================
// 単一ワールド詳細取得 (popup.js用)
// ========================================
/**
 * 単一ワールドの詳細情報を取得
 * popup.jsのfetchWorldDetails呼び出しに対応
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
        // 削除済みワールド
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