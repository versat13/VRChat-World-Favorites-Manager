// popup_actions_world.js - ワールド個別操作・一括操作・コミット・フォルダドロップ・削除
// popup_actions.js から機能分離(v1.4.0時点でのリファクタリング)

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
        // 【v1.4.0修正】VRChat公式の削除は実際にはreleaseStatusが'hidden'
        // になる仕様。'deleted'(404時の独自合成値)と同様に扱う。
        // 'private'(403時に確定させた値)は非公開として区別して通知する。
        // 'accountDeleted'は作者アカウント自体が削除・BANされている
        // ケース(403のエラーメッセージから推定)で、ワールド自体の削除とは
        // 原因が異なるため別メッセージで通知する。
        if (details.releaseStatus === 'accountDeleted') {
          showNotification(t('worldAccountDeleted'), 'info');
        } else if (details.releaseStatus === 'deleted' || details.releaseStatus === 'hidden') {
          showNotification(t('worldDeleted'), 'info');
        } else if (details.releaseStatus === 'private') {
          showNotification(t('worldPrivate'), 'info');
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
        const errorDetail = resolveErrorMessage(response);
        showNotification(
          t('commitFailed', { error: errorDetail }),
          'error'
        );
        logError('コミット失敗', response.message || response.reason || 'Unknown', response);
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
      // 【v1.4.0修正】'hidden'はVRChat公式の削除済みワールドの実際の
      // releaseStatus。'deleted'(このアプリ独自の合成値)と同様に扱う。
      if ((isVRCToVRC || isToVRC) &&
        (world.releaseStatus === 'private' || world.releaseStatus === 'deleted' || world.releaseStatus === 'hidden' || world.releaseStatus === 'accountDeleted')) {

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
