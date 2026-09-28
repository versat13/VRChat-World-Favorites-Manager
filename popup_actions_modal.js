// popup_actions_modal.js - 移動/フォルダ操作/VRCフォルダ各モーダル、ワールド手動追加
// popup_actions.js から機能分離(v1.4.0時点でのリファクタリング)

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
        (world.releaseStatus === 'private' || world.releaseStatus === 'deleted' || world.releaseStatus === 'accountDeleted')) {
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
