// popup_actions.js
// ========================================
// ワールド操作 (個別)
// ========================================
function handleWorldAction(action, worldId, folderId) {
  switch (action) {
    case 'open':
      openWorldPage(worldId);
      break;
    case 'copy':
      copyWorldURL(worldId);
      break;
    case 'refetch':
      refetchWorldDetails(worldId, folderId);
      break;
    case 'delete':
      deleteSingleWorld(worldId, folderId);
      break;
  }
}

function openWorldPage(worldId) {
  chrome.tabs.create({ url: `https://vrchat.com/home/world/${worldId}`, active: false });
}

function copyWorldURL(worldId) {
  const url = `https://vrchat.com/home/world/${worldId}`;
  navigator.clipboard.writeText(url).then(() => {
    showNotification(t('urlCopied'), 'success');
  }).catch(err => {
    console.error('Failed to copy:', err);
    showNotification(t('copyFailed'), 'error');
  });
}

// ========================================
// ワールド詳細取得
// ========================================
async function refetchWorldDetails(worldId, folderId) {
  try {
    showNotification(t('detailsFetching'), 'info');

    const details = await fetchWorldDetails(worldId);

    if (details) {
      const response = await chrome.runtime.sendMessage({
        type: 'updateWorld',
        world: { ...details, folderId }
      });

      if (response.success) {
        showNotification(t('detailsUpdated'), 'success');
        await loadData();
        renderCurrentView();
      } else {
        showNotification(t('updateFailed'), 'error');
      }
    } else {
      showNotification(t('detailsFetchingFailed'), 'error');
    }
  } catch (error) {
    console.error('Failed to refetch world details:', error);
    showNotification(t('errorOccurred'), 'error');
  }
}

/**
 * 🔥 統一: ワールド詳細取得関数(唯一の実装)
 * popup.js内の全ての箇所からこの関数を使用する
 */
async function fetchWorldDetails(worldId) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'getSingleWorldDetails',
      worldId: worldId
    });

    if (response.success && response.details) {
      return response.details;
    }

    console.error(`Failed to fetch world ${worldId}:`, response.error);
    return null;

  } catch (error) {
    console.error(`Error fetching world ${worldId}:`, error);
    return null;
  }
}

// ========================================
// 選択中のワールド更新
// ========================================
async function updateSelectedWorlds() {
  if (selectedWorldIds.size === 0) return;

  isFetchingDetails = true;
  const btn = document.getElementById('updateSelectedBtn');
  const originalText = btn.textContent;
  btn.disabled = true;

  let successCount = 0;
  let failCount = 0;
  const worldIds = Array.from(selectedWorldIds);

  for (let i = 0; i < worldIds.length; i++) {
    const worldId = worldIds[i];
    const world = allWorlds.find(w => w.id === worldId);

    btn.textContent = `🔄 ${t('updatingWorlds')} (${i + 1}/${worldIds.length})`;

    const details = await fetchWorldDetails(worldId);

    if (details) {
      const response = await chrome.runtime.sendMessage({
        type: 'updateWorld',
        world: { ...details, folderId: world.folderId }
      });

      if (response.success) successCount++;
      else failCount++;
    } else {
      failCount++;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  isFetchingDetails = false;
  btn.disabled = false;
  btn.textContent = originalText;

  showNotification(t('updateComplete', { successCount, failCount }), 'success');
  await loadData();
  renderCurrentView();
}

// ========================================
// 全ワールドの詳細取得
// ========================================
async function fetchAllDetails(targetFolderId = null) {
  let targetWorlds = allWorlds;

  if (targetFolderId) {
    targetWorlds = allWorlds.filter(w => w.folderId === targetFolderId);
    logAction('FETCH_DETAILS_TARGET_FOLDER', { folderId: targetFolderId, count: targetWorlds.length });
  } else if (currentFolder !== 'all') {
    targetWorlds = allWorlds.filter(w => w.folderId === currentFolder);
    logAction('FETCH_DETAILS_CURRENT_FOLDER', { folderId: currentFolder, count: targetWorlds.length });
  } else {
    logAction('FETCH_DETAILS_ALL', { count: targetWorlds.length });
  }

  const worldsWithoutDetails = targetWorlds.filter(w => !w.thumbnailImageUrl);

  if (worldsWithoutDetails.length === 0) {
    showNotification(t('allDetailsFetched'), 'info');
    return;
  }

  const sortedWorlds = sortWorlds(worldsWithoutDetails);
  const totalCount = sortedWorlds.length;

  isFetchingDetails = true;
  shouldCancelFetch = false;
  const btn = document.getElementById('fetchDetailsBtn');
  btn.disabled = false;
  const originalText = btn.textContent;

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < sortedWorlds.length; i++) {
    if (shouldCancelFetch) {
      showNotification(t('thumbnailCancel'), 'info');
      break;
    }

    btn.textContent = `🔄 ${t('detailsFetching')} (${i + 1}/${totalCount})`;

    const world = sortedWorlds[i];

    const details = await fetchWorldDetails(world.id);

    if (details) {
      const response = await chrome.runtime.sendMessage({
        type: 'updateWorld',
        world: { ...details, folderId: world.folderId }
      });

      if (response.success) successCount++;
      else failCount++;
    } else {
      failCount++;
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    if ((i + 1) % 5 === 0 || i === sortedWorlds.length - 1) {
      await loadData();
      renderCurrentView();
    }
  }

  isFetchingDetails = false;
  shouldCancelFetch = false;
  btn.disabled = false;
  btn.textContent = originalText;

  showNotification(t('fetchComplete', { successCount, failCount }), 'success');
  await loadData();
  renderCurrentView();
}

// ========================================
// リスト編集中の状態管理 (コミット処理) - 🔥 修正版
// ========================================
async function handleRefreshOrConfirm() {
  const refreshBtn = document.getElementById('refreshBtn');
  const refreshText = document.getElementById('refreshText');
  
  if (!refreshBtn) {
    console.error('[handleRefreshOrConfirm] refreshBtn not found');
    return;
  }

  // 🔥 編集中の場合、先にコミット処理を実行
  if (isEditingList) {
    const expectedMovedCount = editingBuffer.movedWorlds.length;
    const expectedDeletedCount = editingBuffer.deletedWorlds.length;
    
    logAction('COMMIT_START', { 
      expectedMoved: expectedMovedCount, 
      expectedDeleted: expectedDeletedCount 
    });
    if (refreshText) {
      refreshText.textContent = t('commitInProgress');
    }
    refreshBtn.innerHTML = `🔄<span id="refreshText"> ${t('commitInProgress')}</span>`;
    refreshBtn.textContent = t('commitInProgress');
    refreshBtn.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'COMMIT_BUFFER',
        changes: editingBuffer
      });

      logAction('COMMIT_RESPONSE', response);

      if (response.success) {
        const actualMovedCount = response.movedCount || 0;
        const actualDeletedCount = response.deletedCount || 0;
        
        if (actualMovedCount !== expectedMovedCount) {
          console.warn('[COMMIT] Moved count mismatch:', {
            expected: expectedMovedCount,
            actual: actualMovedCount
          });
        }
        
        if (actualDeletedCount !== expectedDeletedCount) {
          console.warn('[COMMIT] Deleted count mismatch:', {
            expected: expectedDeletedCount,
            actual: actualDeletedCount
          });
        }
        
        if (actualMovedCount === 0 && actualDeletedCount === 0) {
          showNotification(t('commitSuccessNoChanges'), 'info');
        } else {
          showNotification(
            t('commitSuccess', { 
              moved: actualMovedCount, 
              deleted: actualDeletedCount 
            }),
            'success'
          );
        }

        editingBuffer = { movedWorlds: [], deletedWorlds: [] };
        isEditingList = false;

      } else {
        const errorDetail = response.error || response.reason || 'Unknown';
        showNotification(
          t('commitFailed', { error: errorDetail }),
          'error'
        );
        logError('COMMIT_FAILED', errorDetail, response);
      }

    } catch (error) {
      console.error('Commit failed:', error);
      logError('COMMIT_EXCEPTION', error);
      showNotification(t('commitProcessFailed'), 'error');
    }
  }

  if (refreshText) {
    refreshText.textContent = t('loadingView');
  }
  refreshBtn.innerHTML = `🔃<span id="refreshText"> ${t('loadingView')}</span>`;
  refreshBtn.textContent = t('loadingText');
  refreshBtn.disabled = true;
  
  try {
    await loadData();
    renderFolderTabs();
    renderCurrentView();
    updateEditingState();
  } catch (error) {
    console.error('Refresh failed:', error);
    logError('REFRESH_FAILED', error);
    showNotification(t('reloadFailed'), 'error');
  } finally {
    // 🔥 成功・失敗問わず必ずボタン状態を復元
    if (!isEditingList) {
      refreshBtn.innerHTML = `🔃<span id="refreshText"> ${t('reload')}</span>`;
      refreshBtn.classList.remove('confirm-button');
      refreshBtn.disabled = false;
    }
    // 編集中の場合は updateEditingState() に任せる
  }
}

