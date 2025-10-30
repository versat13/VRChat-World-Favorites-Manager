// popup_main.js v1.2.0
// ========================================
// VRC同期完了通知のリスナー
// ========================================
function setupVRCSyncListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'VRC_SYNC_COMPLETED') {
      console.log('[Popup] Received VRC_SYNC_COMPLETED:', message);
      
      // データを再読み込み
      loadData().then(() => {
        renderFolderTabs();
        renderCurrentView();
        
        // FETCH時のみサムネイル取得を自動実行
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
        console.error('[Popup] Failed to reload after VRC sync:', error);
        showNotification(t('reloadFailed'), 'error');
      });
      
      sendResponse({ received: true });
      return true;
    }
  });
}

// ========================================
// 起動
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
  await initSettings(); // popup_core.js
  detectWindowMode();
  await loadSettings(); // popup_core.js
  await loadData();
  setupEventListeners();
  renderFolderTabs();
  renderCurrentView();
  updateEditingState();
  await checkPendingWorldFromContext(); // popup_actions.js
  
  // 🔥 VRC同期完了通知のリスナーを追加
  setupVRCSyncListener();
});

function detectWindowMode() {
  if (window.outerWidth > 750 || window.innerHeight > 650) {
    document.body.classList.remove('popup-mode');
    document.body.classList.add('window-mode');
  }
}

// ========================================
// データ読み込み
// ========================================
async function loadData() {
  try {
    const worldsResponse = await chrome.runtime.sendMessage({ type: 'getAllWorlds' });
    allWorlds = worldsResponse.worlds || [];

    const foldersResponse = await chrome.runtime.sendMessage({ type: 'getFolders' });
    folders = foldersResponse.folders || [];
    vrcFolders = foldersResponse.vrcFolders || [];

    console.log('[Popup] Data loaded:', allWorlds.length, 'worlds,', folders.length, 'folders,', vrcFolders.length, 'VRC folders');
  } catch (error) {
    console.error('[Popup] Failed to load data:', error);
    showNotification(t('dataLoadFailed'), 'error');
  }
}

// ========================================
// イベントリスナー設定
// ========================================
function setupEventListeners() {
  // 検索
  document.getElementById('searchInput').addEventListener('input', handleSearch);
  document.getElementById('searchClearBtn').addEventListener('click', clearSearch);

  // ページネーション
  document.getElementById('prevPageBtn').addEventListener('click', () => changePage(-1));
  document.getElementById('nextPageBtn').addEventListener('click', () => changePage(1));
  document.getElementById('selectAllWrapper').addEventListener('click', toggleSelectAll);

  // ヘッダー
  document.getElementById('openOptionsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  document.getElementById('openWindowBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'popup.html' });
  });

  // 表示数変更
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

  // --- popup_actions.js の関数を呼び出し ---

  // 選択中の操作
  document.getElementById('updateSelectedBtn').addEventListener('click', updateSelectedWorlds);
  document.getElementById('moveSelectedBtn').addEventListener('click', () => openMoveFolderModal(Array.from(selectedWorldIds)));
  document.getElementById('deleteSelectedBtn').addEventListener('click', deleteSelectedWorlds);

  // 全体操作
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

  // フォルダ名変更モーダル
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

// ========================================
// フィルタリング&ソート中央集権化
// ========================================
function getFilteredAndSortedWorlds() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  let worlds = allWorlds;

  if (currentFolder !== 'all') {
    worlds = worlds.filter(w => w.folderId === currentFolder);
  }

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

