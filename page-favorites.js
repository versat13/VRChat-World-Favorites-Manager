console.log("[VRC Resolver] Favorites Page Script v5.0 (Improved Edition)");

(function () {
  'use strict';

  // === Constants ===
  const API_BASE = 'https://vrchat.com/api/1';

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
    },
    DANGER_CONFIRM: {
      BG: 'rgba(249, 106, 106, 0.4)',
      BORDER: 'rgba(249, 106, 106, 0.8)',
      TEXT: '#ffffff',
      HOVER_BG: 'rgba(249, 106, 106, 0.5)',
      HOVER_BORDER: 'rgba(249, 106, 106, 1)'
    }
  };

  const TIMEOUTS = {
    URL_CHECK_INTERVAL: 500,
    RELOAD_DELAY: 500,
    FAVORITES_LOAD_DELAY: 1000,
    API_CALL_DELAY: 250,
    BUTTON_FEEDBACK: 1500,
    CARD_FADE: 300,
    DELETE_CONFIRM_TIMEOUT: 3000
  };

  // === Global State ===
  const RESOLVED_WORLDS = new Map();
  const FAVORITE_ID_TO_WORLD_ID = new Map();
  let PROCESSED_CARDS = new WeakSet();
  let SAVED_WORLD_IDS = new Set();
  let VRC_FOLDERS = [];
  let EXT_FOLDERS = [];
  let currentUrl = window.location.href;
  let isLoadingFavorites = false;
  let currentDropdownText = '';
  let pendingFavoriteId = null;
  let pendingWorldId = null;
  let vrcWorlds = [];

  // Store original fetch
  const origFetch = window.fetch;

  // === Data Loading Functions ===
  async function loadSavedWorlds() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'getAllWorlds' });
      if (response?.worlds) {
        SAVED_WORLD_IDS = new Set(response.worlds.map(w => w.id));
        console.log('[Favorites] Loaded saved worlds:', SAVED_WORLD_IDS.size);
      }
    } catch (e) {
      if (e.message.includes('Extension context invalidated')) {
        console.warn('[Favorites] Extension context invalidated');
        showNotification('拡張機能が更新されました。ページを再読み込みしてください', 'info');
      } else {
        console.error('[Favorites] Failed to load saved worlds:', e);
      }
    }
  }

  async function loadFolders() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'getFolders' });
      if (response.error) {
        console.error('[Favorites] Error loading folders:', response.error);
        return;
      }
      VRC_FOLDERS = response.vrcFolders || [];
      EXT_FOLDERS = response.folders || [];
      console.log('[Favorites] Loaded folders:', { VRC_FOLDERS, EXT_FOLDERS });
    } catch (e) {
      if (e.message.includes('Extension context invalidated')) {
        console.warn('[Favorites] Extension context invalidated');
      } else {
        console.error('[Favorites] Failed to load folders:', e);
      }
    }
  }

  async function loadVRCFolders() {
    try {
      const response = await origFetch(`${API_BASE}/favorite/groups`, {
        method: 'GET',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch favorite groups: ${response.status}`);
      }

      const groups = await response.json();
      const worldGroups = groups.filter(g => g.type === 'world');

      VRC_FOLDERS = worldGroups.map(g => ({
        id: g.name,
        name: g.name,
        displayName: g.displayName || g.name,
        type: g.type
      }));

      console.log('[Favorites] Loaded VRC folders from API:', VRC_FOLDERS.length);
    } catch (e) {
      console.error('[Favorites] Failed to load VRC folders:', e);
    }
  }

  // === URL and Change Monitoring ===
  function watchChanges() {
    setInterval(() => {
      // URL change monitoring
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        if (currentUrl.includes('/favorites/world/') || currentUrl.includes('/home')) {
          resetAndReload();
        }
      }

      // Dropdown change monitoring
      const dropdown = document.querySelector('[aria-label="Favorite Collection Selector"] [role="note"]');
      if (dropdown) {
        const newText = dropdown.textContent.trim();
        if (newText && newText !== currentDropdownText) {
          currentDropdownText = newText;
          resetAndReload();
        }
      }
    }, TIMEOUTS.URL_CHECK_INTERVAL);
  }

  function resetAndReload() {
    console.log('[Favorites] Favorites view changed. Resetting processed cards.');
    PROCESSED_CARDS = new WeakSet();
    setTimeout(() => {
      loadFavoritesManually().then(() => checkForWorldCards());
    }, TIMEOUTS.RELOAD_DELAY);
  }

  // === Fetch Interception ===
  window.fetch = async (...args) => {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    const response = await origFetch(...args);

    if (url?.includes('/api/1/favorites')) {
      try {
        const clone = response.clone();
        processFavoritesData(await clone.json());
        setTimeout(() => checkForWorldCards(), TIMEOUTS.API_CALL_DELAY);
      } catch { }
    }

    if (url?.includes('/api/1/worlds/wrld_')) {
      try {
        const clone = response.clone();
        const worldData = await clone.json();
        if (worldData?.id && worldData?.name) {
          RESOLVED_WORLDS.set(worldData.id, worldData);
          updateAllMatchingCards(worldData.id, worldData);
        }
      } catch { }
    }

    return response;
  };

  function processFavoritesData(data) {
    const favorites = Array.isArray(data) ? data : [data];
    favorites.forEach(fav => {
      if (fav.id && fav.favoriteId && fav.favoriteId.startsWith('wrld_')) {
        FAVORITE_ID_TO_WORLD_ID.set(fav.id, fav.favoriteId);
        if (!RESOLVED_WORLDS.has(fav.favoriteId)) {
          fetchWorldInfo(fav.favoriteId);
        }
      }
    });
  }

  async function fetchWorldInfo(worldId) {
    if (RESOLVED_WORLDS.has(worldId)) return;
    try {
      const res = await origFetch(`${API_BASE}/worlds/${worldId}`, { credentials: 'include' });

      let data;
      if (res.ok) {
        data = await res.json();
      } else if (res.status === 404) {
        data = { id: worldId, name: '[Deleted]', deleted: true };
      } else {
        return;
      }

      RESOLVED_WORLDS.set(worldId, data);
      updateAllMatchingCards(worldId, data);

    } catch (e) {
      console.error('[Favorites] Error fetching world info:', e);
    }
  }

  // === Button Creation ===
  function addControlButtons(card) {
    if (PROCESSED_CARDS.has(card)) return;

    // Check if this is a favorites page or user/world page
    const unfavBtn = card.querySelector('button[id^="Tooltip-Unfavorite-"]');
    const isFavoritesPage = !!unfavBtn;

    let favoriteId = null;
    let worldId = null;

    if (isFavoritesPage) {
      favoriteId = unfavBtn.id.replace('Tooltip-Unfavorite-', '');
      if (!favoriteId) return;
      worldId = FAVORITE_ID_TO_WORLD_ID.get(favoriteId);
    } else {
      // On user/world pages, extract worldId from data-scrollkey or links
      const scrollKey = card.getAttribute('data-scrollkey');
      if (scrollKey && scrollKey.startsWith('wrld_')) {
        worldId = scrollKey;
      } else {
        // Try to get from link href
        const link = card.querySelector('a[href*="/home/world/wrld_"]');
        if (link) {
          const match = link.href.match(/\/home\/world\/(wrld_[a-zA-Z0-9-]+)/);
          if (match) worldId = match[1];
        }
      }

      if (!worldId) return;
    }

    // Layout adjustment - make card and parent container flexible height
    card.style.position = 'relative';
    card.style.minHeight = '384px';
    card.style.height = 'auto';

    // Expand parent container height on user pages
    const parentContainer = card.closest('.tw-snap-x');
    if (parentContainer) {
      parentContainer.style.minHeight = '460px';
      parentContainer.style.height = 'auto';
    }

    const statsContainer = card.querySelector('.flex-grow-1.css-kfjcvw.e18c1r7j40');
    if (statsContainer) {
      statsContainer.style.paddingBottom = '70px';
    }

    PROCESSED_CARDS.add(card);

    // Create button container
    const container = document.createElement('div');
    container.className = 'vrc-control-buttons';
    container.style.cssText = `
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    justify-content: space-between;
    align-items: stretch;
    gap: 4px;
    padding: 8px;
    background: transparent;
    z-index: 5;
  `;

    // Create buttons based on page type
    const saveBtn = createSaveButton(worldId, card);
    const linkBtn = createLinkButton(worldId, favoriteId);

    let thirdBtn;
    let fourthBtn;

    if (isFavoritesPage) {
      // Favorites page: フォルダ移動ボタンを削除し、スペースを維持
      // (変更点1のロジックをここに記載)
      thirdBtn = document.createElement('div');
      thirdBtn.style.cssText = `flex: 1; padding: 6px 4px; border: 1px solid transparent; border-radius: 6px; min-width: 0;`;

      fourthBtn = createDeleteButton(favoriteId, card);

    } else {
      // User/World page: Favorites/削除ボタン。フォルダ移動機能は廃止
      // ここで作成するthirdBtnは、登録後に自己を置き換えることなく、状態（☆/★, 色）のみを更新するように修正する。
      thirdBtn = createFavoritesButton(worldId, card); // container引数を削除

      // 削除ボタンを常に有効にする (favIdがnullでも動作するよう、createDeleteButtonも修正する)
      fourthBtn = createDeleteButton(null, card, true, worldId); // 常に有効化フラグとworldIdを渡す
    }

    container.appendChild(saveBtn);
    container.appendChild(linkBtn);
    container.appendChild(thirdBtn);
    container.appendChild(fourthBtn);

    card.appendChild(container);

    // Update card if world data exists
    const worldData = worldId ? RESOLVED_WORLDS.get(worldId) : null;
    if (worldId && worldData) {
      updateCard(card, worldId, worldData);
    }
  }

  function createControlButton(icon, label, onClick, disabled = false, colorScheme = 'PRIMARY') {
    const colors = COLORS[colorScheme] || COLORS.PRIMARY;

    const btn = document.createElement('button');
    btn.className = 'vrc-control-btn';
    btn.style.cssText = `
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 6px 4px;
    background: ${colors.BG};
    border: 1px solid ${colors.BORDER};
    border-radius: 6px;
    color: ${colors.TEXT};
    cursor: ${disabled ? 'not-allowed' : 'pointer'};
    transition: all 0.2s;
    font-size: 11px;
    line-height: 1.2;
    opacity: ${disabled ? '0.5' : '1'};
    pointer-events: ${disabled ? 'none' : 'auto'};
    min-width: 0;
  `;

    btn.dataset.colorScheme = colorScheme;

    const iconContainer = document.createElement('span');
    iconContainer.className = 'btn-icon';
    iconContainer.textContent = icon;
    iconContainer.style.cssText = 'font-size: 16px; position: relative; display: inline-block;';

    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    labelSpan.style.cssText = `
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
    text-align: center;
  `;

    btn.appendChild(iconContainer);
    btn.appendChild(labelSpan);

    if (!disabled) {
      btn.onmouseover = () => {
        const scheme = COLORS[btn.dataset.colorScheme] || COLORS.PRIMARY;
        btn.style.background = scheme.HOVER_BG;
        btn.style.borderColor = scheme.HOVER_BORDER;
      };
      btn.onmouseout = () => {
        const scheme = COLORS[btn.dataset.colorScheme] || COLORS.PRIMARY;
        btn.style.background = scheme.BG;
        btn.style.borderColor = scheme.BORDER;
      };
      btn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick();
      };
    }

    return btn;
  }

  // Helper function to update button color scheme
  function updateButtonColorScheme(btn, colorScheme) {
    const colors = COLORS[colorScheme] || COLORS.PRIMARY;
    btn.dataset.colorScheme = colorScheme;
    btn.style.background = colors.BG;
    btn.style.borderColor = colors.BORDER;
    btn.style.color = colors.TEXT;
  }

  // Helper function to set button loading state with animation
  function setButtonLoading(btn, isLoading) {
    const iconContainer = btn.querySelector('.btn-icon');
    if (!iconContainer) return;

    if (isLoading) {
      iconContainer.classList.add('spinning');
      // Remove any existing check mark
      const existingCheck = iconContainer.querySelector('.btn-check');
      if (existingCheck) existingCheck.remove();
    } else {
      iconContainer.classList.remove('spinning');
    }
  }

  // Helper function to show success with check mark overlay
  function showButtonSuccess(btn, originalIcon) {
    const iconContainer = btn.querySelector('.btn-icon');
    if (!iconContainer) return;

    // Remove spinning animation
    iconContainer.classList.remove('spinning');

    // Add check mark overlay
    const checkMark = document.createElement('span');
    checkMark.className = 'btn-check';
    checkMark.textContent = '✓';
    iconContainer.appendChild(checkMark);

    // Remove check mark after animation
    setTimeout(() => {
      if (checkMark.parentNode) {
        checkMark.remove();
      }
    }, 1500);
  }

  function createSaveButton(worldId, card) {
    const isSaved = worldId ? SAVED_WORLD_IDS.has(worldId) : false;
    const btn = createControlButton(
      isSaved ? '☑' : '☐',
      'Chrome保存',
      async () => {
        const iconContainer = btn.querySelector('.btn-icon');
        const originalIcon = iconContainer.textContent;

        // Allow clicking even without worldId - resolve it first
        if (!worldId) {
          showNotification('World IDを取得しています...', 'info');
          btn.disabled = true;
          iconContainer.textContent = '⏳';
          setButtonLoading(btn, true);

          // Try to get worldId from card
          const scrollKey = card.getAttribute('data-scrollkey');
          if (scrollKey && scrollKey.startsWith('wrld_')) {
            worldId = scrollKey;
            btn.dataset.worldId = worldId;
          } else {
            const link = card.querySelector('a[href*="/home/world/wrld_"]');
            if (link) {
              const match = link.href.match(/\/home\/world\/(wrld_[a-zA-Z0-9-]+)/);
              if (match) {
                worldId = match[1];
                btn.dataset.worldId = worldId;
              }
            }
          }

          if (!worldId) {
            showNotification('World IDを取得できませんでした', 'error');
            setButtonLoading(btn, false);
            btn.disabled = false;
            iconContainer.textContent = originalIcon;
            return;
          }
        }

        const wasSaved = SAVED_WORLD_IDS.has(worldId);

        btn.disabled = true;
        iconContainer.textContent = '⏳';
        setButtonLoading(btn, true);

        try {
          if (wasSaved) {
            await deleteFromExtension(worldId);
            iconContainer.textContent = '☐';
            updateButtonColorScheme(btn, 'PRIMARY');
          } else {
            await showExtFolderModal(worldId, card);
            if (SAVED_WORLD_IDS.has(worldId)) {
              iconContainer.textContent = '☑';
              updateButtonColorScheme(btn, 'SAVED');
            } else {
              iconContainer.textContent = '☐';
              updateButtonColorScheme(btn, 'PRIMARY');
            }
          }
          showButtonSuccess(btn, iconContainer.textContent);
        } catch (error) {
          iconContainer.textContent = '✖';
          setTimeout(() => {
            iconContainer.textContent = originalIcon;
            updateButtonColorScheme(btn, wasSaved ? 'SAVED' : 'PRIMARY');
          }, TIMEOUTS.BUTTON_FEEDBACK);
        } finally {
          setButtonLoading(btn, false);
          setTimeout(() => {
            btn.disabled = false;
          }, TIMEOUTS.BUTTON_FEEDBACK);
        }
      },
      false, // Always enabled
      isSaved ? 'SAVED' : 'PRIMARY'
    );

    btn.dataset.worldId = worldId || '';
    return btn;
  }

  function updateSaveButtonDisplay(btn, worldId) {
    const iconContainer = btn.querySelector('.btn-icon');
    const labelSpan = btn.querySelector('span:last-child');

    if (!iconContainer || !labelSpan) return;

    if (!worldId) {
      iconContainer.textContent = '☐';
      labelSpan.textContent = 'Chrome保存';
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.pointerEvents = 'none';
      updateButtonColorScheme(btn, 'PRIMARY');
      return;
    }

    const isSaved = SAVED_WORLD_IDS.has(worldId);
    iconContainer.textContent = isSaved ? '☑' : '☐';
    labelSpan.textContent = 'Chrome保存';
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
    updateButtonColorScheme(btn, isSaved ? 'SAVED' : 'PRIMARY');
  }

  function createLinkButton(worldId, favoriteId) {
    return createControlButton('🔗', 'リンク', async () => {
      const wid = worldId || FAVORITE_ID_TO_WORLD_ID.get(favoriteId);
      if (!wid) {
        showNotification('World IDが未解決です', 'error');
        return;
      }

      const btn = event.currentTarget;
      const iconContainer = btn.querySelector('.btn-icon');
      const originalIcon = iconContainer.textContent;

      await navigator.clipboard.writeText(`https://vrchat.com/home/world/${wid}`);
      iconContainer.textContent = '🔗';
      showButtonSuccess(btn, originalIcon);
      showNotification('リンクをコピーしました', 'success');

      setTimeout(() => {
        iconContainer.textContent = originalIcon;
      }, TIMEOUTS.BUTTON_FEEDBACK);
    });
  }

  // page-favorites.js (変更後: createFavoritesButton関数)
  // container引数を削除
  function createFavoritesButton(worldId, card) { 
    // VRCお気に入り情報を取得する処理 (既存のvrcWorld変数に依存)
    const vrcWorld = (vrcWorlds && Array.isArray(vrcWorlds)) ? vrcWorlds.find(w => w.id === worldId) : null;
    let currentFavoriteId = vrcWorld ? vrcWorld.favoriteId : null; // 登録済みの場合のFavoriteID
    let isFavorited = !!vrcWorld;
    
    const btn = createControlButton(
      isFavorited ? '★' : '☆',
      'Favorites', 
      async () => {
        const btn = event.currentTarget;
        const iconContainer = btn.querySelector('.btn-icon');
        const labelSpan = btn.querySelector('span:last-child');
        const originalIcon = iconContainer.textContent;
        
        if (!worldId) {
          showNotification('World IDが未解決です', 'error');
          return;
        }
        
        // ボタンの状態をローディングに設定
        iconContainer.textContent = '⏳';
        setButtonLoading(btn, true);
        btn.disabled = true;
        
        // 登録済みの場合（削除処理）
        if (isFavorited && currentFavoriteId) {
          try {
            // 削除ボタンのロジックと同じ処理を実行
            await deleteVRCFavoriteRecord(currentFavoriteId); 
  
            iconContainer.textContent = '☆';
            labelSpan.textContent = 'Favorites';
            updateButtonColorScheme(btn, 'PRIMARY');
            showButtonSuccess(btn, '☆');
            showNotification('お気に入りから削除しました', 'success');
            
            isFavorited = false;
            currentFavoriteId = null; // 状態を更新
            
            // 削除ボタンの状態も更新する（非活性化はしないが、成功表示を出す）
            const deleteBtn = card.querySelector('.vrc-control-buttons').querySelector('.vrc-control-btn:last-child');
            if (deleteBtn) showButtonSuccess(deleteBtn, '✓');
  
          } catch (error) {
            showNotification(`お気に入り削除に失敗しました: ${error.message}`, 'error');
            iconContainer.textContent = '✖';
            setTimeout(() => {
              iconContainer.textContent = originalIcon;
            }, TIMEOUTS.BUTTON_FEEDBACK);
          }
          
        } else { 
          // 未登録の場合（追加処理：フォルダ選択必須）
          try {
            const folderId = await showVRCFolderSelectModal(worldId, card); // フォルダ選択モーダルを開く
            
            const response = await origFetch(`${API_BASE}/favorites`, {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'world', favoriteId: worldId, tags: [folderId] })
            });
  
            if (response.ok) {
              const data = await response.json();
              iconContainer.textContent = '★';
              labelSpan.textContent = 'Favorites';
              updateButtonColorScheme(btn, 'SAVED'); // 黄色に設定
              showButtonSuccess(btn, '★');
              showNotification('お気に入りに追加しました', 'success');
              
              // 状態を更新
              isFavorited = true;
              currentFavoriteId = data.id; 
              
              // vrcWorlds cacheも更新
              if (!vrcWorlds) vrcWorlds = [];
              vrcWorlds.push({ id: worldId, favoriteId: data.id, folderId: folderId });
  
            } else {
              throw new Error(`Failed to add favorite (${response.status})`);
            }
          } catch (error) {
            if (error.message !== 'Cancelled') {
              showNotification(`お気に入り追加に失敗しました: ${error.message}`, 'error');
              iconContainer.textContent = '✖';
              setTimeout(() => {
                iconContainer.textContent = originalIcon;
              }, TIMEOUTS.BUTTON_FEEDBACK);
            } else {
              iconContainer.textContent = originalIcon;
            }
          }
        }
        
        setButtonLoading(btn, false);
        btn.disabled = false;
        setTimeout(() => {
          // 最終的な状態を再設定 (成功/失敗に関わらず)
          iconContainer.textContent = isFavorited ? '★' : '☆';
          updateButtonColorScheme(btn, isFavorited ? 'SAVED' : 'PRIMARY');
        }, TIMEOUTS.BUTTON_FEEDBACK);
        
      },
      false, // 常に有効
      isFavorited ? 'SAVED' : 'PRIMARY'
    );
    
    btn.dataset.worldId = worldId || '';
    btn.dataset.favoriteId = currentFavoriteId || '';
    
    return btn;
  }

  async function showVRCFolderSelectModal(worldId, card) {
    return new Promise((resolve, reject) => {
      const worldName = getWorldName(card, worldId);

      const folders = VRC_FOLDERS.map(f => ({
        id: f.id,
        name: f.displayName,
        class: 'vrc'
      }));

      showFolderSelectModal({
        title: '📁 VRChatフォルダに追加',
        description: `「${worldName}」を追加するVRChatフォルダを選択してください`,
        folders: folders,
        onConfirm: (folderId) => {
          resolve(folderId);
        },
        onCancel: () => {
          reject(new Error('Cancelled'));
        }
      });
    });
  }

  // page-favorites.js (変更後: createDeleteButton関数)
  // 常に有効化フラグ(forceEnable)とworldIdを追加
  function createDeleteButton(favoriteId, card, forceEnable = false, worldId = null) {
    // お気に入り一覧ページ (favoriteIdがある) または強制有効化 (user/worldページ) の場合のみボタンを有効にする
    const disabled = !forceEnable && !favoriteId; 
    let currentFavoriteId = favoriteId;
    let confirmTimeout = null;
    
    const btn = createControlButton(
      '🗑',
      '削除',
      async () => {
        const btn = event.currentTarget;
        const iconContainer = btn.querySelector('.btn-icon');
        const originalIcon = iconContainer.textContent;
        
        // ユーザーページで、VRCお気に入りの登録を動的に確認
        if (forceEnable && worldId) {
          // vrcWorlds cacheからfavoriteIdを取得し直す
          const vrcWorld = (vrcWorlds && Array.isArray(vrcWorlds)) ? vrcWorlds.find(w => w.id === worldId) : null;
          currentFavoriteId = vrcWorld ? vrcWorld.favoriteId : null;
          
          if (!currentFavoriteId) {
            // VRCお気に入りに登録されていない場合は、拡張機能からの削除を行う
            const isSavedToExt = worldId ? SAVED_WORLD_IDS.has(worldId) : false;
            if (isSavedToExt) {
               showNotification('拡張機能保存から削除します。', 'info');
               await deleteFromExtension(worldId);
               showButtonSuccess(btn, '✓');
               return;
            }
            
            showNotification('削除対象のお気に入りが見つかりません', 'info');
            return;
          }
        }
        
        // VRCお気に入りに登録されている場合のみ、削除処理に進む
        if (!currentFavoriteId) {
           showNotification('VRCお気に入りに登録されていません', 'info');
           return;
        }
  
        // 確認ステップ
        if (btn.dataset.confirming !== 'true') {
          btn.dataset.confirming = 'true';
          updateButtonColorScheme(btn, 'DANGER_CONFIRM');
          iconContainer.textContent = '⚠';
          btn.querySelector('span:last-child').textContent = '確 定';
          confirmTimeout = setTimeout(() => {
            if (btn.dataset.confirming === 'true') {
              btn.dataset.confirming = 'false';
              updateButtonColorScheme(btn, 'DANGER');
              iconContainer.textContent = originalIcon;
              btn.querySelector('span:last-child').textContent = '削除';
            }
          }, TIMEOUTS.DELETE_CONFIRM_TIMEOUT);
          return;
        }
  
        // 削除実行
        clearTimeout(confirmTimeout);
        btn.dataset.confirming = 'false';
        iconContainer.textContent = '⏳';
        setButtonLoading(btn, true);
        btn.disabled = true;
  
        try {
          await deleteVRCFavoriteRecord(currentFavoriteId);
  
          // 成功したら、お気に入りボタンの状態もリセットする
          const favBtn = card.querySelector('.vrc-control-buttons').querySelector('.vrc-control-btn:nth-child(3)');
          if (favBtn) {
             favBtn.querySelector('.btn-icon').textContent = '☆';
             updateButtonColorScheme(favBtn, 'PRIMARY');
          }
  
          iconContainer.textContent = '✓';
          updateButtonColorScheme(btn, 'DANGER');
          showButtonSuccess(btn, '✓');
          showNotification('お気に入りを削除しました', 'success');
  
          // vrcWorlds cacheからも削除
          vrcWorlds = vrcWorlds.filter(w => w.favoriteId !== currentFavoriteId);
          
        } catch (error) {
          iconContainer.textContent = '✖';
          setTimeout(() => {
            iconContainer.textContent = originalIcon;
            updateButtonColorScheme(btn, 'DANGER');
          }, TIMEOUTS.BUTTON_FEEDBACK);
        } finally {
          setButtonLoading(btn, false);
          setTimeout(() => {
            iconContainer.textContent = originalIcon;
            updateButtonColorScheme(btn, 'DANGER');
            btn.disabled = false;
          }, TIMEOUTS.BUTTON_FEEDBACK);
        }
      },
      disabled, 
      'DANGER'
    );
    
    return btn;
  }

  // === Extension Management ===
  async function showExtFolderModal(worldId, card) {
    const worldName = getWorldName(card, worldId);

    const folders = [
      { id: 'none', name: '未分類', class: 'none' },
      ...EXT_FOLDERS.map(f => ({ id: f.id, name: f.name, class: '' })),
      ...VRC_FOLDERS.map(f => ({ id: f.id, name: f.displayName, class: 'vrc' }))
    ];

    return new Promise((resolve) => {
      showFolderSelectModal({
        title: '📁 保存先フォルダを選択',
        description: `「${worldName}」を保存するフォルダを選択してください`,
        folders: folders,
        onConfirm: async (folderId) => {
          await addToExtension(worldId, folderId, card);
          resolve();
        },
        onCancel: () => {
          resolve();
        }
      });
    });
  }

  async function addToExtension(worldId, folderId, card) {
    const worldName = getWorldName(card, worldId);

    try {
      let worldData = {
        id: worldId,
        name: worldName,
        folderId: folderId
      };

      try {
        const apiResponse = await origFetch(`${API_BASE}/worlds/${worldId}`, {
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
        console.warn('[Favorites] Failed to fetch world details:', apiError);
      }

      const response = await chrome.runtime.sendMessage({
        type: 'addWorld',
        world: worldData
      });

      if (response.success) {
        SAVED_WORLD_IDS.add(worldId);
        showNotification(`✓ ${worldData.name} を追加しました`, 'success');
        updateSaveButtonInCard(card, worldId, true);
      } else if (response.reason === 'already_exists') {
        showNotification('ℹ️ このワールドは既に保存されています', 'info');
        SAVED_WORLD_IDS.add(worldId);
        updateSaveButtonInCard(card, worldId, true);
      } else if (response.reason === 'private_world') {
        showNotification(`✖ プライベートワールド「${response.worldName}」はVRCフォルダに保存できません`, 'error');
      } else {
        showNotification('✖ 追加に失敗しました', 'error');
      }
    } catch (error) {
      console.error('[Favorites] Failed to add to extension:', error);
      if (error.message.includes('Extension context invalidated')) {
        showNotification('拡張機能が更新されました。ページを再読み込みしてください', 'info');
      } else {
        showNotification(`✖ エラー: ${error.message}`, 'error');
      }
    }
  }

  async function deleteFromExtension(worldId) {
    if (!SAVED_WORLD_IDS.has(worldId)) return;

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
        SAVED_WORLD_IDS.delete(worldId);
        showNotification('✓ Chromeから削除しました', 'success');

        // Update all matching cards
        document.querySelectorAll('.vrc-control-btn[data-world-id="' + worldId + '"]').forEach(btn => {
          updateSaveButtonDisplay(btn, worldId);
        });
      } else {
        showNotification('✖ 削除に失敗しました', 'error');
      }
    } catch (error) {
      console.error('[Favorites] Failed to delete from extension:', error);
      if (error.message.includes('Extension context invalidated')) {
        showNotification('拡張機能が更新されました。ページを再読み込みしてください', 'info');
      } else {
        showNotification(`✖ エラー: ${error.message}`, 'error');
      }
    }
  }

  function updateSaveButtonInCard(card, worldId, isSaved) {
    const saveBtn = card.querySelector('.vrc-control-btn[data-world-id]');
    if (saveBtn) {
      saveBtn.dataset.worldId = worldId;
      updateSaveButtonDisplay(saveBtn, worldId);
    }
  }

  function getWorldName(card, worldId) {
    if (RESOLVED_WORLDS.has(worldId)) return RESOLVED_WORLDS.get(worldId).name;
    const h4 = card.querySelector('h4');
    return h4 ? h4.textContent.trim() : worldId;
  }

  async function confirmMoveFolder(newTag) {
    if (!pendingFavoriteId) return;

    try {
      const response = await origFetch(`${API_BASE}/favorites/${pendingFavoriteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: [newTag] }),
        credentials: 'include'
      });

      if (response.ok) {
        const folder = VRC_FOLDERS.find(f => f.id === newTag);
        showNotification(`✓ 「${folder?.displayName || newTag}」フォルダに移動しました`, 'success');
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        throw new Error(`API failed with status: ${response.status}`);
      }
    } catch (error) {
      showNotification(`✖ フォルダ移動に失敗しました: ${error.message}`, 'error');
    } finally {
      pendingFavoriteId = null;
      pendingWorldId = null;
    }
  }

  // === Generic Folder Selection Modal ===
  function showFolderSelectModal(options) {
    const {
      title = '📁 フォルダを選択',
      description = '対象のフォルダを選択してください:',
      folders = [],
      onConfirm = () => { },
      onCancel = () => { }
    } = options;

    const overlay = document.createElement('div');
    overlay.className = 'vrc-resolver-modal';
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
    <div class="folder-selection" style="
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin: 12px 0;
      max-height: 300px;
      overflow-y: auto;
    "></div>
    <div style="display: flex; gap: 8px; margin-top: 16px;">
      <button class="folder-select-cancel" style="
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

    const folderList = modal.querySelector('.folder-selection');
    folders.forEach((folder, index) => {
      const option = createFolderOption(
        folder.id,
        folder.name,
        false, // No initial selection
        folder.class || ''
      );
      folderList.appendChild(option);
    });

    let selectedOption = null;

    folderList.querySelectorAll('.folder-option').forEach(option => {
      option.addEventListener('click', () => {
        // Remove selected class from all options and reset their styles
        folderList.querySelectorAll('.folder-option').forEach(o => {
          o.classList.remove('selected');
          // Reset to base style
          const extraClass = o.dataset.extraClass || '';
          resetFolderOptionStyle(o, extraClass);
        });

        // Add selected class to clicked option
        option.classList.add('selected');
        selectedOption = option;

        // Apply selected style
        const extraClass = option.dataset.extraClass || '';
        applySelectedFolderStyle(option, extraClass);
      });

      option.addEventListener('dblclick', () => {
        const folderId = option.dataset.folderId;
        overlay.remove();
        onConfirm(folderId);
      });
    });

    // Single click confirm for VRC folders
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

    modal.querySelector('.folder-select-cancel').onclick = () => {
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

  function resetFolderOptionStyle(option, extraClass) {
    let baseColor = '#333';
    let baseBg = '#0f1419';

    if (extraClass === 'none') {
      baseColor = '#8b7355';
      baseBg = '#0f1419';
    } else if (extraClass === 'vrc') {
      baseColor = '#103b48';
      baseBg = '#07191d';
    }

    option.style.borderColor = baseColor;
    option.style.background = baseBg;
    option.style.color = extraClass === 'vrc' ? '#888' : '#e0e0e0';
    option.style.boxShadow = 'none';
  }

  function applySelectedFolderStyle(option, extraClass) {
    let selectedBg = '#1a1f2e';
    let selectedShadow = 'rgba(31, 209, 237, 0.3)';
    let hoverColor = '#1fd1ed';

    if (extraClass === 'none') {
      selectedBg = '#2e2a1f';
      selectedShadow = 'rgba(139, 115, 85, 0.3)';
    } else if (extraClass === 'vrc') {
      selectedBg = '#1fd1ed';
      selectedShadow = 'rgba(31, 209, 237, 0.6)';
      option.style.color = '#0a0e1a';
    }

    option.style.borderColor = hoverColor;
    option.style.background = extraClass === 'vrc' ? '#1fd1ed' : selectedBg;
    option.style.boxShadow = `0 0 12px ${selectedShadow}`;
  }

  function createFolderOption(id, name, selected = false, extraClass = '') {
    const option = document.createElement('div');
    option.className = `folder-option ${extraClass} ${selected ? 'selected' : ''}`;
    option.dataset.folderId = id;
    option.dataset.extraClass = extraClass;

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
  `;

    option.onmouseover = () => {
      if (!option.classList.contains('selected')) {
        if (extraClass === 'vrc') {
          option.style.borderColor = '#1fd1ed';
          option.style.background = '#1e5c73';
          option.style.color = '#1fd1ed';
        } else {
          option.style.borderColor = hoverColor;
          option.style.background = selectedBg;
        }
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

  // === Card Update Functions ===
  function updateCard(card, worldId, data) {
    // Update data-scrollkey
    if (worldId && card.getAttribute('data-scrollkey') !== worldId) {
      card.setAttribute('data-scrollkey', worldId);
    }

    const links = card.querySelectorAll('a[href*="???"]');

    if (data.deleted) {
      const titleH4 = card.querySelector('h4');
      if (titleH4 && worldId) {
        titleH4.innerHTML = `[Deleted]<br>${worldId}`;
        titleH4.style.color = '#ff6b6b';
        titleH4.title = `World ID: ${worldId} (World has been deleted)`;
        titleH4.parentElement.style.whiteSpace = 'normal';
      }

      const images = card.querySelectorAll('img[alt="???"]');
      images.forEach(img => {
        img.alt = '[Deleted]';
        img.src = "https://assets.vrchat.com/default/private-world.png";
      });
    } else {
      const titleH4 = card.querySelector('h4');
      if (titleH4 && data.name) {
        titleH4.textContent = data.name;
        titleH4.title = data.name;
        titleH4.style.color = '';
        titleH4.parentElement.style.whiteSpace = '';
      }

      const images = card.querySelectorAll('img[alt="???"]');
      images.forEach(img => {
        img.alt = data.name;
        if (data.imageUrl) {
          img.src = data.imageUrl;
        }
      });
    }

    // Fix links to correct URL
    if (worldId) {
      const correctUrl = `/home/world/${worldId}`;
      links.forEach(link => {
        link.href = correctUrl;
        link.setAttribute('href', correctUrl);

        link.onclick = (e) => {
          e.stopPropagation();
          e.preventDefault();
          window.location.href = correctUrl;
        };
      });
    }

    const saveBtn = card.querySelector('.vrc-control-btn[data-world-id]');
    if (saveBtn) {
      saveBtn.dataset.worldId = worldId;
      updateSaveButtonDisplay(saveBtn, worldId);
    }
  }

  function updateAllMatchingCards(worldId, data) {
    document.querySelectorAll('div[aria-label="World Card"]').forEach(card => {
      const unfav = card.querySelector('button[id^="Tooltip-Unfavorite-"]');
      if (!unfav) return;
      const fid = unfav.id.replace('Tooltip-Unfavorite-', '');

      if (FAVORITE_ID_TO_WORLD_ID.get(fid) === worldId) {
        if (!PROCESSED_CARDS.has(card)) {
          addControlButtons(card);
        }
        updateCard(card, worldId, data);
      }
    });
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
    }, 3000);
  }

  // === DOM Monitoring ===
  const observer = new MutationObserver(() => checkForWorldCards());

  function checkForWorldCards() {
    const cards = document.querySelectorAll('div[data-scrollkey^="wrld_"], div[data-scrollkey="???"]');
    cards.forEach(card => {
      if (!PROCESSED_CARDS.has(card)) {
        addControlButtons(card);
      }
    });
  }

  async function loadFavoritesManually() {
    if (isLoadingFavorites) return;

    const url = window.location.href;
    const match = url.match(/favorites\/(\w+)\/([\w\d\-]+)/);

    let apiUrl = `${API_BASE}/favorites?type=world&n=100`;

    if (match) {
      const [, type, group] = match;
      apiUrl = `${API_BASE}/favorites?type=${type}&n=100`;
      if (group && group !== 'all') {
        apiUrl += `&tag=${group}`;
      }
    }

    isLoadingFavorites = true;

    try {
      const res = await origFetch(apiUrl, { credentials: 'include' });
      if (res.ok) processFavoritesData(await res.json());
    } catch (e) {
      console.error('[Favorites] Error loading favorites:', e);
    } finally {
      isLoadingFavorites = false;
    }
  }

  // === Initialization ===
  async function init() {
    if (!document.body) {
      setTimeout(init, 100);
      return;
    }

    console.log('[Favorites] Initializing...');

    await loadSavedWorlds();
    await loadFolders();
    await loadVRCFolders();

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-scrollkey', 'aria-label']
    });

    watchChanges();
    checkForWorldCards();

    setTimeout(() => {
      loadFavoritesManually().then(() => checkForWorldCards());
    }, TIMEOUTS.FAVORITES_LOAD_DELAY);
  }

  // === Animation Styles ===
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
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes checkFadeIn {
    from {
      opacity: 0;
      transform: scale(0.5);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  .vrc-control-btn .btn-icon {
    position: relative;
    display: inline-block;
  }
  .vrc-control-btn .btn-icon.spinning {
    animation: spin 1s linear infinite;
  }
  .vrc-control-btn .btn-check {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 12px;
    animation: checkFadeIn 0.3s ease-out;
  }
`;
  document.head.appendChild(style);

  // === Start ===
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('[Favorites] Script ready');
})();