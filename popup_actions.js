// popup_actions.js v1.2.2 (前半)
// ワールド操作・コミット・移動・削除

// ============================================================
// ワールド個別操作
// ============================================================

/**
 * ワールドアクションの統一ハンドラー
 * @param {string} action - アクション種別 ('open' | 'copy' | 'addToWatch' | 'refetch' | 'delete')
 * @param {string} worldId - ワールドID
 * @param {string} folderId - フォルダID
 */
function handleWorldAction(action, worldId, folderId) {
  switch (action) {
    case 'open':
      openWorldPage(worldId);
      break;
    case 'copy':
      copyWorldURL(worldId);
      break;
    case 'addToWatch':
      handleAddAuthorToWatchList(worldId);
      break;
    case 'refetch':
      refetchWorldDetails(worldId, folderId);
      break;
    case 'delete':
      deleteSingleWorld(worldId, folderId);
      break;
  }
}

/**
 * ワールドページを新しいタブで開く
 * @param {string} worldId - ワールドID
 */
function openWorldPage(worldId) {
  chrome.tabs.create({
    url: `https://vrchat.com/home/world/${worldId}`,
    active: false
  });
}

/**
 * ワールドURLをクリップボードにコピー
 * @param {string} worldId - ワールドID
 */
function copyWorldURL(worldId) {
  const url = `https://vrchat.com/home/world/${worldId}`;
  navigator.clipboard.writeText(url).then(() => {
    showNotification(t('urlCopied'), 'success');
  }).catch(error => {
    logError('URLコピー失敗', error);
    showNotification(t('copyFailed'), 'error');
  });
}

// ============================================================
// ワールド詳細取得ヘルパー
// ============================================================

/**
 * ワールド詳細情報の取得
 * @param {string} worldId - ワールドID
 * @returns {Promise<Object|null>} ワールド詳細情報
 */
async function fetchWorldDetails(worldId) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'getSingleWorldDetails',
      worldId: worldId
    });

    if (response.success && response.world) {
      return response.world;
    } else {
      logError('ワールド詳細取得失敗', response.error);
      return null;
    }
  } catch (error) {
    logError('ワールド詳細取得例外', error);
    return null;
  }
}

/**
 * ワールド詳細の再取得
 * @param {string} worldId - ワールドID
 * @param {string} folderId - フォルダID
 */
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
        if (details.releaseStatus === 'deleted') {
          showNotification(t('worldDeleted'), 'info');
        } else {
          showNotification(t('detailsUpdated'), 'success');
        }
        await loadData();
        renderCurrentView();
      } else {
        showNotification(t('updateFailed'), 'error');
      }
    } else {
      showNotification(t('detailsFetchingFailed'), 'error');
    }
  } catch (error) {
    logError('詳細再取得失敗', error);
    showNotification(t('errorOccurred'), 'error');
  }
}

// ============================================================
// ワールド一括操作
// ============================================================

/**
 * 選択中のワールドの詳細を一括更新
 */
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

      if (response.success) {
        successCount++;
      } else {
        failCount++;
      }
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

/**
 * サムネイル情報の一括取得
 * @param {string|null} targetFolderId - 対象フォルダID(nullの場合は現在表示中のフォルダ)
 */
async function fetchAllDetails(targetFolderId = null) {
  let targetWorlds = allWorlds;

  if (targetFolderId) {
    targetWorlds = allWorlds.filter(w => w.folderId === targetFolderId);
    logAction('サムネイル一括取得', { 対象フォルダ: targetFolderId, 件数: targetWorlds.length });
  } else if (currentFolder !== 'all') {
    targetWorlds = allWorlds.filter(w => w.folderId === currentFolder);
    logAction('サムネイル一括取得', { 現在フォルダ: currentFolder, 件数: targetWorlds.length });
  } else {
    logAction('サムネイル一括取得', { 全件: targetWorlds.length });
  }

  const worldsWithoutDetails = targetWorlds.filter(w =>
    !w.thumbnailImageUrl && w.releaseStatus !== 'deleted'
  );

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

  try {
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

        if (response.success) {
          successCount++;
        } else {
          failCount++;
        }
      } else {
        failCount++;
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      // 5件ごと、または最後に再描画
      if ((i + 1) % 5 === 0 || i === sortedWorlds.length - 1) {
        await loadData();
        renderCurrentView();
      }
    }

    showNotification(t('fetchComplete', { successCount, failCount }), 'success');
    await loadData();
    renderCurrentView();
  } finally {
    isFetchingDetails = false;
    shouldCancelFetch = false;
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

/**
 * 選択中のワールドを一括削除
 */
function deleteSelectedWorlds() {
  if (isSyncing) {
    showNotification(t('operationDuringSync'), 'warning');
    return;
  }

  if (selectedWorldIds.size === 0) return;

  document.getElementById('deleteModalContent').textContent =
    t('deleteSelectedConfirm', { count: selectedWorldIds.size });

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
      logError('一括削除失敗', error);
      showNotification(t('errorOccurred'), 'error');
    }
  };

  openModal('deleteModal');
}

