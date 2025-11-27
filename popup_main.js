// popup_main.js v1.2.2
// イベント処理・UI更新・ページング

// ============================================================
// VRC同期完了通知リスナー
// ============================================================
function setupVRCSyncListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'VRC_SYNC_COMPLETED') {
      logAction('VRC_SYNC_COMPLETED受信', message);

      loadData().then(() => {
        renderFolderTabs();
        renderCurrentView();

        if (message.actionType === 'FETCH' && message.addedCount > 0) {
          showNotification(t('fetchingThumbnails'), 'info');
          setTimeout(() => {
            fetchAllDetails();
          }, 1000);
        } else if (message.actionType === 'REFLECT') {
          showNotification(
            t('reflectComplete', {
              removedCount: message.removedCount || 0,
              movedCount: message.movedCount || 0,
              addedCount: message.addedCount || 0
            }),
            'success'
          );
        }
      }).catch(error => {
        logError('VRC同期後の再読み込み失敗', error);
        showNotification(t('reloadFailed'), 'error');
      });

      sendResponse({ received: true });
      return true;
    }
  });
}

// ============================================================
// レート制限カウントダウンリスナー
// ============================================================
function setupRateLimitListener() {
  let hasShownInitialNotification = false;
  let isReloadingAfterWait = false;
  let hasPendingReload = false;
  let reloadPromise = null;
  let lastCountdownTime = 0; // 最後にメッセージを受信した時刻
  let timeoutCheckTimer = null; // タイムアウト検出タイマー

  /**
   * ストレージから初期状態を復元
   */
  async function initializePendingReloadState() {
    try {
      const local = await chrome.storage.local.get(['pendingReloadAfterRateLimit']);
      return local.pendingReloadAfterRateLimit || false;
    } catch (error) {
      logError('pendingReloadフラグ読み込み失敗', error);
      return false;
    }
  }

  /**
   * 安全なリロード関数(競合防止)
   */
  async function safeReload() {
    if (reloadPromise) {
      logAction('リロード', '既に実行中のためスキップ');
      return reloadPromise;
    }

    logAction('リロード', '開始');

    reloadPromise = (async () => {
      try {
        await loadData();
        renderFolderTabs();
        renderCurrentView();
        updateEditingState();

        // 完了後にストレージフラグをクリア
        try {
          await chrome.storage.local.remove(['pendingReloadAfterRateLimit']);
        } catch (storageError) {
          logError('pendingReloadフラグクリア失敗', storageError);
        }
      } catch (error) {
        logError('データ再読み込み失敗', error);
        showNotification(t('dataLoadFailed'), 'error');
      }
    })();

    reloadPromise.finally(() => {
      reloadPromise = null;
    });

    return reloadPromise;
  }

  /**
   * タイムアウト検出開始(3秒以上メッセージが来ない場合)
   */
  function startTimeoutCheck() {
    // 既存のタイマーをクリア
    if (timeoutCheckTimer) {
      clearInterval(timeoutCheckTimer);
    }

    timeoutCheckTimer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastCountdownTime;

      // 3秒以上メッセージが来ていない場合は異常と判断
      if (elapsed > 3000 && lastCountdownTime > 0) {
        logAction('カウントダウンタイムアウト検出', 'UI復旧');
        stopTimeoutCheck();
        recoverUI();
      }
    }, 1000);
  }

  /**
   * タイムアウト検出停止
   */
  function stopTimeoutCheck() {
    if (timeoutCheckTimer) {
      clearInterval(timeoutCheckTimer);
      timeoutCheckTimer = null;
    }
    lastCountdownTime = 0;
  }

  /**
   * UI復旧処理
   */
  function recoverUI() {
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.classList.remove('confirm-button');
      refreshBtn.innerHTML = `🔃<span id="refreshText"> ${t('reload')}</span>`;
    }

    // エラー通知
    showNotification(t('rateLimitTimeout'), 'warning');
  }

  /**
   * カウントダウン状態の初期化
   */
  async function initializeCountdownState() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'CHECK_RATE_LIMIT' });
      const refreshBtn = document.getElementById('refreshBtn');
      if (!refreshBtn) return;

      if (response && response.needsWait && response.waitSeconds > 0) {
        // カウントダウン中: UIのみ更新(タイマーはbackground側が管理)
        refreshBtn.disabled = true;
        refreshBtn.classList.add('confirm-button');

        // 残り秒数を表示
        const refreshText = document.getElementById('refreshText');
        const countdownText = `${t('commitInProgress')} (${response.waitSeconds})`;
        if (refreshText) {
          refreshText.textContent = countdownText;
        } else {
          refreshBtn.innerHTML = `⏳<span id="refreshText"> ${countdownText}</span>`;
        }

        // ストレージにフラグを保存
        hasPendingReload = true;
        lastCountdownTime = Date.now();
        startTimeoutCheck();

        try {
          await chrome.storage.local.set({ pendingReloadAfterRateLimit: true });
        } catch (error) {
          logError('pendingReloadフラグ保存失敗', error);
        }

      } else if (response && response.needsWait === false) {
        // 待機終了済み: UI正常化 + 必要なら再読み込み
        stopTimeoutCheck();
        refreshBtn.disabled = false;
        refreshBtn.classList.remove('confirm-button');
        refreshBtn.innerHTML = `🔃<span id="refreshText"> ${t('reload')}</span>`;

        // ストレージから復元したフラグを確認
        const storedFlag = await initializePendingReloadState();
        if (storedFlag && !isReloadingAfterWait) {
          isReloadingAfterWait = true;
          hasPendingReload = false;
          logAction('待機終了検出', 'データ再読み込み実行');
          await safeReload();
          isReloadingAfterWait = false;
        }
      }
    } catch (error) {
      logError('レート制限状態初期化失敗', error);
      stopTimeoutCheck();
    }
  }

  /**
   * クリーンアップ処理(メモリリーク対策)
   */
  window.addEventListener('beforeunload', () => {
    stopTimeoutCheck();
  });

  // 初期化
  initializeCountdownState();

  // メッセージリスナー
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // レート制限カウントダウン
    if (message.action === 'RATE_LIMIT_COUNTDOWN') {
      lastCountdownTime = Date.now(); // タイムアウト検出用

      const refreshBtn = document.getElementById('refreshBtn');
      if (refreshBtn) {
        const refreshText = document.getElementById('refreshText');
        const countdownText = `${t('commitInProgress')} (${message.remainingSeconds})`;

        refreshBtn.disabled = true;
        refreshBtn.classList.add('confirm-button');
        if (refreshText) {
          refreshText.textContent = countdownText;
        } else {
          refreshBtn.innerHTML = `⏳<span id="refreshText"> ${countdownText}</span>`;
        }
      }

      if (!hasShownInitialNotification) {
        showNotification(t('rateLimitWaiting'), 'warning');
        hasShownInitialNotification = true;
        startTimeoutCheck(); // タイムアウト監視開始
      }

      // ストレージフラグを保存
      hasPendingReload = true;
      chrome.storage.local.set({ pendingReloadAfterRateLimit: true }).catch(error => {
        logError('pendingReloadフラグ保存失敗', error);
      });

      sendResponse({ received: true });
      return true;
    }

    // 待機終了
    if (message.action === 'WAIT_FINISHED') {
      hasShownInitialNotification = false;
      stopTimeoutCheck(); // タイムアウト監視停止

      logAction('WAIT_FINISHED受信', 'レート制限待機完了、UI復帰');

      const refreshBtn = document.getElementById('refreshBtn');
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.classList.remove('confirm-button');
        refreshBtn.innerHTML = `🔃<span id="refreshText"> ${t('reload')}</span>`;
      }

      // WAIT_FINISHED受信時は再読み込みしない(まだバッチ処理中の可能性)
      hasPendingReload = true;

      sendResponse({ received: true });
      return true;
    }

    // コミット完了
    if (message.type === 'COMMIT_BUFFER_COMPLETE') {
      logAction('COMMIT_BUFFER_COMPLETE受信', '全バッチ処理完了');

      // hasPendingReloadがあれば実行
      if (hasPendingReload && !isReloadingAfterWait) {
        isReloadingAfterWait = true;
        hasPendingReload = false;
        logAction('コミット完了', 'データ再読み込み実行');

        safeReload().finally(() => {
          isReloadingAfterWait = false;
        });
      }

      sendResponse({ received: true });
      return true;
    }

    // エラーハンドリング
    if (message.action === 'COMMIT_BUFFER_ERROR') {
      logAction('COMMIT_BUFFER_ERROR受信', 'コミット失敗、クリーンアップ');

      // フラグクリア
      hasPendingReload = false;
      isReloadingAfterWait = false;
      hasShownInitialNotification = false;

      // タイムアウト監視停止
      stopTimeoutCheck();

      // UI正常化
      const refreshBtn = document.getElementById('refreshBtn');
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.classList.remove('confirm-button');
        refreshBtn.innerHTML = `🔃<span id="refreshText"> ${t('reload')}</span>`;
      }

      // ストレージクリーンアップ
      chrome.storage.local.remove(['pendingReloadAfterRateLimit']).catch(error => {
        logError('pendingReloadフラグクリア失敗', error);
      });

      // エラー通知
      showNotification(t('commitFailed') || 'コミット処理に失敗しました', 'error');

      sendResponse({ received: true });
      return true;
    }
  });
}

