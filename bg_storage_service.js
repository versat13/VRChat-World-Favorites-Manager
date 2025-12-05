// bg_storage_service.js v1.3.0

// モジュール読み込みログ（開発時のみ）
if (INFO_LOG) console.log('[StorageService] Loaded v1.3.0');

// ========================================
// Rate Limit Management
// ========================================

class StorageRateLimiter {
  constructor() {
    this.writeCount = 0;
    this.resetTime = Date.now() + 60000;
    this.maxWrites = 100;
    this.isWaiting = false;
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
    if (this.isWaiting) {
      logAction('RATE_LIMIT_ALREADY_WAITING', 'Skipping duplicate wait');
      return;
    }

    const now = Date.now();

    if (now >= this.resetTime) {
      this.writeCount = 0;
      this.resetTime = now + 60000;
    }

    if (this.writeCount >= this.maxWrites) {
      const totalWaitMs = this.resetTime - now + 1000;
      const totalWaitSec = Math.ceil(totalWaitMs / 1000);

      try {
        this.isWaiting = true;

        logAction('RATE_LIMIT_WAIT_WITH_PROGRESS', {
          totalWaitSeconds: totalWaitSec,
          hasCallback: !!progressCallback
        });

        if (progressCallback) {
          logAction('RATE_LIMIT_COUNTDOWN_START', { totalWaitSec });

          for (let remaining = totalWaitSec; remaining > 0; remaining--) {
            logAction('RATE_LIMIT_COUNTDOWN_TICK', { remaining });

            // 統一型使用: ProgressMessage.rateLimitCountdown()
            progressCallback(
              ProgressMessage.rateLimitCountdown(remaining, totalWaitSec)
            );
            await sleep(1000);
          }

          logAction('RATE_LIMIT_COUNTDOWN_FINISHED', 'Sending WAIT_FINISHED message');

          // 統一型使用: ProgressMessage.rateLimitFinished()
          progressCallback(
            ProgressMessage.rateLimitFinished()
          );
        } else {
          logAction('RATE_LIMIT_NO_CALLBACK', 'Waiting without progress callback');
          await sleep(totalWaitMs);
        }

        this.writeCount = 0;
        this.resetTime = Date.now() + 60000;
      } finally {
        this.isWaiting = false;
        logAction('RATE_LIMIT_WAIT_FINISHED', 'Exiting wait state');
      }
    }

    this.writeCount++;
  }
}

const rateLimiter = new StorageRateLimiter();

// ========================================
// Storage Wrapper Functions (Rate Limited)
// ========================================

async function safeStorageSet(storageType, data, progressCallback = null) {
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
      logError('STORAGE_RATE_LIMIT_CHROME_API_DETECTED', 'Forcing rateLimiter reset');

      rateLimiter.writeCount = rateLimiter.maxWrites;
      rateLimiter.resetTime = Date.now() + 60000;
      rateLimiter.isWaiting = false;

      logError('STORAGE_RATE_LIMIT_CHROME_API', 'Chrome API rate limit hit unexpectedly');

      if (progressCallback) {
        logAction('CHROME_API_RATE_LIMIT_COUNTDOWN_START', 'Starting 60s countdown');

        for (let remaining = 60; remaining > 0; remaining--) {
          logAction('CHROME_API_RATE_LIMIT_TICK', { remaining });

          // 統一型使用
          progressCallback(
            ProgressMessage.rateLimitCountdown(remaining, 60)
          );
          await sleep(1000);
        }

        logAction('CHROME_API_RATE_LIMIT_FINISHED', 'Sending WAIT_FINISHED message');

        // 統一型使用
        progressCallback(
          ProgressMessage.rateLimitFinished()
        );
      } else {
        logAction('CHROME_API_RATE_LIMIT_NO_CALLBACK', 'Waiting 60s without callback');
        await sleep(60000);
      }

      return safeStorageSet(storageType, data, progressCallback);
    }
    throw error;
  }
}