// ========================================
// フォルダドロップ処理 - 🔥 修正版
// ========================================
async function handleFolderDrop(toFolder, event) {
  if (isSyncing) {
    showNotification(t('operationDuringSync'), 'warning');
    return;
  }

  let fromFolder = null;

  try {
    const worldIds = JSON.parse(event.dataTransfer.getData('worldIds'));
    fromFolder = event.dataTransfer.getData('fromFolder');

    if (toFolder === fromFolder) return;

    logAction('FOLDER_DROP_START', { toFolder, fromFolder, count: worldIds.length });

    let movedCount = 0;
    let skippedCount = 0;
    let restrictedWorlds = [];

    const isToVRC = toFolder.startsWith('worlds');
    const isVRCToVRC = fromFolder.startsWith('worlds') && toFolder.startsWith('worlds');

    if (isToVRC) {
      const targetFolderWorlds = allWorlds.filter(w => w.folderId === toFolder);
      const pendingMoves = editingBuffer.movedWorlds.filter(m => m.toFolder === toFolder).length;
      const totalAfterMove = targetFolderWorlds.length + pendingMoves + worldIds.length;

      logAction('VRC_LIMIT_CHECK', {
        current: targetFolderWorlds.length,
        pending: pendingMoves,
        adding: worldIds.length,
        total: totalAfterMove
      });

      if (totalAfterMove > 150) {
        const folderName = getFolderDisplayName(toFolder);
        showNotification(t('vrcLimitExceededError', { folder: folderName }), 'error');
        logError('VRC_LIMIT_EXCEEDED', `Total would be ${totalAfterMove}`);
        return;
      }
    }

    for (const worldId of worldIds) {
      const world = allWorlds.find(w => w.id === worldId);
      if (!world) continue;

      if ((isVRCToVRC || isToVRC) &&
        (world.releaseStatus === 'private' || world.releaseStatus === 'deleted')) {
        
        restrictedWorlds.push(world.name);
        skippedCount++;
        continue;
      }

      editingBuffer.movedWorlds.push({
        worldId,
        fromFolder: world.folderId,
        toFolder
      });

      world.folderId = toFolder;
      movedCount++;
    }

    if (restrictedWorlds.length > 0) {
      const names = restrictedWorlds.slice(0, 3).join('、');
      const more = restrictedWorlds.length > 3 ? ` 他${restrictedWorlds.length - 3}件` : '';
      
      showNotification(t('privateWorldsCannotMoveWarning', { names, more }), 'warning');
    }

    if (movedCount > 0) {
      showNotification(t('worldsMovedConfirm', { count: movedCount }), 'info');
      logAction('DROP_SUCCESS', { movedCount, skippedCount, restrictedCount: restrictedWorlds.length });
      
      selectedWorldIds.clear();
      renderFolderTabs();
      renderCurrentView();
      updateEditingState();
    }

  } catch (error) {
    console.error('Failed to handle folder drop:', error);
    logError('FOLDER_DROP', error, { toFolder, fromFolder });
    showNotification(t('moveFailed'), 'error');
    try {
      renderFolderTabs();
      renderCurrentView();
      updateEditingState();
    } catch (uiError) {
      console.error('Failed to update UI after drop error:', uiError);
    }
  }
}

