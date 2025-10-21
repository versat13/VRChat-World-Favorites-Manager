// popup.js - v8.0 (前半: 初期化〜ビュー描画)

// ========================================
// グローバル状態
// ========================================
let allWorlds = [];
let folders = [];
let vrcFolders = [];
let selectedWorldIds = new Set();
let currentFolder = 'all';
let currentPage = 1;
let itemsPerPage = 20;
let isFetchingDetails = false;
let shouldCancelFetch = false;
let sortBy = 'added';
let sortAscending = false;

// リスト編集中の状態管理
let isEditingList = false;
let editingBuffer = {
  movedWorlds: [],    // { worldId, fromFolder, toFolder }
  deletedWorlds: []   // { worldId, folderId }
};

// モーダル状態
let pendingWorldData = null;
let currentRenamingFolder = null;
let currentMovingWorldIds = [];
let currentImportExportMode = null;
let pendingDeleteAction = null;

// フォルダ並び順
let folderOrder = [];

// ========================================
// 初期化
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
  detectWindowMode();
  await loadSettings();
  await loadData();
  setupEventListeners();
  renderFolderTabs();
  renderCurrentView();
  updateEditingState();
});

// ウィンドウモード検出
function detectWindowMode() {
  if (window.outerWidth > 750 || window.innerHeight > 650) {
    document.body.classList.remove('popup-mode');
    document.body.classList.add('window-mode');
  }
}

// 設定読み込み
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['currentFolder', 'itemsPerPage', 'sortBy', 'sortAscending', 'folderOrder']);
    if (result.currentFolder) currentFolder = result.currentFolder;
    if (result.itemsPerPage) {
      itemsPerPage = result.itemsPerPage;
      document.getElementById('itemsPerPageInput').value = itemsPerPage;
    }
    if (result.sortBy) {
      sortBy = result.sortBy;
      document.getElementById('sortSelect').value = sortBy;
    }
    if (result.sortAscending !== undefined) {
      sortAscending = result.sortAscending;
      document.getElementById('sortOrder').textContent = sortAscending ? '↑' : '↓';
    }
    if (result.folderOrder) {
      folderOrder = result.folderOrder;
    }
  } catch (error) {
    console.error('[Popup] Failed to load settings:', error);
  }
}

// 設定保存
async function saveSettings() {
  try {
    await chrome.storage.local.set({
      currentFolder: currentFolder,
      itemsPerPage: itemsPerPage,
      sortBy: sortBy,
      sortAscending: sortAscending,
      folderOrder: folderOrder
    });
  } catch (error) {
    console.error('[Popup] Failed to save settings:', error);
  }
}

// データ読み込み
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
    showNotification('データの読み込みに失敗しました', 'error');
  }
}

