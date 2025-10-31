// bg_storage_service.js v1.2.0
console.log('[StorageService] Loaded');

// ========================================
// レート制限管理
// ========================================

class StorageRateLimiter {
  constructor() {
    this.writeCount = 0;
    this.resetTime = Date.now() + 60000;
    this.maxWrites = 100;
  }

  async checkAndWait() {
    const now = Date.now();
    
    if (now >= this.resetTime) {
      this.writeCount = 0;
      this.resetTime = now + 60000;
    }
    
    if (this.writeCount >= this.maxWrites) {
      const waitTime = this.resetTime - now;
      logAction('RATE_LIMIT_WAIT', { 
        waitMs: waitTime,
        message: 'Waiting for rate limit reset'
      });
      
      await sleep(waitTime + 1000);
      
      this.writeCount = 0;
      this.resetTime = Date.now() + 60000;
    }
    
    this.writeCount++;
  }

  needsWait() {
    const now = Date.now();
    
    if (now >= this.resetTime) {
      this.writeCount = 0;
      this.resetTime = now + 60000;
      return false;
    }
    
    return this.writeCount >= this.maxWrites;
  }
  
  getWaitTime() {
    if (!this.needsWait()) return 0;
    return Math.max(0, this.resetTime - Date.now());
  }
  
  getWaitTimeInSeconds() {
    const waitMs = this.getWaitTime();
    return Math.ceil(waitMs / 1000);
  }
  
  async checkAndWaitWithProgress(progressCallback) {
    const now = Date.now();
    
    if (now >= this.resetTime) {
      this.writeCount = 0;
      this.resetTime = now + 60000;
    }
    
    if (this.writeCount >= this.maxWrites) {
      const totalWaitMs = this.resetTime - now + 1000;
      const totalWaitSec = Math.ceil(totalWaitMs / 1000);
      
      logAction('RATE_LIMIT_WAIT_WITH_PROGRESS', { 
        totalWaitSeconds: totalWaitSec
      });
      
      // 🔥 progressCallback の有無に関わらずカウントダウン
      for (let remaining = totalWaitSec; remaining > 0; remaining--) {
        if (progressCallback) {
          progressCallback({
            action: 'RATE_LIMIT_COUNTDOWN',
            remainingSeconds: remaining,
            totalWaitSeconds: totalWaitSec
          });
        }
        await sleep(1000);
      }
      
      if (progressCallback) {
        progressCallback({
          action: 'RATE_LIMIT_COMPLETE'
        });
      }
      
      this.writeCount = 0;
      this.resetTime = Date.now() + 60000;
    }
    
    this.writeCount++;
  }
}

const rateLimiter = new StorageRateLimiter();

// ========================================
// ストレージラッパー関数(レート制限対応)
// ========================================

async function safeStorageSet(storageType, data, progressCallback = null) {
  // 🔥 progressCallback の有無に関わらず、常に checkAndWaitWithProgress を使用
  await rateLimiter.checkAndWaitWithProgress(progressCallback);
  
  try {
    if (storageType === 'sync') {
      await chrome.storage.sync.set(data);
    } else {
      await chrome.storage.local.set(data);
    }
    return { success: true };
  } catch (error) {
    if (error.message && error.message.includes('MAX_WRITE_OPERATIONS_PER_MINUTE')) {
      logError('STORAGE_RATE_LIMIT', 'Rate limit exceeded, retrying after 60s');
      
      if (progressCallback) {
        for (let remaining = 60; remaining > 0; remaining--) {
          progressCallback({
            action: 'RATE_LIMIT_COUNTDOWN',
            remainingSeconds: remaining,
            totalWaitSeconds: 60
          });
          await sleep(1000);
        }
        
        progressCallback({
          action: 'RATE_LIMIT_COMPLETE'
        });
      } else {
        await sleep(60000);
      }
      
      return safeStorageSet(storageType, data, progressCallback);
    }
    throw error;
  }
}

async function safeStorageRemove(storageType, keys, progressCallback = null) {
  // 🔥 progressCallback の有無に関わらず、常に checkAndWaitWithProgress を使用
  await rateLimiter.checkAndWaitWithProgress(progressCallback);
  
  try {
    if (storageType === 'sync') {
      await chrome.storage.sync.remove(keys);
    } else {
      await chrome.storage.local.remove(keys);
    }
    return { success: true };
  } catch (error) {
    if (error.message && error.message.includes('MAX_WRITE_OPERATIONS_PER_MINUTE')) {
      logError('STORAGE_RATE_LIMIT', 'Rate limit exceeded, retrying after 60s');
      
      if (progressCallback) {
        for (let remaining = 60; remaining > 0; remaining--) {
          progressCallback({
            action: 'RATE_LIMIT_COUNTDOWN',
            remainingSeconds: remaining,
            totalWaitSeconds: 60
          });
          await sleep(1000);
        }
        
        progressCallback({
          action: 'RATE_LIMIT_COMPLETE'
        });
      } else {
        await sleep(60000);
      }
      
      return safeStorageRemove(storageType, keys, progressCallback);
    }
    throw error;
  }
}

// ========================================
// ストレージ初期化・統計
// ========================================

