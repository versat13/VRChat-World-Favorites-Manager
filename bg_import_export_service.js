// bg_import_export_service.js
console.log('[ImportExportService] Loaded');

// ========================================
// インポート
// ========================================

async function batchImportWorlds(request, sendResponse) {
  const { worlds: importWorlds, targetFolder, isFullBackup } = request;
  logAction('IMPORT_START', { count: importWorlds.length, targetFolder, isFullBackup });

  let addedCount = 0;
  let movedCount = 0;
  let skippedCount = 0;
  const errors = [];
  let isFailure = false;

  try {
    // 1. フルバックアップ時のストレージクリア
    if (isFullBackup) {
      logAction('FULL_BACKUP_CLEAR_STORAGE', 'Starting full overwrite');

      const allLocalKeys = await chrome.storage.local.get(null);
      const keysToRemoveLocal = Object.keys(allLocalKeys).filter(key => 
        key.startsWith('worldDetails_') || key === 'vrcWorlds'
      );
      if (keysToRemoveLocal.length > 0) {
        await chrome.storage.local.remove(keysToRemoveLocal);
      }
      
      await chrome.storage.sync.remove(['worlds', 'folders', 'vrcFolderData']);

      if (request.folders) {
        await chrome.storage.sync.set({ folders: request.folders });
      }
      if (request.vrcFolderData) {
        await chrome.storage.sync.set({ vrcFolderData: request.vrcFolderData });
      }
    }

    // 2. 既存ワールドマップ作成
    const allExistingWorlds = isFullBackup ? [] : await getAllWorldsInternal();
    const existingWorldMap = new Map(allExistingWorlds.map(w => [w.id, w]));
    
    // 3. インポート対象を分類
    const worldsToAddCustom = [];
    const worldsToAddVRC = [];
    const worldsToMove = [];
    const detailsToSaveCustom = {};
    
    for (const world of importWorlds) {
      const folderId = isFullBackup ? (world.folderId || 'none') : (targetFolder || 'none');
      const existing = existingWorldMap.get(world.id);
      
      // 既存で同じフォルダならスキップ
      if (existing && existing.folderId === folderId && !isFullBackup) {
        skippedCount++;
        continue;
      }
      
      // 既存で別フォルダなら移動
      if (existing && existing.folderId !== folderId && !isFullBackup) {
        worldsToMove.push({
          worldId: world.id,
          fromFolder: existing.folderId,
          toFolder: folderId,
          favoriteRecordId: world.favoriteRecordId
        });
        continue;
      }
      
      // 新規追加
      const worldToAdd = {
        id: world.id,
        name: world.name || world.id,
        authorName: world.authorName || null,
        releaseStatus: world.releaseStatus || null,
        thumbnailImageUrl: world.thumbnailImageUrl || null,
        folderId: folderId,
        favoriteRecordId: world.favoriteRecordId || null
      };
      
      // Private/Deletedチェック
      if (folderId.startsWith('worlds') && 
          (world.releaseStatus === 'private' || world.releaseStatus === 'deleted')) {
        skippedCount++;
        errors.push({ id: world.id, reason: 'private_world', details: world.name });
        continue;
      }
      
      // VRCフォルダとカスタムフォルダで分類
      if (folderId.startsWith('worlds')) {
        worldsToAddVRC.push(worldToAdd);
      } else {
        worldsToAddCustom.push(worldToAdd);
        detailsToSaveCustom[world.id] = {
          name: worldToAdd.name,
          authorName: worldToAdd.authorName,
          releaseStatus: worldToAdd.releaseStatus,
          thumbnailImageUrl: worldToAdd.thumbnailImageUrl
        };
      }
    }
    
    logAction('IMPORT_CLASSIFIED', {
      toAddCustom: worldsToAddCustom.length,
      toAddVRC: worldsToAddVRC.length,
      toMove: worldsToMove.length,
      skipped: skippedCount
    });
    
    // 4. 移動処理（既存のバッチ処理を利用）
    if (worldsToMove.length > 0) {
      const moveResult = await new Promise((resolve) => {
        batchUpdateWorlds({ movedWorlds: worldsToMove, deletedWorlds: [] }, resolve);
      });
      movedCount = moveResult.movedCount || 0;
    }
    
    // 5. カスタムフォルダへの一括追加
    if (worldsToAddCustom.length > 0) {
      const syncWorlds = await loadWorldsChunked(); // 分割保存から読み込み
      
      // 容量チェック
      const newWorlds = worldsToAddCustom.map(w => ({ id: w.id, folderId: w.folderId }));
      
      if (syncWorlds.length + newWorlds.length > SYNC_WORLD_LIMIT) {
        const remaining = SYNC_WORLD_LIMIT - syncWorlds.length;
        errors.push({ 
          reason: 'sync_limit_exceeded', 
          details: `最大${SYNC_WORLD_LIMIT}件まで。残り${remaining}件のみ追加可能` 
        });
        isFailure = true;
        
        // 可能な分だけ追加
        newWorlds.splice(remaining);
        worldsToAddCustom.splice(remaining);
      }
      
      // 一括書き込み（分割保存使用）
      syncWorlds.push(...newWorlds);
      await saveWorldsChunked(syncWorlds); // 自動的にチャンク分割される
      addedCount += newWorlds.length;
      
      // 詳細情報を一括保存（チャンクごとに1回）
      await saveWorldDetailsBatch(detailsToSaveCustom);
      
      logAction('IMPORT_CUSTOM_COMPLETE', { count: newWorlds.length });
    }
    
    // 6. VRCフォルダへの一括追加
    if (worldsToAddVRC.length > 0) {
      const local = await chrome.storage.local.get(['vrcWorlds']);
      const vrcWorlds = local.vrcWorlds || [];
      
      // フォルダごとの件数チェック
      const folderCounts = {};
      vrcWorlds.forEach(w => {
        folderCounts[w.folderId] = (folderCounts[w.folderId] || 0) + 1;
      });
      
      const validWorlds = [];
      for (const world of worldsToAddVRC) {
        const count = folderCounts[world.folderId] || 0;
        
        if (count >= VRC_FOLDER_LIMIT) {
          skippedCount++;
          errors.push({ id: world.id, reason: 'vrc_limit_exceeded', details: world.folderId });
          continue;
        }
        
        validWorlds.push(world);
        folderCounts[world.folderId] = count + 1;
      }
      
      // 一括書き込み（1回）
      vrcWorlds.push(...validWorlds);
      await chrome.storage.local.set({ vrcWorlds });
      addedCount += validWorlds.length;
      
      logAction('IMPORT_VRC_COMPLETE', { count: validWorlds.length });
    }
    
    logAction('IMPORT_COMPLETE', { addedCount, movedCount, skippedCount, errors: errors.length });

    const success = (addedCount > 0 || movedCount > 0) || (!isFailure && errors.length === 0);
    
    sendResponse({ 
      success: success, 
      addedCount, 
      movedCount, 
      skippedCount, 
      errors,
      reason: isFailure ? 'LIMIT_EXCEEDED_PARTIAL_FAILURE' : (success ? null : 'NO_WORLDS_PROCESSED')
    });

  } catch (error) {
    logError('BATCH_IMPORT_ERROR', error);
    sendResponse({ 
      success: false, 
      error: error.message, 
      addedCount, 
      movedCount, 
      skippedCount,
      errors
    });
  }
}