// ========================================
// イベントリスナー設定
// ========================================
function setupEventListeners() {
  // コンテキストメニューからのメッセージ
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'openAddWorldModalFromContext' && request.worldId) {
      fetchWorldDetails(request.worldId).then(details => {
        if (details) {
          pendingWorldData = details;
        }
        openAddWorldModalWithInput(request.worldId);
      });
    }
  });

  // 検索
  document.getElementById('searchInput').addEventListener('input', handleSearch);
  document.getElementById('searchClearBtn').addEventListener('click', clearSearch);
  
  // ページネーション
  document.getElementById('prevPageBtn').addEventListener('click', () => changePage(-1));
  document.getElementById('nextPageBtn').addEventListener('click', () => changePage(1));
  document.getElementById('selectAllWrapper').addEventListener('click', toggleSelectAll);
  
  // ヘッダー
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
    document.getElementById('sortOrder').textContent = sortAscending ? '↑' : '↓';
    saveSettings();
    renderCurrentView();
  });

  document.getElementById('sortOrder').addEventListener('click', () => {
    sortAscending = !sortAscending;
    document.getElementById('sortOrder').textContent = sortAscending ? '↑' : '↓';
    saveSettings();
    renderCurrentView();
  });

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
  document.getElementById('syncBtn').addEventListener('click', openSyncMenu);
  document.getElementById('refreshBtn').addEventListener('click', handleRefreshOrConfirm);
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
  document.getElementById('vrcFetchBtn').addEventListener('click', fetchVRCFolder);
  document.getElementById('vrcSyncBtn').addEventListener('click', syncToVRCFolder);
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
// フォルダタブ描画
// ========================================
function renderFolderTabs() {
  const container = document.getElementById('folderTabs');
  const tabs = [];

  tabs.push({ id: 'all', name: 'All', class: '', draggable: false });
  tabs.push({ id: 'none', name: '未分類', class: 'none-folder', draggable: false });

  // カスタムフォルダ（並び替え対応）
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
      tab.addEventListener('dblclick', addNewFolder);
    } else {
      tab.addEventListener('click', () => switchFolder(folderId));
      tab.addEventListener('dblclick', () => openFolderEditModal(folderId));
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
  
  // レンダリング後に編集中のマークを再適用
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

// フォルダ並び順を更新
function updateFolderOrder() {
  const container = document.getElementById('folderTabs');
  const tabs = Array.from(container.querySelectorAll('.folder-tab[draggable="true"]'));
  folderOrder = tabs.map(tab => tab.dataset.folderId);
  saveSettings();
}

// フォルダ切り替え
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
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();

  let filteredWorlds = allWorlds;

  if (currentFolder !== 'all') {
    filteredWorlds = filteredWorlds.filter(w => w.folderId === currentFolder);
  }

  if (searchTerm) {
    filteredWorlds = filteredWorlds.filter(w =>
      w.name.toLowerCase().includes(searchTerm) ||
      (w.authorName && w.authorName.toLowerCase().includes(searchTerm)) ||
      w.id.toLowerCase().includes(searchTerm)
    );
  }

  filteredWorlds = sortWorlds(filteredWorlds);

  const totalPages = Math.ceil(filteredWorlds.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const pageWorlds = filteredWorlds.slice(startIndex, endIndex);

  renderWorlds(pageWorlds);
  updatePagination(currentPage, totalPages, filteredWorlds.length);
  updateSelectionUI();
}

// ワールド並び替え
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

// ワールドリスト描画
function renderWorlds(worlds) {
  const container = document.getElementById('worldsList');

  if (worlds.length === 0) {
    container.innerHTML = '<div class="empty-state">ワールドが見つかりません</div>';
    return;
  }

  container.innerHTML = worlds.map(world => {
    const thumbnailUrl = world.thumbnailImageUrl || '';
    const releaseStatus = world.releaseStatus || 'unknown';
    const isPrivate = releaseStatus === 'private';
    const isDeleted = releaseStatus === 'deleted';
    const isSelected = selectedWorldIds.has(world.id);
    const authorName = world.authorName || '不明';
    const folderName = getFolderDisplayName(world.folderId);

    let statusBadge = '';
    if (thumbnailUrl && releaseStatus !== 'unknown') {
      if (isPrivate) {
        statusBadge = '<span class="status-badge private">🔒 Private</span>';
      } else if (isDeleted) {
        statusBadge = '<span class="status-badge deleted">🔒 Deleted</span>';
      } else {
        statusBadge = '<span class="status-badge public">🌐 Public</span>';
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
            <button class="btn-icon" data-action="open" title="新しいタブで開く">↗️</button>
            <button class="btn-icon" data-action="copy" title="URLをコピー">🔗</button>
            <button class="btn-icon" data-action="refetch" title="詳細を再取得">🖼️</button>
            <button class="btn-icon delete" data-action="delete" title="削除">🗑️</button>
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
        openWorldPage(worldId);
      }
    });

    if (hasSelection) {
      // 複数選択中: カード全体（ボタン以外）がクリック対象
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.btn-icon') && !e.target.closest('.world-checkbox')) {
          e.stopPropagation();
          toggleWorldSelection(worldId);
        }
      });
    } else {
      // 通常時: ダブルクリックで選択開始
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
        handleWorldAction(action, worldId, folderId);
      });
    });
  });
}

// フォルダ表示名取得
function getFolderDisplayName(folderId) {
  if (folderId === 'none') return '未分類';
  if (folderId === 'all') return 'All';

  const vrcFolder = vrcFolders.find(f => f.id === folderId);
  if (vrcFolder) return vrcFolder.displayName;

  const folder = folders.find(f => f.id === folderId);
  return folder ? folder.name : folderId;
}

// ========================================
// ワールド操作
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
    showNotification('URLをコピーしました', 'success');
  }).catch(err => {
    console.error('Failed to copy:', err);
    showNotification('コピーに失敗しました', 'error');
  });
}

// 個別ワールドの詳細を再取得
async function refetchWorldDetails(worldId, folderId) {
  try {
    showNotification('詳細情報を取得中...', 'info');

    const details = await fetchWorldDetails(worldId);

    if (details) {
      const response = await chrome.runtime.sendMessage({
        type: 'updateWorld',
        world: { ...details, folderId }
      });

      if (response.success) {
        showNotification('詳細情報を更新しました', 'success');
        await loadData();
        renderCurrentView();
      } else {
        showNotification('更新に失敗しました', 'error');
      }
    } else {
      showNotification('詳細情報の取得に失敗しました', 'error');
    }
  } catch (error) {
    console.error('Failed to refetch world details:', error);
    showNotification('エラーが発生しました', 'error');
  }
}