// ========================================
// フォルダタブ描画
// ========================================
function renderFolderTabs() {
  const container = document.getElementById('folderTabs');
  const tabs = [];

  tabs.push({ id: 'all', name: t('folderAll'), class: '', draggable: false });
  tabs.push({ id: 'none', name: t('folderNone'), class: 'none-folder', draggable: false });

  // カスタムフォルダ
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

  tabs.push({ id: 'add', name: '+', class: 'add-folder', draggable: false });

  // VRCフォルダ
  vrcFolders.forEach(folder => {
    const count = allWorlds.filter(w => w.folderId === folder.id).length;
    const isOverLimit = count > 150;
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

  container.innerHTML = tabs.map(tab => {
    const count = tab.id === 'all' ? allWorlds.length :
      tab.id === 'add' ? '' :
        allWorlds.filter(w => w.folderId === tab.id).length;
    const activeClass = tab.id === currentFolder ? 'active' : '';
    const displayName = tab.id === 'add' ? '+' : `${tab.name} ${count !== '' ? `(${count})` : ''}`;
    const draggableAttr = tab.draggable ? 'draggable="true"' : '';

    return `<div class="folder-tab ${tab.class} ${activeClass}" data-folder-id="${tab.id}" ${draggableAttr}>${displayName}</div>`;
  }).join('');

  // イベントリスナー設定
  container.querySelectorAll('.folder-tab').forEach(tab => {
    const folderId = tab.dataset.folderId;

    if (folderId === 'add') {
      tab.addEventListener('click', () => switchFolder(folderId));
      tab.addEventListener('dblclick', addNewFolder); // popup_actions.js
    } else {
      tab.addEventListener('click', () => switchFolder(folderId));
      tab.addEventListener('dblclick', () => openFolderEditModal(folderId)); // popup_actions.js
    }

    // ドロップターゲット
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
        handleFolderDrop(folderId, e); // popup_actions.js
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

  // 編集中のマークを再適用
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

function updateFolderOrder() {
  const container = document.getElementById('folderTabs');
  const tabs = Array.from(container.querySelectorAll('.folder-tab[draggable="true"]'));
  folderOrder = tabs.map(tab => tab.dataset.folderId);
  saveSettings();
}

function switchFolder(folderId) {
  currentFolder = folderId;
  currentPage = 1;
  saveSettings();
  renderFolderTabs();
  renderCurrentView();
}

// ========================================
// ビュー描画
// ========================================
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
        `<img src="${thumbnailUrl}" alt="${world.name}">` :
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
            <button class="btn-icon" data-action="refetch" title="${t('refetchDetails')}">🖼️</button>
            <button class="btn-icon delete" data-action="delete" title="${t('deleteWorld')}">🗑️</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // イベントリスナー設定
  container.querySelectorAll('.world-item').forEach(item => {
    const worldId = item.dataset.worldId;
    const folderId = item.dataset.folderId;
    const hasSelection = selectedWorldIds.size > 0;

    const checkbox = item.querySelector('.world-checkbox');
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWorldSelection(worldId);
    });

    const thumbnail = item.querySelector('.world-thumbnail');
    thumbnail.addEventListener('click', (e) => {
      e.stopPropagation();
      if (hasSelection) {
        toggleWorldSelection(worldId);
      } else {
        openWorldPage(worldId); // popup_actions.js
      }
    });

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

    item.querySelectorAll('.btn-icon').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        handleWorldAction(action, worldId, folderId); // popup_actions.js
      });
    });
  });
}

function getFolderDisplayName(folderId) {
  if (folderId === 'none') return t('folderNone');
  if (folderId === 'all') return t('folderAll');

  const vrcFolder = vrcFolders.find(f => f.id === folderId);
  if (vrcFolder) return vrcFolder.displayName;

  const folder = folders.find(f => f.id === folderId);
  return folder ? folder.name : folderId;
}

// ========================================
// 選択操作
// ========================================
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

// ========================================
// ページネーション
// ========================================
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
    
    // 🔥 コンテンツエリアを一番上にスクロール
    const contentArea = document.querySelector('.content');
    if (contentArea) {
      contentArea.scrollTop = 0;
    }
  }
}

// ========================================
// 重複自動解消
// ========================================
async function autoResolveDuplicatesIfNeeded() {
  try {
    // 重複検出
    const detectResponse = await chrome.runtime.sendMessage({ 
      type: 'detectDuplicates' 
    });
    
    if (!detectResponse.success) {
      console.warn('[AutoResolve] Failed to detect duplicates:', detectResponse);
      return;
    }
    
    const duplicates = detectResponse.duplicates || [];
    
    if (duplicates.length === 0) {
      console.log('[AutoResolve] No duplicates found');
      return;
    }
    
    console.log(`[AutoResolve] Found ${duplicates.length} duplicate groups, resolving...`);
    showNotification(t('resolvingDuplicates'), 'info');
    
    // 重複解消
    const resolveResponse = await chrome.runtime.sendMessage({
      type: 'resolveDuplicates',
      strategy: duplicateStrategy
    });
    
    if (resolveResponse.success) {
      const count = resolveResponse.resolvedCount || 0;
      if (count > 0) {
        showNotification(t('duplicatesResolved', { count }), 'success');
        // データ再読み込み
        await loadData();
        renderFolderTabs();
        renderCurrentView();
      }
    } else {
      const errorMsg = resolveResponse.userMessage || resolveResponse.message || 'Unknown error';
      console.error('[AutoResolve] Failed to resolve duplicates:', errorMsg);
      showNotification(t('duplicateResolveFailed', { error: errorMsg }), 'error');
    }
  } catch (error) {
    console.error('[AutoResolve] Exception:', error);
  }
}

// ========================================
// 検索
// ========================================
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

// ========================================
// リスト編集中の状態管理
// ========================================
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
    console.warn('[updateEditingState] Required elements not found');
    return;
  }

  if (isEditingList) {
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
    banner.style.display = 'none';
    refreshBtn.classList.remove('confirm-button');
    refreshBtn.innerHTML = `🔃<span id="refreshText">${t('refreshText')}</span>`;

    addWorldBtn.disabled = isSyncing;
    fetchDetailsBtn.disabled = isSyncing;
    syncBtn.disabled = isSyncing;
    importBtn.disabled = isSyncing;
    exportBtn.disabled = isSyncing;
  }
}