// ========================================
// エクスポート
// ========================================

async function getAllWorldDetailsForExport(sendResponse) {
  try {
    // 分割保存から読み込み
    const syncWorlds = await loadWorldsChunked();
    
    const [sync, local] = await Promise.all([
      chrome.storage.sync.get(['folders', 'vrcFolderData']),
      chrome.storage.local.get(['vrcWorlds'])
    ]);

    const localVRCWorlds = local.vrcWorlds || [];
    const folders = sync.folders || [];
    const vrcFolderData = sync.vrcFolderData || {};

    // 1. 詳細情報を全て取得
    const worldDetailsMap = await getAllWorldDetailsInternal();

    // 2. syncWorlds に詳細情報をマージ
    const exportedWorlds = syncWorlds.map(sw => {
      const details = worldDetailsMap[sw.id] || {};
      return {
        id: sw.id,
        folderId: sw.folderId,
        name: details.name || sw.id,
        authorName: details.authorName || null,
        releaseStatus: details.releaseStatus || null,
        thumbnailImageUrl: details.thumbnailImageUrl || null,
        favoriteRecordId: null
      };
    });

    // 3. VRC Worlds も結合
    const allWorlds = [...exportedWorlds, ...localVRCWorlds];

    // 4. 完全なバックアップデータを作成
    const exportData = {
      meta: {
        version: '8.3',
        type: 'FULL_BACKUP',
        timestamp: new Date().toISOString()
      },
      worlds: allWorlds,
      folders: folders,
      vrcFolderData: vrcFolderData
    };

    sendResponse({ success: true, data: exportData });
    logAction('EXPORT_SUCCESS', { worldCount: allWorlds.length });

  } catch (error) {
    logError('EXPORT_FAILED', error);
    sendResponse({ success: false, error: 'エクスポート処理中にエラーが発生しました: ' + error.message });
  }
}