// ワールド詳細を取得
async function fetchWorldDetails(worldId) {
  try {
    const response = await fetch(`https://vrchat.com/api/1/worlds/${worldId}`, {
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
      console.error(`Failed to fetch world ${worldId}:`, response.status);
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
    console.error(`Error fetching world ${worldId}:`, error);
    return null;
  }
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
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  let filteredWorlds = allWorlds;

  if (currentFolder !== 'all') {
    filteredWorlds = filteredWorlds.filter(w => w.folderId === currentFolder);
  }

  if (searchTerm) {
    filteredWorlds = filteredWorlds.filter(w =>
      w.name.toLowerCase().includes(searchTerm) ||
      (w.authorName && w.authorName.toLowerCase().includes(searchTerm)) ||
      w.id.toLowerCase().includes(searchTerm)
    );
  }

  const currentPageWorldIds = sortWorlds(filteredWorlds)
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
    selectionCount.textContent = `選択中: ${count}個`;
  } else {
    selectionActions.classList.remove('visible');
  }

  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  let filteredWorlds = allWorlds;

  if (currentFolder !== 'all') {
    filteredWorlds = filteredWorlds.filter(w => w.folderId === currentFolder);
  }

  if (searchTerm) {
    filteredWorlds = filteredWorlds.filter(w =>
      w.name.toLowerCase().includes(searchTerm) ||
      (w.authorName && w.authorName.toLowerCase().includes(searchTerm)) ||
      w.id.toLowerCase().includes(searchTerm)
    );
  }

  const currentPageWorldIds = sortWorlds(filteredWorlds)
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
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  let filteredWorlds = allWorlds;

  if (currentFolder !== 'all') {
    filteredWorlds = filteredWorlds.filter(w => w.folderId === currentFolder);
  }

  if (searchTerm) {
    filteredWorlds = filteredWorlds.filter(w =>
      w.name.toLowerCase().includes(searchTerm) ||
      (w.authorName && w.authorName.toLowerCase().includes(searchTerm)) ||
      w.id.toLowerCase().includes(searchTerm)
    );
  }

  const totalPages = Math.ceil(filteredWorlds.length / itemsPerPage);
  const newPage = currentPage + delta;

  if (newPage >= 1 && newPage <= totalPages) {
    currentPage = newPage;
    renderCurrentView();
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
// 通知表示
// ========================================
function showNotification(message, type = 'info') {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.className = `notification ${type} show`;

  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}
// popup.js - v8.0 (後半: フォルダ操作・バッチ処理・モーダル)

// ========================================
// フォルダドロップ処理（編集バッファ使用）
// ========================================
async function handleFolderDrop(toFolder, event) {
  try {
    const worldIds = JSON.parse(event.dataTransfer.getData('worldIds'));
    const fromFolder = event.dataTransfer.getData('fromFolder');

    if (toFolder === fromFolder) return;

    let movedCount = 0;
    let restrictedWorlds = [];

    const isToVRC = toFolder.startsWith('worlds');
    const isVRCToVRC = fromFolder.startsWith('worlds') && toFolder.startsWith('worlds');

    for (const worldId of worldIds) {
      const world = allWorlds.find(w => w.id === worldId);
      if (!world) continue;

      // プライベート/削除済みワールドの移動制限
      if ((isVRCToVRC || isToVRC) && 
          (world.releaseStatus === 'private' || world.releaseStatus === 'deleted')) {
        restrictedWorlds.push(world.name);
        continue;
      }

      // 編集バッファに追加
      editingBuffer.movedWorlds.push({
        worldId,
        fromFolder: world.folderId,
        toFolder
      });

      // UI上で即座に移動
      world.folderId = toFolder;
      movedCount++;
    }

    if (restrictedWorlds.length > 0) {
      const names = restrictedWorlds.slice(0, 3).join('、');
      const more = restrictedWorlds.length > 3 ? ` 他${restrictedWorlds.length - 3}件` : '';
      showNotification(`プライベート・削除済ワールドはVRCフォルダへ移動できません: 「${names}${more}」`, 'warning');
    }

    if (movedCount > 0) {
      showNotification(`${movedCount}個のワールドを移動しました（確定ボタンを押してください）`, 'info');
    }

    selectedWorldIds.clear();
    renderFolderTabs();
    renderCurrentView();
    updateEditingState();
  } catch (error) {
    console.error('Failed to handle folder drop:', error);
    showNotification('移動に失敗しました', 'error');
  }
}

// ========================================
// 削除処理
// ========================================
function deleteSingleWorld(worldId, folderId) {
  const world = allWorlds.find(w => w.id === worldId);
  document.getElementById('deleteModalContent').textContent =
    `「${world?.name || worldId}」を削除しますか?`;

  pendingDeleteAction = async () => {
    try {
      // 編集バッファに追加
      editingBuffer.deletedWorlds.push({ worldId, folderId });

      // UI上から即座に削除
      allWorlds = allWorlds.filter(w => w.id !== worldId);
      selectedWorldIds.delete(worldId);

      renderFolderTabs();
      renderCurrentView();
      updateEditingState();

      showNotification('削除しました（確定ボタンを押してください）', 'info');
    } catch (error) {
      console.error('Failed to delete world:', error);
      showNotification('エラーが発生しました', 'error');
    }
  };

  openModal('deleteModal');
}

function deleteSelectedWorlds() {
  if (selectedWorldIds.size === 0) return;

  document.getElementById('deleteModalContent').textContent =
    `選択中の${selectedWorldIds.size}個のワールドを削除しますか?`;

  pendingDeleteAction = async () => {
    try {
      // 編集バッファに追加
      for (const worldId of selectedWorldIds) {
        const world = allWorlds.find(w => w.id === worldId);
        if (world) {
          editingBuffer.deletedWorlds.push({
            worldId,
            folderId: world.folderId
          });
        }
      }

      // UI上から即座に削除
      allWorlds = allWorlds.filter(w => !selectedWorldIds.has(w.id));
      selectedWorldIds.clear();

      renderFolderTabs();
      renderCurrentView();
      updateEditingState();

      showNotification('削除しました（確定ボタンを押してください）', 'info');
    } catch (error) {
      console.error('Failed to delete worlds:', error);
      showNotification('削除に失敗しました', 'error');
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

    btn.textContent = `🔄 更新中... (${i + 1}/${worldIds.length})`;

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

  showNotification(`更新完了: 成功 ${successCount}件 / 失敗 ${failCount}件`, 'success');
  await loadData();
  renderCurrentView();
}

// ========================================
// 全ワールドの詳細取得
// ========================================
async function fetchAllDetails() {
  let targetWorlds = allWorlds;
  if (currentFolder !== 'all') {
    targetWorlds = allWorlds.filter(w => w.folderId === currentFolder);
  }

  const worldsWithoutDetails = targetWorlds.filter(w => !w.thumbnailImageUrl);

  if (worldsWithoutDetails.length === 0) {
    showNotification('全てのワールドの詳細情報が取得済みです', 'info');
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
      showNotification('サムネイル取得をキャンセルしました', 'info');
      break;
    }

    // 進行状況を表示
    btn.textContent = `🔄 取得中 (${i + 1}/${totalCount})`;

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

  showNotification(`取得完了: 成功 ${successCount}件 / 失敗 ${failCount}件`, 'success');
  await loadData();
  renderCurrentView();
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

  if (isEditingList) {
    const changeCount = editingBuffer.movedWorlds.length + editingBuffer.deletedWorlds.length;
    banner.style.display = 'flex';
    banner.querySelector('.change-count').textContent = `${changeCount}件の変更`;

    refreshBtn.textContent = '✓ 確定';
    refreshBtn.classList.add('confirm-button');

    addWorldBtn.disabled = true;
    fetchDetailsBtn.disabled = true;
    syncBtn.disabled = true;
    importBtn.disabled = true;
    exportBtn.disabled = true;

    // フォルダタブに変更マークを表示（renderFolderTabsで再適用されるので不要）
  } else {
    banner.style.display = 'none';
    refreshBtn.textContent = '🔃 再表示';
    refreshBtn.classList.remove('confirm-button');

    addWorldBtn.disabled = false;
    fetchDetailsBtn.disabled = false;
    syncBtn.disabled = false;
    importBtn.disabled = false;
    exportBtn.disabled = false;
  }
}

async function handleRefreshOrConfirm() {
  if (isEditingList) {
    await confirmChanges();
  } else {
    await refreshScreen();
  }
}

async function confirmChanges() {
  try {
    showNotification('変更を保存しています...', 'info');

    // バッチ処理で一括送信
    const response = await chrome.runtime.sendMessage({
      type: 'batchUpdateWorlds',
      changes: {
        movedWorlds: editingBuffer.movedWorlds,
        deletedWorlds: editingBuffer.deletedWorlds
      }
    });

    // バッファクリア
    editingBuffer.movedWorlds = [];
    editingBuffer.deletedWorlds = [];
    isEditingList = false;

    // データ再読み込み
    await loadData();
    renderFolderTabs();
    renderCurrentView();
    updateEditingState();

    if (response.success) {
      showNotification(`変更を確定しました (${response.movedCount}件)`, 'success');
    } else {
      showNotification(`一部エラー: ${response.errorCount}件失敗`, 'warning');
      if (response.errors) {
        console.error('Confirmation errors:', response.errors);
      }
    }
  } catch (error) {
    console.error('Failed to confirm changes:', error);
    showNotification('確定に失敗しました', 'error');
  }
}

async function refreshScreen() {
  try {
    showNotification('画面を更新しています...', 'info');
    await loadData();
    renderFolderTabs();
    renderCurrentView();
    showNotification('画面を更新しました', 'success');
  } catch (error) {
    console.error('Failed to refresh:', error);
    showNotification('更新に失敗しました', 'error');
  }
}

// ========================================
// フォルダ操作モーダル
// ========================================
async function addNewFolder() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'addFolder' });

    if (response.success) {
      showNotification('フォルダを追加しました', 'success');
      await loadData();
      renderFolderTabs();
    } else {
      showNotification('追加に失敗しました', 'error');
    }
  } catch (error) {
    console.error('Failed to add folder:', error);
    showNotification('エラーが発生しました', 'error');
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
    showNotification('フォルダ名を入力してください', 'warning');
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'renameFolder',
      folderId: currentRenamingFolder,
      newName
    });

    if (response.success) {
      showNotification('フォルダ名を変更しました', 'success');
      await loadData();
      renderFolderTabs();
      closeModal('renameFolderModal');
    } else {
      showNotification('変更に失敗しました', 'error');
    }
  } catch (error) {
    console.error('Failed to rename folder:', error);
    showNotification('エラーが発生しました', 'error');
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
      showNotification(`「${folder.name}」を削除しました(${worldCount}個のワールドは未分類に移動)`, 'success');
      if (currentFolder === currentRenamingFolder) {
        currentFolder = 'all';
      }
      await loadData();
      renderFolderTabs();
      renderCurrentView();
      closeModal('renameFolderModal');
    } else {
      showNotification('削除に失敗しました', 'error');
    }
  } catch (error) {
    console.error('Failed to delete folder:', error);
    showNotification('エラーが発生しました', 'error');
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
    showNotification(`${vrcFolder.displayName}フォルダが100件を超えています。同期を行うには100件以下にしてください。`, 'warning');
  }

  openModal('vrcFolderModal');
}

