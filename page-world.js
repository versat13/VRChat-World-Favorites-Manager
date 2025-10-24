console.log("[VRC Resolver] World Page Script v1.0.1");

(function() {
  'use strict';

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
    BG: 'rgba(6, 75, 92, 1)',
    BORDER: 'rgba(6, 75, 92, 1)',
    TEXT: 'rgba(106, 227, 249, 1)',
    HOVER_BG: 'rgba(7, 52, 63, 1)',
    HOVER_BORDER: 'rgba(8, 108, 132, 1)'
  },
  SAVED: {
    BG: 'rgba(92, 75, 6, 1)',
    BORDER: 'rgba(132, 108, 8, 1)',
    TEXT: 'rgba(249, 227, 106, 1)',
    HOVER_BG: 'rgba(70, 57, 5, 1)',
    HOVER_BORDER: 'rgba(150, 120, 10, 1)'
  },
  DANGER: {
    BG: 'rgba(92, 6, 6, 1)',
    BORDER: 'rgba(92, 6, 6, 1)',
    TEXT: 'rgba(249, 106, 106, 1)',
    HOVER_BG: 'rgba(63, 7, 7, 1)',
    HOVER_BORDER: 'rgba(132, 8, 8, 1)'
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
console.log('[World Page] Script loaded on:', window.location.href);

// === Data Loading Functions ===
async function loadSavedWorlds() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getAllWorlds' });
    if (response.error) {
      console.error('[World Page] Error loading saved worlds:', response.error);
      return;
    }
    savedWorldIds = new Set((response.worlds || []).map(w => w.id));
    console.log('[World Page] Loaded saved worlds:', savedWorldIds.size);
  } catch (e) {
    if (e.message.includes('Extension context invalidated')) {
      console.warn('[World Page] Extension context invalidated. Please reload the page.');
      showNotification('拡張機能が更新されました。ページを再読み込みしてください', 'info');
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
    console.log('[World Page] Loaded folders:', { vrcFolders, exFolders });
  } catch (e) {
    if (e.message.includes('Extension context invalidated')) {
      console.warn('[World Page] Extension context invalidated. Please reload the page.');
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
    console.log('[World Page] Loaded VRC worlds:', vrcWorlds.length);
  } catch (e) {
    if (e.message.includes('Extension context invalidated')) {
      console.warn('[World Page] Extension context invalidated. Please reload the page.');
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
    console.warn('[World Page] Could not extract world ID from URL');
    return;
  }
  
  // Prevent duplicate execution
  if (document.getElementById('vrc-resolver-buttons')) {
    console.log('[World Page] Button panel already exists');
    return;
  }
  
  console.log('[World Page] Creating button panel for world:', worldId);
  
  // Try to find right column and insert inline
  const rightColumn = document.querySelector(SELECTORS.RIGHT_COLUMN);
  if (rightColumn) {
    const detailsBody = rightColumn.querySelector(SELECTORS.DETAILS_BODY);
    if (detailsBody) {
      console.log('[World Page] Found right column, inserting inline panel');
      const panel = createPanelElement(worldId);
      detailsBody.appendChild(panel);
      setupButtonEvents(worldId);
      return;
    }
  }
  
  // Fallback to floating panel
  console.log('[World Page] Right column not found, using floating panel');
  createFloatingPanel(worldId);
}

function createFloatingPanel(worldId) {
  const panel = createPanelElement(worldId, true); // Pass isFloating flag
  panel.style.position = 'fixed';
  panel.style.top = '120px';
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
      <span>リンクをコピー</span>
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
      <span>${isSaved ? 'Chromeから削除' : 'Chromeに保存'}</span>
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
      <span>VRChatから削除</span>
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
      copyBtn.innerHTML = '<span>✓</span><span>コピーしました!</span>';
      setTimeout(() => {
        copyBtn.innerHTML = originalHTML;
      }, 2000);
    }).catch(err => {
      console.error('[World Page] Failed to copy:', err);
      showNotification('リンクのコピーに失敗しました', 'error');
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
    title = '📁 フォルダを選択',
    description = '対象のフォルダを選択してください:',
    folders = [],
    onConfirm = () => {},
    onCancel = () => {},
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
        ✓ 現在「${folders.find(f => f.id === currentFolderId)?.name || currentFolderId}」に登録済み
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
      ">キャンセル</button>
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
      isCurrentFolder ? '✓ 登録済み' : null
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
    { id: 'none', name: '未分類', class: 'none' },
    ...exFolders.map(f => ({ id: f.id, name: f.name, class: '' })),
    ...vrcFolders.map(f => ({ id: f.id, name: f.displayName, class: 'vrc' }))
  ];
  
  showFolderSelectModal({
    title: '📁 フォルダを選択',
    description: 'このワールドを保存するフォルダを選択してください',
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
  console.log(`[World Page] Adding ${worldId} to extension folder ${folderId}...`);
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
        console.log('[World Page] Fetched world details from API:', worldData);
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
      showNotification(`✓ ${worldData.name} を追加しました`, 'success');
      updateExtButton(worldId, true);
    } else if (response.reason === 'already_exists') {
      showNotification('ℹ️ このワールドは既に保存されています', 'info');
      savedWorldIds.add(worldId);
      updateExtButton(worldId, true);
    } else if (response.reason === 'private_world') {
      showNotification(`✖ プライベートワールド「${response.worldName}」はVRCフォルダに保存できません`, 'error');
    } else {
      showNotification('✖ 追加に失敗しました', 'error');
    }
  } catch (error) {
    console.error('[World Page] Failed to add to extension:', error);
    if (error.message.includes('Extension context invalidated')) {
      showNotification('拡張機能が更新されました。ページを再読み込みしてください', 'info');
    } else {
      showNotification(`✖ エラー: ${error.message}`, 'error');
    }
  }
}

async function deleteFromExtension(worldId) {
  if (!savedWorldIds.has(worldId)) {
    return;
  }
  
  console.log(`[World Page] Deleting ${worldId} from extension...`);
  
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getAllWorlds' });
    const world = (response.worlds || []).find(w => w.id === worldId);
    
    if (!world) {
      showNotification('✖ ワールド情報が見つかりません', 'error');
      return;
    }
    
    const deleteResponse = await chrome.runtime.sendMessage({
      type: 'removeWorld',
      worldId: worldId,
      folderId: world.folderId
    });
    
    if (deleteResponse.success) {
      savedWorldIds.delete(worldId);
      showNotification('✓ Chromeから削除しました', 'success');
      updateExtButton(worldId, false);
    } else {
      showNotification('✖ 削除に失敗しました', 'error');
    }
  } catch (error) {
    console.error('[World Page] Failed to delete from extension:', error);
    if (error.message.includes('Extension context invalidated')) {
      showNotification('拡張機能が更新されました。ページを再読み込みしてください', 'info');
    } else {
      showNotification(`✖ エラー: ${error.message}`, 'error');
    }
  }
}

async function deleteFromVRChat(worldId) {
  console.log(`[World Page] Attempting to delete ${worldId} from VRChat favorites...`);
  
  const removeFavButton = Array.from(document.querySelectorAll('div[role="button"]'))
    .find(btn => btn.textContent.includes('Remove Favorite'));
  
  if (removeFavButton) {
    removeFavButton.click();
    showNotification('✓ VRChatから削除しました', 'success');
    
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
          console.warn('[World Page] Extension context invalidated during sync');
        } else {
          console.error('[World Page] Failed to sync deletion:', error);
        }
      }
    }, TIMEOUTS.VRC_DELETE_SYNC);
  } else {
    const vrcWorld = vrcWorlds.find(w => w.id === worldId);
    if (vrcWorld) {
      showNotification('✖ 削除ボタンが見つかりませんでした', 'error');
    } else {
      showNotification('ℹ️ このワールドはVRChatのお気に入りに登録されていません', 'info');
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
    textSpan.textContent = isSaved ? 'Chromeから削除' : 'Chromeに保存';
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
  console.log('[World Page] Starting right column monitor for migration...');
  
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
        console.log('[World Page] Right column appeared, migrating panel...');
        
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
      console.log('[World Page] Right column monitor timeout, keeping floating panel');
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
      console.log('[World Page] URL changed (polling):', currentUrl);
      handleUrlChange();
    }
  }, TIMEOUTS.URL_CHECK_INTERVAL);
}

