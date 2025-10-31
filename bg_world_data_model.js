// bg_world_data_model.js v1.2.0
console.log('[WorldDataModel] Loaded');

// ========================================
// 内部ヘルパー(エクスポート用)
// ========================================

async function getAllWorldsInternal() {
  const syncWorlds = await loadWorldsChunked();
  
  const local = await chrome.storage.local.get(['vrcWorlds']);
  const vrcWorlds = local.vrcWorlds || [];
  const details = await getAllWorldDetailsInternal();

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

async function getSingleWorldDetailsInternal(worldId) {
  try {
    const response = await fetch(`${API_BASE}/worlds/${worldId}`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          id: worldId,
          name: '[Deleted]',
          authorName: null,
          releaseStatus: 'deleted',
          thumbnailImageUrl: null
        };
      }
      return null;
    }

    const data = await response.json();
    return {
      id: data.id,
      name: data.name,
      authorName: data.authorName,
      releaseStatus: data.releaseStatus,
      thumbnailImageUrl: data.thumbnailImageUrl
    };
  } catch (error) {
    logError('GET_WORLD_DETAILS_INTERNAL', error, { worldId });
    return null;
  }
}

async function addWorldToFolder(world) {
  try {
    const folderId = world.folderId;

    if (folderId.startsWith('worlds')) {
      if (world.releaseStatus === 'private' || world.releaseStatus === 'deleted') {
        return createPrivateWorldError(world.name);
      }

      const vrcWorlds = await getVRCFolderWorlds(folderId);

      if (vrcWorlds.length >= VRC_FOLDER_SYNC_LIMIT) {
        return createLimitError('vrc_sync_limit');
      }
      if (vrcWorlds.length >= VRC_FOLDER_LIMIT) {
        return createLimitError('vrc_limit');
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
        favoriteRecordId: world.favoriteRecordId || null
      });
      await chrome.storage.local.set({ vrcWorlds: vrcWorldsList });

    } else {
      const syncWorlds = await loadWorldsChunked();

      if (syncWorlds.length >= SYNC_WORLD_LIMIT) {
        return createLimitError('sync_limit');
      }

      const sync = await chrome.storage.sync.get(['folders', 'vrcFolderData']);
      const testData = {
        worlds: [...syncWorlds, { id: world.id, folderId: folderId }],
        folders: sync.folders || [],
        vrcFolderData: sync.vrcFolderData || {}
      };
      
      const estimatedBytes = JSON.stringify(testData).length;
      const currentBytes = await chrome.storage.sync.getBytesInUse();
      
      const SAFE_LIMIT = chrome.storage.sync.QUOTA_BYTES * 0.95;
      
      if (estimatedBytes > SAFE_LIMIT || currentBytes > SAFE_LIMIT) {
        logError('SYNC_BYTES_EXCEEDED', `Current: ${currentBytes}, Estimated: ${estimatedBytes}, Limit: ${SAFE_LIMIT}`);
        return createLimitError('sync_bytes', {
          currentBytes: currentBytes,
          estimatedBytes: estimatedBytes,
          limit: SAFE_LIMIT
        });
      }

      syncWorlds.push({ id: world.id, folderId: folderId });
      await saveWorldsChunked(syncWorlds);

      await saveWorldDetails(world.id, {
        name: world.name,
        authorName: world.authorName || null,
        releaseStatus: world.releaseStatus || null,
        thumbnailImageUrl: world.thumbnailImageUrl || null
      });
    }

    return createSuccessResponse();
  } catch (error) {
    if (error.message && error.message.includes('QUOTA_BYTES')) {
      return createLimitError('sync_bytes', { error: error.message });
    }
    return createGenericError(error.message);
  }
}

async function removeWorldFromFolder(worldId, folderId) {
  try {
    if (folderId.startsWith('worlds')) {
      const local = await chrome.storage.local.get(['vrcWorlds']);
      const vrcWorlds = (local.vrcWorlds || []).filter(w => w.id !== worldId);
      await chrome.storage.local.set({ vrcWorlds });
    } else {
      await removeWorldFromChunkedStorage(worldId);
      await deleteWorldDetails(worldId);
    }
    return createSuccessResponse();
  } catch (error) {
    return createGenericError(error.message);
  }
}

// ========================================
// ワールドCRUD (単一)
// ========================================

async function getAllWorlds(sendResponse) {
  try {
    const allWorlds = await getAllWorldsInternal();
    sendResponse({ worlds: allWorlds });
  } catch (error) {
    logError('GET_ALL_WORLDS', error);
    sendResponse({ error: error.message, worlds: [] });
  }
}