// ============================================================
// コミット処理(リスト編集確定)
// ============================================================

/**
 * リフレッシュまたは確定ボタンの処理
 * 編集中の場合はコミット、通常時はリフレッシュ
 */
async function handleRefreshOrConfirm() {
  const refreshBtn = document.getElementById('refreshBtn');
  const refreshText = document.getElementById('refreshText');

  if (!refreshBtn) {
    return;
  }

  // 編集中の場合はコミット処理
  if (isEditingList) {
    // コミットデータのコピーを作成
    const commitData = {
      movedWorlds: [...editingBuffer.movedWorlds],
      deletedWorlds: [...editingBuffer.deletedWorlds]
    };

    const expectedMovedCount = commitData.movedWorlds.length;
    const expectedDeletedCount = commitData.deletedWorlds.length;

    logAction('コミット開始', {
      移動予定: expectedMovedCount,
      削除予定: expectedDeletedCount
    });

    // isCommittingフラグをセット(状態保護)
    isCommitting = true;
    committingData = commitData;

    if (refreshText) {
      refreshText.textContent = t('commitInProgress');
    }
    refreshBtn.innerHTML = `🔄<span id="refreshText"> ${t('commitInProgress')}</span>`;
    refreshBtn.disabled = true;

    // UI更新(コミット中状態を表示)
    updateEditingState();

    try {
      // コピーを送信(editingBufferは保持)
      const response = await chrome.runtime.sendMessage({
        type: 'COMMIT_BUFFER',
        changes: commitData
      });

      logAction('コミット応答', response);

      if (response.success) {
        const actualMovedCount = response.movedCount || 0;
        const actualDeletedCount = response.deletedCount || 0;

        // カウント検証
        if (actualMovedCount !== expectedMovedCount) {
          logError('移動カウント不一致', 'カウント不一致', {
            予定: expectedMovedCount,
            実際: actualMovedCount
          });
        }

        if (actualDeletedCount !== expectedDeletedCount) {
          logError('削除カウント不一致', 'カウント不一致', {
            予定: expectedDeletedCount,
            実際: actualDeletedCount
          });
        }

        // コミット成功分をeditingBufferから削除(完全一致)
        editingBuffer.movedWorlds = editingBuffer.movedWorlds.filter(
          m => !commitData.movedWorlds.some(
            cm => cm.worldId === m.worldId &&
              cm.fromFolder === m.fromFolder &&
              cm.toFolder === m.toFolder
          )
        );

        editingBuffer.deletedWorlds = editingBuffer.deletedWorlds.filter(
          d => !commitData.deletedWorlds.some(
            cd => cd.worldId === d.worldId &&
              cd.folderId === d.folderId
          )
        );

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

        // editingBufferが空の場合のみisEditingListをfalse
        isEditingList = editingBuffer.movedWorlds.length > 0 ||
          editingBuffer.deletedWorlds.length > 0;

      } else {
        const errorDetail = response.error || response.reason || 'Unknown';
        showNotification(
          t('commitFailed', { error: errorDetail }),
          'error'
        );
        logError('コミット失敗', errorDetail, response);
      }

    } catch (error) {
      logError('コミット例外', error);
      showNotification(t('commitProcessFailed'), 'error');
    } finally {
      // isCommittingフラグをクリア
      isCommitting = false;
      committingData = null;
    }
  }

  // リフレッシュ処理
  if (refreshText) {
    refreshText.textContent = t('loadingView');
  }
  refreshBtn.innerHTML = `🔃<span id="refreshText"> ${t('loadingView')}</span>`;
  refreshBtn.disabled = true;

  try {
    await loadData();
    renderFolderTabs();
    renderCurrentView();
    updateEditingState();
  } catch (error) {
    logError('リフレッシュ失敗', error);
    showNotification(t('reloadFailed'), 'error');
  } finally {
    if (!isEditingList) {
      refreshBtn.innerHTML = `🔃<span id="refreshText"> ${t('reload')}</span>`;
      refreshBtn.classList.remove('confirm-button');
      refreshBtn.disabled = false;
    }
  }
}

// ============================================================
// フォルダドロップ処理
// ============================================================