// ============================================================
// 起動処理
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  await initSettings();
  detectWindowMode();
  await loadSettings();
  await loadData();
  setupEventListeners();
  renderFolderTabs();
  renderCurrentView();
  updateEditingState();
  await checkPendingWorldFromContext();
  updateUserWatchBadge(); // バッジ初期化

  setupVRCSyncListener();
  setupRateLimitListener();
});

/**
 * ウィンドウモード検出
 */
function detectWindowMode() {
  if (window.outerWidth > 750 || window.innerHeight > 650) {
    document.body.classList.remove('popup-mode');
    document.body.classList.add('window-mode');
  }
}

// ============================================================
// データ読み込み
// ============================================================
async function loadData() {
  try {
    const worldsResponse = await chrome.runtime.sendMessage({ type: 'getAllWorlds' });
    allWorlds = worldsResponse.worlds || [];

    const foldersResponse = await chrome.runtime.sendMessage({ type: 'getFolders' });
    folders = foldersResponse.folders || [];
    vrcFolders = foldersResponse.vrcFolders || [];

    logAction('データ読み込み完了', {
      worlds: allWorlds.length,
      folders: folders.length,
      vrcFolders: vrcFolders.length
    });
  } catch (error) {
    logError('データ読み込み失敗', error);
    showNotification(t('dataLoadFailed'), 'error');
  }
}