// ========================================
// 削除処理
// ========================================
function deleteSingleWorld(worldId, folderId) {
  if (isSyncing) {
    showNotification(t('operationDuringSync'), 'warning');
    return;
  }

  const world = allWorlds.find(w => w.id === worldId);
  document.getElementById('deleteModalContent').textContent =
    `「${world?.name || worldId}${t('deleteConfirm')}`;

  pendingDeleteAction = async () => {
    try {
      editingBuffer.deletedWorlds.push({ worldId, folderId });

      allWorlds = allWorlds.filter(w => w.id !== worldId);
      selectedWorldIds.delete(worldId);

      renderFolderTabs();
      renderCurrentView();
      updateEditingState();

      showNotification(t('deletedConfirm'), 'info');
    } catch (error) {
      console.error('Failed to delete world:', error);
      showNotification(t('errorOccurred'), 'error');
    }
  };

  openModal('deleteModal');
}

function deleteSelectedWorlds() {
  if (isSyncing) {
    showNotification(t('operationDuringSync'), 'warning');
    return;
  }

  if (selectedWorldIds.size === 0) return;

  document.getElementById('deleteModalContent').textContent =
    `${selectedWorldIds.size}${t('deleteConfirm')}`;

  pendingDeleteAction = async () => {
    try {
      for (const worldId of selectedWorldIds) {
        const world = allWorlds.find(w => w.id === worldId);
        if (world) {
          editingBuffer.deletedWorlds.push({
            worldId,
            folderId: world.folderId
          });
        }
      }

      allWorlds = allWorlds.filter(w => !selectedWorldIds.has(w.id));
      selectedWorldIds.clear();

      renderFolderTabs();
      renderCurrentView();
      updateEditingState();

      showNotification(t('deletedConfirm'), 'info');
    } catch (error) {
      console.error('Failed to delete worlds:', error);
      showNotification(t('errorOccurred'), 'error');
    }
  };

  openModal('deleteModal');
}

function confirmDelete() {
  if (pendingDeleteAction) {
    pendingDeleteAction();
    pendingDeleteAction = null;
  }
  closeModal('deleteModal');
}

// ========================================
// フォルダ操作モーダル
// ========================================
async function addNewFolder() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'addFolder' });

    if (response.success) {
      showNotification(t('addFolderSuccess'), 'success');
      await loadData();
      renderFolderTabs();
    } else {
      showNotification(t('addFolderFailed'), 'error');
    }
  } catch (error) {
    console.error('Failed to add folder:', error);
    showNotification(t('errorOccurred'), 'error');
  }
}

function openFolderEditModal(folderId) {
  if (folderId === 'all' || folderId === 'none') return;

  if (folderId.startsWith('worlds')) {
    openVRCFolderModal(folderId);
    return;
  }

  currentRenamingFolder = folderId;
  const folder = folders.find(f => f.id === folderId);
  const folderNumber = folderId.replace('folder', '');

  document.getElementById('folderNameInput').value = folder.name;
  document.getElementById('folderIdBadge').textContent = `Ex.${folderNumber}`;

  openModal('renameFolderModal');
  setTimeout(() => document.getElementById('folderNameInput').focus(), 100);
}

async function confirmRenameFolder() {
  if (!currentRenamingFolder) return;

  const newName = document.getElementById('folderNameInput').value.trim();
  if (!newName) {
    showNotification(t('renameInputWarning'), 'warning');
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'renameFolder',
      folderId: currentRenamingFolder,
      newName
    });

    if (response.success) {
      showNotification(t('folderRenamed'), 'success');
      await loadData();
      renderFolderTabs();
      closeModal('renameFolderModal');
    } else {
      showNotification(t('renameFolderFailed'), 'error');
    }
  } catch (error) {
    console.error('Failed to rename folder:', error);
    showNotification(t('errorOccurred'), 'error');
  }
}

async function confirmDeleteFolder() {
  if (!currentRenamingFolder) return;

  const folder = folders.find(f => f.id === currentRenamingFolder);
  const worldCount = allWorlds.filter(w => w.folderId === currentRenamingFolder).length;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'removeFolder',
      folderId: currentRenamingFolder
    });

    if (response.success) {
      showNotification(t('deleteFolderSuccess', { folderName: folder.name, worldCount }), 'success');
      if (currentFolder === currentRenamingFolder) {
        currentFolder = 'all';
      }
      await loadData();
      renderFolderTabs();
      renderCurrentView();
      closeModal('renameFolderModal');
    } else {
      showNotification(t('deleteFolderFailed'), 'error');
    }
  } catch (error) {
    console.error('Failed to delete folder:', error);
    showNotification(t('errorOccurred'), 'error');
  }
}