/**
 * フォルダタブへのワールドドロップ処理
 * @param {string} toFolder - ドロップ先フォルダID
 * @param {DragEvent} event - ドラッグイベント
 */
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

    logAction('フォルダドロップ開始', {
      移動先: toFolder,
      移動元: fromFolder,
      件数: worldIds.length
    });

    let movedCount = 0;
    let skippedCount = 0;
    let restrictedWorlds = [];

    const isToVRC = toFolder.startsWith('worlds');
    const isVRCToVRC = fromFolder.startsWith('worlds') && toFolder.startsWith('worlds');

    // VRC制限チェック(200件)
    if (isToVRC) {
      const targetFolderWorlds = allWorlds.filter(w => w.folderId === toFolder);
      const pendingMoves = editingBuffer.movedWorlds.filter(m => m.toFolder === toFolder).length;
      const totalAfterMove = targetFolderWorlds.length + pendingMoves + worldIds.length;

      logAction('VRC制限チェック', {
        現在: targetFolderWorlds.length,
        保留中: pendingMoves,
        追加: worldIds.length,
        合計: totalAfterMove
      });

      if (totalAfterMove > 200) {
        const folderName = getFolderDisplayName(toFolder);
        showNotification(t('vrcLimitExceededError', { folder: folderName }), 'error');
        logError('VRC制限超過', `合計${totalAfterMove}件`);
        return;
      }
    }

    for (const worldId of worldIds) {
      const world = allWorlds.find(w => w.id === worldId);
      if (!world) continue;

      // 削除済みワールドはスキップ
      const isDeleted = editingBuffer.deletedWorlds.some(d => d.worldId === worldId);
      if (isDeleted) {
        logAction('削除済みワールドをスキップ', { worldId });
        skippedCount++;
        continue;
      }

      // VRCフォルダへのプライベート/削除済みワールド移動を制限
      if ((isVRCToVRC || isToVRC) &&
        (world.releaseStatus === 'private' || world.releaseStatus === 'deleted')) {

        restrictedWorlds.push(world.name);
        skippedCount++;
        continue;
      }

      // 既存の移動を検索して元のfromFolderを保持
      const existingMove = editingBuffer.movedWorlds.find(m => m.worldId === worldId);
      const originalFromFolder = existingMove ? existingMove.fromFolder : world.folderId;

      // 既存の移動を削除
      editingBuffer.movedWorlds = editingBuffer.movedWorlds.filter(m => m.worldId !== worldId);

      // 新しい移動を追加 (元のfromFolderを保持)
      editingBuffer.movedWorlds.push({
        worldId,
        fromFolder: originalFromFolder,
        toFolder
      });

      // UIは即座に更新
      world.folderId = toFolder;
      movedCount++;
    }

    // 制限ワールドの警告
    if (restrictedWorlds.length > 0) {
      const names = restrictedWorlds.slice(0, 3).join('、');
      const more = restrictedWorlds.length > 3 ?
        t('andOthers', { count: restrictedWorlds.length - 3 }) : '';

      showNotification(
        t('privateWorldsCannotMoveWarning', { names, more }),
        'warning'
      );
    }

    if (movedCount > 0) {
      showNotification(t('worldsMovedConfirm', { count: movedCount }), 'info');
      logAction('ドロップ成功', {
        移動: movedCount,
        スキップ: skippedCount,
        制限: restrictedWorlds.length
      });

      selectedWorldIds.clear();
      renderFolderTabs();
      renderCurrentView();
      updateEditingState();
    }

  } catch (error) {
    logError('フォルダドロップ失敗', error, { 移動先: toFolder, 移動元: fromFolder });
    showNotification(t('moveFailed'), 'error');
    try {
      renderFolderTabs();
      renderCurrentView();
      updateEditingState();
    } catch (uiError) {
      logError('ドロップ後のUI更新失敗', uiError);
    }
  }
}

// ============================================================
// 削除操作
// ============================================================

/**
 * 単一ワールドの削除
 * @param {string} worldId - ワールドID
 * @param {string} folderId - フォルダID
 */
function deleteSingleWorld(worldId, folderId) {
  if (isSyncing) {
    showNotification(t('operationDuringSync'), 'warning');
    return;
  }

  const world = allWorlds.find(w => w.id === worldId);
  document.getElementById('deleteModalContent').textContent =
    t('deleteSingleConfirm', { name: world?.name || worldId });

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
      logError('削除失敗', error);
      showNotification(t('errorOccurred'), 'error');
    }
  };

  openModal('deleteModal');
}

/**
 * 削除確認モーダルの確定
 */
function confirmDelete() {
  if (pendingDeleteAction) {
    pendingDeleteAction();
    pendingDeleteAction = null;
  }
  closeModal('deleteModal');
}

