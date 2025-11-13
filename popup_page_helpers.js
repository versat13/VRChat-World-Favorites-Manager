// popup_page_helpers.js v1.2.0
// ========================================
// 共通UI関数（popup, page-favorites, page-world共通）
// ========================================

console.log('[PopupPageHelpers] Loaded');

// ========================================
// 通知システム
// ========================================

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

function createNotificationContainer() {
  const container = document.createElement('div');
  container.id = 'notificationContainer';
  container.className = 'notification-container';
  document.body.appendChild(container);
  return container;
}

// ========================================
// フォルダ選択モーダル
// ========================================

function showFolderSelectModal(options) {
  const {
    title = 'フォルダを選択',
    description = 'フォルダを選択してください',
    folders = [],
    onConfirm = () => {},
    onCancel = () => {},
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
    currentFolderDiv.textContent = `現在の登録先: ${currentFolder?.name || currentFolderId}`;
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
      isCurrentFolder ? '登録済' : null
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

// ========================================
// フォルダオプション生成（共通ロジック）
// ========================================

function generateFolderOptions(allWorlds, folders, vrcFolders, includeVRC = true, includeAll = false) {
  const options = [];

  if (includeAll) {
    options.push({
      id: 'all',
      name: '全てのバックアップ',
      class: '',
      disabled: false
    });
  }

  options.push({
    id: 'none',
    name: '📂 未分類',
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
// データローダー（共通）
// ========================================

async function loadAllFolders() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getFolders' });
    return {
      folders: response.folders || [],
      vrcFolders: response.vrcFolders || []
    };
  } catch (error) {
    console.error('Failed to load folders:', error);
    return { folders: [], vrcFolders: [] };
  }
}

async function loadAllWorlds() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getAllWorlds' });
    return response.worlds || [];
  } catch (error) {
    console.error('Failed to load worlds:', error);
    return [];
  }
}

// ========================================
// フォルダ表示名取得
// ========================================

function getFolderDisplayName(folderId, folders, vrcFolders) {
  if (folderId === 'none') return '未分類';
  if (folderId === 'all') return '全て';

  const vrcFolder = vrcFolders.find(f => f.id === folderId);
  if (vrcFolder) return vrcFolder.displayName;

  const folder = folders.find(f => f.id === folderId);
  return folder ? folder.name : folderId;
}

// ========================================
// ワールドID検証
// ========================================

function isValidWorldId(str) {
  return /^wrld_[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(str);
}

// ========================================
// モーダル操作（汎用）
// ========================================

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('show');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('show');
  }
}

// ========================================
// ログ出力（共通）
// ========================================

function logAction(action, data) {
  console.log(`[Action] ${action}`, data);
}

function logError(context, error, data) {
  console.error(`[Error] ${context}`, error, data);
}