// ========================================
// VRCフォルダモーダル
// ========================================
function openVRCFolderModal(folderId) {
  const vrcFolder = vrcFolders.find(f => f.id === folderId);
  const folderNumber = folderId.replace('worlds', '');
  document.getElementById('vrcFolderIdBadge').textContent = `VRChat.${folderNumber}`;

  const count = allWorlds.filter(w => w.folderId === folderId).length;
  if (count > 100) {
    showNotification(t('vrcOver100Warning', { folder: vrcFolder.displayName }), 'warning');
  }

  openModal('vrcFolderModal');
}

/**
 * VRCフォルダモーダルの「取得」ボタン - ブリッジウィンドウを開く
 */
async function fetchAllVRCFolders() {
  closeModal('vrcFolderModal');
  
  try {
    await chrome.windows.create({
      url: chrome.runtime.getURL('popup2_vrc_bridge.html') + '?mode=fetch',
      type: 'popup',
      width: 500,
      height: 450
    });
  } catch (error) {
    console.error('Failed to open VRC bridge:', error);
    showNotification(t('openSyncWindowFailed'), 'error');
  }
}

/**
 * VRCフォルダモーダルの「同期」ボタン - openSyncMenu() にリダイレクト
 */
async function syncAllFavorites() {
  closeModal('vrcFolderModal');
  await openSyncMenu();
}

/**
 * 🔥 修正: ブリッジウィンドウを開く統一メソッド
 */
async function openSyncMenu() {
  // 1. 100件超えチェック
  const over100Folders = vrcFolders.filter(folder => {
    const count = allWorlds.filter(w => w.folderId === folder.id).length;
    return count > 100;
  });

  if (over100Folders.length > 0) {
    const folderNames = over100Folders.map(f => f.displayName).join('、');
    showNotification(t('syncFailed', { folders: folderNames }), 'error');
    return;
  }

  // 2. ブリッジウィンドウを開く
  try {
    await chrome.windows.create({
      url: chrome.runtime.getURL('popup2_vrc_bridge.html') + '?mode=reflect',
      type: 'popup',
      width: 500,
      height: 450
    });
  } catch (error) {
    console.error('Failed to open sync bridge:', error);
    showNotification(t('openSyncWindowFailed'), 'error');
  }
}

// ========================================
// ワールド追加
// ========================================
async function addWorldManual() {
  pendingWorldData = null;
  let initialValue = '';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const match = tab.url.match(/\/world\/(wrld_[a-f0-9-]+)/);
      if (match) {
        initialValue = match[1];
        const details = await fetchWorldDetails(initialValue);
        if (details) {
          pendingWorldData = details;
        }
      }
    }

    if (!initialValue) {
      try {
        const clipboardText = await navigator.clipboard.readText();
        const urlMatch = clipboardText.match(/world\/(wrld_[a-f0-9-]+)/);
        const idMatch = clipboardText.match(/^wrld_[a-f0-9-]+$/);

        if (urlMatch) {
          initialValue = urlMatch[1];
        } else if (idMatch) {
          initialValue = clipboardText.trim();
        }
      } catch (e) {
        console.log('Clipboard access denied or empty');
      }
    }
  } catch (error) {
    console.error('Failed to check current page/clipboard:', error);
  }

  openAddWorldModalWithInput(initialValue);
}

function openAddWorldModalWithInput(initialValue = '') {
  const existingModal = document.querySelector('.modal-overlay.add-world-overlay');
  if (existingModal) {
    existingModal.remove();
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay add-world-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal-content';

  const titleDiv = document.createElement('div');
  titleDiv.className = 'modal-title';
  titleDiv.textContent = t('addWorldTitle');
  modal.appendChild(titleDiv);

  const descriptionP = document.createElement('p');
  descriptionP.className = 'modal-description';
  descriptionP.textContent = t('addWorldInputPrompt');
  modal.appendChild(descriptionP);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'modal-input';
  input.placeholder = 'wrld_... または https://vrchat.com/home/world/wrld_...';
  input.value = initialValue;
  modal.appendChild(input);

  const descriptionP2 = document.createElement('p');
  descriptionP2.className = 'modal-description';
  descriptionP2.textContent = t('addWorldFolderPrompt');
  descriptionP2.style.marginTop = '16px';
  modal.appendChild(descriptionP2);

  const folderList = document.createElement('div');
  folderList.className = 'folder-select-list';

  const folderOptions = generateFolderOptions(false, false);

  folderOptions.forEach((folder, index) => {
    const isDisabled = folder.disabled || folder.isDisabled || false;

    const option = createFolderOption(
      folder.id,
      folder.name,
      index === 0,
      folder.class || '',
      null
    );

    if (isDisabled) {
      option.classList.add('disabled');
    }

    if (!isDisabled) {
      option.addEventListener('click', () => {
        folderList.querySelectorAll('.folder-option').forEach(o => {
          o.classList.remove('selected');
        });
        option.classList.add('selected');
      });

      option.addEventListener('dblclick', async () => {
        const worldIdOrUrl = input.value.trim();
        if (!worldIdOrUrl) {
          showNotification(t('inputRequiredWarning'), 'warning');
          return;
        }
        overlay.remove();
        await confirmAddWorldWithFolder(folder.id, worldIdOrUrl);
      });
    }

    folderList.appendChild(option);
  });

  modal.appendChild(folderList);

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'modal-buttons';

  const confirmButton = document.createElement('button');
  confirmButton.className = 'btn primary';
  confirmButton.textContent = t('addWorldButton');
  confirmButton.onclick = async () => {
    const selectedOption = folderList.querySelector('.folder-option.selected');
    if (!selectedOption) {
      showNotification(t('folderSelectWarning'), 'warning');
      return;
    }

    const worldIdOrUrl = input.value.trim();
    if (!worldIdOrUrl) {
      showNotification(t('inputRequiredWarning'), 'warning');
      return;
    }

    const folderId = selectedOption.dataset.folderId;
    overlay.remove();
    await confirmAddWorldWithFolder(folderId, worldIdOrUrl);
  };
  buttonContainer.appendChild(confirmButton);

  const cancelButton = document.createElement('button');
  cancelButton.className = 'btn secondary';
  cancelButton.textContent = t('cancelButton');
  cancelButton.onclick = () => {
    overlay.remove();
  };
  buttonContainer.appendChild(cancelButton);

  modal.appendChild(buttonContainer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  };

  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      confirmButton.click();
    }
  });

  setTimeout(() => input.focus(), 100);
}