// ============================================================
// 移動モーダル
// ============================================================

/**
 * フォルダ移動モーダルを開く
 * @param {string[]} worldIds - 移動するワールドIDの配列
 */
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

/**
 * フォルダ移動の確定
 * @param {string} toFolder - 移動先フォルダID
 */
async function confirmMoveFolderWithId(toFolder) {
  if (isSyncing) {
    showNotification(t('operationDuringSync'), 'warning');
    return;
  }

  try {
    let movedCount = 0;
    let skippedCount = 0;
    let restrictedWorlds = [];

    // VRC制限チェック(200件: D&Dと同じ)
    if (toFolder.startsWith('worlds')) {
      const targetFolderWorlds = allWorlds.filter(w => w.folderId === toFolder);
      const pendingMoves = editingBuffer.movedWorlds.filter(m => m.toFolder === toFolder).length;
      const totalAfterMove = targetFolderWorlds.length + pendingMoves + currentMovingWorldIds.length;

      if (totalAfterMove > 200) {
        showNotification(
          t('vrcLimitExceededError', { folder: getFolderDisplayName(toFolder) }),
          'error'
        );
        return;
      }
    }

    for (const worldId of currentMovingWorldIds) {
      const world = allWorlds.find(w => w.id === worldId);
      if (!world) continue;

      // 同じフォルダへの移動はスキップ
      if (world.folderId === toFolder) {
        skippedCount++;
        continue;
      }

      // 削除済みワールドはスキップ
      const isDeleted = editingBuffer.deletedWorlds.some(d => d.worldId === worldId);
      if (isDeleted) {
        logAction('削除済みワールドをスキップ', { worldId });
        skippedCount++;
        continue;
      }

      const isVRCToVRC = world.folderId.startsWith('worlds') && toFolder.startsWith('worlds');
      const isToVRC = toFolder.startsWith('worlds');

      // VRCフォルダへのプライベート/削除済みワールド移動を制限
      if ((isVRCToVRC || isToVRC) &&
        (world.releaseStatus === 'private' || world.releaseStatus === 'deleted')) {
        restrictedWorlds.push(world.name);
        skippedCount++;
        continue;
      }

      // 既存の移動を検索して元のfromFolderを保持
      const existingMove = editingBuffer.movedWorlds.find(m => m.worldId === worldId);
      const originalFromFolder = existingMove ? existingMove.fromFolder : world.folderId;

      // 既存の移動を削除
      editingBuffer.movedWorlds = editingBuffer.movedWorlds.filter(m => m.worldId !== worldId);

      // 新しい移動を追加 (元のfromFolderを保持)
      editingBuffer.movedWorlds.push({
        worldId,
        fromFolder: originalFromFolder,
        toFolder
      });

      world.folderId = toFolder;
      movedCount++;
    }

    // 制限ワールドの警告
    if (restrictedWorlds.length > 0) {
      const names = restrictedWorlds.slice(0, 3).join('、');
      const more = restrictedWorlds.length > 3 ?
        t('andOthers', { count: restrictedWorlds.length - 3 }) : '';
      showNotification(
        t('privateWorldsCannotMoveWarning', { names, more }),
        'warning'
      );
    }

    if (movedCount > 0) {
      showNotification(t('worldsMovedConfirm', { count: movedCount }), 'info');
      logAction('フォルダ移動成功', {
        移動: movedCount,
        スキップ: skippedCount,
        制限: restrictedWorlds.length
      });
    }

    selectedWorldIds.clear();
    renderFolderTabs();
    renderCurrentView();
    updateEditingState();
  } catch (error) {
    logError('フォルダ移動失敗', error, {
      移動先: toFolder,
      ワールドID: currentMovingWorldIds
    });
    showNotification(t('moveFailed'), 'error');
  }
}

// ============================================================
// フォルダ操作モーダル
// ============================================================

/**
 * 新規フォルダの追加
 */
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
    logError('フォルダ追加失敗', error);
    showNotification(t('errorOccurred'), 'error');
  }
}

/**
 * フォルダ編集モーダルを開く
 * @param {string} folderId - フォルダID
 */
function openFolderEditModal(folderId) {
  if (folderId === 'all' || folderId === 'none') return;

  // VRCフォルダの場合
  if (folderId.startsWith('worlds')) {
    openVRCFolderModal(folderId);
    return;
  }

  // カスタムフォルダの場合
  currentRenamingFolder = folderId;
  const folder = folders.find(f => f.id === folderId);
  const folderNumber = folderId.replace('folder', '');

  document.getElementById('folderNameInput').value = folder.name;
  document.getElementById('folderIdBadge').textContent = `Ex.${folderNumber}`;

  openModal('renameFolderModal');
  setTimeout(() => document.getElementById('folderNameInput').focus(), 100);
}