async function fetchVRCFolder() {
  const folderId = document.getElementById('vrcFolderIdBadge').textContent.replace('VRChat.', 'worlds');
  const btn = document.getElementById('vrcFetchBtn');
  const originalText = btn.textContent;

  try {
    btn.textContent = '📥 取得中...';
    btn.disabled = true;
    showNotification('VRChatから取得中...', 'info');

    const response = await chrome.runtime.sendMessage({
      type: 'fetchVRCFolder',
      folderId: folderId
    });

    if (response.success) {
      let message = `取得完了: ${response.addedCount}個追加(全${response.totalCount}個)`;
      
      if (response.differentFolder && response.differentFolder.length > 0) {
        const names = response.differentFolder.slice(0, 3).map(w => w.worldName).join('、');
        const more = response.differentFolder.length > 3 ? ` 他${response.differentFolder.length - 3}件` : '';
        message += `\n\n既に別フォルダに存在: 「${names}${more}」`;
      }
      
      showNotification(message, 'success');
      await loadData();
      renderFolderTabs();
      renderCurrentView();
      closeModal('vrcFolderModal');
    } else {
      showNotification(`取得失敗: ${response.error}`, 'error');
    }
  } catch (error) {
    console.error('Failed to fetch VRC folder:', error);
    showNotification('取得に失敗しました', 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function syncToVRCFolder() {
  const folderId = document.getElementById('vrcFolderIdBadge').textContent.replace('VRChat.', 'worlds');
  const btn = document.getElementById('vrcSyncBtn');
  const originalText = btn.textContent;

  const count = allWorlds.filter(w => w.folderId === folderId).length;
  if (count > 100) {
    showNotification('フォルダが100件を超えています。100件以下にしてください。', 'error');
    return;
  }

  try {
    btn.textContent = '⚠️ 同期中...';
    btn.disabled = true;
    showNotification('VRChatに同期中...', 'info');

    const response = await chrome.runtime.sendMessage({
      type: 'syncToVRCFolder',
      folderId: folderId
    });

    if (response.success) {
      const totalOperations = response.addedCount + response.removedCount;
      let message = `同期完了: 追加 ${response.addedCount}個 / 削除 ${response.removedCount}個`;
      if (response.errors) {
        message += `\nエラー: ${response.errors.slice(0, 3).join(', ')}`;
      }
      showNotification(message, response.errors ? 'warning' : 'success');
      
      // 反映監視を開始
      if (totalOperations > 0) {
        const estimatedSeconds = totalOperations * 1;
        showSyncReflectionTimer(estimatedSeconds);
      }
      
      await loadData();
      renderFolderTabs();
      renderCurrentView();
      closeModal('vrcFolderModal');
    } else {
      showNotification(`同期失敗: ${response.error}`, 'error');
    }
  } catch (error) {
    console.error('Failed to sync to VRC folder:', error);
    showNotification('同期に失敗しました', 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// ========================================
// VRChat完全同期
// ========================================
async function openSyncMenu() {
  const btn = document.getElementById('syncBtn');
  const originalText = btn.textContent;
  
  try {
    btn.textContent = '🔄 同期中...';
    btn.disabled = true;
    showNotification('VRChatと同期中...', 'info');

    const response = await chrome.runtime.sendMessage({ type: 'syncAllFavorites' });

    if (response.success) {
      const totalOperations = response.removed + response.moved + response.added;
      const message = `同期完了!\n追加: ${response.added}件 (計${response.totalAdd}件中)\n削除: ${response.removed}件 (計${response.totalRemove}件中)${response.moved ? `\n移動: ${response.moved}件` : ''}`;
      
      if (response.errors && response.errors.length > 0) {
        showNotification(`${message}\n\nエラー: ${response.errors.slice(0, 3).join(', ')}`, 'warning');
      } else {
        showNotification(message, 'success');
      }
      
      // 反映監視を開始（操作数に応じて時間を計算）
      if (totalOperations > 0) {
        const estimatedSeconds = totalOperations * 1; // 1件につき約1秒
        showSyncReflectionTimer(estimatedSeconds);
      }
      
      await loadData();
      renderFolderTabs();
      renderCurrentView();
    } else {
      showNotification(`同期失敗: ${response.error}`, 'error');
    }
  } catch (error) {
    console.error('Failed to sync all favorites:', error);
    showNotification('同期に失敗しました', 'error');
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// VRC同期の反映タイマーを表示
function showSyncReflectionTimer(estimatedSeconds) {
  const notification = document.getElementById('notification');
  let remainingSeconds = estimatedSeconds;
  
  const updateTimer = () => {
    if (remainingSeconds > 0) {
      notification.textContent = `⏱️ VRChat公式への反映まで約${remainingSeconds}秒...`;
      notification.className = 'notification info show';
      remainingSeconds--;
      setTimeout(updateTimer, 1000);
    } else {
      notification.textContent = '✅ VRChat公式への反映が完了しました';
      notification.className = 'notification success show';
      setTimeout(() => {
        notification.classList.remove('show');
      }, 3000);
    }
  };
  
  updateTimer();
}

// ========================================
// ワールド追加（重複チェック付き）
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
  titleDiv.textContent = '🌐 ワールドを追加';
  modal.appendChild(titleDiv);

  const descriptionP = document.createElement('p');
  descriptionP.className = 'modal-description';
  descriptionP.textContent = 'ワールドIDまたはURLを入力してください:';
  modal.appendChild(descriptionP);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'modal-input';
  input.placeholder = 'wrld_... または https://vrchat.com/home/world/wrld_...';
  input.value = initialValue;
  modal.appendChild(input);

  const descriptionP2 = document.createElement('p');
  descriptionP2.className = 'modal-description';
  descriptionP2.textContent = 'このワールドの保存先フォルダを選択してください:';
  descriptionP2.style.marginTop = '16px';
  modal.appendChild(descriptionP2);

  const folderList = document.createElement('div');
  folderList.className = 'folder-select-list';

  const folderOptions = generateFolderOptions(true, false);
  
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
          showNotification('ワールドIDまたはURLを入力してください', 'warning');
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
  confirmButton.textContent = '追加';
  confirmButton.onclick = async () => {
    const selectedOption = folderList.querySelector('.folder-option.selected');
    if (!selectedOption) {
      showNotification('フォルダを選択してください', 'warning');
      return;
    }
    
    const worldIdOrUrl = input.value.trim();
    if (!worldIdOrUrl) {
      showNotification('ワールドIDまたはURLを入力してください', 'warning');
      return;
    }

    const folderId = selectedOption.dataset.folderId;
    overlay.remove();
    await confirmAddWorldWithFolder(folderId, worldIdOrUrl);
  };
  buttonContainer.appendChild(confirmButton);

  const cancelButton = document.createElement('button');
  cancelButton.className = 'btn secondary';
  cancelButton.textContent = 'キャンセル';
  cancelButton.onclick = () => {
    overlay.remove();
  };
  buttonContainer.appendChild(cancelButton);

  modal.appendChild(buttonContainer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // オーバーレイクリックで閉じる
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  };
  
  // Enterキーで追加
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      confirmButton.click();
    }
  });

  // 入力欄にフォーカス
  setTimeout(() => input.focus(), 100);
}

function openAddWorldModal() {
  const worldId = pendingWorldData?.id || '';
  openAddWorldModalWithInput(worldId);
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
      showNotification('無効なワールドIDまたはURLです', 'error');
      return;
    }
  } else if (pendingWorldData) {
    worldId = pendingWorldData.id;
  } else {
    showNotification('ワールドIDまたはURLを入力してください', 'warning');
    return;
  }

  try {
    const worldData = pendingWorldData || await fetchWorldDetails(worldId);

    if (!worldData) {
      showNotification('ワールド情報の取得に失敗しました', 'error');
      return;
    }

    const response = await chrome.runtime.sendMessage({
      type: 'addWorld',
      world: { ...worldData, folderId }
    });

    if (response.success) {
      showNotification(`${worldData.name} を追加しました`, 'success');
      await loadData();
      renderFolderTabs();
      renderCurrentView();
    } else if (response.reason === 'already_exists_same_folder') {
      showNotification('このワールドは既に登録済みです', 'warning');
    } else if (response.reason === 'already_exists_different_folder') {
      const folderName = getFolderDisplayName(response.existingFolder);
      showNotification(`このワールドは既に「${folderName}」に存在します`, 'warning');
    } else if (response.reason === 'private_world') {
      showNotification(`プライベート・削除済ワールド「${response.worldName}」はVRCフォルダに追加できません`, 'warning');
    } else if (response.reason === 'vrc_limit_exceeded') {
      showNotification('VRCフォルダが150件を超えています', 'error');
    } else if (response.reason === 'sync_limit_exceeded') {
      showNotification('共有ストレージが800件を超えています', 'error');
    } else {
      showNotification('追加に失敗しました', 'error');
    }
  } catch (error) {
    console.error('Failed to add world:', error);
    showNotification('エラーが発生しました', 'error');
  }
}

function isValidWorldId(str) {
  return /^wrld_[a-f0-9-]+$/i.test(str.trim());
}

// ========================================
// フォルダ移動モーダル
// ========================================
function openMoveFolderModal(worldIds) {
  currentMovingWorldIds = worldIds;

  const folderOptions = generateFolderOptions(true, false);

  showFolderSelectModal({
    title: '📁 移動先フォルダを選択',
    description: `${worldIds.length}個のワールドを移動します:`,
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
  try {
    let movedCount = 0;
    let skippedCount = 0;
    let restrictedWorlds = [];

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
      showNotification(`プライベート・削除済ワールドは移動できません: 「${names}${more}」`, 'warning');
    }

    if (movedCount > 0) {
      showNotification(`${movedCount}個のワールドを移動しました（確定ボタンを押してください）`, 'info');
    }

    selectedWorldIds.clear();
    renderFolderTabs();
    renderCurrentView();
    updateEditingState();
  } catch (error) {
    console.error('Failed to move worlds:', error);
    showNotification('移動に失敗しました', 'error');
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
      name: 'All(完全バックアップ)',
      class: '',
      disabled: false
    });
  }

  options.push({
    id: 'none',
    name: '未分類',
    class: 'none',
    disabled: false
  });

  folders.forEach(folder => {
    options.push({
      id: folder.id,
      name: folder.name,
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
        name: `${folder.displayName}${isOverLimit ? ' (上限)' : isOverSyncLimit ? ' (同期不可)' : ''}`,
        class: isOverLimit ? 'vrc vrc-disabled' : 'vrc',
        disabled: isOverLimit,
        isDisabled: isOverLimit
      });
    });
  }

  return options;
}