async function confirmAddWorldWithFolder(folderId, worldIdOrUrl = null) {
  let worldId = null;

  if (worldIdOrUrl) {
    const urlMatch = worldIdOrUrl.match(/world\/(wrld_[a-f0-9-]+)/);
    if (urlMatch) {
      worldId = urlMatch[1];
    } else if (isValidWorldId(worldIdOrUrl)) {
      worldId = worldIdOrUrl;
    } else {
      showNotification(t('invalidWorldIdOrUrl'), 'error');
      return;
    }
  } else if (pendingWorldData) {
    worldId = pendingWorldData.id;
  } else {
    showNotification(t('inputRequiredWarning'), 'warning');
    return;
  }

  try {
    const worldData = pendingWorldData || await fetchWorldDetails(worldId);

    if (!worldData) {
      showNotification(t('worldDetailsFailed'), 'error');
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'addWorld',
      world: { ...worldData, folderId }
    });

    if (response.success) {
      showNotification(`${worldData.name}${t('worldAdded')}`, 'success');
      await loadData();
      renderFolderTabs();
      renderCurrentView();
    } else if (response.reason === 'already_exists_same_folder') {
      showNotification(t('worldAlreadyRegistered'), 'warning');
    } else if (response.reason === 'already_exists_different_folder') {
      const folderName = getFolderDisplayName(response.existingFolder);
      showNotification(t('worldExistsInFolder', { folderName }), 'warning');
    } else if (response.reason === 'private_world') {
      showNotification(t('privateWorldCannotAdd', { worldName: response.worldName }), 'warning');
    } else if (response.reason === 'vrc_limit_exceeded') {
      showNotification(t('vrcLimitExceededAdd'), 'error');
    } else if (response.reason === 'sync_limit_exceeded') {
      showNotification(t('syncLimitExceededAdd'), 'error');
    } else {
      showNotification(t('addWorldFailed'), 'error');
    }
  } catch (error) {
    console.error('Failed to add world:', error);
    showNotification(t('errorOccurred'), 'error');
  }
}

// ========================================
// コンテキストメニューからのワールド追加の遷移処理
// ========================================
async function checkPendingWorldFromContext() {
  try {
    const result = await chrome.storage.local.get('pendingWorldIdFromContext');

    if (result.pendingWorldIdFromContext) {
      const worldId = result.pendingWorldIdFromContext;
      
      // 即座にクリア（重複実行を防ぐ）
      await chrome.storage.local.remove('pendingWorldIdFromContext');

      logAction('CONTEXT_MENU_PENDING_DETECTED', { worldId });
      
      // ワールド情報を取得
      const details = await fetchWorldDetails(worldId);

      if (details) {
        pendingWorldData = details;
        
        // フォルダ選択モーダルを開く
        openAddWorldModalWithInput(worldId);
        
        showNotification(t('fetchingWorldDetails') + ' → ' + details.name, 'success');
      } else {
        showNotification(t('worldDetailsFailed'), 'error');
      }
    }
  } catch (error) {
    console.error('Failed to check pending world from context:', error);
    showNotification(t('errorOccurred'), 'error');
  }
}

// ========================================
// フォルダ移動モーダル
// ========================================
function openMoveFolderModal(worldIds) {
  currentMovingWorldIds = worldIds;

  const folderOptions = generateFolderOptions(true, false);

  showFolderSelectModal({
    title: t('moveFolderTitle'),
    description: `${worldIds.length}${t('worldsToMove')}`,
    folders: folderOptions,
    onConfirm: async (folderId) => {
      await confirmMoveFolderWithId(folderId);
    },
    onCancel: () => {
      currentMovingWorldIds = [];
    }
  });
}