/**
 * フォルダ名変更の確定
 */
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
    logError('フォルダ名変更失敗', error);
    showNotification(t('errorOccurred'), 'error');
  }
}

/**
 * フォルダ削除の確定
 */
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
      showNotification(
        t('deleteFolderSuccess', { folderName: folder.name, worldCount }),
        'success'
      );
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
    logError('フォルダ削除失敗', error);
    showNotification(t('errorOccurred'), 'error');
  }
}

// ============================================================
// モーダル共通関数
// ============================================================

/**
 * モーダルを開く
 * @param {string} modalId - モーダルのDOM ID
 */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('show');
  }
}

/**
 * モーダルを閉じる
 * @param {string} modalId - モーダルのDOM ID
 */
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('show');
  }
}

/**
 * フォルダ選択モーダルの表示
 * @param {Object} options - モーダル設定
 * @param {string} options.title - タイトル
 * @param {string} options.description - 説明文
 * @param {Array} options.folders - フォルダ一覧
 * @param {Function} options.onConfirm - 確定時のコールバック
 * @param {Function} options.onCancel - キャンセル時のコールバック
 * @param {string|null} options.currentFolderId - 現在のフォルダID
 */
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
    // disabledまたはisDisabledのどちらかでチェックするロジックは残しています
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

/**
 * フォルダオプション一覧の生成
 * @param {boolean} includeVRC - VRCフォルダを含むか
 * @param {boolean} includeAll - 「全て」オプションを含むか
 * @returns {Array} フォルダオプション一覧
 */
function generateFolderOptions(includeVRC = true, includeAll = false) {
  const options = [];

  // `folders`, `vrcFolders`, `allWorlds`, `t`はグローバルに定義されている前提
  if (typeof folders === 'undefined' || typeof vrcFolders === 'undefined' || typeof allWorlds === 'undefined' || typeof t === 'undefined') {
    // 依存関係が未定義の場合のエラー処理や警告をここに追加できます
    // console.error("Required variables (folders, vrcFolders, allWorlds, t) are not defined.");
    // return options;
  }

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
      const isOverLimit = count >= 200;
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

/**
 * フォルダオプションDOMの作成
 * @param {string} id - フォルダID
 * @param {string} name - フォルダ名
 * @param {boolean} selected - 選択状態
 * @param {string} extraClass - 追加CSSクラス
 * @param {string|null} badge - バッジテキスト
 * @returns {HTMLElement} フォルダオプションDOM
 */
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

// ============================================================
// 通知システム
// ============================================================

/**
 * 通知メッセージを表示
 * @param {string} message - 表示するメッセージ
 * @param {string} type - 'info' | 'success' | 'error' | 'warning'
 */
function showNotification(message, type = 'info') {
  const container = document.getElementById('notificationContainer') || createNotificationContainer();

  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;

  container.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('show');
  }, 10);

  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

/**
 * 通知コンテナを作成
 * @returns {HTMLElement} 通知コンテナ要素
 */
function createNotificationContainer() {
  const container = document.createElement('div');
  container.id = 'notificationContainer';
  container.className = 'notification-container';
  document.body.appendChild(container);
  return container;
}
// popup_actions.js v1.2.2 (後半)
// ============================================================
// VRCフォルダモーダル
// ============================================================

/**
 * VRCフォルダモーダルを開く
 * @param {string} folderId - VRCフォルダID
 */
function openVRCFolderModal(folderId) {
  const vrcFolder = vrcFolders.find(f => f.id === folderId);
  const folderNumber = folderId.replace('worlds', '');
  document.getElementById('vrcFolderIdBadge').textContent = `VRChat.${folderNumber}`;

  const count = allWorlds.filter(w => w.folderId === folderId).length;
  if (count > 100) {
    showNotification(
      t('vrcOver100Warning', { folder: vrcFolder.displayName }),
      'warning'
    );
  }

  openModal('vrcFolderModal');
}

/**
 * VRCフォルダ全取得(FETCH)
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
    logError('VRC同期ウィンドウ起動失敗', error);
    showNotification(t('openSyncWindowFailed'), 'error');
  }
}

/**
 * VRC同期(REFLECT)
 */
async function syncAllFavorites() {
  closeModal('vrcFolderModal');
  await openSyncMenu();
}

/**
 * VRC同期メニューを開く
 */
