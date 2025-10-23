// bg_storage_service.js
console.log('[StorageService] Loaded');

// ========================================
// ストレージ初期化・統計
// ========================================

async function initializeStorage() {
  const sync = await chrome.storage.sync.get(['folders', 'vrcFolderData', 'worlds', 'worlds_0']);
  const local = await chrome.storage.local.get(['vrcWorlds', 'worldDetails']);

  if (!sync.folders) await chrome.storage.sync.set({ folders: [] });
  if (!local.vrcWorlds) await chrome.storage.local.set({ vrcWorlds: [] });

  // 旧形式のworldsが存在する場合、分割形式に移行
  if (sync.worlds && sync.worlds.length > 0) {
    logAction('MIGRATE_WORLDS_TO_CHUNKED', { count: sync.worlds.length });
    await saveWorldsChunked(sync.worlds);
    await chrome.storage.sync.remove(['worlds']);
  }

  // 分割形式が存在しない場合は初期化
  if (!sync.worlds_0) {
    await chrome.storage.sync.set({ worlds_0: [] });
  }

  // 旧形式のworldDetailsが存在する場合、分割形式に移行
  if (local.worldDetails && Object.keys(local.worldDetails).length > 0) {
    logAction('MIGRATE_WORLD_DETAILS', { count: Object.keys(local.worldDetails).length });
    await saveWorldDetailsBatch(local.worldDetails);
    await chrome.storage.local.remove(['worldDetails']);
  }

  if (!sync.vrcFolderData) {
    await chrome.storage.sync.set({ vrcFolderData: {} });
  }
}

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
    sendResponse(stats);
  } catch (error) {
    logError('GET_STORAGE_STATS', error);
    sendResponse({ error: error.message });
  }
}

// ========================================
// worldDetails保存ヘルパー（分割I/O）
// ========================================

async function saveWorldDetails(worldId, details) {
  // 元のコードではランダムなキーに保存していたが、
  // IDに基づいて決定論的なキーに保存する方が管理しやすい
  const chunkIndex = Math.abs(worldId.split('').reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) | 0, 0)) % DETAILS_CHUNK_SIZE;
  const chunkKey = `worldDetails_${chunkIndex}`;

  const local = await chrome.storage.local.get([chunkKey]);
  const chunk = local[chunkKey] || {};
  chunk[worldId] = details;
  await chrome.storage.local.set({ [chunkKey]: chunk });
}

async function saveWorldDetailsBatch(detailsMap) {
  const chunks = {};

  for (const [worldId, details] of Object.entries(detailsMap)) {
    // IDに基づいて決定論的なキーを選択
    const chunkIndex = Math.abs(worldId.split('').reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) | 0, 0)) % DETAILS_CHUNK_SIZE;
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
  // IDからキーを特定
  const chunkIndex = Math.abs(worldId.split('').reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) | 0, 0)) % DETAILS_CHUNK_SIZE;
  const chunkKey = `worldDetails_${chunkIndex}`;

  const local = await chrome.storage.local.get([chunkKey]);
  if (local[chunkKey] && local[chunkKey][worldId]) {
    return local[chunkKey][worldId];
  }

  // フォールバック (全スキャン)
  for (let i = 0; i < DETAILS_CHUNK_SIZE; i++) {
    const key = `worldDetails_${i}`;
    const chunk = await chrome.storage.local.get([key]);
    if (chunk[key] && chunk[key][worldId]) {
      return chunk[key][worldId];
    }
  }

  return null;
}

async function deleteWorldDetails(worldId) {
  // IDからキーを特定
  const chunkIndex = Math.abs(worldId.split('').reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) | 0, 0)) % DETAILS_CHUNK_SIZE;
  const chunkKey = `worldDetails_${chunkIndex}`;

  const local = await chrome.storage.local.get([chunkKey]);
  if (local[chunkKey] && local[chunkKey][worldId]) {
    delete local[chunkKey][worldId];
    await chrome.storage.local.set({ [chunkKey]: local[chunkKey] });
    return;
  }

  // フォールバック (全スキャン)
  for (let i = 0; i < DETAILS_CHUNK_SIZE; i++) {
    const key = `worldDetails_${i}`;
    const chunk = await chrome.storage.local.get([key]);
    if (chunk[key] && chunk[key][worldId]) {
      delete chunk[key][worldId];
      await chrome.storage.local.set({ [key]: chunk[key] });
      return;
    }
  }
}

async function getAllWorldDetailsInternal() {
  const allKeys = await chrome.storage.local.get(null);
  const worldDetails = {};

  const detailKeys = Object.keys(allKeys).filter(key => key.startsWith('worldDetails_'));

  for (const key of detailKeys) {
    Object.assign(worldDetails, allKeys[key]);
  }

  return worldDetails;
}