async function confirmMoveFolderWithId(toFolder) {
  if (isSyncing) {
    showNotification(t('operationDuringSync'), 'warning');
    return;
  }

  try {
    let movedCount = 0;
    let skippedCount = 0;
    let restrictedWorlds = [];

    if (toFolder.startsWith('worlds')) {
      const targetFolderWorlds = allWorlds.filter(w => w.folderId === toFolder);
      const pendingMoves = editingBuffer.movedWorlds.filter(m => m.toFolder === toFolder).length;
      const totalAfterMove = targetFolderWorlds.length + pendingMoves + currentMovingWorldIds.length;

      if (totalAfterMove > 100) {
        showNotification(t('vrcOver100Move', { folder: getFolderDisplayName(toFolder) }), 'error');
        return;
      }
    }

    for (const worldId of currentMovingWorldIds) {
      const world = allWorlds.find(w => w.id === worldId);
      if (!world) continue;

      const fromFolder = world.folderId;

      if (fromFolder === toFolder) {
        skippedCount++;
        continue;
      }

      const isVRCToVRC = fromFolder.startsWith('worlds') && toFolder.startsWith('worlds');
      const isToVRC = toFolder.startsWith('worlds');

      if ((isVRCToVRC || isToVRC) &&
        (world.releaseStatus === 'private' || world.releaseStatus === 'deleted')) {
        restrictedWorlds.push(world.name);
        skippedCount++;
        continue;
      }

      editingBuffer.movedWorlds.push({
        worldId,
        fromFolder,
        toFolder
      });

      world.folderId = toFolder;
      movedCount++;
    }

    if (restrictedWorlds.length > 0) {
      const names = restrictedWorlds.slice(0, 3).join('、');
      const more = restrictedWorlds.length > 3 ? ` 他${restrictedWorlds.length - 3}件` : '';
      showNotification(t('privateWorldsCannotMoveWarning', { names, more }), 'warning');
    }

    if (movedCount > 0) {
      showNotification(t('worldsMovedConfirm', { count: movedCount }), 'info');
      logAction('MOVE_FOLDER_SUCCESS', { movedCount, skippedCount, restrictedCount: restrictedWorlds.length });
    }

    selectedWorldIds.clear();
    renderFolderTabs();
    renderCurrentView();
    updateEditingState();
  } catch (error) {
    console.error('Failed to move worlds:', error);
    logError('MOVE_FOLDER_FAILED', error, { toFolder, worldIds: currentMovingWorldIds });
    showNotification(t('moveFailed'), 'error');
  }
}

// ========================================
// 共通フォルダ選択UI生成
// ========================================
function generateFolderOptions(includeVRC = true, includeAll = false) {
  const options = [];

  if (includeAll) {
    options.push({
      id: 'all',
      name: t('allBackup'),
      class: '',
      disabled: false
    });
  }

  options.push({
    id: 'none',
    name: t('uncategorized'),
    class: 'none',
    disabled: false
  });

  folders.forEach(folder => {
    options.push({
      id: folder.id,
      name: `📁 ${folder.name}`,
      class: '',
      disabled: false
    });
  });

  if (includeVRC) {
    vrcFolders.forEach(folder => {
      const count = allWorlds.filter(w => w.folderId === folder.id).length;
      const isOverLimit = count >= 150;
      const isOverSyncLimit = count >= 100;

      options.push({
        id: folder.id,
        name: `${folder.displayName}${isOverLimit ? t('limitReached') : isOverSyncLimit ? t('syncNotPossible') : ''}`,
        class: isOverLimit ? 'vrc vrc-disabled' : 'vrc',
        disabled: isOverLimit,
        isDisabled: isOverLimit
      });
    });
  }

  return options;
}

function createFolderOption(id, name, selected = false, extraClass = '', badge = null) {
  const option = document.createElement('div');
  option.className = `folder-option ${extraClass} ${selected ? 'selected' : ''}`;
  option.dataset.folderId = id;

  const nameSpan = document.createElement('span');
  nameSpan.className = 'folder-option-name';
  nameSpan.textContent = name;
  option.appendChild(nameSpan);

  if (badge) {
    const badgeSpan = document.createElement('span');
    badgeSpan.className = 'folder-option-badge';
    badgeSpan.textContent = badge;
    option.appendChild(badgeSpan);
  }

  return option;
}

function showFolderSelectModal(options) {
  const {
    title = t('selectFolderTitle'),
    description = t('selectFolderPrompt'),
    folders = [],
    onConfirm = () => { },
    onCancel = () => { },
    currentFolderId = null
  } = options;

  const existingModal = document.querySelector('.modal-overlay.folder-select-overlay');
  if (existingModal) {
    existingModal.remove();
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay folder-select-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal-content folder-select-modal';

  const titleDiv = document.createElement('div');
  titleDiv.className = 'modal-title';
  titleDiv.textContent = title;
  modal.appendChild(titleDiv);

  const descriptionP = document.createElement('p');
  descriptionP.className = 'modal-description';
  descriptionP.textContent = description;
  modal.appendChild(descriptionP);

  if (currentFolderId) {
    const currentFolder = folders.find(f => f.id === currentFolderId);
    const currentFolderDiv = document.createElement('p');
    currentFolderDiv.className = 'current-folder-info';
    currentFolderDiv.textContent = t('registeredIn', { folderName: currentFolder?.name || currentFolderId });
    modal.appendChild(currentFolderDiv);
  }

  const folderList = document.createElement('div');
  folderList.className = 'folder-select-list';

  folders.forEach((folder, index) => {
    const isCurrentFolder = folder.id === currentFolderId;
    const isDisabled = folder.disabled || folder.isDisabled || false;

    const option = createFolderOption(
      folder.id,
      folder.name,
      index === 0 && !currentFolderId,
      folder.class || '',
      isCurrentFolder ? t('registered') : null
    );

    if (isDisabled) {
      option.classList.add('disabled');
    }

    if (!isDisabled) {
      option.addEventListener('click', () => {
        folderList.querySelectorAll('.folder-option').forEach(o => {
          o.classList.remove('selected');
        });
        option.classList.add('selected');
      });

      option.addEventListener('dblclick', () => {
        overlay.remove();
        onConfirm(folder.id);
      });
    }

    folderList.appendChild(option);
  });

  modal.appendChild(folderList);

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'modal-buttons';

  const confirmButton = document.createElement('button');
  confirmButton.className = 'btn primary';
  confirmButton.textContent = t('confirmButton');
  confirmButton.onclick = () => {
    const selectedOption = folderList.querySelector('.folder-option.selected');
    if (selectedOption) {
      const folderId = selectedOption.dataset.folderId;
      overlay.remove();
      onConfirm(folderId);
    } else {
      showNotification(t('folderSelectWarning'), 'warning');
    }
  };
  buttonContainer.appendChild(confirmButton);

  const cancelButton = document.createElement('button');
  cancelButton.className = 'btn secondary';
  cancelButton.textContent = t('cancelButton');
  cancelButton.onclick = () => {
    overlay.remove();
    onCancel();
  };
  buttonContainer.appendChild(cancelButton);

  modal.appendChild(buttonContainer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.remove();
      onCancel();
    }
  };
}

