// page-world.js v1.2.2

(function () {
  'use strict';

  const { t, initContentScriptSettings, watchSettingsChanges, isExtensionInvalidatedError,
          DEBUG_LOG } = window.VRCHelpers;
  const { showFolderSelectModal, showNotification } = window.PageHelpersShared;

  // ==================== 拡張機能コンテキストチェック ====================
  function checkExtensionContext() {
    try {
      // chrome.runtime.idが存在するか確認
      if (!chrome.runtime?.id) {
        return false;
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  // ==================== 設定チェック ====================
  async function checkExtensionSettings() {
    try {
      // 拡張機能コンテキストが無効化されていないか確認
      if (!checkExtensionContext()) {
        showNotification(t('extInvalidated'), 'warning');
        // スクリプトの実行を停止
        if (checkInterval) clearInterval(checkInterval);
        if (urlObserver) urlObserver.disconnect();
        if (rightColumnObserver) rightColumnObserver.disconnect();
        return false;
      }

      const result = await chrome.storage.sync.get('settings');
      const settings = result.settings || {};

      if (settings.enableVrcSiteIntegration === false) {
        if (DEBUG_LOG) {
          console.log('[World Page] VRC Site Integration is disabled. Script will not run.');
        }
        return false;
      }

      return true;
    } catch (error) {
      if (isExtensionInvalidatedError(error)) {
        showNotification(t('extInvalidated'), 'warning');
        // スクリプトの実行を停止
        if (checkInterval) clearInterval(checkInterval);
        if (urlObserver) urlObserver.disconnect();
        if (rightColumnObserver) rightColumnObserver.disconnect();
        return false;
      }
      console.error('[World Page] Failed to check settings:', error);
      return true;
    }
  }

  // ==================== 定数 ====================
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

  // ==================== グローバル変数 ====================
  let savedWorldIds = new Set();
  let vrcFolders = [];
  let exFolders = [];
  let vrcWorlds = [];
  let lastUrl = location.href;
  let checkInterval = null;
  let rightColumnObserver = null;

  window.vrcResolverLoaded = true;

  // ==================== データロード ====================
  async function loadSavedWorlds() {
    try {
      if (!checkExtensionContext()) {
        return;
      }
      const response = await chrome.runtime.sendMessage({ type: 'getAllWorlds' });
      if (response.error) {
        console.error('[World Page] Error loading saved worlds:', response.error);
        return;
      }
      savedWorldIds = new Set((response.worlds || []).map(w => w.id));
    } catch (error) {
      if (isExtensionInvalidatedError(error)) {
        // エラーログは出さず、静かに処理を中断
        return;
      }
      console.error('[World Page] Failed to communicate with background:', error);
    }
  }

  async function loadFolders() {
    try {
      if (!checkExtensionContext()) {
        return;
      }
      const response = await chrome.runtime.sendMessage({ type: 'getFolders' });
      if (response.error) {
        console.error('[World Page] Error loading folders:', response.error);
        return;
      }
      vrcFolders = response.vrcFolders || [];
      exFolders = response.folders || [];
    } catch (error) {
      if (!isExtensionInvalidatedError(error)) {
        console.error('[World Page] Failed to load folders:', error);
      }
    }
  }

  async function loadVRCWorlds() {
    try {
      if (!checkExtensionContext()) {
        return;
      }
      const response = await chrome.runtime.sendMessage({ type: 'getVRCWorlds' });
      if (response.error) {
        console.error('[World Page] Error loading VRC worlds:', response.error);
        return;
      }
      vrcWorlds = response.vrcWorlds || [];
    } catch (error) {
      if (!isExtensionInvalidatedError(error)) {
        console.error('[World Page] Failed to load VRC worlds:', error);
      }
    }
  }

  // ==================== URL・World ID取得 ====================
  function getWorldIdFromUrl() {
    const match = window.location.pathname.match(/\/home\/world\/(wrld_[a-zA-Z0-9-]+)/);
    if (match) return match[1];

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

  // ==================== ボタンパネル作成 ====================
  function createButtonPanel() {
    const worldId = getWorldIdFromUrl();
    if (!worldId) {
      return;
    }

    if (document.getElementById('vrc-resolver-buttons')) {
      return;
    }

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

    createFloatingPanel(worldId);
  }

  function createFloatingPanel(worldId) {
    const panel = createPanelElement(worldId, true);
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
    setupButtonEvents(worldId, true);
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
    const isVRCDeleteDisabled = isFloating;

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

  // ==================== ボタンイベント設定 ====================
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
        copyBtn.innerHTML = `<span>✔</span><span>${t('linkCopied')}</span>`;
        setTimeout(() => {
          copyBtn.innerHTML = originalHTML;
        }, 2000);
      }).catch(error => {
        console.error('[World Page] Failed to copy:', error);
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

  // ==================== フォルダ選択モーダル ====================
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

  // ==================== ワールド管理機能 ====================
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
        if (DEBUG_LOG) {
          console.warn('[World Page] Failed to fetch world details, using basic info:', apiError);
        }
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
      if (isExtensionInvalidatedError(error)) {
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
      if (isExtensionInvalidatedError(error)) {
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
          if (!isExtensionInvalidatedError(error)) {
            console.error('[World Page] Failed to sync deletion:', error);
          }
        }
      }, TIMEOUTS.VRC_DELETE_SYNC);
    } else {
      const vrcWorld = vrcWorlds.find(w => w.id === worldId);
      if (vrcWorld) {
        showNotification(t('alreadyDeleted'), 'info');

        try {
          await chrome.runtime.sendMessage({
            type: 'removeWorld',
            worldId: worldId,
            folderId: vrcWorld.folderId
          });
          vrcWorlds = vrcWorlds.filter(w => w.id !== worldId);
        } catch (error) {
          if (!isExtensionInvalidatedError(error)) {
            console.error('[World Page] Failed to sync deletion:', error);
          }
        }
      } else {
        showNotification(t('vrcDeleteNotFavorited'), 'info');
      }
    }
  }

  // ==================== ボタン更新 ====================
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

    if (isSaved) {
      extBtn.style.background = COLORS.SAVED.BG;
      extBtn.style.borderColor = COLORS.SAVED.BORDER;
      extBtn.style.color = COLORS.SAVED.TEXT;
    } else {
      extBtn.style.background = COLORS.PRIMARY.BG;
      extBtn.style.borderColor = COLORS.PRIMARY.BORDER;
      extBtn.style.color = COLORS.PRIMARY.TEXT;
    }

    setupExtButton(worldId);
  }

  // ==================== Right Column監視と移行 ====================
  function monitorRightColumnAndMigrate(worldId, floatingPanel) {
    let hasTriggered = false;

    if (rightColumnObserver) {
      try {
        rightColumnObserver.disconnect();
      } catch (error) {
        if (DEBUG_LOG) {
          console.warn('[World Page] Failed to disconnect previous observer:', error);
        }
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
          } catch (error) {
            if (DEBUG_LOG) {
              console.warn('[World Page] Failed to disconnect observer:', error);
            }
          }
          clearTimeout(timer);

          if (floatingPanel && floatingPanel.parentNode) {
            floatingPanel.remove();
          }

          const panel = createPanelElement(worldId, false);
          detailsBody.appendChild(panel);
          setupButtonEvents(worldId, false);
        }
      }
    });

    rightColumnObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    const timer = setTimeout(() => {
      if (!hasTriggered) {
        hasTriggered = true;
        if (rightColumnObserver) {
          try {
            rightColumnObserver.disconnect();
          } catch (error) {
            if (DEBUG_LOG) {
              console.warn('[World Page] Failed to disconnect observer on timeout:', error);
            }
          }
        }
      }
    }, TIMEOUTS.ELEMENT_WAIT);
  }

  // ==================== URL変更監視 ====================
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

    if (rightColumnObserver) {
      try {
        rightColumnObserver.disconnect();
      } catch (error) {
        if (DEBUG_LOG) {
          console.warn('[World Page] Failed to disconnect observer:', error);
        }
      }
      rightColumnObserver = null;
    }

    setTimeout(() => {
      init();
    }, TIMEOUTS.URL_CHANGE_DELAY);
  }

  // ==================== 初期化 ====================
  async function init() {
    if (!isTargetPage()) {
      return;
    }

    // 拡張機能コンテキストチェック
    if (!checkExtensionContext()) {
      if (DEBUG_LOG) {
        console.log('[World Page] Extension context invalidated. Stopping script.');
      }
      return;
    }

    const isEnabled = await checkExtensionSettings();
    if (!isEnabled) {
      return;
    }

    await initContentScriptSettings();
    watchSettingsChanges(() => {
      const existingPanel = document.getElementById('vrc-resolver-buttons');
      if (existingPanel) {
        existingPanel.remove();
        createButtonPanel();
      }
    });

    if (document.getElementById('vrc-resolver-buttons')) {
      return;
    }

    const worldId = getWorldIdFromUrl();
    if (!worldId) {
      return;
    }

    await Promise.all([
      loadSavedWorlds(),
      loadFolders(),
      loadVRCWorlds()
    ]);

    const rightColumn = document.querySelector(SELECTORS.RIGHT_COLUMN);
    if (rightColumn) {
      const detailsBody = rightColumn.querySelector(SELECTORS.DETAILS_BODY);
      if (detailsBody) {
        createButtonPanel();
        return;
      }
    }

    createFloatingPanel(worldId);

    const floatingPanel = document.getElementById('vrc-resolver-buttons');
    monitorRightColumnAndMigrate(worldId, floatingPanel);
  }

  // ==================== 起動処理 ====================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
      startUrlMonitoring();
    });
  } else {
    init();
    startUrlMonitoring();
  }

  urlObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

})();

if (window.VRCHelpers && window.VRCHelpers.DEBUG_LOG) {
  console.log('[World Page] Script ready');
}