async function safeStorageRemove(storageType, keys, progressCallback = null) {
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
      logError('STORAGE_RATE_LIMIT_CHROME_API_DETECTED', 'Forcing rateLimiter reset');

      rateLimiter.writeCount = rateLimiter.maxWrites;
      rateLimiter.resetTime = Date.now() + 60000;
      rateLimiter.isWaiting = false;

      logError('STORAGE_RATE_LIMIT_CHROME_API', 'Chrome API rate limit hit unexpectedly');

      if (progressCallback) {
        logAction('CHROME_API_RATE_LIMIT_COUNTDOWN_START', 'Starting 60s countdown');

        for (let remaining = 60; remaining > 0; remaining--) {
          logAction('CHROME_API_RATE_LIMIT_TICK', { remaining });

          // 統一型使用
          progressCallback(
            ProgressMessage.rateLimitCountdown(remaining, 60)
          );
          await sleep(1000);
        }

        logAction('CHROME_API_RATE_LIMIT_FINISHED', 'Sending WAIT_FINISHED message');

        // 統一型使用
        progressCallback(
          ProgressMessage.rateLimitFinished()
        );
      } else {
        logAction('CHROME_API_RATE_LIMIT_NO_CALLBACK', 'Waiting 60s without callback');
        await sleep(60000);
      }

      return safeStorageRemove(storageType, keys, progressCallback);
    }
    throw error;
  }
}

// ========================================
// Storage Initialization & Stats
// ========================================

async function initializeStorage() {
  const sync = await chrome.storage.sync.get(['folders', 'vrcFolderData', 'worlds', 'worlds_0']);
  const local = await chrome.storage.local.get(['vrcWorlds', 'worldDetails', 'migrationCompleted_v120']);

  if (!sync.folders) await safeStorageSet('sync', { folders: [] });
  if (!local.vrcWorlds) await safeStorageSet('local', { vrcWorlds: [] });

  // 旧データのマイグレーション（worlds → worlds_0〜worlds_9）
  if (sync.worlds && sync.worlds.length > 0) {
    logAction('MIGRATE_WORLDS_TO_CHUNKED', { count: sync.worlds.length });
    await saveWorldsChunked(sync.worlds);
    await safeStorageRemove('sync', ['worlds']);
  }

  if (!sync.worlds_0) {
    await safeStorageSet('sync', { worlds_0: [] });
  }

  // 旧worldDetailsのマイグレーション（worldDetails → worldDetails_0〜worldDetails_19）
  if (local.worldDetails && Object.keys(local.worldDetails).length > 0) {
    logAction('MIGRATE_WORLD_DETAILS', { count: Object.keys(local.worldDetails).length });
    await saveWorldDetailsBatch(local.worldDetails);
    await safeStorageRemove('local', ['worldDetails']);
  }

  if (!sync.vrcFolderData) {
    await safeStorageSet('sync', { vrcFolderData: {} });
  }

  // v1.2.0: vrcWorldsの詳細情報をworldDetails_*に統合
  // 注意: v1.2.2でこのマイグレーション処理は削除予定
  if (!local.migrationCompleted_v120) {
    await migrateVrcWorldsToUnifiedStorage();
  }
}

// ========================================
// マイグレーション処理（v1.2.2で削除予定）
// ========================================

async function migrateVrcWorldsToUnifiedStorage() {
  try {
    logAction('MIGRATION_V120_START', 'Starting vrcWorlds migration');

    const local = await chrome.storage.local.get(['vrcWorlds']);
    const vrcWorlds = local.vrcWorlds || [];

    if (vrcWorlds.length === 0) {
      logAction('MIGRATION_V120_SKIP', 'No vrcWorlds to migrate');
      await chrome.storage.local.set({ migrationCompleted_v120: true });
      return;
    }

    const detailsMap = {};
    for (const world of vrcWorlds) {
      if (world.name || world.authorName || world.releaseStatus || world.thumbnailImageUrl) {
        detailsMap[world.id] = {
          name: world.name || world.id,
          authorName: world.authorName || null,
          releaseStatus: world.releaseStatus || null,
          thumbnailImageUrl: world.thumbnailImageUrl || null
        };
      }
    }

    if (Object.keys(detailsMap).length > 0) {
      logAction('MIGRATION_V120_SAVING_DETAILS', { count: Object.keys(detailsMap).length });
      await saveWorldDetailsBatch(detailsMap);
    }

    const minimalVrcWorlds = vrcWorlds.map(w => ({
      id: w.id,
      folderId: w.folderId,
      favoriteRecordId: w.favoriteRecordId || null
    }));

    await chrome.storage.local.set({
      vrcWorlds: minimalVrcWorlds,
      migrationCompleted_v120: true
    });

    logAction('MIGRATION_V120_COMPLETE', {
      totalWorlds: vrcWorlds.length,
      detailsSaved: Object.keys(detailsMap).length
    });

  } catch (error) {
    logError('MIGRATION_V120_ERROR', error);
    await chrome.storage.local.set({ migrationCompleted_v120: true });
  }
}