// ========================================
// インポート/エクスポート
// ========================================
function openImportExportModal(mode) {
  currentImportExportMode = mode;
  document.getElementById('importExportTitle').textContent =
    mode === 'import' ? t('importTitle') : t('exportTitle');
  openModal('importExportModal');
}

function handleImportExportTypeSelect(type) {
  closeModal('importExportModal');

  if (type === 'vrchat') {
    if (currentImportExportMode === 'import') {
      handleVRChatImport();
    } else {
      showNotification(t('exportSyncError'), 'info');
    }
    return;
  }

  if (currentImportExportMode === 'export') {
    openFolderSelectForExport(type);
  } else {
    if (type === 'json') {
      document.getElementById('importFile').accept = '.json';
      document.getElementById('importFile').dataset.type = 'json';
    } else if (type === 'vrcx') {
      document.getElementById('importFile').accept = '.csv,.txt';
      document.getElementById('importFile').dataset.type = 'vrcx';
    }
    openFolderSelectForImport(type);
  }
}

async function handleVRChatImport() {
  showNotification(t('fetchingVRCAll'), 'info');

  try {
    const response = await chrome.runtime.sendMessage({ type: 'fetchAllVRCFolders' });

    if (response.success) {
      showNotification(
        t('fetchVRCComplete', { addedCount: response.addedCount, totalFolders: response.totalFolders }),
        'success'
      );
      await loadData();
      renderFolderTabs();
      renderCurrentView();

      if (response.addedCount > 0) {
        showNotification(t('fetchingThumbnails'), 'info');
        setTimeout(() => {
          fetchAllDetails();
        }, 1000);
      }
    } else {
      showNotification(t('syncFetchFailed', { error: response.error }), 'error');
    }
  } catch (error) {
    console.error('Failed to fetch all VRC folders:', error);
    showNotification(t('syncFetchFailed', { error: error.message }), 'error');
  }
}

function openFolderSelectForExport(type) {
  const folderOptions = generateFolderOptions(true, true);

  showFolderSelectModal({
    title: t('exportTargetTitle'),
    description: t('exportSelectPrompt'),
    folders: folderOptions,
    onConfirm: async (folderId) => {
      await executeExport(type, folderId);
    },
    onCancel: () => {
      console.log('Export cancelled');
    }
  });
}

function openFolderSelectForImport(type) {
  const folderOptions = generateFolderOptions(false, false);

  showFolderSelectModal({
    title: t('importTargetTitle'),
    description: t('importSelectPrompt'),
    folders: folderOptions,
    onConfirm: (folderId) => {
      document.getElementById('importFile').dataset.targetFolder = folderId;
      document.getElementById('importFile').click();
    },
    onCancel: () => {
      console.log('Import cancelled');
    }
  });
}