async function getVRCWorlds(sendResponse) {
  try {
    const local = await chrome.storage.local.get(['vrcWorlds']);
    sendResponse({ vrcWorlds: local.vrcWorlds || [] });
  } catch (error) {
    logError('GET_VRC_WORLDS', error);
    sendResponse({ error: error.message, vrcWorlds: [] });
  }
}

async function addWorld(world, sendResponse) {
  try {
    if (!world || !world.id || !world.name) {
      sendResponse(createGenericError('Invalid world data', 'invalid_data'));
      return;
    }

    const folderId = world.folderId || 'none';
    const allWorlds = await getAllWorldsInternal();
    const existing = allWorlds.find(w => w.id === world.id);

    if (existing) {
      if (existing.folderId === folderId) {
        sendResponse({ success: false, reason: 'already_exists_same_folder' });
        return;
      }
      sendResponse(createAlreadyExistsError(existing.folderId, world.name));
      return;
    }

    const addResult = await addWorldToFolder({
      ...world,
      folderId: folderId
    });

    if (addResult.success) {
      logAction('WORLD_ADDED', { worldId: world.id, folderId });
      sendResponse(createSuccessResponse());
    } else {
      sendResponse(addResult);
    }
  } catch (error) {
    logError('ADD_WORLD', error);
    sendResponse(createGenericError(error.message));
  }
}

async function removeWorld(worldId, folderId, sendResponse) {
  try {
    const removeResult = await removeWorldFromFolder(worldId, folderId);

    if (removeResult.success) {
      logAction('WORLD_REMOVED', { worldId, folderId });
      sendResponse(createSuccessResponse());
    } else {
      sendResponse(removeResult);
    }
  } catch (error) {
    logError('REMOVE_WORLD', error);
    sendResponse(createGenericError(error.message));
  }
}

async function updateWorld(world, sendResponse) {
  try {
    if (!world || !world.id) {
      sendResponse(createGenericError('Invalid world data', 'invalid_data'));
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
          authorName: world.authorName !== undefined ? world.authorName : vrcWorlds[index].authorName,
          releaseStatus: world.releaseStatus !== undefined ? world.releaseStatus : vrcWorlds[index].releaseStatus,
          thumbnailImageUrl: world.thumbnailImageUrl !== undefined ? world.thumbnailImageUrl : vrcWorlds[index].thumbnailImageUrl,
          favoriteRecordId: world.favoriteRecordId !== undefined ? world.favoriteRecordId : vrcWorlds[index].favoriteRecordId
        };
        await chrome.storage.local.set({ vrcWorlds });
      }

    } else {
      await saveWorldDetails(world.id, {
        name: world.name,
        authorName: world.authorName || null,
        releaseStatus: world.releaseStatus || null,
        thumbnailImageUrl: world.thumbnailImageUrl || null
      });
    }

    logAction('WORLD_UPDATED', { worldId: world.id });
    sendResponse(createSuccessResponse());
  } catch (error) {
    logError('UPDATE_WORLD', error);
    sendResponse(createGenericError(error.message));
  }
}

async function moveWorld(worldId, fromFolder, toFolder, newFavoriteRecordId, sendResponse) {
  logAction('MOVE_WORLD_START', { worldId, fromFolder, toFolder });

  try {
    if (fromFolder === toFolder) {
      sendResponse(createSuccessResponse());
      return;
    }

    const allWorlds = await getAllWorldsInternal();
    let world = allWorlds.find(w => w.id === worldId && w.folderId === fromFolder);

    if (!world) {
      world = allWorlds.find(w => w.id === worldId);
      if (world && world.folderId === toFolder) {
         sendResponse(createSuccessResponse());
         return;
      }
      logError('MOVE_WORLD_NOT_FOUND', 'World not found in source folder', { worldId, fromFolder });
      sendResponse(createGenericError('World not found in source folder', 'not_found'));
      return;
    }

    await removeWorldFromFolder(worldId, fromFolder);

    const worldToAdd = {
      ...world,
      folderId: toFolder,
      favoriteRecordId: newFavoriteRecordId || world.favoriteRecordId
    };
    
    const addResult = await addWorldToFolder(worldToAdd);

    if (!addResult.success) {
      logError('MOVE_WORLD_ADD_FAILED', addResult.reason || addResult.error, worldToAdd);
      await addWorldToFolder({ ...world, folderId: fromFolder });
      sendResponse(addResult);
      return;
    }

    logAction('MOVE_WORLD_SUCCESS', { worldId, fromFolder, toFolder });
    sendResponse(createSuccessResponse());
  } catch (error) {
    logError('MOVE_WORLD_ERROR', error, { worldId, fromFolder, toFolder });
    sendResponse(createGenericError(error.message));
  }
}