// ============================================================
// イベントリスナー設定
// ============================================================
function setupEventListeners() {
  // 検索
  document.getElementById('searchInput').addEventListener('input', handleSearch);
  document.getElementById('searchClearBtn').addEventListener('click', clearSearch);

  // ページング
  document.getElementById('prevPageBtn').addEventListener('click', () => changePage(-1));
  document.getElementById('nextPageBtn').addEventListener('click', () => changePage(1));
  document.getElementById('selectAllWrapper').addEventListener('click', toggleSelectAll);

  // ヘッダーボタン
  document.getElementById('openOptionsBtn').addEventListener('click', () => {
    chrome.windows.create({
      url: chrome.runtime.getURL('options_page.html'),
      type: 'popup',
      width: 800,
      height: 600
    });
  });
  
  document.getElementById('openUserFavoritesBtn').addEventListener('click', openUserFavoritesWindow);
  document.getElementById('openWindowBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'popup.html' });
  });

  // 表示設定
  document.getElementById('itemsPerPageInput').addEventListener('change', (e) => {
    let value = parseInt(e.target.value);
    if (isNaN(value) || value < 1) value = 1;
    if (value > 100) value = 100;
    itemsPerPage = value;
    e.target.value = value;
    currentPage = 1;
    saveSettings();
    renderCurrentView();
  });

  // ソート
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    const newSort = e.target.value;
    if (newSort === sortBy) {
      sortAscending = !sortAscending;
    } else {
      sortBy = newSort;
      sortAscending = false;
    }
    document.getElementById('sortOrder').textContent = sortAscending ? '⬆️' : '⬇️';
    saveSettings();
    renderCurrentView();
  });

  document.getElementById('sortOrder').addEventListener('click', () => {
    sortAscending = !sortAscending;
    document.getElementById('sortOrder').textContent = sortAscending ? '⬆️' : '⬇️';
    saveSettings();
    renderCurrentView();
  });

  // 選択操作
  document.getElementById('updateSelectedBtn').addEventListener('click', updateSelectedWorlds);
  document.getElementById('moveSelectedBtn').addEventListener('click', () => openMoveFolderModal(Array.from(selectedWorldIds)));
  document.getElementById('deleteSelectedBtn').addEventListener('click', deleteSelectedWorlds);

  // ツールバーボタン
  document.getElementById('addWorldBtn').addEventListener('click', addWorldManual);
  document.getElementById('fetchDetailsBtn').addEventListener('click', () => {
    if (isFetchingDetails) {
      shouldCancelFetch = true;
    } else {
      fetchAllDetails();
    }
  });

  document.getElementById('syncBtn').addEventListener('click', () => {
    openSyncMenu();
  });

  document.getElementById('refreshBtn').addEventListener('click', () => {
    handleRefreshOrConfirm();
  });

  document.getElementById('importBtn').addEventListener('click', () => openImportExportModal('import'));
  document.getElementById('exportBtn').addEventListener('click', () => openImportExportModal('export'));

  // フォルダ編集モーダル
  document.getElementById('renameConfirm').addEventListener('click', confirmRenameFolder);
  document.getElementById('renameCancel').addEventListener('click', () => closeModal('renameFolderModal'));
  document.getElementById('deleteFolderBtn').addEventListener('click', confirmDeleteFolder);
  document.getElementById('folderNameInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') confirmRenameFolder();
  });

  // VRCフォルダモーダル
  document.getElementById('vrcFetchBtn').addEventListener('click', fetchAllVRCFolders);
  document.getElementById('vrcSyncBtn').addEventListener('click', syncAllFavorites);
  document.getElementById('vrcCancelBtn').addEventListener('click', () => closeModal('vrcFolderModal'));

  // インポート/エクスポートモーダル
  document.getElementById('importExportCancel').addEventListener('click', () => closeModal('importExportModal'));
  document.querySelectorAll('.import-export-option').forEach(option => {
    option.addEventListener('click', () => handleImportExportTypeSelect(option.dataset.type));
  });

  // 削除確認モーダル
  document.getElementById('deleteConfirm').addEventListener('click', confirmDelete);
  document.getElementById('deleteCancel').addEventListener('click', () => closeModal('deleteModal'));

  // ファイルインポート
  document.getElementById('importFile').addEventListener('change', handleFileImport);
}