// ========================================
// Storage Stats
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
    sendResponse(stats);
  } catch (error) {
    logError('GET_STORAGE_STATS', error);
    sendResponse({ error: error.message });
  }
}

// ========================================
// worldDetails Save Helpers (Rate Limited)
// ========================================

async function saveWorldDetails(worldId, details, progressCallback = null) {
  const chunkIndex = Math.abs(hashCode(worldId)) % DETAILS_CHUNK_SIZE;
  const chunkKey = `worldDetails_${chunkIndex}`;

  const local = await chrome.storage.local.get([chunkKey]);
  const chunk = local[chunkKey] || {};
  chunk[worldId] = details;
  await safeStorageSet('local', { [chunkKey]: chunk }, progressCallback);
}

async function saveWorldDetailsBatch(detailsMap, progressCallback = null) {
  const chunks = {};

  for (const [worldId, details] of Object.entries(detailsMap)) {
    const chunkIndex = Math.abs(hashCode(worldId)) % DETAILS_CHUNK_SIZE;
    const chunkKey = `worldDetails_${chunkIndex}`;

    if (!chunks[chunkKey]) {
      chunks[chunkKey] = {};
    }
    chunks[chunkKey][worldId] = details;
  }

  const chunkCount = Object.keys(chunks).length;
  logAction('BATCH_SAVE_DETAILS_CHUNKS', {
    totalWorlds: Object.keys(detailsMap).length,
    chunkCount
  });

  for (const [chunkKey, chunkData] of Object.entries(chunks)) {
    const local = await chrome.storage.local.get([chunkKey]);
    const existing = local[chunkKey] || {};

    await safeStorageSet('local', {
      [chunkKey]: { ...existing, ...chunkData }
    }, progressCallback);
  }

  logAction('BATCH_SAVE_DETAILS_COMPLETE', {
    writesPerformed: chunkCount,
    totalRateLimiterCount: rateLimiter.writeCount
  });
}

async function getWorldDetails(worldId) {
  const chunkIndex = Math.abs(hashCode(worldId)) % DETAILS_CHUNK_SIZE;
  const chunkKey = `worldDetails_${chunkIndex}`;

  const local = await chrome.storage.local.get([chunkKey]);
  if (local[chunkKey] && local[chunkKey][worldId]) {
    return local[chunkKey][worldId];
  } else {
    return null;
  }
}

async function deleteWorldDetails(worldId, progressCallback = null) {
  const chunkIndex = Math.abs(hashCode(worldId)) % DETAILS_CHUNK_SIZE;
  const chunkKey = `worldDetails_${chunkIndex}`;

  const local = await chrome.storage.local.get([chunkKey]);
  if (local[chunkKey] && local[chunkKey][worldId]) {
    delete local[chunkKey][worldId];
    await safeStorageSet('local', { [chunkKey]: local[chunkKey] }, progressCallback);
    return true;
  }
  return false;
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
// worlds Chunked Save Helpers (Rate Limited)
// ========================================

async function saveWorldsChunked(worlds, progressCallback = null) {
  logAction('SAVE_WORLDS_CHUNKED_START', {
    worldCount: worlds.length,
    hasCallback: !!progressCallback
  });

  const chunks = {};

  for (let i = 0; i < worlds.length; i += WORLDS_CHUNK_SIZE) {
    const chunkIndex = Math.floor(i / WORLDS_CHUNK_SIZE);
    const chunkKey = `worlds_${chunkIndex}`;
    chunks[chunkKey] = worlds.slice(i, i + WORLDS_CHUNK_SIZE);
  }

  const sync = await chrome.storage.sync.get(null);
  const oldChunkKeys = Object.keys(sync).filter(key => key.startsWith('worlds_'));

  for (const [key, value] of Object.entries(chunks)) {
    await safeStorageSet('sync', { [key]: value }, progressCallback);
  }

  const newChunkKeys = Object.keys(chunks);
  const keysToRemove = oldChunkKeys.filter(key => !newChunkKeys.includes(key));
  if (keysToRemove.length > 0) {
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

// ========================================
// Internal Helpers (Data Access)
// ========================================

async function getVRCFolderWorlds(folderId) {
  const local = await chrome.storage.local.get(['vrcWorlds']);
  const vrcWorlds = local.vrcWorlds || [];
  return vrcWorlds.filter(w => w.folderId === folderId);
}