// ========================================
// ワールドCRUD (バッチ)
// ========================================

async function batchUpdateWorlds(changes, sendResponse, progressCallback = null) {
  logBatch('START', {
    movedCount: changes.movedWorlds?.length || 0,
    deletedCount: changes.deletedWorlds?.length || 0
  });

  try {
    const { movedWorlds = [], deletedWorlds = [] } = changes;

    if (movedWorlds.length === 0 && deletedWorlds.length === 0) {
      logBatch('EMPTY', 'No changes');
      sendResponse(createSuccessResponse({ movedCount: 0, deletedCount: 0 }));
      return;
    }

    let movedSuccessCount = 0;
    let deletedSuccessCount = 0;
    let errorCount = 0;
    const errors = [];

    const allChanges = [
      ...movedWorlds.map(m => ({ type: 'move', ...m })),
      ...deletedWorlds.map(d => ({ type: 'delete', ...d }))
    ];

    logBatch('CLASSIFIED', { totalChanges: allChanges.length });

    for (let i = 0; i < allChanges.length; i += BATCH_SIZE.sync) {
      const batch = allChanges.slice(i, i + BATCH_SIZE.sync);
      logBatch('UNIFIED_BATCH', { batch: i / BATCH_SIZE.sync + 1, size: batch.length });

      const result = await processUnifiedBatch(batch, progressCallback);
      
      movedSuccessCount += result.movedSuccess || 0;
      deletedSuccessCount += result.deletedSuccess || 0;
      errorCount += result.errors || 0;
      
      if (result.errorMessages && result.errorMessages.length > 0) {
        errors.push(...result.errorMessages);
      }

      await sleep(500);
    }

    logBatch('COMPLETE', { 
      movedSuccessCount, 
      deletedSuccessCount, 
      errorCount 
    });

    sendResponse({
      success: errorCount === 0,
      movedCount: movedSuccessCount,
      deletedCount: deletedSuccessCount,
      errorCount: errorCount,
      errors: errors.length > 0 ? errors : null
    });
  } catch (error) {
    logError('BATCH_UPDATE_ERROR', error);
    sendResponse(createGenericError(error.message));
  }
}