async function openSyncMenu() {
  // 100件超えフォルダのチェック
  const over100Folders = vrcFolders.filter(folder => {
    const count = allWorlds.filter(w => w.folderId === folder.id).length;
    return count > 100;
  });

  if (over100Folders.length > 0) {
    const folderNames = over100Folders.map(f => f.displayName).join('、');
    showNotification(t('syncFailed', { folders: folderNames }), 'error');
    return;
  }

  try {
    await chrome.windows.create({
      url: chrome.runtime.getURL('popup2_vrc_bridge.html') + '?mode=reflect',
      type: 'popup',
      width: 500,
      height: 450
    });
  } catch (error) {
    logError('VRC同期ウィンドウ起動失敗', error);
    showNotification(t('openSyncWindowFailed'), 'error');
  }
}

// ============================================================
// ワールド手動追加
// ============================================================

/**
 * ワールド手動追加モーダルを開く
 */
async function addWorldManual() {
  pendingWorldData = null;
  let initialValue = '';

  // 現在のタブからワールドIDを取得
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

    // クリップボードからワールドIDを取得
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
      } catch (error) {
        logAction('クリップボードアクセス拒否', error.message);
      }
    }
  } catch (error) {
    logError('現在ページ/クリップボード確認失敗', error);
  }

  openAddWorldModalWithInput(initialValue);
}

/**
 * ワールド追加モーダルを表示
 * @param {string} initialValue - 初期入力値
 */
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
  input.placeholder = t('addWorldUrlPlaceholder');
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

/**
 * ワールド追加の確定
 * @param {string} folderId - 追加先フォルダID
 * @param {string|null} worldIdOrUrl - ワールドIDまたはURL
 */
async function confirmAddWorldWithFolder(folderId, worldIdOrUrl = null) {
  let worldId = null;

  if (worldIdOrUrl) {
    const launchMatch = worldIdOrUrl.match(/worldId=(wrld_[a-f0-9-]+)/i);
    const urlMatch = worldIdOrUrl.match(/world\/(wrld_[a-f0-9-]+)/i);

    if (launchMatch) {
      worldId = launchMatch[1];
    } else if (urlMatch) {
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
      showNotification(
        t('privateWorldCannotAdd', { worldName: response.worldName }),
        'warning'
      );
    } else if (response.reason === 'vrc_limit_exceeded') {
      showNotification(t('vrcLimitExceededAdd'), 'error');
    } else if (response.reason === 'sync_limit_exceeded') {
      showNotification(t('syncLimitExceededAdd'), 'error');
    } else {
      showNotification(t('addWorldFailed'), 'error');
    }
  } catch (error) {
    logError('ワールド追加失敗', error);
    showNotification(t('errorOccurred'), 'error');
  }
}

// ============================================================
// コンテキストメニュー連携
// ============================================================

/**
 * コンテキストメニューから保留中のワールドを確認
 */
async function checkPendingWorldFromContext() {
  try {
    const result = await chrome.storage.local.get('pendingWorldIdFromContext');

    if (result.pendingWorldIdFromContext) {
      const worldId = result.pendingWorldIdFromContext;

      await chrome.storage.local.remove('pendingWorldIdFromContext');

      logAction('コンテキストメニューから保留中ワールド検出', { worldId });

      const details = await fetchWorldDetails(worldId);

      if (details) {
        pendingWorldData = details;

        openAddWorldModalWithInput(worldId);

        showNotification(t('fetchingWorldDetails') + ' → ' + details.name, 'success');
      } else {
        showNotification(t('worldDetailsFailed'), 'error');
      }
    }
  } catch (error) {
    logError('コンテキストメニュー保留ワールド確認失敗', error);
    showNotification(t('errorOccurred'), 'error');
  }
}

// ============================================================
// popup3: ユーザー公開お気に入り取得機能
// ============================================================
async function openUserFavoritesWindow() {
  try {
    await chrome.windows.create({
      url: chrome.runtime.getURL('popup3_user_watch.html'),
      type: 'popup',
      width: 850,
      height: 700
    });
  } catch (error) {
    console.error('Failed to open user favorites window:', error);
    showNotification('ウィンドウを開けませんでした', 'error');
  }
}

// ============================================================
// ウォッチリスト機能
// ============================================================

/**
 * 作者をウォッチリストに追加
 * @param {string} worldId - ワールドID
 */