async function executeExport(type, folderId) {
  try {
    if (folderId === 'all') {
      if (type === 'json') {
        showNotification(t('backupCreating'), 'info');
        const response = await chrome.runtime.sendMessage({ type: 'getWorldDetailsForExport' });

        if (response.success && response.data) {
          const dataStr = JSON.stringify(response.data, null, 2);
          const blob = new Blob([dataStr], { type: 'application/json' });
          downloadFile(blob, `vrchat-full-backup-${getDateString()}.json`);
          showNotification(t('exportCompleteFull'), 'success');
        } else {
          showNotification(t('exportFailed', { error: response.error || t('dataFetchError') }), 'error');
        }
        return;

      } else if (type === 'vrcx') {
        const csvData = allWorlds.map(w => `${w.id},${w.name}`).join('\n');
        const blob = new Blob([csvData], { type: 'text/csv' });
        downloadFile(blob, `vrchat-all-worlds-${getDateString()}.csv`);
        showNotification(t('exportWorldsComplete', { count: allWorlds.length }), 'success');
        return;
      }
    }

    let exportWorlds = allWorlds.filter(w => w.folderId === folderId);

    if (exportWorlds.length === 0) {
      showNotification(t('exportNoWorld'), 'warning');
      return;
    }

    if (type === 'json') {
      const dataStr = JSON.stringify(exportWorlds, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      downloadFile(blob, `vrchat-worlds-${folderId}-${getDateString()}.json`);
      showNotification(t('exportWorldsComplete', { count: exportWorlds.length }), 'success');
    } else if (type === 'vrcx') {
      const csvData = exportWorlds.map(w => `${w.id},${w.name}`).join('\n');
      const blob = new Blob([csvData], { type: 'text/csv' });
      downloadFile(blob, `vrchat-worlds-${folderId}-${getDateString()}.csv`);
      showNotification(t('exportWorldsComplete', { count: exportWorlds.length }), 'success');
    }
  } catch (error) {
    console.error('Export failed:', error);
    showNotification(t('exportFailed', { error: error.message }), 'error');
  }
}

function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function getDateString() {
  return new Date().toISOString().split('T')[0];
}

// ========================================
// ファイルインポート
// ========================================
async function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const type = event.target.dataset.type;
  const targetFolder = event.target.dataset.targetFolder;

  logAction('FILE_IMPORT_START', { filename: file.name, type, targetFolder });

  try {
    const text = await file.text();
    let importWorlds = [];

    if (type === 'json') {
      const data = JSON.parse(text);

      // 🔥 修正: データ形式で判定（バージョン番号に依存しない）
      // 完全バックアップの条件:
      // 1. meta.type が 'FULL_BACKUP' である
      // 2. または worlds, folders, vrcFolderData の3つすべてが存在する
      const isFullBackup = data.meta?.type === 'FULL_BACKUP' || 
                           (data.worlds && data.folders !== undefined && data.vrcFolderData !== undefined);

      if (isFullBackup) {
        // 🔥 データ検証
        if (!data.worlds || !Array.isArray(data.worlds)) {
          showNotification(t('importFailedGeneral', { error: 'Invalid backup data: worlds array missing' }), 'error');
          event.target.value = '';
          return;
        }

        if (data.worlds.length === 0) {
          showNotification(t('importNoWorld'), 'warning');
          event.target.value = '';
          return;
        }

        if (!confirm(t('importConfirm'))) {
          event.target.value = '';
          return;
        }

        // 🔥 バージョン情報をログに記録（デバッグ用）
        const importVersion = data.meta?.version || data.version || 'unknown';
        logAction('FULL_BACKUP_IMPORT_START', { 
          version: importVersion,
          worldCount: data.worlds.length,
          hasFolder: !!data.folders,
          hasVRCFolderData: !!data.vrcFolderData
        });

        showNotification(t('importRestoring'), 'info');

        // 互換性のための旧形式対応（syncWorlds, vrcWorlds）
        const worldsToImport = data.worlds || [...(data.syncWorlds || []), ...(data.vrcWorlds || [])];

        const response = await chrome.runtime.sendMessage({
          type: 'batchImportWorlds',
          isFullBackup: true,
          worlds: worldsToImport,
          folders: data.folders,
          vrcFolderData: data.vrcFolderData
        });

        logAction('FILE_IMPORT_RESPONSE (Full)', response);

        if (response.success || response.addedCount > 0) {
          showNotification(t('importRestored'), 'success');
          await loadData();
          renderFolderTabs();
          renderCurrentView();

          showNotification(t('fetchingThumbnails'), 'info');
          setTimeout(() => {
            fetchAllDetails('all');
          }, 1000);
        } else {
          showNotification(t('importFailedGeneral', { error: response.error || response.reason }), 'error');
        }

        event.target.value = '';
        return;
      }

      // 🔥 部分インポート（ワールド配列のみ）
      if (!Array.isArray(data)) {
        showNotification(t('importFailedGeneral', { error: 'Invalid format: expected array of worlds' }), 'error');
        event.target.value = '';
        return;
      }

      importWorlds = data;
      
      // 🔥 各ワールドの必須フィールドをチェック
      const invalidWorlds = importWorlds.filter(w => !w.id);
      if (invalidWorlds.length > 0) {
        logError('INVALID_WORLD_DATA', `${invalidWorlds.length} worlds missing id`);
        showNotification(
          t('importFailedGeneral', { 
            error: `${invalidWorlds.length} worlds have invalid data (missing id)` 
          }), 
          'error'
        );
        event.target.value = '';
        return;
      }

    } else if (type === 'vrcx') {
      // 🔥 VRCXインポート（CSV形式）
      const lines = text.split('\n').filter(line => line.trim());

      if (lines.length === 0) {
        showNotification(t('importNoWorld'), 'warning');
        event.target.value = '';
        return;
      }

      for (const line of lines) {
        const worldIdMatch = line.match(/wrld_[a-f0-9-]+/i);
        if (!worldIdMatch) continue;

        const worldId = worldIdMatch[0];
        const parts = line.split(',');
        const name = parts.length > 1 ? parts.slice(1).join(',').trim() : worldId;

        importWorlds.push({
          id: worldId,
          name: name,
          authorName: null,
          releaseStatus: null,
          thumbnailImageUrl: null
        });
      }
      
      logAction('VRCX_IMPORT_PARSED', { totalLines: lines.length, validWorlds: importWorlds.length });
    }

    if (importWorlds.length === 0) {
      showNotification(t('importNoWorld'), 'warning');
      event.target.value = '';
      return;
    }

    logAction('FILE_IMPORT_PARSED', { count: importWorlds.length });
    showNotification(t('importingWorlds', { count: importWorlds.length }), 'info');

    // 部分インポート
    const response = await chrome.runtime.sendMessage({
      type: 'batchImportWorlds',
      worlds: importWorlds,
      targetFolder: targetFolder,
      isFullBackup: false
    });

    logAction('FILE_IMPORT_RESPONSE (Partial)', response);

    if (response.success || response.addedCount > 0 || response.movedCount > 0) {
      showNotification(t('importComplete', response), 'success');

      await loadData();
      renderFolderTabs();
      renderCurrentView();

      if (response.addedCount > 0) {
        showNotification(t('fetchingThumbnails'), 'info');
        setTimeout(() => {
          fetchAllDetails(targetFolder);
        }, 1000);
      }
    } else {
      const errorMsg = response.reason === 'vrc_limit_exceeded'
        ? t('vrcLimitExceededImport')
        : response.reason === 'sync_limit_exceeded'
          ? t('syncLimitExceededImport')
          : response.reason === 'LIMIT_EXCEEDED_PARTIAL_FAILURE'
            ? t('limitExceededPartial')
            : t('importFailedGeneral', { error: response.error || t('unknownError') });
      showNotification(errorMsg, 'error');
      logError('FILE_IMPORT_FAILED', response.error || response.reason);
    }

  } catch (error) {
    console.error('Import failed:', error);
    logError('FILE_IMPORT_ERROR', error);
    showNotification(t('importProcessFailed'), 'error');
  }

  event.target.value = '';
}

// ========================================
// モーダル操作 (汎用)
// ========================================
function openModal(modalId) {
  document.getElementById(modalId).classList.add('show');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('show');
}