async function processUnifiedBatch(batch, progressCallback = null) {
  logBatch('UNIFIED_BATCH_START', { size: batch.length });

  try {
    let syncWorlds = await loadWorldsChunked();
    
    const local = await chrome.storage.local.get(['vrcWorlds']);
    let vrcWorlds = local.vrcWorlds || [];

    let movedSuccessCount = 0;
    let deletedSuccessCount = 0;
    const errorMessages = [];
    let syncModified = false;
    let vrcModified = false;

    const moveToSync = batch.filter(c => c.type === 'move' && c.fromFolder.startsWith('worlds') && !c.toFolder.startsWith('worlds'));
    const moveToVRC = batch.filter(c => c.type === 'move' && !c.fromFolder.startsWith('worlds') && c.toFolder.startsWith('worlds'));
    const deleteFromSync = batch.filter(c => c.type === 'delete' && !c.folderId.startsWith('worlds'));
    
    const syncAfterDelete = syncWorlds.length - deleteFromSync.length;
    const syncAfterMove = syncAfterDelete + moveToSync.length - moveToVRC.length;
    
    if (syncAfterMove > SYNC_WORLD_LIMIT) {
      const overflow = syncAfterMove - SYNC_WORLD_LIMIT;
      logError('BATCH_SYNC_LIMIT_EXCEEDED', `Would exceed limit: ${syncAfterMove}/${SYNC_WORLD_LIMIT}`, { overflow });
      return { 
        movedSuccess: 0,
        deletedSuccess: 0,
        errors: batch.length, 
        errorMessages: [`Sync上限超過: ${overflow}件オーバー (上限${SYNC_WORLD_LIMIT}件)`] 
      };
    }
    
    const vrcFolderCounts = {};
    vrcWorlds.forEach(w => {
      vrcFolderCounts[w.folderId] = (vrcFolderCounts[w.folderId] || 0) + 1;
    });
    
    for (const change of moveToVRC) {
      vrcFolderCounts[change.toFolder] = (vrcFolderCounts[change.toFolder] || 0) + 1;
    }
    
    const vrcAddByFolder = {};
    for (const change of moveToVRC) {
      vrcAddByFolder[change.toFolder] = (vrcAddByFolder[change.toFolder] || 0) + 1;
    }
    
    for (const [folderId, count] of Object.entries(vrcFolderCounts)) {
      if (count > VRC_FOLDER_LIMIT) {
        const addCount = vrcAddByFolder[folderId] || 0;
        logError('BATCH_VRC_LIMIT_EXCEEDED', `${folderId}: ${count}/${VRC_FOLDER_LIMIT}`, { addCount });
        return { 
          movedSuccess: 0,
          deletedSuccess: 0,
          errors: batch.length, 
          errorMessages: [`${folderId}上限超過: ${addCount}件追加で合計${count}件 (上限${VRC_FOLDER_LIMIT}件)`] 
        };
      }
    }

    for (const change of batch) {
      try {
        if (change.type === 'delete') {
          const fromIsVRC = change.folderId.startsWith('worlds');

          if (fromIsVRC) {
            const beforeLength = vrcWorlds.length;
            vrcWorlds = vrcWorlds.filter(w => w.id !== change.worldId);
            if (vrcWorlds.length < beforeLength) {
              deletedSuccessCount++;
              vrcModified = true;
              logAction('DELETE_SUCCESS_VRC', { worldId: change.worldId });
            } else {
              logAction('DELETE_ALREADY_REMOVED_VRC', { worldId: change.worldId });
            }
          } else {
            const beforeLength = syncWorlds.length;
            syncWorlds = syncWorlds.filter(w => w.id !== change.worldId);
            if (syncWorlds.length < beforeLength) {
              await deleteWorldDetails(change.worldId);
              deletedSuccessCount++;
              syncModified = true;
              logAction('DELETE_SUCCESS_SYNC', { worldId: change.worldId });
            } else {
              logAction('DELETE_ALREADY_REMOVED_SYNC', { worldId: change.worldId });
            }
          }

        } else if (change.type === 'move') {
          const fromIsVRC = change.fromFolder.startsWith('worlds');
          const toIsVRC = change.toFolder.startsWith('worlds');

          if (fromIsVRC && toIsVRC) {
            const index = vrcWorlds.findIndex(w => w.id === change.worldId);
            if (index !== -1) {
              vrcWorlds[index].folderId = change.toFolder;
              movedSuccessCount++;
              vrcModified = true;
              logAction('MOVE_SUCCESS_VRC_TO_VRC', { worldId: change.worldId, from: change.fromFolder, to: change.toFolder });
            } else {
              errorMessages.push(`${change.worldId}: VRC->VRC 移動元が見つかりません`);
              logError('MOVE_NOT_FOUND_VRC_TO_VRC', change.worldId);
            }

          } else if (fromIsVRC && !toIsVRC) {
            const vrcIndex = vrcWorlds.findIndex(w => w.id === change.worldId);
            if (vrcIndex !== -1) {
              const vrcWorld = vrcWorlds.splice(vrcIndex, 1)[0];
              syncWorlds.push({ id: change.worldId, folderId: change.toFolder });
              await saveWorldDetails(change.worldId, {
                name: vrcWorld.name,
                authorName: vrcWorld.authorName,
                releaseStatus: vrcWorld.releaseStatus,
                thumbnailImageUrl: vrcWorld.thumbnailImageUrl
              });
              movedSuccessCount++;
              vrcModified = true;
              syncModified = true;
              logAction('MOVE_SUCCESS_VRC_TO_SYNC', { worldId: change.worldId, from: change.fromFolder, to: change.toFolder });
            } else {
              errorMessages.push(`${change.worldId}: VRC->Sync 移動元が見つかりません`);
              logError('MOVE_NOT_FOUND_VRC_TO_SYNC', change.worldId);
            }

          } else if (!fromIsVRC && toIsVRC) {
            const syncIndex = syncWorlds.findIndex(w => w.id === change.worldId);
            if (syncIndex !== -1) {
              syncWorlds.splice(syncIndex, 1);
              const details = await getWorldDetails(change.worldId);
              if (details) {
                vrcWorlds.push({
                  id: change.worldId,
                  ...details,
                  folderId: change.toFolder,
                  favoriteRecordId: null
                });
                movedSuccessCount++;
                syncModified = true;
                vrcModified = true;
                logAction('MOVE_SUCCESS_SYNC_TO_VRC', { worldId: change.worldId, from: change.fromFolder, to: change.toFolder });
              } else {
                errorMessages.push(`${change.worldId}: 詳細情報が見つかりません`);
                logError('MOVE_DETAILS_NOT_FOUND', change.worldId);
              }
            } else {
              errorMessages.push(`${change.worldId}: Sync->VRC 移動元が見つかりません`);
              logError('MOVE_NOT_FOUND_SYNC_TO_VRC', change.worldId);
            }

          } else {
            const index = syncWorlds.findIndex(w => w.id === change.worldId);
            if (index !== -1) {
              syncWorlds[index].folderId = change.toFolder;
              movedSuccessCount++;
              syncModified = true;
              logAction('MOVE_SUCCESS_SYNC_TO_SYNC', { worldId: change.worldId, from: change.fromFolder, to: change.toFolder });
            } else {
              errorMessages.push(`${change.worldId}: Sync->Sync 移動元が見つかりません`);
              logError('MOVE_NOT_FOUND_SYNC_TO_SYNC', change.worldId);
            }
          }
        }
      } catch (e) {
        if (e.message && e.message.includes('MAX_WRITE_OPERATIONS_PER_MINUTE')) {
          errorMessages.push(`レート制限: 短時間に多くの変更を行ったため、約60秒お待ちください`);
          logError('UNIFIED_BATCH_RATE_LIMIT', e.message, change);
          throw e;
        }
        
        errorMessages.push(`${change.worldId || 'unknown'}: ${e.message}`);
        logError('UNIFIED_BATCH_ITEM_ERROR', e, change);
      }
    }

    try {
      if (syncModified) {
        await saveWorldsChunked(syncWorlds, progressCallback);
      }
      if (vrcModified) {
        await safeStorageSet('local', { vrcWorlds }, progressCallback);
      }
    } catch (storageError) {
      if (storageError.message && storageError.message.includes('MAX_WRITE_OPERATIONS_PER_MINUTE')) {
        logError('STORAGE_RATE_LIMIT_IN_BATCH', storageError.message);
        throw new Error('短時間に多くの変更を行ったため、約60秒お待ちください');
      }
      throw storageError;
    }

    logBatch('UNIFIED_BATCH_COMPLETE', { movedSuccess: movedSuccessCount, deletedSuccess: deletedSuccessCount, errors: errorMessages.length });
    
    return { 
      movedSuccess: movedSuccessCount,
      deletedSuccess: deletedSuccessCount,
      errors: errorMessages.length, 
      errorMessages 
    };
    
  } catch (error) {
    if (error.message && error.message.includes('MAX_WRITE_OPERATIONS_PER_MINUTE')) {
      logError('UNIFIED_BATCH_RATE_LIMIT_FATAL', error.message);
      return { 
        movedSuccess: 0,
        deletedSuccess: 0,
        errors: batch.length, 
        errorMessages: ['短時間に多くの変更を行ったため、約60秒お待ちください'],
        rateLimitError: true
      };
    }
    
    logError('UNIFIED_BATCH_ERROR', error);
    return { 
      movedSuccess: 0,
      deletedSuccess: 0,
      errors: batch.length, 
      errorMessages: [error.message] 
    };
  }
}