async function handleAddAuthorToWatchList(worldId) {
  try {
    const world = allWorlds.find(w => w.id === worldId);

    if (!world) {
      showNotification(t('worldNotFound') || 'ワールドが見つかりません', 'error');
      return;
    }

    // authorIdが存在する場合はそのまま使用
    if (world.authorId) {
      if (DEBUG_LOG_ACTIONS) {
        logAction('ADD_AUTHOR_TO_WATCH_LIST', { 
          worldId, 
          authorId: world.authorId,
          authorName: world.authorName 
        });
      }

      const response = await chrome.runtime.sendMessage({
        type: 'addToWatchList',
        userId: world.authorId
      });

      if (response.success) {
        showNotification(
          t('addedToWatchList', { authorName: world.authorName }) ||
          `${world.authorName} をウォッチリストに追加しました`,
          'success'
        );
        
        // 【修正】background 側の処理完了を待ってからバッジ更新
        // 300ms待機してから更新（background の通知状態が確実に更新されるまで）
        setTimeout(async () => {
          await updateUserWatchBadge(true); // 強制更新フラグを追加
          
          if (DEBUG_LOG_ACTIONS) {
            logAction('WATCH_BADGE_UPDATED_AFTER_ADD', { authorId: world.authorId });
          }
        }, 300);

      } else if (response.reason === 'already_exists') {
        showNotification(
          t('alreadyInWatchList', { authorName: world.authorName }) ||
          `${world.authorName} は既にウォッチリスト中です`,
          'info'
        );
        
        // 既存ユーザーの場合も念のため更新
        setTimeout(() => updateUserWatchBadge(true), 100);

      } else {
        showNotification(t('addToWatchListFailed') || '追加に失敗しました', 'error');
      }
      return;
    }

    // authorIdが無い場合はAPIから取得（通知は出さない）
    const worldInfoResponse = await chrome.runtime.sendMessage({
      type: 'getWorldInfo',
      worldId: worldId
    });

    if (!worldInfoResponse.success || !worldInfoResponse.world.authorId) {
      showNotification(t('authorInfoFetchFailed') || '作者情報の取得に失敗しました', 'error');
      return;
    }

    const authorId = worldInfoResponse.world.authorId;
    const authorName = worldInfoResponse.world.authorName || 'Unknown';

    if (DEBUG_LOG_ACTIONS) {
      logAction('ADD_AUTHOR_TO_WATCH_LIST_FETCHED', { 
        worldId, 
        authorId, 
        authorName 
      });
    }

    // ウォッチリストに追加
    const response = await chrome.runtime.sendMessage({
      type: 'addToWatchList',
      userId: authorId
    });

    if (response.success) {
      showNotification(
        t('addedToWatchList', { authorName }) ||
        `${authorName} をウォッチリストに追加しました`,
        'success'
      );
      
      // 【修正】同様に待機してから更新
      setTimeout(async () => {
        await updateUserWatchBadge(true);
        
        if (DEBUG_LOG_ACTIONS) {
          logAction('WATCH_BADGE_UPDATED_AFTER_ADD_FETCHED', { authorId });
        }
      }, 300);

    } else if (response.reason === 'already_exists') {
      showNotification(
        t('alreadyInWatchList', { authorName }) ||
        `${authorName} は既にウォッチリスト中です`,
        'info'
      );
      
      setTimeout(() => updateUserWatchBadge(true), 100);

    } else {
      showNotification(t('addToWatchListFailed') || '追加に失敗しました', 'error');
    }

  } catch (error) {
    logError('ウォッチリスト追加失敗', error);
    showNotification(t('errorOccurred') || 'エラーが発生しました', 'error');
  }
}

// ============================================================
// インポート/エクスポート
// ============================================================

/**
 * インポート/エクスポートモーダルを開く
 * @param {string} mode - モード ('import' | 'export')
 */
function openImportExportModal(mode) {
  currentImportExportMode = mode;
  document.getElementById('importExportTitle').textContent =
    mode === 'import' ? t('importTitle') : t('exportTitle');
  openModal('importExportModal');
}

/**
 * インポート/エクスポートタイプの選択
 * @param {string} type - タイプ ('vrchat' | 'json' | 'vrcx')
 */
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

/**
 * VRChatからのインポート(FETCH)
 */
async function handleVRChatImport() {
  showNotification(t('fetchingVRCAll'), 'info');

  try {
    const response = await chrome.runtime.sendMessage({ type: 'fetchAllVRCFolders' });

    if (response.success) {
      showNotification(
        t('fetchVRCComplete', {
          addedCount: response.addedCount,
          totalFolders: response.totalFolders
        }),
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
    logError('VRC全フォルダ取得失敗', error);
    showNotification(t('syncFetchFailed', { error: error.message }), 'error');
  }
}

/**
 * エクスポート対象フォルダ選択
 * @param {string} type - エクスポート形式 ('json' | 'vrcx')
 */
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
      logAction('エクスポートキャンセル', { type });
    }
  });
}

