(function () {
  'use strict';

  let savedWorldIds = new Set();
  let vrcFolders = [];
  let exFolders = [];
  let vrcWorlds = [];

  // === 保存済みワールドリストを読み込み ===
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
      console.error('[World Page] Failed to communicate with background:', e);
    }
  }
  // === フォルダ情報を読み込み ===
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
      console.error('[World Page] Failed to load folders:', e);
    }
  }
  // === VRCワールド一覧を読み込み ===
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
      console.error('[World Page] Failed to load VRC worlds:', e);
    }
  }
  // === URLからワールドIDを取得 ===
  function getWorldIdFromUrl() {
    const match = window.location.pathname.match(/\/home\/world\/(wrld_[a-zA-Z0-9-]+)\//);
    if (match) return match[1];
    const params = new URLSearchParams(window.location.search);
    const worldId = params.get('worldId');
    if (worldId && worldId.startsWith('wrld_')) return worldId;

    return null;
  }
  // === ワールド名を取得(h2タグから) ===
  function getWorldName() {
    const h2 = document.querySelector('h2');
    return h2 ? h2.textContent.trim() : null;
  }
  // === ページタイプを判定 ===
  function isInstancePage() {
    return window.location.pathname.includes('/home/launch');
  }
  // === ボタンパネルを作成 ===
  function createButtonPanel() {
    const worldId = getWorldIdFromUrl();
    if (!worldId) {
      console.warn('[World Page] Could not extract world ID from URL');
      return;
    }
    if (document.getElementById('vrc-resolver-buttons')) {
      console.log('[World Page] Button panel already exists');
      return;
    }

    console.log('[World Page] Creating button panel for world:', worldId);

    if (isInstancePage()) {
      createFloatingPanel(worldId);
      return;
    }

    const rightColumn = document.querySelector('.mt-3.mt-sm-0.css-br1a89.e1264afg10');
    if (!rightColumn) {
      console.warn('[World Page] Could not find right column container, using float');
      createFloatingPanel(worldId);
      return;
    }

    const detailsBody = rightColumn.querySelector('.css-kfjcvw.e18c1r7j40');
    if (!detailsBody) {
      console.warn('[World Page] Could not find Details section body, using float');
      createFloatingPanel(worldId);
      return;
    }

    const panel = createPanelElement(worldId);
    detailsBody.appendChild(panel);
    setupButtonEvents(worldId);
  }
  // === フロート表示パネル作成 ===
  function createFloatingPanel(worldId) {
    const panel = createPanelElement(worldId);
    panel.style.position = 'fixed';
    panel.style.top = '100px';
    panel.style.right = '20px';
    panel.style.zIndex = '10000';
    panel.style.width = '280px';
    panel.style.backgroundColor = 'rgba(26, 29, 36, 0.95)';
    panel.style.padding = '16px';
    panel.style.borderRadius = '12px';
    panel.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.6)';
    panel.style.border = '2px solid rgba(31, 209, 237, 0.3)';
    document.body.appendChild(panel);
    setupButtonEvents(worldId);
  }
  // === パネル要素を作成 ===
  function createPanelElement(worldId) {
    const panel = document.createElement('div');
    panel.id = 'vrc-resolver-buttons';
    // 修正済み: CSS文字列をテンプレートリテラルで囲む
    panel.style.cssText = `display: flex; flex-direction: column; gap: 8px; margin-top: 16px; width: 100%;`;
    const isSaved = savedWorldIds.has(worldId);
    const vrcWorld = vrcWorlds.find(w => w.id === worldId);
    const isInVRC = !!vrcWorld;

    panel.innerHTML = `
  <button id="copy-link-btn" style="
    width: 100%;
    padding: 10px;
    background: rgba(6, 75, 92, 1);
    border: 2px solid rgba(6, 75, 92, 1);
    border-radius: 4px;
    color: rgba(106, 227, 249, 1);
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
    background: ${isSaved ? 'rgba(92, 75, 6, 1)' : 'rgba(6, 75, 92, 1)'};
    border: 2px solid ${isSaved ? 'rgba(132, 108, 8, 1)' : 'rgba(6, 75, 92, 1)'};
    border-radius: 4px;
    color: ${isSaved ? 'rgba(249, 227, 106, 1)' : 'rgba(106, 227, 249, 1)'};
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
    background: rgba(92, 6, 6, 1);
    border: 2px solid rgba(92, 6, 6, 1);
    border-radius: 4px;
    color: rgba(249, 106, 106, 1);
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    opacity: ${isInVRC ? '1' : '0.5'};
    pointer-events: ${isInVRC ? 'auto' : 'none'};
  ">
    <span>🗑️</span>
    <span>VRChatから削除</span>
  </button>
  `;

    return panel;
  }
  // === ボタンイベントを設定 ===
  function setupButtonEvents(worldId) {
    // リンクコピーボタン
    const copyBtn = document.getElementById('copy-link-btn');
    if (copyBtn) {
      copyBtn.onmouseover = () => {
        copyBtn.style.borderColor = 'rgba(8, 108, 132, 1)';
        copyBtn.style.background = 'rgba(7, 52, 63, 1)';
      };
      copyBtn.onmouseout = () => {
        copyBtn.style.borderColor = 'rgba(6, 75, 92, 1)';
        copyBtn.style.background = 'rgba(6, 75, 92, 1)';
      };
      copyBtn.onclick = () => {
        const url = `https://vrchat.com/home/world/${worldId}`;
          navigator.clipboard.writeText(url).then(() => {
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = '<span>✓</span><span>コピーしました!</span>';
            setTimeout(() => {
              copyBtn.innerHTML = originalHTML;
            }, 2000);
          }).catch(err => {
            console.error('[World Page] Failed to copy:', err);
            alert('リンクのコピーに失敗しました');
          });
      };
    }
    // Chrome保存/削除ボタン
    const extBtn = document.getElementById('ext-save-btn');
    if (extBtn) {
      const isSaved = savedWorldIds.has(worldId);

      extBtn.onmouseover = () => {
        if (isSaved) {
          extBtn.style.borderColor = 'rgba(150, 120, 10, 1)';
          extBtn.style.background = 'rgba(70, 57, 5, 1)';
        } else {
          extBtn.style.borderColor = 'rgba(8, 108, 132, 1)';
          extBtn.style.background = 'rgba(7, 52, 63, 1)';
        }
      };
      extBtn.onmouseout = () => {
        if (isSaved) {
          extBtn.style.borderColor = 'rgba(132, 108, 8, 1)';
          extBtn.style.background = 'rgba(92, 75, 6, 1)';
        } else {
          extBtn.style.borderColor = 'rgba(6, 75, 92, 1)';
          extBtn.style.background = 'rgba(6, 75, 92, 1)';
        }
      };
      extBtn.onclick = () => {
        if (savedWorldIds.has(worldId)) {
          deleteFromExtension(worldId);
        } else {
          showExtFolderModal(worldId);
        }
      };
    }

    // VRChat削除ボタン
    const vrcDeleteBtn = document.getElementById('vrc-delete-btn');
    if (vrcDeleteBtn) {
      vrcDeleteBtn.onmouseover = () => {
        if (vrcWorlds.some(w => w.id === worldId)) {
          vrcDeleteBtn.style.borderColor = 'rgba(132, 8, 8, 1)';
          vrcDeleteBtn.style.background = 'rgba(63, 7, 7, 1)';
        }
      };
      vrcDeleteBtn.onmouseout = () => {
        vrcDeleteBtn.style.borderColor = 'rgba(92, 6, 6, 1)';
        vrcDeleteBtn.style.background = 'rgba(92, 6, 6, 1)';
      };
      vrcDeleteBtn.onclick = () => deleteFromVRChat(worldId);
    }
  }
  // === 拡張機能フォルダ選択モーダル表示 ===
  function showExtFolderModal(worldId) {
    // フォルダ定義
    const unclassifiedFolder = {
      id: 'none',
      name: '未分類',
      class: 'none',
      color: { bg: '#2e2a1f', border: '#8b7355', hoverBg: '#2e2a1f', hoverBorder: '#8b7355', activeBg: '#2e2a1f', activeColor: '#e0e0e0' }
    };
  
    const externalFolders = exFolders.map(f => ({
      id: f.id,
      name: f.name,
      class: '',
      // VRCフォルダではないChrome内フォルダのカラーを定義
      color: { bg: '#0f1419', border: '#333', hoverBg: '#1a1f2e', hoverBorder: '#1fd1ed', activeBg: '#1a1f2e', activeColor: '#e0e0e0' }
    }));
  
    // VRChatと同期しているフォルダ (vrcFolders) は選択肢から除外するため、ここでは使用しない
  
    // フォルダの並び順を設定
    const folders = [
      unclassifiedFolder, // 1. 未分類
      ...externalFolders, // 2. VRC同期でないChrome内のフォルダ
      // VRC同期フォルダは除外
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

  // === 汎用フォルダ選択モーダルを表示 ===
  function showFolderSelectModal(options) {
    const {
      title = '📁 フォルダを選択',
      description = '対象のフォルダを選択してください:',
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

    // フォルダリスト生成
    const folderList = document.getElementById('folder-select-list');
    folders.forEach((folder, index) => {
      const isCurrentFolder = folder.id === currentFolderId;
      const option = createFolderOption(
        folder.id,
        folder.name,
        index === 0,
        folder.class || '',
        isCurrentFolder ? '✓ 登録済み' : null,
        folder.color
      );
      folderList.appendChild(option);
    });

    // フォルダ選択イベント
    folderList.querySelectorAll('.folder-option').forEach(option => {
      option.addEventListener('click', () => {
        folderList.querySelectorAll('.folder-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');

        // シングルクリックで確定
        const folderId = option.dataset.folderId;
        setTimeout(() => {
          overlay.remove();
          onConfirm(folderId);
        }, 200);
      });
    });

    // キャンセルボタン
    document.getElementById('folder-select-cancel').onclick = () => {
      overlay.remove();
      onCancel();
    };

    // オーバーレイクリックで閉じる
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.remove();
        onCancel();
      }
    };
  }
  // === モーダルオーバーレイ作成 ===
  function createModalOverlay() {
    const overlay = document.createElement('div');
    // 修正済み: CSS文字列をテンプレートリテラルで囲む
    overlay.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.8); z-index: 10001; display: flex; align-items: center; justify-content: center;`;
    return overlay;
  }
  // === フォルダオプション作成 ===
  function createFolderOption(id, name, selected = false, extraClass = '', badge = null, colors = null, isDisabled = false) {
    const option = document.createElement('div');
    // 修正済み: クラス名連結をテンプレートリテラルで修正
    option.className = `folder-option ${extraClass} ${selected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`;
    option.dataset.folderId = id;
    if (isDisabled) {
      option.dataset.isDisabled = 'true';
    }
  
    const defaultColors = {
      bg: '#0f1419',
      border: '#333',
      hoverBg: '#1a1f2e',
      hoverBorder: '#1fd1ed',
      activeBg: '#1a1f2e',
      activeColor: '#e0e0e0'
    };
  
    const color = colors || defaultColors;
    const opacity = isDisabled ? '0.4' : '1';
    const cursor = isDisabled ? 'not-allowed' : 'pointer';
  
    option.style.cssText = `
    padding: 10px;
    background: ${color.bg};
    border: 2px solid ${selected ? color.activeBg : color.border};
    border-radius: 8px;
    cursor: ${cursor};
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 8px;
    opacity: ${opacity};
    `;
  
    if (selected) {
      option.style.background = color.activeBg;
      option.style.boxShadow = `0 0 12px ${color.hoverBorder}40`;
    }
  
    option.onmouseover = () => {
      if (!isDisabled) {
        option.style.borderColor = color.hoverBorder;
        option.style.background = color.hoverBg;
      }
    };
  
    option.onmouseout = () => {
      if (!isDisabled && !option.classList.contains('selected')) {
        option.style.borderColor = color.border;
        option.style.background = color.bg;
        option.style.boxShadow = 'none';
      }
    };
  
    option.innerHTML = `
    <span style="font-size: 18px;">${isDisabled ? '🚫' : '📁'}</span>
    <span style="font-size: 12px; color: #e0e0e0; flex: 1;">${name}</span>
    ${badge ? `<span style="font-size: 10px; color: #67d781; background: rgba(103, 215, 129, 0.2); padding: 2px 6px; border-radius: 4px;">${badge}</span>` : ''}
    `;
  
    return option;
  }
  // === 拡張機能に追加 ===
  async function addToExtension(worldId, folderId) {
    console.log(`[World Page] Adding ${worldId} to extension folder ${folderId}...`);
    try {
      // ワールド詳細情報を取得
      const worldData = await fetch(`https://vrchat.com/api/1/worlds/${worldId}`, {
        credentials: 'include'
      });

      if (!worldData.ok) {
        throw new Error(`Failed to fetch world details: ${worldData.status}`);
      }

      const worldInfo = await worldData.json();

      const response = await chrome.runtime.sendMessage({
        type: 'addWorld',
        world: {
          id: worldId,
          name: worldInfo.name || worldId,
          authorName: worldInfo.authorName || null,
          releaseStatus: worldInfo.releaseStatus || null,
          thumbnailImageUrl: worldInfo.thumbnailImageUrl || null,
          folderId: folderId
        }
      });

      if (response.success) {
        savedWorldIds.add(worldId);
        showNotification(`✔ ${worldInfo.name} を追加しました`, 'success');
        updateExtButton(worldId, true);
      } else if (response.reason === 'already_exists') {
        showNotification('ℹ️ このワールドは既に保存されています', 'info');
        savedWorldIds.add(worldId);
      } else {
        showNotification('✖ 追加に失敗しました', 'error');
      }
    } catch (error) {
      console.error('[World Page] Failed to add to extension:', error);
      showNotification(`✖ エラー: ${error.message}`, 'error');
    }
  }
  // === 拡張機能から削除 ===
  async function deleteFromExtension(worldId) {
    if (!savedWorldIds.has(worldId)) {
      return;
    }
    console.log(`[World Page] Deleting ${worldId} from extension...`);

    const response = await chrome.runtime.sendMessage({ type: 'getAllWorlds' });
    const world = (response.worlds || []).find(w => w.id === worldId);

    if (!world) {
      showNotification('✖ ワールド情報が見つかりません', 'error');
      return;
    }

    try {
      const deleteResponse = await chrome.runtime.sendMessage({
        type: 'removeWorld',
        worldId: worldId,
        folderId: world.folderId
      });

      if (deleteResponse.success) {
        savedWorldIds.delete(worldId);
        showNotification('✔ Chromeから削除しました', 'success');
        updateExtButton(worldId, false);
      } else {
        showNotification('✖ 削除に失敗しました', 'error');
      }
    } catch (error) {
      console.error('[World Page] Failed to delete from extension:', error);
      showNotification(`✖ エラー: ${error.message}`, 'error');
    }
  }
  // === VRChatから削除 ===
  async function deleteFromVRChat(worldId) {
    const vrcWorld = vrcWorlds.find(w => w.id === worldId);
    if (!vrcWorld) {
      showNotification('✖ VRChatのお気に入りに登録されていません', 'info');
      return;
    }
    console.log(`[World Page] Deleting ${worldId} from VRChat favorites...`);

    try {
      // ページ内の公式Remove Favoriteボタンを探してクリック
      const removeFavButton = Array.from(document.querySelectorAll('div[role="button"]'))
        .find(btn => btn.textContent.includes('Remove Favorite'));

      if (removeFavButton) {
        removeFavButton.click();
        showNotification('✔ VRChatから削除しました', 'success');

        // 少し待ってから拡張機能のストレージからも削除
        setTimeout(async () => {
          await chrome.runtime.sendMessage({
            type: 'removeWorld',
            worldId: worldId,
            folderId: vrcWorld.folderId
          });

          // ローカルキャッシュからも削除
          const index = vrcWorlds.findIndex(w => w.id === worldId);
          if (index !== -1) {
            vrcWorlds.splice(index, 1);
          }

          updateVRCDeleteButton(worldId, false);
        }, 500);
      } else {
        showNotification('✖ 削除ボタンが見つかりませんでした', 'error');
      }
    } catch (error) {
      console.error('[World Page] Error deleting from VRChat:', error);
      showNotification(`✖ エラー: ${error.message}`, 'error');
    }
  }
  // === VRC削除ボタンの更新 ===
  function updateVRCDeleteButton(worldId, isInVRC) {
    const vrcDeleteBtn = document.getElementById('vrc-delete-btn');
    if (vrcDeleteBtn) {
      vrcDeleteBtn.style.opacity = isInVRC ? '1' : '0.5';
      vrcDeleteBtn.style.pointerEvents = isInVRC ? 'auto' : 'none';
    }
  }
  // === 拡張機能ボタンの更新 ===
  function updateExtButton(worldId, isSaved) {
    const extBtn = document.getElementById('ext-save-btn');
    if (extBtn) {
      const checkSpan = extBtn.querySelector('span:first-child');
      const textSpan = extBtn.querySelector('span:last-child');
      if (checkSpan) {
        checkSpan.textContent = isSaved ? '☑' : '☐';
      }
      if (textSpan) {
        textSpan.textContent = isSaved ? 'Chromeから削除' : 'Chromeに保存';
      }

      if (isSaved) {
        extBtn.style.background = 'rgba(92, 75, 6, 1)';
        extBtn.style.borderColor = 'rgba(132, 108, 8, 1)';
        extBtn.style.color = 'rgba(249, 227, 106, 1)';
      } else {
        extBtn.style.background = 'rgba(6, 75, 92, 1)';
        extBtn.style.borderColor = 'rgba(6, 75, 92, 1)';
        extBtn.style.color = 'rgba(106, 227, 249, 1)';
      }
    }
  }
  // === 通知表示 ===
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
    }, 3000);
  }
  // === 要素が出現するまで待機 ===
  function waitForElement(selector, callback, timeout = 10000) {
    const existing = document.querySelector(selector);
    if (existing) {
      callback(existing);
      return;
    }
    const observer = new MutationObserver((mutations, obs) => {
      const element = document.querySelector(selector);
      if (element) {
        obs.disconnect();
        clearTimeout(timer);
        callback(element);
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    const timer = setTimeout(() => {
      observer.disconnect();
      console.warn('[World Page] Element not found within timeout:', selector);
    }, timeout);
  }

  // === URL変更を監視(SPA対応 + フレーム遷移対応) ===
  let lastUrl = location.href;
  let checkInterval = null;

  // 定期的なURLチェック
  function startUrlMonitoring() {
    if (checkInterval) {
      clearInterval(checkInterval);
    }

    checkInterval = setInterval(() => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        console.log('[World Page] URL changed (polling detected):', currentUrl);
        handleUrlChange();
      }
    }, 500);
  }

  // MutationObserverによる監視
  const urlObserver = new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      console.log('[World Page] URL changed (mutation detected):', currentUrl);
      handleUrlChange();
    }
  });

  // URL変更時の処理
  function handleUrlChange() {
    // 既存のパネルを削除
    const existingPanel = document.getElementById('vrc-resolver-buttons');
    if (existingPanel) {
      console.log('[World Page] Removing existing panel');
      existingPanel.remove();
    }

    // 少し待ってから再初期化
    setTimeout(() => {
      console.log('[World Page] Reinitializing after URL change');
      init();
    }, 800);
  }

  // === 初期化 ===
  async function init() {
    // ページタイプをチェック（ワールドページかインスタンスページのみ対象）
    const isWorldPage = /\/home\/world\/wrld_/.test(window.location.pathname);
    const isLaunchPage = /\/home\/launch/.test(window.location.pathname);

    if (!isWorldPage && !isLaunchPage) {
      console.log('[World Page] Not a target page (world or launch), skipping');
      return;
    }

    if (document.getElementById('vrc-resolver-buttons')) {
      console.log('[World Page] Button panel already exists');
      return;
    }

    const worldId = getWorldIdFromUrl();
    if (!worldId) {
      console.log('[World Page] Could not extract world ID from URL');
      return;
    }

    console.log('[World Page] Initializing for world:', worldId);

    await loadSavedWorlds();
    await loadFolders();
    await loadVRCWorlds();

    const mainContentSelector = '.tw-flex.justify-content-between.flex-column.flex-sm-row';

    waitForElement(mainContentSelector, (mainContainer) => {
      console.log('[World Page] Main content container found, creating button panel');
      createButtonPanel();
    }, 5000);
  }

  // 初回実行
  console.log('[World Page] Script loaded on:', window.location.href);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
      startUrlMonitoring();
    });
  } else {
    init();
    startUrlMonitoring();
  }

  // MutationObserverによるURL変更監視を開始
  urlObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  // アニメーション用CSS追加
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