async function commitBuffer(request, sendResponse, progressCallback = null) {
  await batchUpdateWorlds(request.changes, sendResponse, progressCallback);
}

// ========================================
// フォルダ操作
// ========================================

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
    logError('GET_FOLDERS', error);
    sendResponse({ error: error.message, folders: [], vrcFolders: [] });
  }
}

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

    logAction('FOLDER_ADDED', newFolder.id);
    sendResponse(createSuccessResponse({ folder: newFolder }));
  } catch (error) {
    logError('ADD_FOLDER', error);
    sendResponse(createGenericError(error.message));
  }
}

async function removeFolder(folderId, sendResponse) {
  try {
    const sync = await chrome.storage.sync.get(['folders']);
    const folders = (sync.folders || []).filter(f => f.id !== folderId);
    await chrome.storage.sync.set({ folders: folders });

    const syncWorlds = await loadWorldsChunked();
    const updatedWorlds = syncWorlds.map(w =>
      w.folderId === folderId ? { ...w, folderId: 'none' } : w
    );
    await saveWorldsChunked(updatedWorlds);

    logAction('FOLDER_REMOVED', folderId);
    sendResponse(createSuccessResponse());
  } catch (error) {
    logError('REMOVE_FOLDER', error);
    sendResponse(createGenericError(error.message));
  }
}

