// bg_import_export_service.js v1.2.0 (前半)
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
    // 🔥 1. 完全バックアップ時の事前検証
    if (isFullBackup) {
      logAction('FULL_BACKUP_VALIDATION_START', 'Validating backup data');

      // データ検証
      if (!importWorlds || !Array.isArray(importWorlds)) {
        throw new Error('Invalid backup: worlds must be an array');
      }

      if (importWorlds.length === 0) {
        throw new Error('Invalid backup: worlds array is empty');
      }

      // 各ワールドの必須フィールドをチェック
      const invalidWorlds = importWorlds.filter(w => !w.id || !w.folderId);
      if (invalidWorlds.length > 0) {
        throw new Error(`Invalid backup: ${invalidWorlds.length} worlds missing required fields (id or folderId)`);
      }

      // フォルダデータの検証
      if (request.folders !== undefined && !Array.isArray(request.folders)) {
        throw new Error('Invalid backup: folders must be an array');
      }

      if (request.vrcFolderData !== undefined && typeof request.vrcFolderData !== 'object') {
        throw new Error('Invalid backup: vrcFolderData must be an object');
      }

      logAction('FULL_BACKUP_VALIDATION_SUCCESS', 'Backup data is valid');

      // 🔥 2. 既存データのバックアップ作成(ロールバック用)
      logAction('FULL_BACKUP_CREATE_ROLLBACK', 'Creating rollback backup');

      const rollbackData = {
        syncWorlds: await loadWorldsChunked(),
        sync: await chrome.storage.sync.get(['folders', 'vrcFolderData']),
        local: await chrome.storage.local.get(['vrcWorlds'])
      };

      // worldDetailsもバックアップ
      const allLocalKeys = await chrome.storage.local.get(null);
      rollbackData.worldDetails = {};
      Object.keys(allLocalKeys).forEach(key => {
        if (key.startsWith('worldDetails_')) {
          rollbackData.worldDetails[key] = allLocalKeys[key];
        }
      });

      logAction('FULL_BACKUP_ROLLBACK_CREATED', {
        syncWorldsCount: rollbackData.syncWorlds.length,
        vrcWorldsCount: (rollbackData.local.vrcWorlds || []).length
      });

      // 🔥 3. ストレージクリア
      try {
        logAction('FULL_BACKUP_CLEAR_STORAGE', 'Starting full overwrite');

        // Local Storage のクリア
        const keysToRemoveLocal = Object.keys(allLocalKeys).filter(key =>
          key.startsWith('worldDetails_') || key === 'vrcWorlds'
        );
        if (keysToRemoveLocal.length > 0) {
          await chrome.storage.local.remove(keysToRemoveLocal);
        }

        // Sync Storage のクリア
        await chrome.storage.sync.remove(['folders', 'vrcFolderData']);

        // 全てのチャンクをクリア
        const syncKeys = await chrome.storage.sync.get(null);
        const chunksToRemove = Object.keys(syncKeys).filter(key => key.startsWith('worlds_'));
        if (chunksToRemove.length > 0) {
          await chrome.storage.sync.remove(chunksToRemove);
        }

        logAction('FULL_BACKUP_STORAGE_CLEARED', 'All storage cleared');

      } catch (clearError) {
        // クリア失敗時はロールバック
        logError('FULL_BACKUP_CLEAR_FAILED', clearError);
        throw new Error('Failed to clear storage: ' + clearError.message);
      }

      // 🔥 4. 新データのインポート(try-catchでロールバック可能に)
      try {
        // フォルダ・VRCフォルダデータを復元
        if (request.folders) {
          await chrome.storage.sync.set({ folders: request.folders });
        }
        if (request.vrcFolderData) {
          await chrome.storage.sync.set({ vrcFolderData: request.vrcFolderData });
        }

        logAction('FULL_BACKUP_METADATA_RESTORED', 'Folders and VRC data restored');

      } catch (restoreError) {
        // メタデータ復元失敗時はロールバック
        logError('FULL_BACKUP_METADATA_RESTORE_FAILED', restoreError);

        // ロールバック実行
        logAction('FULL_BACKUP_ROLLBACK_START', 'Rolling back to previous state');
        await saveWorldsChunked(rollbackData.syncWorlds);
        await chrome.storage.sync.set(rollbackData.sync);
        await chrome.storage.local.set(rollbackData.local);

        // worldDetailsも復元
        for (const [key, value] of Object.entries(rollbackData.worldDetails)) {
          await chrome.storage.local.set({ [key]: value });
        }

        logAction('FULL_BACKUP_ROLLBACK_COMPLETE', 'Rollback completed');
        throw new Error('Failed to restore metadata, rolled back: ' + restoreError.message);
      }
    }

    // 🔥 5. 既存ワールドマップ作成(完全バックアップ時はクリア後なので空)
    const allExistingWorlds = await getAllWorldsInternal();
    const existingWorldMap = new Map(allExistingWorlds.map(w => [w.id, w]));

    logAction('EXISTING_WORLDS_LOADED', {
      count: allExistingWorlds.length,
      isFullBackup
    });

    // 6. インポート対象を分類
    const worldsToAddCustom = [];
    const worldsToAddVRC = [];
    const worldsToMove = [];
    const detailsToSaveCustom = {};

    for (const world of importWorlds) {
      const folderId = isFullBackup ? (world.folderId || 'none') : (targetFolder || 'none');
      const existing = existingWorldMap.get(world.id);

      // 完全バックアップ時は既存チェックをスキップ(クリア済みのため)
      if (isFullBackup) {
        // 既存データなし → すべて新規追加
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
          // 🔥 修正: エラーハンドラー使用
          const error = createPrivateWorldError(world.name);
          errors.push({ id: world.id, reason: error.reason, details: error.message });
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
        continue;
      }

      // 部分インポート時のみ既存チェック

      // 既存で同じフォルダならスキップ
      if (existing && existing.folderId === folderId) {
        skippedCount++;
        continue;
      }

      // 既存で別フォルダなら移動
      if (existing && existing.folderId !== folderId) {
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
        // 🔥 修正: エラーハンドラー使用
        const error = createPrivateWorldError(world.name);
        errors.push({ id: world.id, reason: error.reason, details: error.message });
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

    // 7. 移動処理(既存のバッチ処理を流用)
    if (worldsToMove.length > 0) {
      const moveResult = await new Promise((resolve) => {
        batchUpdateWorlds({ movedWorlds: worldsToMove, deletedWorlds: [] }, resolve);
      });
      movedCount = moveResult.movedCount || 0;
    }

    // 8. カスタムフォルダへの一括追加
    if (worldsToAddCustom.length > 0) {
      const syncWorlds = await loadWorldsChunked();

      // 容量チェック
      const newWorlds = worldsToAddCustom.map(w => ({ id: w.id, folderId: w.folderId }));

      if (syncWorlds.length + newWorlds.length > SYNC_WORLD_LIMIT) {
        const remaining = SYNC_WORLD_LIMIT - syncWorlds.length;
        // 🔥 修正: エラーハンドラー使用
        const error = createLimitError('sync_limit', { remaining });
        errors.push({
          reason: error.reason,
          details: `最大${SYNC_WORLD_LIMIT}件まで。残り${remaining}件のみ追加可能`
        });
        isFailure = true;

        // 可能な分だけ追加
        newWorlds.splice(remaining);
        worldsToAddCustom.splice(remaining);
      }

      // 一括書き込み
      syncWorlds.push(...newWorlds);
      await saveWorldsChunked(syncWorlds);
      addedCount += newWorlds.length;

      // 詳細情報を一括保存
      await saveWorldDetailsBatch(detailsToSaveCustom);

      logAction('IMPORT_CUSTOM_COMPLETE', { count: newWorlds.length });
    }

    // 9. VRCフォルダへの一括追加
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
          // 🔥 修正: エラーハンドラー使用
          const error = createLimitError('vrc_limit', { folderId: world.folderId });
          errors.push({ id: world.id, reason: error.reason, details: error.message });
          continue;
        }

        validWorlds.push(world);
        folderCounts[world.folderId] = count + 1;
      }

      // 一括書き込み
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
        version: '1.2.0',
        type: 'FULL_BACKUP',
        timestamp: new Date().toISOString()
      },
      worlds: allWorlds,
      folders: folders,
      vrcFolderData: vrcFolderData
    };

    sendResponse(createSuccessResponse({ data: exportData }));
    logAction('EXPORT_SUCCESS', { worldCount: allWorlds.length });

  } catch (error) {
    logError('EXPORT_FAILED', error);
    sendResponse(createGenericError('エクスポート処理中にエラーが発生しました: ' + error.message));
  }
}