const urlObserver = new MutationObserver(() => {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    console.log('[World Page] URL changed (mutation):', currentUrl);
    handleUrlChange();
  }
});

function handleUrlChange() {
  const existingPanel = document.getElementById('vrc-resolver-buttons');
  if (existingPanel) {
    console.log('[World Page] Removing existing panel');
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
    console.log('[World Page] Reinitializing after URL change');
    init();
  }, TIMEOUTS.URL_CHANGE_DELAY);
}

// === Initialization ===
async function init() {
  if (!isTargetPage()) {
    console.log('[World Page] Not a target page, skipping');
    return;
  }
  
  if (document.getElementById('vrc-resolver-buttons')) {
    console.log('[World Page] Button panel already exists');
    return;
  }
  
  const worldId = getWorldIdFromUrl();
  if (!worldId) {
    console.log('[World Page] Could not extract world ID');
    return;
  }
  
  console.log('[World Page] Initializing for world:', worldId);
  
  await loadSavedWorlds();
  await loadFolders();
  await loadVRCWorlds();
  
  // Check if right column already exists
  const rightColumn = document.querySelector(SELECTORS.RIGHT_COLUMN);
  if (rightColumn) {
    const detailsBody = rightColumn.querySelector(SELECTORS.DETAILS_BODY);
    if (detailsBody) {
      console.log('[World Page] Right column found, creating inline panel');
      createButtonPanel();
      return;
    }
  }
  
  // Create floating panel immediately
  console.log('[World Page] Creating floating panel immediately');
  createFloatingPanel(worldId);
  
  // Start monitoring for right column to migrate panel
  const floatingPanel = document.getElementById('vrc-resolver-buttons');
  monitorRightColumnAndMigrate(worldId, floatingPanel);
}

// === Initial Execution ===
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[World Page] DOMContentLoaded');
    init();
    startUrlMonitoring();
  });
} else {
  console.log('[World Page] Document already loaded');
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

console.log("[World Page] Script ready");

})();