async function renameFolder(folderId, newName, sendResponse) {
  try {
    const sync = await chrome.storage.sync.get(['folders']);
    const folders = sync.folders || [];
    const folder = folders.find(f => f.id === folderId);

    if (folder) {
      folder.name = newName;
      await chrome.storage.sync.set({ folders });
      logAction('FOLDER_RENAMED', { folderId, newName });
      sendResponse(createSuccessResponse());
    } else {
      sendResponse(createGenericError('Folder not found', 'not_found'));
    }
  } catch (error) {
    logError('RENAME_FOLDER', error);
    sendResponse(createGenericError(error.message));
  }
}

// ========================================
// その他
// ========================================

async function detectDuplicates(sendResponse) {
  try {
    const allWorlds = await getAllWorldsInternal();
    const worldMap = new Map();
    const duplicates = [];

    for (const world of allWorlds) {
      if (worldMap.has(world.id)) {
        const existing = worldMap.get(world.id);
        let dupEntry = duplicates.find(d => d.worldId === world.id);
        if (dupEntry) {
          dupEntry.folders.push(world.folderId);
          dupEntry.instances.push(world);
        } else {
          duplicates.push({
            worldId: world.id,
            worldName: world.name,
            folders: [existing.folderId, world.folderId],
            instances: [existing, world]
          });
        }
      } else {
        worldMap.set(world.id, world);
      }
    }

    logAction('DETECT_DUPLICATES', { count: duplicates.length });
    sendResponse({ duplicates });
  } catch (error) {
    logError('DETECT_DUPLICATES_ERROR', error);
    sendResponse({ error: error.message, duplicates: [] });
  }
}

async function resolveDuplicates(strategy, sendResponse) {
  try {
    logAction('RESOLVE_DUPLICATES_START', { strategy });
    
    const allWorlds = await getAllWorldsInternal();
    const worldMap = new Map();
    const toDelete = [];

    for (const world of allWorlds) {
      if (worldMap.has(world.id)) {
        const existing = worldMap.get(world.id);
        
        let keepWorld, deleteWorld;
        
        switch (strategy) {
          case 'keep_vrc':
            if (world.folderId.startsWith('worlds')) {
              keepWorld = world;
              deleteWorld = existing;
            } else if (existing.folderId.startsWith('worlds')) {
              keepWorld = existing;
              deleteWorld = world;
            } else {
              keepWorld = existing;
              deleteWorld = world;
            }
            break;
            
          case 'keep_newest':
            if (world.favoriteRecordId && !existing.favoriteRecordId) {
              keepWorld = world;
              deleteWorld = existing;
            } else {
              keepWorld = existing;
              deleteWorld = world;
            }
            break;
            
          case 'keep_first':
          default:
            keepWorld = existing;
            deleteWorld = world;
            break;
        }
        
        toDelete.push({
          worldId: deleteWorld.id,
          folderId: deleteWorld.folderId
        });
        
        worldMap.set(world.id, keepWorld);
      } else {
        worldMap.set(world.id, world);
      }
    }
    
    if (toDelete.length === 0) {
      logAction('RESOLVE_DUPLICATES_NONE', 'No duplicates found');
      sendResponse(createSuccessResponse({ 
        resolvedCount: 0,
        message: '重複は見つかりませんでした'
      }));
      return;
    }
    
    let successCount = 0;
    const errors = [];
    
    for (const item of toDelete) {
      try {
        const result = await removeWorldFromFolder(item.worldId, item.folderId);
        if (result.success) {
          successCount++;
        } else {
          errors.push(`${item.worldId}: ${result.message || result.error}`);
        }
      } catch (error) {
        errors.push(`${item.worldId}: ${error.message}`);
      }
    }
    
    logAction('RESOLVE_DUPLICATES_COMPLETE', { 
      total: toDelete.length,
      success: successCount,
      errors: errors.length
    });
    
    sendResponse(createSuccessResponse({
      resolvedCount: successCount,
      totalDuplicates: toDelete.length,
      errors: errors.length > 0 ? errors : null,
      message: `${successCount}件の重複を解消しました`
    }));
    
  } catch (error) {
    logError('RESOLVE_DUPLICATES_ERROR', error);
    sendResponse(createGenericError(error.message));
  }
}