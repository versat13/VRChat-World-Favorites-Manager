// page-world.js v1.2.0

(function () {
  'use strict';

  // ==================== 翻訳データ ====================
  const translations = {
    ja: {
      extInvalidated: '拡張機能が更新されました。ページを再読み込みしてください',
      copyLink: 'リンクをコピー',
      saveToChrome: 'Chromeに保存',
      deleteFromChrome: 'Chromeから削除',
      deleteFromVRC: 'VRChatから削除',
      linkCopied: 'コピーしました!',
      addedSuccess: '「{name}」を未分類に追加しました',
      alreadySaved: '「{name}」は既に「{folder}」に登録済みです',
      selectFolder: '📁 フォルダを選択',
      selectFolderDesc: 'このワールドを保存するフォルダを選択してください',
      cancel: 'キャンセル',
      uncategorized: '未分類',
      savedTo: '✓ {name} を追加しました',
      privateWorldError: '✖ プライベートワールド「{name}」はVRCフォルダに保存できません',
      addFailed: '✖ 追加に失敗しました',
      deletedSuccess: '✔ Chromeから削除しました',
      deleteFailed: '✖ 削除に失敗しました',
      vrcDeleteSuccess: '✔ VRChatから削除しました',
      vrcDeleteNotFound: '✖ 削除ボタンが見つかりませんでした',
      vrcDeleteNotFavorited: 'ℹ️ このワールドはVRChatのお気に入りに登録されていません',
      worldIdNotFound: 'ワールドIDを取得できませんでした',
      error: 'エラーが発生しました',
      copyFailed: 'リンクのコピーに失敗しました',
      registered: '✓ 登録済み'
    },
    en: {
      extInvalidated: 'Extension context invalidated. Please reload the page.',
      copyLink: 'Copy Link',
      saveToChrome: 'Save to Chrome',
      deleteFromChrome: 'Remove from Chrome',
      deleteFromVRC: 'Delete from VRChat',
      linkCopied: 'Copied!',
      addedSuccess: 'Added "{name}" to Uncategorized',
      alreadySaved: '"{name}" is already saved in "{folder}"',
      selectFolder: '📁 Select Folder',
      selectFolderDesc: 'Select folder to save this world',
      cancel: 'Cancel',
      uncategorized: 'Uncategorized',
      savedTo: '✓ Added {name}',
      privateWorldError: '✖ Private world "{name}" cannot be saved to VRC folder',
      addFailed: '✖ Failed to add',
      deletedSuccess: '✔ Removed from Chrome',
      deleteFailed: '✖ Failed to delete',
      vrcDeleteSuccess: '✔ Removed from VRChat',
      vrcDeleteNotFound: '✖ Delete button not found',
      vrcDeleteNotFavorited: 'ℹ️ This world is not in VRChat favorites',
      worldIdNotFound: 'Failed to get world ID',
      error: 'An error occurred',
      copyFailed: 'Failed to copy link',
      registered: '✓ Registered'
    }
  };

  let currentLang = 'ja';

  // 翻訳関数（動的メッセージ用）
  function t(key, params = {}) {
    let text = translations[currentLang][key] || key;
    // パラメータ置換
    Object.keys(params).forEach(param => {
      text = text.replace(`{${param}}`, params[param]);
    });
    return text;
  }

  // 設定ロードと変更監視
  async function initContentScriptSettings() {
    try {
      const result = await chrome.storage.sync.get('settings');
      if (result.settings) {
        currentLang = result.settings.language || 'ja';
      }
    } catch (error) {
      console.error('[World Page] Failed to load settings:', error);
    }
  }

  function watchSettingsChanges() {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && changes.settings) {
        const newSettings = changes.settings.newValue;
        if (newSettings.language && newSettings.language !== currentLang) {
          currentLang = newSettings.language;
          // 言語変更時にボタンを再作成
          const existingPanel = document.getElementById('vrc-resolver-buttons');
          if (existingPanel) {
            existingPanel.remove();
            createButtonPanel();
          }
        }
      }
    });
  }

  // ==================== 設定チェック ====================
  /**
   * 拡張機能の設定を確認し、VRCサイト連携が無効の場合は処理を中断
   */
  async function checkExtensionSettings() {
    try {
      const result = await chrome.storage.sync.get('settings');
      const settings = result.settings || {};

      // enableVrcSiteIntegration が false の場合は処理を中断
      if (settings.enableVrcSiteIntegration === false) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('[World Page] Failed to check settings:', error);
      // エラーの場合はデフォルトで有効とする
      return true;
    }
  }

  // ==================== メインスクリプト ====================

  // === Constants ===
  const SELECTORS = {
    RIGHT_COLUMN: '.mt-3.mt-sm-0.css-br1a89.e1264afg10',
    DETAILS_BODY: '.css-kfjcvw.e18c1r7j40',
    FALLBACK_CONTAINERS: [
      '.tw-flex.justify-content-between.flex-column.flex-sm-row',
      'div[class*="justify-content-between"]'
    ]
  };

  const COLORS = {
    PRIMARY: {
      BG: 'rgba(31, 209, 237, 0.15)',
      BORDER: 'rgba(31, 209, 237, 0.3)',
      TEXT: '#1fd1ed',
      HOVER_BG: 'rgba(31, 209, 237, 0.25)',
      HOVER_BORDER: 'rgba(31, 209, 237, 0.5)'
    },
    SAVED: {
      BG: 'rgba(249, 227, 106, 0.15)',
      BORDER: 'rgba(249, 227, 106, 0.3)',
      TEXT: '#f9e36a',
      HOVER_BG: 'rgba(249, 227, 106, 0.25)',
      HOVER_BORDER: 'rgba(249, 227, 106, 0.5)'
    },
    DANGER: {
      BG: 'rgba(249, 106, 106, 0.15)',
      BORDER: 'rgba(249, 106, 106, 0.3)',
      TEXT: '#f96a6a',
      HOVER_BG: 'rgba(249, 106, 106, 0.25)',
      HOVER_BORDER: 'rgba(249, 106, 106, 0.5)'
    }
  };

  const TIMEOUTS = {
    ELEMENT_WAIT: 10000,
    NOTIFICATION: 3000,
    URL_CHANGE_DELAY: 1000,
    URL_CHECK_INTERVAL: 500,
    VRC_DELETE_SYNC: 500
  };

  // === Global State ===
  let savedWorldIds = new Set();
  let vrcFolders = [];
  let exFolders = [];
  let vrcWorlds = [];
  let lastUrl = location.href;
  let checkInterval = null;
  let rightColumnObserver = null;

  // === Script Loaded Indicator ===
  window.vrcResolverLoaded = true;

  // === Data Loading Functions ===
  async function loadSavedWorlds() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'getAllWorlds' });
      if (response.error) {
        console.error('[World Page] Error loading saved worlds:', response.error);
        return;
      }
      savedWorldIds = new Set((response.worlds || []).map(w => w.id));
    } catch (e) {
      if (e.message.includes('Extension context invalidated')) {
        showNotification(t('extInvalidated'), 'info');
      } else {
        console.error('[World Page] Failed to communicate with background:', e);
      }
    }
  }

  async function loadFolders() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'getFolders' });
      if (response.error) {
        console.error('[World Page] Error loading folders:', response.error);
        return;
      }
      vrcFolders = response.vrcFolders || [];
      exFolders = response.folders || [];
    } catch (e) {
      if (e.message.includes('Extension context invalidated')) {
      } else {
        console.error('[World Page] Failed to load folders:', e);
      }
    }
  }

  async function loadVRCWorlds() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'getVRCWorlds' });
      if (response.error) {
        console.error('[World Page] Error loading VRC worlds:', response.error);
        return;
      }
      vrcWorlds = response.vrcWorlds || [];
    } catch (e) {
      if (e.message.includes('Extension context invalidated')) {
      } else {
        console.error('[World Page] Failed to load VRC worlds:', e);
      }
    }
  }

  // === URL and World ID Extraction ===
  function getWorldIdFromUrl() {
    // Individual world page: /home/world/wrld_xxx
    const match = window.location.pathname.match(/\/home\/world\/(wrld_[a-zA-Z0-9-]+)/);
    if (match) return match[1];

    // Instance page: /home/launch?worldId=wrld_xxx
    const params = new URLSearchParams(window.location.search);
    const worldId = params.get('worldId');
    if (worldId && worldId.startsWith('wrld_')) return worldId;

    return null;
  }

  function getWorldName() {
    const h2 = document.querySelector('h2');
    return h2 ? h2.textContent.trim() : null;
  }

  function isTargetPage() {
    return /\/home\/world\/wrld_/.test(window.location.pathname) ||
      /\/home\/launch/.test(window.location.pathname);
  }

  // === Button Panel Creation ===
  function createButtonPanel() {
    const worldId = getWorldIdFromUrl();
    if (!worldId) {
      return;
    }

    // Prevent duplicate execution
    if (document.getElementById('vrc-resolver-buttons')) {
      return;
    }

    // Try to find right column and insert inline
    const rightColumn = document.querySelector(SELECTORS.RIGHT_COLUMN);
    if (rightColumn) {
      const detailsBody = rightColumn.querySelector(SELECTORS.DETAILS_BODY);
      if (detailsBody) {
        const panel = createPanelElement(worldId);
        detailsBody.appendChild(panel);
        setupButtonEvents(worldId);
        return;
      }
    }

    // Fallback to floating panel
    createFloatingPanel(worldId);
  }

  function createFloatingPanel(worldId) {
    const panel = createPanelElement(worldId, true); // Pass isFloating flag
    panel.style.position = 'fixed';
    panel.style.top = '280px';
    panel.style.right = '40px';
    panel.style.zIndex = '10000';
    panel.style.width = '280px';
    panel.style.backgroundColor = 'rgba(26, 29, 36, 0.95)';
    panel.style.padding = '16px';
    panel.style.borderRadius = '12px';
    panel.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.6)';
    panel.style.border = '2px solid rgba(31, 209, 237, 0.3)';

    document.body.appendChild(panel);
    setupButtonEvents(worldId, true); // Pass isFloating flag
  }

  function createPanelElement(worldId, isFloating = false) {
    const panel = document.createElement('div');
    panel.id = 'vrc-resolver-buttons';
    panel.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 16px;
    width: 100%;
  `;

    const isSaved = savedWorldIds.has(worldId);
    const isVRCDeleteDisabled = isFloating; // Disable VRC delete button if floating

    panel.innerHTML = `
    <button id="copy-link-btn" style="
      width: 100%;
      padding: 10px;
      background: ${COLORS.PRIMARY.BG};
      border: 2px solid ${COLORS.PRIMARY.BORDER};
      border-radius: 4px;
      color: ${COLORS.PRIMARY.TEXT};
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    ">
      <span>🔗</span>
      <span>${t('copyLink')}</span>
    </button>
    
    <button id="ext-save-btn" style="
      width: 100%;
      padding: 10px;
      background: ${isSaved ? COLORS.SAVED.BG : COLORS.PRIMARY.BG};
      border: 2px solid ${isSaved ? COLORS.SAVED.BORDER : COLORS.PRIMARY.BORDER};
      border-radius: 4px;
      color: ${isSaved ? COLORS.SAVED.TEXT : COLORS.PRIMARY.TEXT};
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    ">
      <span>${isSaved ? '☑' : '☐'}</span>
      <span>${isSaved ? t('deleteFromChrome') : t('saveToChrome')}</span>
    </button>
    
    <button id="vrc-delete-btn" style="
      width: 100%;
      padding: 10px;
      background: ${COLORS.DANGER.BG};
      border: 2px solid ${COLORS.DANGER.BORDER};
      border-radius: 4px;
      color: ${COLORS.DANGER.TEXT};
      cursor: ${isVRCDeleteDisabled ? 'not-allowed' : 'pointer'};
      font-size: 14px;
      font-weight: 600;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      opacity: ${isVRCDeleteDisabled ? '0.5' : '1'};
      pointer-events: ${isVRCDeleteDisabled ? 'none' : 'auto'};
    ">
      <span>🗑️</span>
      <span>${t('deleteFromVRC')}</span>
    </button>
  `;

    return panel;
  }

  // === Button Event Setup ===
  function setupButtonEvents(worldId, isFloating = false) {
    setupCopyButton();
    setupExtButton(worldId);
    setupVRCDeleteButton(worldId, isFloating);
  }

  function setupCopyButton() {
    const copyBtn = document.getElementById('copy-link-btn');
    if (!copyBtn) return;

    copyBtn.onmouseover = () => {
      copyBtn.style.borderColor = COLORS.PRIMARY.HOVER_BORDER;
      copyBtn.style.background = COLORS.PRIMARY.HOVER_BG;
    };
    copyBtn.onmouseout = () => {
      copyBtn.style.borderColor = COLORS.PRIMARY.BORDER;
      copyBtn.style.background = COLORS.PRIMARY.BG;
    };
    copyBtn.onclick = () => {
      const worldId = getWorldIdFromUrl();
      const url = `https://vrchat.com/home/world/${worldId}`;
      navigator.clipboard.writeText(url).then(() => {
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = `<span>✓</span><span>${t('linkCopied')}</span>`;
        setTimeout(() => {
          copyBtn.innerHTML = originalHTML;
        }, 2000);
      }).catch(err => {
        console.error('[World Page] Failed to copy:', err);
        showNotification(t('copyFailed'), 'error');
      });
    };
  }

  function setupExtButton(worldId) {
    const extBtn = document.getElementById('ext-save-btn');
    if (!extBtn) return;

    const updateHoverState = () => {
      const isSaved = savedWorldIds.has(worldId);
      extBtn.onmouseover = () => {
        if (isSaved) {
          extBtn.style.borderColor = COLORS.SAVED.HOVER_BORDER;
          extBtn.style.background = COLORS.SAVED.HOVER_BG;
        } else {
          extBtn.style.borderColor = COLORS.PRIMARY.HOVER_BORDER;
          extBtn.style.background = COLORS.PRIMARY.HOVER_BG;
        }
      };
      extBtn.onmouseout = () => {
        if (isSaved) {
          extBtn.style.borderColor = COLORS.SAVED.BORDER;
          extBtn.style.background = COLORS.SAVED.BG;
        } else {
          extBtn.style.borderColor = COLORS.PRIMARY.BORDER;
          extBtn.style.background = COLORS.PRIMARY.BG;
        }
      };
    };

    updateHoverState();

    extBtn.onclick = () => {
      if (savedWorldIds.has(worldId)) {
        deleteFromExtension(worldId);
      } else {
        showExtFolderModal(worldId);
      }
    };
  }

  function setupVRCDeleteButton(worldId, isFloating = false) {
    const vrcDeleteBtn = document.getElementById('vrc-delete-btn');
    if (!vrcDeleteBtn) return;

    // If floating (no right column), keep button disabled
    if (isFloating) {
      return;
    }

    vrcDeleteBtn.onmouseover = () => {
      vrcDeleteBtn.style.borderColor = COLORS.DANGER.HOVER_BORDER;
      vrcDeleteBtn.style.background = COLORS.DANGER.HOVER_BG;
    };
    vrcDeleteBtn.onmouseout = () => {
      vrcDeleteBtn.style.borderColor = COLORS.DANGER.BORDER;
      vrcDeleteBtn.style.background = COLORS.DANGER.BG;
    };
    vrcDeleteBtn.onclick = () => deleteFromVRChat(worldId);
  }

  // === Folder Selection Modal ===
  function showFolderSelectModal(options) {
    const {
      title = t('selectFolder'),
      description = t('selectFolderDesc'),
      folders = [],
      onConfirm = () => { },
      onCancel = () => { },
      currentFolderId = null
    } = options;

    const overlay = createModalOverlay();

    const modal = document.createElement('div');
    modal.style.cssText = `
    background: #1a1d24;
    border: 2px solid #1fd1ed;
    border-radius: 12px;
    padding: 24px;
    max-width: 400px;
    width: 90%;
    box-shadow: 0 8px 32px rgba(31, 209, 237, 0.3);
  `;

    modal.innerHTML = `
    <div style="color: #1fd1ed; margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">
      ${title}
    </div>
    <p style="color: #aaa; margin: 0 0 16px 0; font-size: 14px;">
      ${description}
    </p>
    ${currentFolderId ? `
      <p style="color: #67d781; margin: 0 0 12px 0; font-size: 12px; background: rgba(103, 215, 129, 0.1); padding: 8px; border-radius: 4px;">
        ${t('registered')} 「${folders.find(f => f.id === currentFolderId)?.name || currentFolderId}」
      </p>
    ` : ''}
    <div id="folder-select-list" style="
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 12px 0;
      max-height: 300px;
      overflow-y: auto;
    "></div>
    <div style="display: flex; gap: 8px; margin-top: 16px;">
      <button id="folder-select-cancel" style="
        flex: 1;
        padding: 12px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid #666;
        border-radius: 8px;
        color: #aaa;
        cursor: pointer;
        transition: all 0.2s;
      ">${t('cancel')}</button>
    </div>
  `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const folderList = document.getElementById('folder-select-list');
    folders.forEach((folder, index) => {
      const isCurrentFolder = folder.id === currentFolderId;
      const option = createFolderOption(
        folder.id,
        folder.name,
        index === 0,
        folder.class || '',
        isCurrentFolder ? t('registered').split(' ')[0] : null
      );
      folderList.appendChild(option);
    });

    folderList.querySelectorAll('.folder-option').forEach(option => {
      option.addEventListener('click', () => {
        folderList.querySelectorAll('.folder-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
      });

      option.addEventListener('dblclick', () => {
        const folderId = option.dataset.folderId;
        overlay.remove();
        onConfirm(folderId);
      });
    });

    if (title.includes('VRChat')) {
      folderList.querySelectorAll('.folder-option').forEach(option => {
        option.addEventListener('click', () => {
          const folderId = option.dataset.folderId;
          setTimeout(() => {
            overlay.remove();
            onConfirm(folderId);
          }, 200);
        });
      });
    }

    document.getElementById('folder-select-cancel').onclick = () => {
      overlay.remove();
      onCancel();
    };

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.remove();
        onCancel();
      }
    };
  }

  function showExtFolderModal(worldId) {
    const folders = [
      { id: 'none', name: t('uncategorized'), class: 'none' },
      ...exFolders.map(f => ({ id: f.id, name: f.name, class: '' })),
      ...vrcFolders.map(f => ({ id: f.id, name: f.displayName, class: 'vrc' }))
    ];

    showFolderSelectModal({
      title: t('selectFolder'),
      description: t('selectFolderDesc'),
      folders: folders,
      onConfirm: (folderId) => {
        addToExtension(worldId, folderId);
      }
    });
  }

  function createModalOverlay() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    z-index: 10001;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
    return overlay;
  }

  function createFolderOption(id, name, selected = false, extraClass = '', badge = null) {
    const option = document.createElement('div');
    option.className = `folder-option ${extraClass} ${selected ? 'selected' : ''}`;
    option.dataset.folderId = id;

    let baseColor = '#333';
    let hoverColor = '#1fd1ed';
    let selectedBg = '#1a1f2e';
    let selectedShadow = 'rgba(31, 209, 237, 0.3)';

    if (extraClass === 'none') {
      baseColor = '#8b7355';
      selectedBg = '#2e2a1f';
      selectedShadow = 'rgba(139, 115, 85, 0.3)';
    } else if (extraClass === 'vrc') {
      baseColor = '#103b48';
      hoverColor = '#1fd1ed';
      selectedBg = '#1fd1ed';
      selectedShadow = 'rgba(31, 209, 237, 0.6)';
    }

    option.style.cssText = `
    padding: 10px;
    background: ${extraClass === 'vrc' ? '#07191d' : '#0f1419'};
    border: 2px solid ${selected ? hoverColor : baseColor};
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 8px;
    color: ${extraClass === 'vrc' ? '#888' : '#e0e0e0'};
  `;

    if (selected) {
      if (extraClass === 'vrc') {
        option.style.background = '#1fd1ed';
        option.style.color = '#0a0e1a';
      } else {
        option.style.background = selectedBg;
      }
      option.style.boxShadow = `0 0 12px ${selectedShadow}`;
    }

    option.innerHTML = `
    <span style="font-size: 18px;">📁</span>
    <span style="font-size: 12px; flex: 1;">${name}</span>
    ${badge ? `<span style="font-size: 10px; color: #67d781; background: rgba(103, 215, 129, 0.2); padding: 2px 6px; border-radius: 4px;">${badge}</span>` : ''}
  `;

    option.onmouseover = () => {
      if (extraClass === 'vrc') {
        option.style.borderColor = '#1fd1ed';
        option.style.background = '#1e5c73';
        option.style.color = '#1fd1ed';
      } else {
        option.style.borderColor = hoverColor;
        option.style.background = selectedBg;
      }
    };

    option.onmouseout = () => {
      if (!option.classList.contains('selected')) {
        option.style.borderColor = baseColor;
        option.style.background = extraClass === 'vrc' ? '#07191d' : '#0f1419';
        option.style.color = extraClass === 'vrc' ? '#888' : '#e0e0e0';
        option.style.boxShadow = 'none';
      }
    };

    return option;
  }

  // === World Management Functions ===
  async function addToExtension(worldId, folderId) {
    const worldName = getWorldName() || worldId;

    try {
      let worldData = {
        id: worldId,
        name: worldName,
        folderId: folderId
      };

      try {
        const apiResponse = await fetch(`https://vrchat.com/api/1/worlds/${worldId}`, {
          credentials: 'include'
        });

        if (apiResponse.ok) {
          const apiData = await apiResponse.json();
          worldData = {
            id: worldId,
            name: apiData.name || worldName,
            authorName: apiData.authorName || null,
            releaseStatus: apiData.releaseStatus || null,
            thumbnailImageUrl: apiData.thumbnailImageUrl || null,
            folderId: folderId
          };
        }
      } catch (apiError) {
        console.warn('[World Page] Failed to fetch world details, using basic info:', apiError);
      }

      const response = await chrome.runtime.sendMessage({
        type: 'addWorld',
        world: worldData
      });

      if (response.success) {
        savedWorldIds.add(worldId);
        showNotification(t('savedTo', { name: worldData.name }), 'success');
        updateExtButton(worldId, true);
      } else if (response.reason === 'already_exists') {
        showNotification(t('alreadySaved', { name: worldData.name, folder: '' }), 'info');
        savedWorldIds.add(worldId);
        updateExtButton(worldId, true);
      } else if (response.reason === 'private_world') {
        showNotification(t('privateWorldError', { name: response.worldName || worldData.name }), 'error');
      } else {
        showNotification(t('addFailed'), 'error');
      }
    } catch (error) {
      console.error('[World Page] Failed to add to extension:', error);
      if (error.message.includes('Extension context invalidated')) {
        showNotification(t('extInvalidated'), 'info');
      } else {
        showNotification(t('error'), 'error');
      }
    }
  }

  async function deleteFromExtension(worldId) {
    if (!savedWorldIds.has(worldId)) {
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({ type: 'getAllWorlds' });
      const world = (response.worlds || []).find(w => w.id === worldId);

      if (!world) {
        showNotification(t('deleteFailed'), 'error');
        return;
      }

      const deleteResponse = await chrome.runtime.sendMessage({
        type: 'removeWorld',
        worldId: worldId,
        folderId: world.folderId
      });

      if (deleteResponse.success) {
        savedWorldIds.delete(worldId);
        showNotification(t('deletedSuccess'), 'success');
        updateExtButton(worldId, false);
      } else {
        showNotification(t('deleteFailed'), 'error');
      }
    } catch (error) {
      console.error('[World Page] Failed to delete from extension:', error);
      if (error.message.includes('Extension context invalidated')) {
        showNotification(t('extInvalidated'), 'info');
      } else {
        showNotification(t('error'), 'error');
      }
    }
  }

  async function deleteFromVRChat(worldId) {
    const removeFavButton = Array.from(document.querySelectorAll('div[role="button"]'))
      .find(btn => btn.textContent.includes('Remove Favorite'));

    if (removeFavButton) {
      removeFavButton.click();
      showNotification(t('vrcDeleteSuccess'), 'success');

      setTimeout(async () => {
        try {
          const vrcWorld = vrcWorlds.find(w => w.id === worldId);
          if (vrcWorld) {
            await chrome.runtime.sendMessage({
              type: 'removeWorld',
              worldId: worldId,
              folderId: vrcWorld.folderId
            });

            const index = vrcWorlds.findIndex(w => w.id === worldId);
            if (index !== -1) {
              vrcWorlds.splice(index, 1);
            }
          }
        } catch (error) {
          if (error.message.includes('Extension context invalidated')) {
          } else {
            console.error('[World Page] Failed to sync deletion:', error);
          }
        }
      }, TIMEOUTS.VRC_DELETE_SYNC);
    } else {
      const vrcWorld = vrcWorlds.find(w => w.id === worldId);
      if (vrcWorld) {
        showNotification(t('vrcDeleteNotFound'), 'error');
      } else {
        showNotification(t('vrcDeleteNotFavorited'), 'info');
      }
    }
  }

  // === Button Update Functions ===
  function updateExtButton(worldId, isSaved) {
    const extBtn = document.getElementById('ext-save-btn');
    if (!extBtn) return;

    const checkSpan = extBtn.querySelector('span:first-child');
    const textSpan = extBtn.querySelector('span:last-child');

    if (checkSpan) {
      checkSpan.textContent = isSaved ? '☑' : '☐';
    }
    if (textSpan) {
      textSpan.textContent = isSaved ? t('deleteFromChrome') : t('saveToChrome');
    }

    // Update colors
    if (isSaved) {
      extBtn.style.background = COLORS.SAVED.BG;
      extBtn.style.borderColor = COLORS.SAVED.BORDER;
      extBtn.style.color = COLORS.SAVED.TEXT;
    } else {
      extBtn.style.background = COLORS.PRIMARY.BG;
      extBtn.style.borderColor = COLORS.PRIMARY.BORDER;
      extBtn.style.color = COLORS.PRIMARY.TEXT;
    }

    // Re-setup hover events
    setupExtButton(worldId);
  }

  // === Notification Display ===
  function showNotification(message, type = 'info') {
    const existing = document.getElementById('vrc-resolver-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'vrc-resolver-notification';
    notification.style.cssText = `
    position: fixed;
    top: 80px;
    right: 20px;
    z-index: 10002;
    background: ${type === 'success' ? 'rgba(103, 215, 129, 0.9)' :
        type === 'error' ? 'rgba(255, 87, 103, 0.9)' :
          'rgba(31, 209, 237, 0.9)'};
    color: white;
    padding: 16px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    font-size: 14px;
    font-weight: 600;
    white-space: pre-line;
    max-width: 300px;
    animation: slideIn 0.3s ease-out;
  `;

    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => notification.remove(), 300);
    }, TIMEOUTS.NOTIFICATION);
  }

  // === Element Waiting with Right Column Monitoring ===
  function monitorRightColumnAndMigrate(worldId, floatingPanel) {
    let hasTriggered = false;

    // Setup MutationObserver to watch for right column
    if (rightColumnObserver) {
      try {
        rightColumnObserver.disconnect();
      } catch (e) {
        console.warn('[World Page] Failed to disconnect previous observer:', e);
      }
    }

    rightColumnObserver = new MutationObserver((mutations) => {
      if (hasTriggered) return;

      const rightColumn = document.querySelector(SELECTORS.RIGHT_COLUMN);
      if (rightColumn) {
        const detailsBody = rightColumn.querySelector(SELECTORS.DETAILS_BODY);
        if (detailsBody) {
          hasTriggered = true;
          try {
            rightColumnObserver.disconnect();
          } catch (e) {
            console.warn('[World Page] Failed to disconnect observer:', e);
          }
          clearTimeout(timer);

          // Remove floating panel
          if (floatingPanel && floatingPanel.parentNode) {
            floatingPanel.remove();
          }

          // Create inline panel
          const panel = createPanelElement(worldId, false); // Not floating anymore
          detailsBody.appendChild(panel);
          setupButtonEvents(worldId, false); // Not floating anymore
        }
      }
    });

    rightColumnObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    // Stop monitoring after timeout
    const timer = setTimeout(() => {
      if (!hasTriggered) {
        hasTriggered = true;
        if (rightColumnObserver) {
          try {
            rightColumnObserver.disconnect();
          } catch (e) {
            console.warn('[World Page] Failed to disconnect observer on timeout:', e);
          }
        }
      }
    }, TIMEOUTS.ELEMENT_WAIT);
  }

  // === URL Change Monitoring ===
  function startUrlMonitoring() {
    if (checkInterval) {
      clearInterval(checkInterval);
    }

    checkInterval = setInterval(() => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        handleUrlChange();
      }
    }, TIMEOUTS.URL_CHECK_INTERVAL);
  }

  const urlObserver = new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      handleUrlChange();
    }
  });

  function handleUrlChange() {
    const existingPanel = document.getElementById('vrc-resolver-buttons');
    if (existingPanel) {
      existingPanel.remove();
    }

    // Disconnect right column observer if active
    if (rightColumnObserver) {
      try {
        rightColumnObserver.disconnect();
      } catch (e) {
        console.warn('[World Page] Failed to disconnect observer:', e);
      }
      rightColumnObserver = null;
    }

    setTimeout(() => {
      init();
    }, TIMEOUTS.URL_CHANGE_DELAY);
  }

  // === Initialization ===
  async function init() {
    if (!isTargetPage()) {
      return;
    }
    
    // 設定チェック: VRCサイト連携が無効の場合は処理を中断
    const isEnabled = await checkExtensionSettings();
    if (!isEnabled) {
      return;
    }

    // 言語設定をロード
    await initContentScriptSettings();
    watchSettingsChanges();

    if (document.getElementById('vrc-resolver-buttons')) {
      return;
    }

    const worldId = getWorldIdFromUrl();
    if (!worldId) {
      return;
    }

    await loadSavedWorlds();
    await loadFolders();
    await loadVRCWorlds();

    // Check if right column already exists
    const rightColumn = document.querySelector(SELECTORS.RIGHT_COLUMN);
    if (rightColumn) {
      const detailsBody = rightColumn.querySelector(SELECTORS.DETAILS_BODY);
      if (detailsBody) {
        createButtonPanel();
        return;
      }
    }

    // Create floating panel immediately
    createFloatingPanel(worldId);

    // Start monitoring for right column to migrate panel
    const floatingPanel = document.getElementById('vrc-resolver-buttons');
    monitorRightColumnAndMigrate(worldId, floatingPanel);
  }

  // === Initial Execution ===
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
      startUrlMonitoring();
    });
  } else {
    init();
    startUrlMonitoring();
  }

  // Start URL monitoring with MutationObserver
  urlObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // Add animation CSS
  const style = document.createElement('style');
  style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
  document.head.appendChild(style);

})();