async function initializeStorage() {
  const sync = await chrome.storage.sync.get(['folders', 'vrcFolderData', 'worlds', 'worlds_0']);
  const local = await chrome.storage.local.get(['vrcWorlds', 'worldDetails']);

  if (!sync.folders) await safeStorageSet('sync', { folders: [] });
  if (!local.vrcWorlds) await safeStorageSet('local', { vrcWorlds: [] });

  if (sync.worlds && sync.worlds.length > 0) {
    logAction('MIGRATE_WORLDS_TO_CHUNKED', { count: sync.worlds.length });
    await saveWorldsChunked(sync.worlds);
    await safeStorageRemove('sync', ['worlds']);
  }

  if (!sync.worlds_0) {
    await safeStorageSet('sync', { worlds_0: [] });
  }

  if (local.worldDetails && Object.keys(local.worldDetails).length > 0) {
    logAction('MIGRATE_WORLD_DETAILS', { count: Object.keys(local.worldDetails).length });
    await saveWorldDetailsBatch(local.worldDetails);
    await safeStorageRemove('local', ['worldDetails']);
  }

  if (!sync.vrcFolderData) {
    await safeStorageSet('sync', { vrcFolderData: {} });
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
// worldDetails保存ヘルパー(レート制限対応)
// ========================================

async function saveWorldDetails(worldId, details) {
  const chunkIndex = Math.abs(hashCode(worldId)) % DETAILS_CHUNK_SIZE;
  const chunkKey = `worldDetails_${chunkIndex}`;

  const local = await chrome.storage.local.get([chunkKey]);
  const chunk = local[chunkKey] || {};
  chunk[worldId] = details;
  await safeStorageSet('local', { [chunkKey]: chunk });
}

async function saveWorldDetailsBatch(detailsMap) {
  const chunks = {};

  for (const [worldId, details] of Object.entries(detailsMap)) {
    const chunkIndex = Math.abs(hashCode(worldId)) % DETAILS_CHUNK_SIZE;
    const chunkKey = `worldDetails_${chunkIndex}`;

    if (!chunks[chunkKey]) {
      chunks[chunkKey] = {};
    }
    chunks[chunkKey][worldId] = details;
  }

  for (const [chunkKey, chunkData] of Object.entries(chunks)) {
    const local = await chrome.storage.local.get([chunkKey]);
    const existing = local[chunkKey] || {};
    await safeStorageSet('local', {
      [chunkKey]: { ...existing, ...chunkData }
    });
  }
}

async function getWorldDetails(worldId) {
  const chunkIndex = Math.abs(hashCode(worldId)) % DETAILS_CHUNK_SIZE;
  const chunkKey = `worldDetails_${chunkIndex}`;

  const local = await chrome.storage.local.get([chunkKey]);
  if (local[chunkKey] && local[chunkKey][worldId]) {
    return local[chunkKey][worldId];
  }

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
  const chunkIndex = Math.abs(hashCode(worldId)) % DETAILS_CHUNK_SIZE;
  const chunkKey = `worldDetails_${chunkIndex}`;

  const local = await chrome.storage.local.get([chunkKey]);
  if (local[chunkKey] && local[chunkKey][worldId]) {
    delete local[chunkKey][worldId];
    await safeStorageSet('local', { [chunkKey]: local[chunkKey] });
    return;
  }

  for (let i = 0; i < DETAILS_CHUNK_SIZE; i++) {
    const key = `worldDetails_${i}`;
    const chunk = await chrome.storage.local.get([key]);
    if (chunk[key] && chunk[key][worldId]) {
      delete chunk[key][worldId];
      await safeStorageSet('local', { [key]: chunk[key] });
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
// worlds分割保存ヘルパー(レート制限対応) - 🔥 修正版
// ========================================

async function saveWorldsChunked(worlds, progressCallback = null) {
  const chunks = {};

  for (let i = 0; i < worlds.length; i += WORLDS_CHUNK_SIZE) {
    const chunkIndex = Math.floor(i / WORLDS_CHUNK_SIZE);
    const chunkKey = `worlds_${chunkIndex}`;
    chunks[chunkKey] = worlds.slice(i, i + WORLDS_CHUNK_SIZE);
  }

  const sync = await chrome.storage.sync.get(null);
  const oldChunkKeys = Object.keys(sync).filter(key => key.startsWith('worlds_'));

  // 🔥 progressCallback を各保存処理に渡す
  for (const [key, value] of Object.entries(chunks)) {
    await safeStorageSet('sync', { [key]: value }, progressCallback);
  }

  const newChunkKeys = Object.keys(chunks);
  const keysToRemove = oldChunkKeys.filter(key => !newChunkKeys.includes(key));
  if (keysToRemove.length > 0) {
    // 🔥 progressCallback を削除処理にも渡す
    await safeStorageRemove('sync', keysToRemove, progressCallback);
  }

  logAction('WORLDS_CHUNKED_SAVED', {
    totalWorlds: worlds.length,
    chunks: Object.keys(chunks).length
  });
}

async function loadWorldsChunked() {
  const sync = await chrome.storage.sync.get(null);
  const worlds = [];

  for (let i = 0; i < MAX_WORLDS_CHUNKS; i++) {
    const chunkKey = `worlds_${i}`;
    if (sync[chunkKey]) {
      worlds.push(...sync[chunkKey]);
    }
  }

  return worlds;
}

async function addWorldToChunkedStorage(worldId, folderId) {
  const worlds = await loadWorldsChunked();
  worlds.push({ id: worldId, folderId: folderId });
  await saveWorldsChunked(worlds);
}

async function removeWorldFromChunkedStorage(worldId) {
  const worlds = await loadWorldsChunked();
  const filtered = worlds.filter(w => w.id !== worldId);
  await saveWorldsChunked(filtered);
}

async function updateWorldInChunkedStorage(worldId, newFolderId) {
  const worlds = await loadWorldsChunked();
  const index = worlds.findIndex(w => w.id === worldId);
  if (index !== -1) {
    worlds[index].folderId = newFolderId;
    await saveWorldsChunked(worlds);
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