// ============================================================
// フィルタリング・ソート
// ============================================================
function getFilteredAndSortedWorlds() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  let worlds = allWorlds;

  // フォルダフィルタ
  if (currentFolder !== 'all') {
    worlds = worlds.filter(w => w.folderId === currentFolder);
  }

  // 検索フィルタ
  if (searchTerm) {
    worlds = worlds.filter(w =>
      w.name.toLowerCase().includes(searchTerm) ||
      (w.authorName && w.authorName.toLowerCase().includes(searchTerm)) ||
      w.id.toLowerCase().includes(searchTerm)
    );
  }

  return sortWorlds(worlds);
}

function sortWorlds(worlds) {
  const sorted = [...worlds];

  sorted.sort((a, b) => {
    let result = 0;

    switch (sortBy) {
      case 'name':
        result = a.name.localeCompare(b.name, 'ja');
        break;
      case 'author':
        const authorA = a.authorName || '';
        const authorB = b.authorName || '';
        result = authorA.localeCompare(authorB, 'ja');
        break;
      case 'added':
      default:
        result = a.id.localeCompare(b.id);
        break;
    }

    return sortAscending ? result : -result;
  });

  return sorted;
}

// ============================================================
// フォルダタブ描画
// ============================================================
function renderFolderTabs() {
  const container = document.getElementById('folderTabs');
  const tabs = [];

  // 特殊フォルダ
  tabs.push({ id: 'all', name: t('folderAll'), class: '', draggable: false });
  tabs.push({ id: 'none', name: t('folderNone'), class: 'none-folder', draggable: false });

  // カスタムフォルダ(並び順適用)
  let sortedFolders = [...folders];
  if (folderOrder.length > 0) {
    sortedFolders.sort((a, b) => {
      const indexA = folderOrder.indexOf(a.id);
      const indexB = folderOrder.indexOf(b.id);
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }

  sortedFolders.forEach(folder => {
    tabs.push({ id: folder.id, name: `📁 ${folder.name}`, class: '', draggable: true });
  });

  // フォルダ追加ボタン
  tabs.push({ id: 'add', name: '+', class: 'add-folder', draggable: false });

  // VRCフォルダ
  vrcFolders.forEach(folder => {
    const count = allWorlds.filter(w => w.folderId === folder.id).length;
    const isOverLimit = count > 200;
    const isOverSyncLimit = count > 100;

    let folderClass = 'vrc-folder';
    if (isOverLimit) {
      folderClass += ' vrc-limit-exceeded';
    } else if (isOverSyncLimit) {
      folderClass += ' vrc-sync-warning';
    }

    tabs.push({
      id: folder.id,
      name: folder.displayName,
      class: folderClass,
      draggable: false
    });
  });

  // HTML生成
  container.innerHTML = tabs.map(tab => {
    const count = tab.id === 'all' ? allWorlds.length :
      tab.id === 'add' ? '' :
        allWorlds.filter(w => w.folderId === tab.id).length;
    const activeClass = tab.id === currentFolder ? 'active' : '';
    const displayName = tab.id === 'add' ? '+' : `${tab.name} ${count !== '' ? `(${count})` : ''}`;
    const draggableAttr = tab.draggable ? 'draggable="true"' : '';

    return `<div class="folder-tab ${tab.class} ${activeClass}" data-folder-id="${tab.id}" ${draggableAttr}>${displayName}</div>`;
  }).join('');

  // イベント登録
  container.querySelectorAll('.folder-tab').forEach(tab => {
    const folderId = tab.dataset.folderId;

    // クリック/ダブルクリック
    if (folderId === 'add') {
      tab.addEventListener('click', () => switchFolder(folderId));
      tab.addEventListener('dblclick', addNewFolder);
    } else {
      tab.addEventListener('click', () => switchFolder(folderId));
      tab.addEventListener('dblclick', () => openFolderEditModal(folderId));
    }

    // ドラッグ&ドロップ(ワールド)
    tab.addEventListener('dragover', (e) => {
      if (folderId !== 'add' && folderId !== 'all') {
        e.preventDefault();
        tab.classList.add('drop-target');
      }
    });

    tab.addEventListener('dragleave', () => {
      tab.classList.remove('drop-target');
    });

    tab.addEventListener('drop', (e) => {
      e.preventDefault();
      tab.classList.remove('drop-target');
      const dataType = e.dataTransfer.types[0];
      if (dataType === 'worldids') {
        handleFolderDrop(folderId, e);
      }
    });

    // フォルダ並び替え
    if (tab.draggable) {
      tab.addEventListener('dragstart', (e) => {
        tab.classList.add('dragging');
        e.dataTransfer.setData('folderId', folderId);
        e.dataTransfer.effectAllowed = 'move';
      });

      tab.addEventListener('dragend', () => {
        tab.classList.remove('dragging');
      });

      tab.addEventListener('dragover', (e) => {
        const draggingFolderId = e.dataTransfer.types.find(t => t === 'folderid');
        if (draggingFolderId) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';

          const draggingElement = container.querySelector('.folder-tab.dragging');
          if (draggingElement && draggingElement !== tab) {
            const rect = tab.getBoundingClientRect();
            const after = e.clientY > rect.top + rect.height / 2;

            if (after) {
              tab.parentNode.insertBefore(draggingElement, tab.nextSibling);
            } else {
              tab.parentNode.insertBefore(draggingElement, tab);
            }
          }
        }
      });

      tab.addEventListener('drop', (e) => {
        const draggingFolderId = e.dataTransfer.getData('folderId');
        if (draggingFolderId) {
          e.preventDefault();
          e.stopPropagation();
          updateFolderOrder();
        }
      });
    }
  });

  // 編集中フォルダをハイライト
  if (isEditingList) {
    const affectedFolders = new Set();
    editingBuffer.movedWorlds.forEach(m => {
      affectedFolders.add(m.fromFolder);
      affectedFolders.add(m.toFolder);
    });
    editingBuffer.deletedWorlds.forEach(d => affectedFolders.add(d.folderId));

    container.querySelectorAll('.folder-tab').forEach(tab => {
      const folderId = tab.dataset.folderId;
      if (affectedFolders.has(folderId)) {
        tab.classList.add('has-changes');
      }
    });
  }
}

/**
 * フォルダ並び順の更新
 */
function updateFolderOrder() {
  const container = document.getElementById('folderTabs');
  const tabs = Array.from(container.querySelectorAll('.folder-tab[draggable="true"]'));
  folderOrder = tabs.map(tab => tab.dataset.folderId);
  saveSettings();
}

/**
 * フォルダ切り替え
 */
function switchFolder(folderId) {
  currentFolder = folderId;
  currentPage = 1;
  saveSettings();
  renderFolderTabs();
  renderCurrentView();
}

// ============================================================
// ビュー描画
// ============================================================
function renderCurrentView() {
  const filteredWorlds = getFilteredAndSortedWorlds();

  const totalPages = Math.ceil(filteredWorlds.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageWorlds = filteredWorlds.slice(startIndex, endIndex);

  renderWorlds(pageWorlds);
  updatePagination(currentPage, totalPages, filteredWorlds.length);
  updateSelectionUI();
}

function renderWorlds(worlds) {
  const container = document.getElementById('worldsList');

  if (worlds.length === 0) {
    container.innerHTML = `<div class="empty-state">${t('emptyState')}</div>`;
    return;
  }

  container.innerHTML = worlds.map(world => {
    const thumbnailUrl = world.thumbnailImageUrl || '';
    const releaseStatus = world.releaseStatus || 'unknown';
    const isPrivate = releaseStatus === 'private';
    const isDeleted = releaseStatus === 'deleted';
    const isSelected = selectedWorldIds.has(world.id);
    const authorName = world.authorName || t('unknownAuthor');
    const folderName = getFolderDisplayName(world.folderId);

    let statusBadge = '';
    if (releaseStatus !== 'unknown') {
      if (isDeleted) {
        statusBadge = `<span class="status-badge deleted">${t('statusDeleted')}</span>`;
      } else if (isPrivate) {
        statusBadge = `<span class="status-badge private">${t('statusPrivate')}</span>`;
      } else {
        statusBadge = `<span class="status-badge public">${t('statusPublic')}</span>`;
      }
    }

    return `
      <div class="world-item ${isSelected ? 'selected' : ''}" 
           data-world-id="${world.id}" 
           data-folder-id="${world.folderId}"
           draggable="true">
        <div class="world-checkbox">
          <div class="custom-checkbox ${isSelected ? 'checked' : ''}"></div>
        </div>
        <div class="world-thumbnail">
          ${thumbnailUrl ?
        `<img src="${thumbnailUrl}" alt="${world.name}" draggable="false">` :
        `<div class="no-thumbnail"></div>`
      }
          ${statusBadge}
        </div>
        <div class="world-info">
          <div class="world-info-text">
            <div class="world-name" title="${world.name}">${world.name}</div>
            <div class="world-author" title="${authorName}">👤 ${authorName}</div>
            <div class="world-folder-badge">📁 ${folderName}</div>
          </div>
          <div class="world-actions">
            <button class="btn-icon" data-action="open" title="${t('openInNewTab')}">↗️</button>
            <button class="btn-icon" data-action="copy" title="${t('copyUrl')}">🔗</button>
            <button class="btn-icon" data-action="addToWatch" title="${t('addToWatchList') || 'ウォッチリストに追加'}">👤</button>
            <button class="btn-icon" data-action="refetch" title="${t('refetchDetails')}">🖼️</button>
            <button class="btn-icon delete" data-action="delete" title="${t('deleteWorld')}">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // イベント登録
  container.querySelectorAll('.world-item').forEach(item => {
    const worldId = item.dataset.worldId;
    const folderId = item.dataset.folderId;
    const hasSelection = selectedWorldIds.size > 0;

    // チェックボックス
    const checkbox = item.querySelector('.world-checkbox');
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWorldSelection(worldId);
    });

    // サムネイル
    const thumbnail = item.querySelector('.world-thumbnail');
    thumbnail.addEventListener('click', (e) => {
      e.stopPropagation();
      if (hasSelection) {
        toggleWorldSelection(worldId);
      } else {
        openWorldPage(worldId);
      }
    });

    // アイテム全体のクリック
    if (hasSelection) {
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.btn-icon') && !e.target.closest('.world-checkbox')) {
          e.stopPropagation();
          toggleWorldSelection(worldId);
        }
      });
    } else {
      item.addEventListener('dblclick', (e) => {
        if (!e.target.closest('.btn-icon') && !e.target.closest('.world-checkbox')) {
          toggleWorldSelection(worldId);
        }
      });
    }

    // ドラッグ
    item.addEventListener('dragstart', (e) => {
      item.classList.add('dragging');
      if (selectedWorldIds.has(worldId)) {
        e.dataTransfer.setData('worldIds', JSON.stringify(Array.from(selectedWorldIds)));
      } else {
        e.dataTransfer.setData('worldIds', JSON.stringify([worldId]));
      }
      e.dataTransfer.setData('fromFolder', folderId);
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
    });

    // アクションボタン
    item.querySelectorAll('.btn-icon').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        handleWorldAction(action, worldId, folderId);
      });
    });
  });
}

/**
 * フォルダ表示名取得
 */
function getFolderDisplayName(folderId) {
  if (folderId === 'none') return t('folderNone');
  if (folderId === 'all') return t('folderAll');

  const vrcFolder = vrcFolders.find(f => f.id === folderId);
  if (vrcFolder) return vrcFolder.displayName;

  const folder = folders.find(f => f.id === folderId);
  return folder ? folder.name : folderId;
}

// ============================================================
// 選択操作
// ============================================================
function toggleWorldSelection(worldId) {
  if (selectedWorldIds.has(worldId)) {
    selectedWorldIds.delete(worldId);
  } else {
    selectedWorldIds.add(worldId);
  }
  renderCurrentView();
}

function toggleSelectAll() {
  const filteredWorlds = getFilteredAndSortedWorlds();

  const currentPageWorldIds = filteredWorlds
    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
    .map(w => w.id);

  const allSelected = currentPageWorldIds.every(id => selectedWorldIds.has(id));

  if (allSelected) {
    currentPageWorldIds.forEach(id => selectedWorldIds.delete(id));
  } else {
    currentPageWorldIds.forEach(id => selectedWorldIds.add(id));
  }

  renderCurrentView();
}

function updateSelectionUI() {
  const count = selectedWorldIds.size;
  const selectionActions = document.getElementById('selectionActions');
  const selectionCount = document.getElementById('selectionCount');
  const selectAllCheckbox = document.getElementById('selectAllCheckbox');

  if (count > 0) {
    selectionActions.classList.add('visible');
    selectionCount.textContent = t('selectionCount', { count });
  } else {
    selectionActions.classList.remove('visible');
  }

  const filteredWorlds = getFilteredAndSortedWorlds();

  const currentPageWorldIds = filteredWorlds
    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
    .map(w => w.id);

  const allSelected = currentPageWorldIds.length > 0 &&
    currentPageWorldIds.every(id => selectedWorldIds.has(id));

  if (allSelected) {
    selectAllCheckbox.classList.add('checked');
  } else {
    selectAllCheckbox.classList.remove('checked');
  }
}

// ============================================================
// ページング
// ============================================================
function updatePagination(page, totalPages, totalItems) {
  document.getElementById('currentPage').textContent = page;
  document.getElementById('totalPages').textContent = totalPages || 1;
  document.getElementById('totalItems').textContent = totalItems;

  document.getElementById('prevPageBtn').disabled = page <= 1;
  document.getElementById('nextPageBtn').disabled = page >= totalPages || totalPages === 0;
}

function changePage(delta) {
  const filteredWorlds = getFilteredAndSortedWorlds();
  const totalPages = Math.ceil(filteredWorlds.length / itemsPerPage);
  const newPage = currentPage + delta;

  if (newPage >= 1 && newPage <= totalPages) {
    currentPage = newPage;
    renderCurrentView();

    // スクロール位置をトップに戻す
    const contentArea = document.querySelector('.content');
    if (contentArea) {
      contentArea.scrollTop = 0;
    }
  }
}

// ============================================================
// 重複自動解消
// ============================================================
async function autoResolveDuplicatesIfNeeded() {
  try {
    const detectResponse = await chrome.runtime.sendMessage({
      type: 'detectDuplicates'
    });

    if (!detectResponse.success) {
      logError('重複検出失敗', detectResponse);
      return;
    }

    const duplicates = detectResponse.duplicates || [];

    if (duplicates.length === 0) {
      logAction('重複解消', '重複なし');
      return;
    }

    logAction('重複解消', `${duplicates.length}件の重複グループ検出`);
    showNotification(t('resolvingDuplicates'), 'info');

    const resolveResponse = await chrome.runtime.sendMessage({
      type: 'resolveDuplicates',
      strategy: duplicateStrategy
    });

    if (resolveResponse.success) {
      const count = resolveResponse.resolvedCount || 0;
      if (count > 0) {
        showNotification(t('duplicatesResolved', { count }), 'success');
        await loadData();
        renderFolderTabs();
        renderCurrentView();
      }
    } else {
      const errorMsg = resolveResponse.userMessage || resolveResponse.message || 'Unknown error';
      logError('重複解消失敗', errorMsg);
      showNotification(t('duplicateResolveFailed', { error: errorMsg }), 'error');
    }
  } catch (error) {
    logError('重複解消例外', error);
  }
}

// ============================================================
// 検索
// ============================================================
function handleSearch() {
  currentPage = 1;
  renderCurrentView();
  updateSearchClearButton();
}

function updateSearchClearButton() {
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('searchClearBtn');
  clearBtn.style.display = searchInput.value ? 'block' : 'none';
}

function clearSearch() {
  document.getElementById('searchInput').value = '';
  handleSearch();
}

// ============================================================
// リスト編集状態管理
// ============================================================
function updateEditingState() {
  const hasChanges = editingBuffer.movedWorlds.length > 0 || editingBuffer.deletedWorlds.length > 0;
  isEditingList = hasChanges;

  const banner = document.getElementById('editingBanner');
  const refreshBtn = document.getElementById('refreshBtn');
  const addWorldBtn = document.getElementById('addWorldBtn');
  const fetchDetailsBtn = document.getElementById('fetchDetailsBtn');
  const syncBtn = document.getElementById('syncBtn');
  const importBtn = document.getElementById('importBtn');
  const exportBtn = document.getElementById('exportBtn');

  if (!banner || !refreshBtn) {
    return;
  }

  // コミット処理中は状態を保護
  if (isCommitting) {
    return;
  }

  if (isEditingList) {
    // 編集中状態
    const changeCount = editingBuffer.movedWorlds.length + editingBuffer.deletedWorlds.length;
    banner.style.display = 'flex';

    const changeCountEl = banner.querySelector('.change-count');
    if (changeCountEl) {
      changeCountEl.textContent = t('changeCount', { count: changeCount });
    }

    refreshBtn.disabled = false;
    refreshBtn.innerHTML = `✔<span id="refreshText">${t('confirmText')}</span>`;
    refreshBtn.classList.add('confirm-button');

    addWorldBtn.disabled = true;
    fetchDetailsBtn.disabled = true;
    syncBtn.disabled = true;
    importBtn.disabled = true;
    exportBtn.disabled = true;
  } else {
    // 通常状態
    banner.style.display = 'none';
    refreshBtn.classList.remove('confirm-button');
    refreshBtn.innerHTML = `🔃<span id="refreshText">${t('refreshText')}</span>`;
    refreshBtn.disabled = false;

    addWorldBtn.disabled = isSyncing;
    fetchDetailsBtn.disabled = isSyncing;
    syncBtn.disabled = isSyncing;
    importBtn.disabled = isSyncing;
    exportBtn.disabled = isSyncing;
  }
}