/**
 * インポート先フォルダ選択
 * @param {string} type - インポート形式 ('json' | 'vrcx')
 */
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
      logAction('インポートキャンセル', { type });
    }
  });
}

/**
 * エクスポート実行
 * @param {string} type - エクスポート形式 ('json' | 'vrcx')
 * @param {string} folderId - エクスポート対象フォルダID
 */
async function executeExport(type, folderId) {
  try {
    // 完全バックアップ
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
          showNotification(
            t('exportFailed', { error: response.error || t('dataFetchError') }),
            'error'
          );
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

    // フォルダ別エクスポート
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
    logError('エクスポート失敗', error);
    showNotification(t('exportFailed', { error: error.message }), 'error');
  }
}

/**
 * ファイルダウンロード
 * @param {Blob} blob - ダウンロードするBlob
 * @param {string} filename - ファイル名
 */
function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 日付文字列取得
 * @returns {string} YYYY-MM-DD形式の日付
 */
function getDateString() {
  return new Date().toISOString().split('T')[0];
}

/**
 * ファイルインポート処理
 * @param {Event} event - ファイル選択イベント
 */
async function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const type = event.target.dataset.type;
  const targetFolder = event.target.dataset.targetFolder;

  logAction('ファイルインポート開始', {
    ファイル名: file.name,
    形式: type,
    対象フォルダ: targetFolder
  });

  try {
    const text = await file.text();
    let importWorlds = [];

    if (type === 'json') {
      const data = JSON.parse(text);

      // 完全バックアップの判定
      const isFullBackup = data.meta?.type === 'FULL_BACKUP' ||
        (data.worlds && data.folders !== undefined && data.vrcFolderData !== undefined);

      if (isFullBackup) {
        if (!data.worlds || !Array.isArray(data.worlds)) {
          showNotification(
            t('importFailedGeneral', { error: 'Invalid backup data: worlds array missing' }),
            'error'
          );
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

        const importVersion = data.meta?.version || data.version || 'unknown';
        logAction('完全バックアップインポート開始', {
          バージョン: importVersion,
          ワールド数: data.worlds.length,
          フォルダあり: !!data.folders,
          VRCフォルダあり: !!data.vrcFolderData
        });

        showNotification(t('importRestoring'), 'info');

        const worldsToImport = data.worlds || [...(data.syncWorlds || []), ...(data.vrcWorlds || [])];

        const response = await chrome.runtime.sendMessage({
          type: 'batchImportWorlds',
          isFullBackup: true,
          worlds: worldsToImport,
          folders: data.folders,
          vrcFolderData: data.vrcFolderData
        });

        logAction('ファイルインポート応答(完全)', response);

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
          showNotification(
            t('importFailedGeneral', { error: response.error || response.reason }),
            'error'
          );
        }

        event.target.value = '';
        return;
      }

      // 部分インポート
      if (!Array.isArray(data)) {
        showNotification(
          t('importFailedGeneral', { error: 'Invalid format: expected array of worlds' }),
          'error'
        );
        event.target.value = '';
        return;
      }

      importWorlds = data;

      const invalidWorlds = importWorlds.filter(w => !w.id);
      if (invalidWorlds.length > 0) {
        logError('無効なワールドデータ', `${invalidWorlds.length}件のワールドにIDがありません`);
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

      logAction('VRCXインポート解析', {
        総行数: lines.length,
        有効ワールド: importWorlds.length
      });
    }

    if (importWorlds.length === 0) {
      showNotification(t('importNoWorld'), 'warning');
      event.target.value = '';
      return;
    }

    logAction('ファイルインポート解析完了', { 件数: importWorlds.length });
    showNotification(t('importingWorlds', { count: importWorlds.length }), 'info');

    const response = await chrome.runtime.sendMessage({
      type: 'batchImportWorlds',
      worlds: importWorlds,
      targetFolder: targetFolder,
      isFullBackup: false
    });

    logAction('ファイルインポート応答(部分)', response);

    if (response.success || response.addedCount > 0 || response.movedCount > 0) {
      showNotification(t('importComplete', response), 'success');

      await loadData();
      renderFolderTabs();
      renderCurrentView();

      if (response.addedCount > 0) {
        showNotification(t('fetchingThumbnails'), 'info');
        setTimeout(() => {
          fetchAllDetails(targetFolder);

          if (autoResolveDuplicates) {
            setTimeout(() => autoResolveDuplicatesIfNeeded(), 2000);
          }
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
      logError('ファイルインポート失敗', response.error || response.reason);
    }

  } catch (error) {
    logError('インポート例外', error);
    showNotification(t('importProcessFailed'), 'error');
  }

  event.target.value = '';
}