// ========================================
// worlds分割保存ヘルパー
// ========================================

/**
 * worlds配列を分割して保存
 */
async function saveWorldsChunked(worlds) {
  const chunks = {};

  // チャンクに分割
  for (let i = 0; i < worlds.length; i += WORLDS_CHUNK_SIZE) {
    const chunkIndex = Math.floor(i / WORLDS_CHUNK_SIZE);
    const chunkKey = `worlds_${chunkIndex}`;
    chunks[chunkKey] = worlds.slice(i, i + WORLDS_CHUNK_SIZE);
  }

  // 既存のチャンクをクリア
  const sync = await chrome.storage.sync.get(null);
  const oldChunkKeys = Object.keys(sync).filter(key => key.startsWith('worlds_'));

  // 新しいチャンクを保存
  for (const [key, value] of Object.entries(chunks)) {
    await chrome.storage.sync.set({ [key]: value });
  }

  // 不要になった古いチャンクを削除
  const newChunkKeys = Object.keys(chunks);
  const keysToRemove = oldChunkKeys.filter(key => !newChunkKeys.includes(key));
  if (keysToRemove.length > 0) {
    await chrome.storage.sync.remove(keysToRemove);
  }

  logAction('WORLDS_CHUNKED_SAVED', {
    totalWorlds: worlds.length,
    chunks: Object.keys(chunks).length
  });
}

/**
 * 分割保存されたworlds配列を読み込み
 */
async function loadWorldsChunked() {
  const sync = await chrome.storage.sync.get(null);
  const worlds = [];

  // worlds_0, worlds_1, ... の順に読み込み
  for (let i = 0; i < MAX_WORLDS_CHUNKS; i++) {
    const chunkKey = `worlds_${i}`;
    if (sync[chunkKey]) {
      worlds.push(...sync[chunkKey]);
    }
  }

  return worlds;
}

/**
 * 特定のワールドを追加（分割保存対応）
 */
async function addWorldToChunkedStorage(worldId, folderId) {
  const worlds = await loadWorldsChunked();
  worlds.push({ id: worldId, folderId: folderId });
  await saveWorldsChunked(worlds);
}

/**
 * 特定のワールドを削除（分割保存対応）
 */
async function removeWorldFromChunkedStorage(worldId) {
  const worlds = await loadWorldsChunked();
  const filtered = worlds.filter(w => w.id !== worldId);
  await saveWorldsChunked(filtered);
}

/**
 * 特定のワールドを更新（分割保存対応）
 */
async function updateWorldInChunkedStorage(worldId, newFolderId) {
  const worlds = await loadWorldsChunked();
  const index = worlds.findIndex(w => w.id === worldId);
  if (index !== -1) {
    worlds[index].folderId = newFolderId;
    await saveWorldsChunked(worlds);
  }
}

// ========================================
// 初期化処理の修正
// ========================================

async function initializeStorage() {
  const sync = await chrome.storage.sync.get(['folders', 'vrcFolderData', 'worlds', 'worlds_0']);
  const local = await chrome.storage.local.get(['vrcWorlds', 'worldDetails']);

  if (!sync.folders) await chrome.storage.sync.set({ folders: [] });
  if (!local.vrcWorlds) await chrome.storage.local.set({ vrcWorlds: [] });

  // 旧形式のworldsが存在する場合、分割形式に移行
  if (sync.worlds && sync.worlds.length > 0) {
    logAction('MIGRATE_WORLDS_TO_CHUNKED', { count: sync.worlds.length });
    await saveWorldsChunked(sync.worlds);
    await chrome.storage.sync.remove(['worlds']);
  }

  // 分割形式が存在しない場合は初期化
  if (!sync.worlds_0) {
    await chrome.storage.sync.set({ worlds_0: [] });
  }

  // 旧形式のworldDetailsが存在する場合、分割形式に移行
  if (local.worldDetails && Object.keys(local.worldDetails).length > 0) {
    logAction('MIGRATE_WORLD_DETAILS', { count: Object.keys(local.worldDetails).length });
    await saveWorldDetailsBatch(local.worldDetails);
    await chrome.storage.local.remove(['worldDetails']);
  }

  if (!sync.vrcFolderData) {
    await chrome.storage.sync.set({ vrcFolderData: {} });
  }
}

// ========================================
// 内部ヘルパー (データアクセス)
// ========================================

async function getVRCFolderWorlds(folderId) {
  const local = await chrome.storage.local.get(['vrcWorlds']);
  const vrcWorlds = local.vrcWorlds || [];
  return vrcWorlds.filter(w => w.folderId === folderId);
}