// ========================================
// 汎用フォルダ選択モーダル
// ========================================
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
    title = '📁 フォルダを選択',
    description = '対象のフォルダを選択してください:',
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
    currentFolderDiv.textContent = `✓ 現在「${currentFolder?.name || currentFolderId}」に登録済み`;
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
      isCurrentFolder ? '✓ 登録済み' : null
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
  confirmButton.textContent = '確定';
  confirmButton.onclick = () => {
    const selectedOption = folderList.querySelector('.folder-option.selected');
    if (selectedOption) {
      const folderId = selectedOption.dataset.folderId;
      overlay.remove();
      onConfirm(folderId);
    } else {
      showNotification('フォルダを選択してください', 'warning');
    }
  };
  buttonContainer.appendChild(confirmButton);

  const cancelButton = document.createElement('button');
  cancelButton.className = 'btn secondary';
  cancelButton.textContent = 'キャンセル';
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
    mode === 'import' ? '📥 インポート' : '📤 エクスポート';
  openModal('importExportModal');
}

function handleImportExportTypeSelect(type) {
  closeModal('importExportModal');

  if (type === 'vrchat') {
    if (currentImportExportMode === 'import') {
      handleVRChatImport();
    } else {
      showNotification('VRChat連携エクスポートは「同期」ボタンを使用してください', 'info');
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
  showNotification('VRChatから全フォルダを取得中...', 'info');

  try {
    const response = await chrome.runtime.sendMessage({ type: 'fetchAllVRCFolders' });

    if (response.success) {
      showNotification(
        `取得完了: ${response.addedCount}個追加(全${response.totalFolders}フォルダ)`,
        'success'
      );
      await loadData();
      renderFolderTabs();
      renderCurrentView();

      if (response.addedCount > 0) {
        showNotification('サムネイル情報を取得中...', 'info');
        setTimeout(() => {
          fetchAllDetails();
        }, 1000);
      }
    } else {
      showNotification(`取得失敗: ${response.error}`, 'error');
    }
  } catch (error) {
    console.error('Failed to fetch all VRC folders:', error);
    showNotification('取得に失敗しました', 'error');
  }
}

function openFolderSelectForExport(type) {
  const folderOptions = generateFolderOptions(true, true);

  showFolderSelectModal({
    title: '📤 エクスポート対象フォルダ',
    description: 'エクスポートするフォルダを選択してください:',
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
  const folderOptions = generateFolderOptions(true, false);

  showFolderSelectModal({
    title: '📥 インポート先フォルダ',
    description: 'インポート先のフォルダを選択してください:',
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
        const sync = await chrome.storage.sync.get(['worlds', 'folders', 'vrcFolderData']);
        const local = await chrome.storage.local.get(['vrcWorlds', 'worldDetails']);

        const exportData = {
          version: '8.0',
          syncWorlds: sync.worlds || [],
          folders: sync.folders || [],
          vrcFolderData: sync.vrcFolderData || {},
          vrcWorlds: local.vrcWorlds || [],
          worldDetails: local.worldDetails || {}
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        downloadFile(blob, `vrchat-full-backup-${getDateString()}.json`);
        showNotification('完全バックアップをエクスポートしました', 'success');
        return;
      } else if (type === 'vrcx') {
        const csvData = allWorlds.map(w => `${w.id},${w.name}`).join('\n');
        const blob = new Blob([csvData], { type: 'text/csv' });
        downloadFile(blob, `vrchat-all-worlds-${getDateString()}.csv`);
        showNotification(`${allWorlds.length}個のワールドをエクスポートしました`, 'success');
        return;
      }
    }

    let exportWorlds = allWorlds.filter(w => w.folderId === folderId);

    if (exportWorlds.length === 0) {
      showNotification('エクスポートするワールドがありません', 'warning');
      return;
    }

    if (type === 'json') {
      const dataStr = JSON.stringify(exportWorlds, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      downloadFile(blob, `vrchat-worlds-${folderId}-${getDateString()}.json`);
      showNotification(`${exportWorlds.length}個のワールドをエクスポートしました`, 'success');
    } else if (type === 'vrcx') {
      const csvData = exportWorlds.map(w => `${w.id},${w.name}`).join('\n');
      const blob = new Blob([csvData], { type: 'text/csv' });
      downloadFile(blob, `vrchat-worlds-${folderId}-${getDateString()}.csv`);
      showNotification(`${exportWorlds.length}個のワールドをエクスポートしました`, 'success');
    }
  } catch (error) {
    console.error('Export failed:', error);
    showNotification('エクスポートに失敗しました', 'error');
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

async function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const type = event.target.dataset.type;
  const targetFolder = event.target.dataset.targetFolder;

  try {
    const text = await file.text();
    let importWorlds = [];

    if (type === 'json') {
      const data = JSON.parse(text);

      if (data.version && data.version.startsWith('8.') && data.syncWorlds) {
        if (!confirm('完全バックアップを復元しますか?\n現在のデータは上書きされます。')) {
          event.target.value = '';
          return;
        }

        await chrome.storage.sync.set({
          worlds: data.syncWorlds || [],
          folders: data.folders || [],
          vrcFolderData: data.vrcFolderData || {}
        });

        await chrome.storage.local.set({
          vrcWorlds: data.vrcWorlds || [],
          worldDetails: data.worldDetails || {}
        });

        showNotification('完全バックアップを復元しました', 'success');
        await loadData();
        renderFolderTabs();
        renderCurrentView();
        event.target.value = '';
        return;
      }

      importWorlds = Array.isArray(data) ? data : [];
    } else if (type === 'vrcx') {
      const lines = text.split('\n').filter(line => line.trim());

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
    }

    if (importWorlds.length === 0) {
      showNotification('インポートするワールドがありません', 'warning');
      event.target.value = '';
      return;
    }

    const existingIds = new Set(allWorlds.map(w => w.id));
    let addedCount = 0;
    let skippedCount = 0;

    for (const world of importWorlds) {
      if (existingIds.has(world.id)) {
        skippedCount++;
        continue;
      }

      const response = await chrome.runtime.sendMessage({
        type: 'addWorld',
        world: { ...world, folderId: targetFolder }
      });

      if (response.success) {
        addedCount++;
      } else {
        skippedCount++;
      }
    }

    showNotification(
      `インポート完了: ${addedCount}個追加 / ${skippedCount}個スキップ`,
      'success'
    );

    await loadData();
    renderFolderTabs();
    renderCurrentView();

    if (addedCount > 0) {
      showNotification('サムネイル情報を取得中...', 'info');
      setTimeout(() => {
        fetchAllDetails();
      }, 1000);
    }

  } catch (error) {
    console.error('Import failed:', error);
    showNotification('インポートに失敗しました', 'error');
  }

  event.target.value = '';
}

// ========================================
// モーダル操作
// ========================================
function openModal(modalId) {
  document.getElementById(modalId).classList.add('show');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('show');
}