// page-favorites.js v1.2.1 前半

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
        // オブザーバーを停止
        if (observer) observer.disconnect();
        return false;
      }

      const result = await chrome.storage.sync.get('settings');
      const settings = result.settings || {};

      if (settings.enableVrcSiteIntegration === false) {
        if (DEBUG_LOG) {
          console.log('[Favorites] VRC Site Integration is disabled. Script will not run.');
        }
        return false;
      }

      if (DEBUG_LOG) {
        console.log('[Favorites] VRC Site Integration is enabled.');
      }
      return true;
    } catch (error) {
      if (isExtensionInvalidatedError(error)) {
        showNotification(t('extInvalidated'), 'warning');
        // オブザーバーを停止
        if (observer) observer.disconnect();
        return false;
      }
      console.error('[Favorites] Failed to check settings:', error);
      return true;
    }
  }

  // ==================== 定数 ====================
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

  // ==================== グローバル変数 ====================
  const RESOLVED_WORLDS = new Map();
  const FAVORITE_ID_TO_WORLD_ID = new Map();
  let PROCESSED_CARDS = new WeakSet();
  let SAVED_WORLD_IDS = new Set();
  let VRC_FOLDERS = [];
  let EXT_FOLDERS = [];
  let currentUrl = window.location.href;
  let isLoadingFavorites = false;
  let currentDropdownText = '';

  let vrcWorlds = [];
  let worldDetailsCache = {};
  const DETAILS_CHUNK_SIZE = 100;

  const origFetch = window.fetch;

  // ==================== ユーティリティ関数 ====================
  function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash;
  }

  async function getWorldDetails(worldId) {
    if (worldDetailsCache[worldId]) {
      return worldDetailsCache[worldId];
    }

    const chunkIndex = Math.abs(hashCode(worldId)) % DETAILS_CHUNK_SIZE;
    const key = `worldDetails_${chunkIndex}`;

    try {
      const result = await chrome.storage.local.get([key]);
      const chunk = result[key] || {};
      const details = chunk[worldId];

      if (details) {
        worldDetailsCache[worldId] = details;
        return details;
      }

      return null;
    } catch (error) {
      console.error('[Favorites] Failed to get world details:', error);
      return null;
    }
  }

  async function getWorldDetailsBatch(worldIds) {
    const detailsMap = {};
    const chunksNeeded = new Set();

    worldIds.forEach(worldId => {
      const chunkIndex = Math.abs(hashCode(worldId)) % DETAILS_CHUNK_SIZE;
      chunksNeeded.add(chunkIndex);
    });

    const keys = Array.from(chunksNeeded).map(i => `worldDetails_${i}`);
    const result = await chrome.storage.local.get(keys);

    worldIds.forEach(worldId => {
      const chunkIndex = Math.abs(hashCode(worldId)) % DETAILS_CHUNK_SIZE;
      const key = `worldDetails_${chunkIndex}`;
      const chunk = result[key] || {};

      if (chunk[worldId]) {
        detailsMap[worldId] = chunk[worldId];
        worldDetailsCache[worldId] = chunk[worldId];
      }
    });

    return detailsMap;
  }

  async function getWorldName(worldId) {
    const details = await getWorldDetails(worldId);
    return details?.name || worldId;
  }

  function getVRCWorldData(worldId) {
    return vrcWorlds.find(w => w.id === worldId) || null;
  }

  // ==================== VRCリアルタイム確認 ====================
  async function getVRCFavoriteRecordIdRealtime(worldId) {
    try {
      if (DEBUG_LOG) {
        console.log('[Favorites] 🔍 Checking realtime favorite status for:', worldId);
      }

      const response = await chrome.runtime.sendMessage({
        type: 'getVRCFavoriteInfo',
        worldId: worldId
      });

      if (DEBUG_LOG) {
        console.log('[Favorites] 🔍 Realtime check response:', response);
      }

      if (response.success && response.favorited) {
        if (DEBUG_LOG) {
          console.log('[Favorites] ✓ Found in VRC favorites:', response.favoriteRecordId);
        }
        return response.favoriteRecordId;
      } else {
        if (DEBUG_LOG) {
          console.log('[Favorites] ✗ Not in VRC favorites');
        }
        return null;
      }
    } catch (error) {
      console.error('[Favorites] Failed to check favorite status:', error);
      return null;
    }
  }

  // ==================== Favoritesボタン作成 ====================
  function createFavoritesButton(worldId, card) {
    const vrcWorld = getVRCWorldData(worldId);

    let currentFavoriteId = vrcWorld?.favoriteRecordId || null;
    let isFavorited = !!vrcWorld;

    if (DEBUG_LOG) {
      console.log('[Favorites] 🎯 createFavoritesButton:', {
        worldId,
        isFavorited,
        currentFavoriteId,
        vrcWorld: vrcWorld ? { id: vrcWorld.id, folderId: vrcWorld.folderId } : null
      });
    }

    const btn = createControlButton(
      isFavorited ? '★' : '☆',
      t('favoritesBtn'),
      async () => {
        const btn = event.currentTarget;
        const iconContainer = btn.querySelector('.btn-icon');
        const labelSpan = btn.querySelector('span:last-child');
        const originalIcon = iconContainer.textContent;

        if (!worldId) {
          showNotification(t('worldIdUnresolved'), 'error');
          return;
        }

        if (DEBUG_LOG) {
          console.log('[Favorites] 📘 Button clicked:', {
            worldId,
            originalIcon,
            currentCachedState: isFavorited
          });
        }

        iconContainer.textContent = '⏳';
        setButtonLoading(btn, true);
        btn.disabled = true;

        const realtimeFavoriteId = await getVRCFavoriteRecordIdRealtime(worldId);

        if (DEBUG_LOG) {
          console.log('[Favorites] 🔍 Realtime result:', {
            worldId,
            realtimeFavoriteId,
            willDelete: !!realtimeFavoriteId,
            willAdd: !realtimeFavoriteId
          });
        }

        if (realtimeFavoriteId) {
          if (DEBUG_LOG) {
            console.log('[Favorites] 🗑️ Starting DELETE process');
          }

          try {
            const response = await chrome.runtime.sendMessage({
              type: 'deleteVRCFavorite',
              favoriteRecordId: realtimeFavoriteId
            });

            if (response.success) {
              iconContainer.textContent = '☆';
              labelSpan.textContent = t('favoritesBtn');
              updateButtonColorScheme(btn, 'PRIMARY');
              showButtonSuccess(btn, '☆');
              showNotification(t('deleteSuccess'), 'success');

              vrcWorlds = vrcWorlds.filter(w => w.id !== worldId);
              if (DEBUG_LOG) {
                console.log('[Favorites] Removed from cache:', worldId);
              }

              isFavorited = false;
              currentFavoriteId = null;

              updateDeleteButtonState(card, worldId, false);

            } else {
              if (isAlreadyDeletedError(response.error)) {
                if (DEBUG_LOG) {
                  console.log('[Favorites] ℹ️ Favorite already deleted (400)');
                }

                iconContainer.textContent = '☆';
                labelSpan.textContent = t('favoritesBtn');
                updateButtonColorScheme(btn, 'PRIMARY');
                showButtonSuccess(btn, '☆');
                showNotification(t('alreadyDeleted'), 'info');

                vrcWorlds = vrcWorlds.filter(w => w.id !== worldId);
                isFavorited = false;
                currentFavoriteId = null;
                updateDeleteButtonState(card, worldId, false);
              } else {
                throw new Error(response.error || 'Unknown error');
              }
            }

          } catch (error) {
            showNotification(t('vrcDeleteFailed', { error: error.message }), 'error');
            iconContainer.textContent = '✖';
            setTimeout(() => {
              iconContainer.textContent = originalIcon;
            }, TIMEOUTS.BUTTON_FEEDBACK);
          }

        } else {
          if (DEBUG_LOG) {
            console.log('[Favorites] ➕ Starting ADD process');
          }

          try {
            const folderId = await showVRCFolderSelectModal(worldId, card);

            if (DEBUG_LOG) {
              console.log('[Favorites] Adding to favorites:', { worldId, folderId });
            }

            const response = await chrome.runtime.sendMessage({
              type: 'addVRCFavorite',
              worldId: worldId,
              folderId: folderId
            });

            if (response.success) {
              iconContainer.textContent = '★';
              labelSpan.textContent = t('favoritesBtn');
              updateButtonColorScheme(btn, 'SAVED');
              showButtonSuccess(btn, '★');
              showNotification(t('addToFavorites'), 'success');

              isFavorited = true;
              currentFavoriteId = response.favoriteRecordId;
              btn.dataset.favoriteId = response.favoriteRecordId;

              vrcWorlds = vrcWorlds.filter(w => w.id !== worldId);
              vrcWorlds.push({
                id: worldId,
                favoriteRecordId: response.favoriteRecordId,
                folderId: folderId
              });
              if (DEBUG_LOG) {
                console.log('[Favorites] Added to cache:', response.favoriteRecordId);
              }

            } else {
              if (response.error && response.error.includes('400')) {
                if (DEBUG_LOG) {
                  console.log('[Favorites] ⚠️ Got 400 error - already favorited');
                }
                showNotification(t('alreadyFavoritedError'), 'info');
                iconContainer.textContent = '★';
                labelSpan.textContent = t('favoritesBtn');
                updateButtonColorScheme(btn, 'SAVED');
                return;
              }

              if (isPrivateWorldError(response.error)) {
                if (DEBUG_LOG) {
                  console.log('[Favorites] ⚠️ Got 403 error - private world');
                }
                showNotification(t('privateWorldCannotAdd'), 'warning');
                iconContainer.textContent = '🔒';
                setTimeout(() => {
                  iconContainer.textContent = originalIcon;
                }, TIMEOUTS.BUTTON_FEEDBACK);
                return;
              }

              if (response.error) {
                const errorMsg = response.error || 'Unknown error';
                showNotification(t('addToFavoritesFailed', { error: errorMsg }), 'error');
                iconContainer.textContent = '✖';
                setTimeout(() => {
                  iconContainer.textContent = originalIcon;
                }, TIMEOUTS.BUTTON_FEEDBACK);
              }
            }
          } catch (error) {
            if (error.message !== 'Cancelled') {
              showNotification(t('addToFavoritesFailed', { error: error.message }), 'error');
              iconContainer.textContent = '✖';
              setTimeout(() => {
                iconContainer.textContent = originalIcon;
              }, TIMEOUTS.BUTTON_FEEDBACK);
            } else {
              if (DEBUG_LOG) {
                console.log('[Favorites] User cancelled folder selection');
              }
              iconContainer.textContent = originalIcon;
            }
          }
        }

        setButtonLoading(btn, false);
        btn.disabled = false;

        setTimeout(() => {
          iconContainer.textContent = isFavorited ? '★' : '☆';
          updateButtonColorScheme(btn, isFavorited ? 'SAVED' : 'PRIMARY');

          if (DEBUG_LOG) {
            console.log('[Favorites] 🎯 Final state:', {
              worldId,
              isFavorited,
              icon: iconContainer.textContent
            });
          }
        }, TIMEOUTS.BUTTON_FEEDBACK);

      },
      false,
      isFavorited ? 'SAVED' : 'PRIMARY'
    );

    btn.dataset.worldId = worldId || '';
    btn.dataset.favoriteId = currentFavoriteId || '';

    return btn;
  }

  // ==================== 削除ボタン作成 ====================
  function createDeleteButton(favoriteId, card, forceEnable = false, worldId = null) {
    const disabled = !forceEnable && !favoriteId;

    let currentFavoriteId = favoriteId;

    if (!currentFavoriteId && worldId) {
      const vrcWorld = getVRCWorldData(worldId);
      currentFavoriteId = vrcWorld?.favoriteRecordId || null;
      if (DEBUG_LOG) {
        console.log('[Favorites] createDeleteButton (cached):', { worldId, currentFavoriteId });
      }
    }

    let confirmTimeout = null;

    const btn = createControlButton(
      '🗑',
      t('deleteBtn'),
      async () => {
        const btn = event.currentTarget;
        const iconContainer = btn.querySelector('.btn-icon');
        const labelSpan = btn.querySelector('span:last-child');
        const originalIcon = '🗑';
        const originalLabel = t('deleteBtn');

        if (forceEnable && worldId) {
          const realtimeFavoriteId = await getVRCFavoriteRecordIdRealtime(worldId);

          if (!realtimeFavoriteId) {
            showNotification(t('notInFavorites'), 'info');
            return;
          }

          currentFavoriteId = realtimeFavoriteId;
          if (DEBUG_LOG) {
            console.log('[Favorites] Delete button realtime check:', { worldId, currentFavoriteId });
          }
        }

        if (!currentFavoriteId) {
          showNotification(t('notInFavorites'), 'info');
          return;
        }

        if (btn.dataset.confirming !== 'true') {
          btn.dataset.confirming = 'true';
          updateButtonColorScheme(btn, 'DANGER_CONFIRM');
          iconContainer.textContent = '⚠';
          labelSpan.textContent = t('deleteConfirm');
          confirmTimeout = setTimeout(() => {
            if (btn.dataset.confirming === 'true') {
              btn.dataset.confirming = 'false';
              updateButtonColorScheme(btn, 'DANGER');
              iconContainer.textContent = originalIcon;
              labelSpan.textContent = originalLabel;
            }
          }, TIMEOUTS.DELETE_CONFIRM_TIMEOUT);
          return;
        }

        clearTimeout(confirmTimeout);
        btn.dataset.confirming = 'false';
        iconContainer.textContent = '⏳';
        setButtonLoading(btn, true);
        btn.disabled = true;

        try {
          if (DEBUG_LOG) {
            console.log('[Favorites] Deleting favorite:', currentFavoriteId);
          }

          const response = await chrome.runtime.sendMessage({
            type: 'deleteVRCFavorite',
            favoriteRecordId: currentFavoriteId
          });

          if (response.success) {
            updateFavoritesButtonState(card, worldId, false);

            iconContainer.textContent = '✓';
            showButtonSuccess(btn, '✓');
            showNotification(t('deleteSuccess'), 'success');

            vrcWorlds = vrcWorlds.filter(w => w.id !== worldId);
            if (DEBUG_LOG) {
              console.log('[Favorites] Removed from cache (delete button):', worldId);
            }

            const isFavoritesPage = !!card.querySelector('button[id^="Tooltip-Unfavorite-"]');
            if (isFavoritesPage) {
              setTimeout(() => {
                card.style.transition = `opacity ${TIMEOUTS.CARD_FADE}ms ease-out`;
                card.style.opacity = '0';
                setTimeout(() => {
                  card.remove();
                }, TIMEOUTS.CARD_FADE);
              }, 1000);
            }

          } else {
            if (isAlreadyDeletedError(response.error)) {
              if (DEBUG_LOG) {
                console.log('[Favorites] ℹ️ Favorite already deleted (400)');
              }

              iconContainer.textContent = '☆';
              labelSpan.textContent = t('favoritesBtn');
              updateButtonColorScheme(btn, 'PRIMARY');
              showButtonSuccess(btn, '☆');
              showNotification(t('alreadyDeleted'), 'info');

              vrcWorlds = vrcWorlds.filter(w => w.id !== worldId);

              const isFavoritesPage = !!card.querySelector('button[id^="Tooltip-Unfavorite-"]');
              if (isFavoritesPage) {
                setTimeout(() => {
                  card.style.transition = `opacity ${TIMEOUTS.CARD_FADE}ms ease-out`;
                  card.style.opacity = '0';
                  setTimeout(() => {
                    card.remove();
                  }, TIMEOUTS.CARD_FADE);
                }, 1000);
              }
              return;
            }

            throw new Error(response.error || 'Unknown error');
          }

        } catch (error) {
          showNotification(t('vrcDeleteFailed', { error: error.message }), 'error');
          iconContainer.textContent = '✖';
          setTimeout(() => {
            iconContainer.textContent = originalIcon;
            labelSpan.textContent = originalLabel;
            updateButtonColorScheme(btn, 'DANGER');
          }, TIMEOUTS.BUTTON_FEEDBACK);
        } finally {
          setButtonLoading(btn, false);
          setTimeout(() => {
            iconContainer.textContent = originalIcon;
            labelSpan.textContent = originalLabel;
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

  // page-favorites.js v1.2.1 後半
  // ==================== データロード ====================
  async function loadSavedWorlds() {
    try {
      if (!checkExtensionContext()) {
        return;
      }
      const response = await chrome.runtime.sendMessage({ type: 'getAllWorlds' });
      if (response?.worlds) {
        SAVED_WORLD_IDS = new Set(response.worlds.map(w => w.id));
        if (DEBUG_LOG) {
          console.log('[Favorites] Loaded saved worlds:', SAVED_WORLD_IDS.size);
        }
      }
    } catch (error) {
      if (isExtensionInvalidatedError(error)) {
        return;
      }
      console.error('[Favorites] Failed to load saved worlds:', error);
    }
  }

  async function loadFolders() {
    try {
      if (!checkExtensionContext()) {
        return;
      }
      const response = await chrome.runtime.sendMessage({ type: 'getFolders' });
      if (response.error) {
        console.error('[Favorites] Error loading folders:', response.error);
        return;
      }
      VRC_FOLDERS = response.vrcFolders || [];
      EXT_FOLDERS = response.folders || [];
      if (DEBUG_LOG) {
        console.log('[Favorites] Loaded folders:', { VRC_FOLDERS, EXT_FOLDERS });
      }
    } catch (error) {
      if (!isExtensionInvalidatedError(error)) {
        console.error('[Favorites] Failed to load folders:', error);
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
        if (response.status === 401) {
          if (DEBUG_LOG) {
            console.log('[Favorites] Not logged in to VRChat (401)');
          }
          VRC_FOLDERS = [];
          return;
        }
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

      if (DEBUG_LOG) {
        console.log('[Favorites] Loaded VRC folders from API:', VRC_FOLDERS.length);
      }
    } catch (error) {
      if (!error.message.includes('401')) {
        console.error('[Favorites] Failed to load VRC folders:', error);
      }
      VRC_FOLDERS = [];
    }
  }

  async function loadVRCWorlds() {
    try {
      if (!checkExtensionContext()) {
        return;
      }

      if (DEBUG_LOG) {
        console.log('[Favorites] 📂 Loading VRC worlds from storage...');
      }

      const response = await chrome.runtime.sendMessage({ type: 'getVRCWorlds' });

      if (response?.vrcWorlds) {
        vrcWorlds = response.vrcWorlds;

        if (DEBUG_LOG) {
          console.log('[Favorites] ✅ Loaded vrcWorlds:', vrcWorlds.length);

          const withFavId = vrcWorlds.filter(w => w.favoriteRecordId);
          const withoutFavId = vrcWorlds.filter(w => !w.favoriteRecordId);

          console.log('[Favorites] 📊 Statistics:', {
            total: vrcWorlds.length,
            withFavoriteRecordId: withFavId.length,
            withoutFavoriteRecordId: withoutFavId.length
          });

          if (withoutFavId.length > 0) {
            console.warn('[Favorites] ⚠️ Some worlds missing favoriteRecordId');
            console.table(withoutFavId.slice(0, 5).map(w => ({
              id: w.id,
              folderId: w.folderId,
              hasFavoriteRecordId: !!w.favoriteRecordId
            })));
            console.log('[Favorites] 💡 Tip: favoriteRecordId will be populated when favorites are added via this interface');
          }
        }

        if (vrcWorlds.length > 0) {
          if (DEBUG_LOG) {
            console.log('[Favorites] 📖 Loading world details...');
          }
          const worldIds = vrcWorlds.map(w => w.id);
          const detailsMap = await getWorldDetailsBatch(worldIds);

          if (DEBUG_LOG) {
            const detailsCount = Object.keys(detailsMap).length;
            console.log('[Favorites] ✅ Loaded world details:', detailsCount);
          }
        }

      } else {
        console.warn('[Favorites] No VRC worlds in response:', response);
        vrcWorlds = [];
      }
    } catch (error) {
      if (!isExtensionInvalidatedError(error)) {
        console.error('[Favorites] Failed to load VRC worlds:', error);
      }
      vrcWorlds = [];
    }
  }

  // ==================== URL監視 ====================
  function watchChanges() {
    setInterval(() => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        if (currentUrl.includes('/favorites/world/') || currentUrl.includes('/home')) {
          resetAndReload();
        }
      }

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
    if (DEBUG_LOG) {
      console.log('[Favorites] Favorites view changed. Resetting processed cards.');
    }
    PROCESSED_CARDS = new WeakSet();
    setTimeout(() => {
      loadFavoritesManually().then(() => checkForWorldCards());
    }, TIMEOUTS.RELOAD_DELAY);
  }

  // ==================== Fetch Interception ====================
  window.fetch = async (...args) => {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    const response = await origFetch(...args);

    if (url?.includes('/api/1/favorites')) {
      try {
        const clone = response.clone();
        processFavoritesData(await clone.json());
        setTimeout(() => checkForWorldCards(), TIMEOUTS.API_CALL_DELAY);
      } catch (error) {
        if (DEBUG_LOG) {
          console.error('[Favorites] Failed to process favorites response:', error);
        }
      }
    }

    if (url?.includes('/api/1/worlds/wrld_')) {
      try {
        const clone = response.clone();
        const worldData = await clone.json();
        if (worldData?.id && worldData?.name) {
          RESOLVED_WORLDS.set(worldData.id, worldData);
          updateAllMatchingCards(worldData.id, worldData);
        }
      } catch (error) {
        if (DEBUG_LOG) {
          console.error('[Favorites] Failed to process world response:', error);
        }
      }
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

    if (DEBUG_LOG) {
      console.log(`[Favorites] 🌐 Fetching world info for: ${worldId}`);
    }

    try {
      const res = await origFetch(`${API_BASE}/worlds/${worldId}`, { credentials: 'include' });

      if (DEBUG_LOG) {
        console.log(`[Favorites] 📡 Response status for ${worldId}: ${res.status}`);
      }

      let data;
      if (res.ok) {
        data = await res.json();
        if (DEBUG_LOG) {
          console.log(`[Favorites] ✅ Successfully fetched ${worldId}`);
        }
      } else if (res.status === 404) {
        if (DEBUG_LOG) {
          console.log(`[Favorites] 🗑️ World ${worldId} is deleted (404)`);
        }
        data = { id: worldId, name: '[Deleted]', deleted: true };
      } else if (res.status === 403) {
        if (DEBUG_LOG) {
          console.log(`[Favorites] 🔒 World ${worldId} is private or inaccessible (403)`);
        }
        data = { id: worldId, name: '[Private]', private: true };
      } else {
        console.warn(`[Favorites] ⚠️ Unexpected status ${res.status} for ${worldId}`);
        data = { id: worldId, name: `[Error ${res.status}]`, error: true };
      }

      RESOLVED_WORLDS.set(worldId, data);
      updateAllMatchingCards(worldId, data);

    } catch (error) {
      console.warn(`[Favorites] ⚠️ Network error for ${worldId}:`, error.message);

      const fallbackData = {
        id: worldId,
        name: '[Connection Error]',
        fetchError: true
      };
      RESOLVED_WORLDS.set(worldId, fallbackData);
      updateAllMatchingCards(worldId, fallbackData);
    }
  }

  // ==================== ボタン作成 ====================
  function addControlButtons(card) {
    if (PROCESSED_CARDS.has(card)) return;

    const unfavBtn = card.querySelector('button[id^="Tooltip-Unfavorite-"]');
    const isFavoritesPage = !!unfavBtn;

    let favoriteId = null;
    let worldId = null;

    if (isFavoritesPage) {
      favoriteId = unfavBtn.id.replace('Tooltip-Unfavorite-', '');
      if (!favoriteId) return;
      worldId = FAVORITE_ID_TO_WORLD_ID.get(favoriteId);
    } else {
      const scrollKey = card.getAttribute('data-scrollkey');
      if (scrollKey && scrollKey.startsWith('wrld_')) {
        worldId = scrollKey;
      } else {
        const link = card.querySelector('a[href*="/home/world/wrld_"]');
        if (link) {
          const match = link.href.match(/\/home\/world\/(wrld_[a-zA-Z0-9-]+)/);
          if (match) worldId = match[1];
        }
      }

      if (!worldId) return;
    }

    if (DEBUG_LOG) {
      console.log('[Favorites] addControlButtons:', {
        worldId,
        isFavoritesPage,
        vrcWorldsCount: vrcWorlds?.length || 0
      });
    }

    card.style.position = 'relative';
    card.style.minHeight = '384px';
    card.style.height = 'auto';

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

    const saveBtn = createSaveButton(worldId, card);
    const linkBtn = createLinkButton(worldId, favoriteId);

    let thirdBtn;
    let fourthBtn;

    if (isFavoritesPage) {
      thirdBtn = document.createElement('div');
      thirdBtn.style.cssText = `flex: 1; padding: 6px 4px; border: 1px solid transparent; border-radius: 6px; min-width: 0;`;
      fourthBtn = createDeleteButton(favoriteId, card, false, worldId);
    } else {
      thirdBtn = createFavoritesButton(worldId, card);
      fourthBtn = createDeleteButton(null, card, true, worldId);
    }

    container.appendChild(saveBtn);
    container.appendChild(linkBtn);
    container.appendChild(thirdBtn);
    container.appendChild(fourthBtn);

    card.appendChild(container);

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

  function updateButtonColorScheme(btn, colorScheme) {
    const colors = COLORS[colorScheme] || COLORS.PRIMARY;
    btn.dataset.colorScheme = colorScheme;
    btn.style.background = colors.BG;
    btn.style.borderColor = colors.BORDER;
    btn.style.color = colors.TEXT;
  }

  function setButtonLoading(btn, isLoading) {
    const iconContainer = btn.querySelector('.btn-icon');
    if (!iconContainer) return;

    if (isLoading) {
      iconContainer.classList.add('spinning');
      const existingCheck = iconContainer.querySelector('.btn-check');
      if (existingCheck) existingCheck.remove();
    } else {
      iconContainer.classList.remove('spinning');
    }
  }

  function showButtonSuccess(btn, originalIcon) {
    const iconContainer = btn.querySelector('.btn-icon');
    if (!iconContainer) return;

    iconContainer.classList.remove('spinning');

    const checkMark = document.createElement('span');
    checkMark.className = 'btn-check';
    checkMark.textContent = '✓';
    iconContainer.appendChild(checkMark);

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
      t('chromeSaveBtn'),
      async () => {
        const iconContainer = btn.querySelector('.btn-icon');
        const originalIcon = iconContainer.textContent;

        if (!worldId) {
          showNotification(t('worldIdResolving'), 'info');
          btn.disabled = true;
          iconContainer.textContent = '⏳';
          setButtonLoading(btn, true);

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
            showNotification(t('worldIdResolveFailed'), 'error');
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
      false,
      isSaved ? 'SAVED' : 'PRIMARY'
    );

    btn.dataset.buttonType = 'save';
    btn.dataset.worldId = worldId || '';
    return btn;
  }

  function updateSaveButtonDisplay(btn, worldId) {
    const iconContainer = btn.querySelector('.btn-icon');
    const labelSpan = btn.querySelector('span:last-child');

    if (!iconContainer || !labelSpan) return;

    if (!worldId) {
      iconContainer.textContent = '☐';
      labelSpan.textContent = t('chromeSaveBtn');
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.pointerEvents = 'none';
      updateButtonColorScheme(btn, 'PRIMARY');
      return;
    }

    const isSaved = SAVED_WORLD_IDS.has(worldId);
    iconContainer.textContent = isSaved ? '☑' : '☐';
    labelSpan.textContent = t('chromeSaveBtn');
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
    updateButtonColorScheme(btn, isSaved ? 'SAVED' : 'PRIMARY');
  }

  function createLinkButton(worldId, favoriteId) {
    return createControlButton('🔗', t('copyLinkBtn'), async () => {
      const wid = worldId || FAVORITE_ID_TO_WORLD_ID.get(favoriteId);
      if (!wid) {
        showNotification(t('worldIdUnresolved'), 'error');
        return;
      }

      const btn = event.currentTarget;
      const iconContainer = btn.querySelector('.btn-icon');
      const originalIcon = iconContainer.textContent;

      await navigator.clipboard.writeText(`https://vrchat.com/home/world/${wid}`);
      iconContainer.textContent = '🔗';
      showButtonSuccess(btn, originalIcon);
      showNotification(t('linkCopied'), 'success');

      setTimeout(() => {
        iconContainer.textContent = originalIcon;
      }, TIMEOUTS.BUTTON_FEEDBACK);
    });
  }

  // ==================== ボタン状態更新ヘルパー ====================
  function updateFavoritesButtonState(card, worldId, isFavorited) {
    const favBtn = card.querySelector('.vrc-control-buttons .vrc-control-btn:nth-child(3)');
    if (favBtn && favBtn.querySelector('.btn-icon')) {
      const iconContainer = favBtn.querySelector('.btn-icon');
      const labelSpan = favBtn.querySelector('span:last-child');
      iconContainer.textContent = isFavorited ? '★' : '☆';
      if (labelSpan) labelSpan.textContent = t('favoritesBtn');
      updateButtonColorScheme(favBtn, isFavorited ? 'SAVED' : 'PRIMARY');
    }
  }

  function updateDeleteButtonState(card, worldId, hasData) {
    const deleteBtn = card.querySelector('.vrc-control-buttons .vrc-control-btn:last-child');
    if (deleteBtn && deleteBtn.querySelector('.btn-icon')) {
      const iconContainer = deleteBtn.querySelector('.btn-icon');
      const labelSpan = deleteBtn.querySelector('span:last-child');
      if (iconContainer && labelSpan) {
        iconContainer.textContent = '🗑';
        labelSpan.textContent = t('deleteBtn');
        deleteBtn.dataset.confirming = 'false';
        updateButtonColorScheme(deleteBtn, 'DANGER');
      }
    }
  }

  // ==================== モーダル ====================
  async function showVRCFolderSelectModal(worldId, card) {
    const worldName = await getWorldName(worldId);

    const folders = VRC_FOLDERS.map(f => ({
      id: f.id,
      name: f.displayName,
      class: 'vrc'
    }));

    return new Promise((resolve, reject) => {
      showFolderSelectModal({
        title: t('selectVRCFolder'),
        description: t('selectVRCFolderDesc', { name: worldName }),
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

  async function showExtFolderModal(worldId, card) {
    const worldName = await getWorldName(worldId);

    const folders = [
      { id: 'none', name: t('uncategorized'), class: 'none' },
      ...EXT_FOLDERS.map(f => ({ id: f.id, name: f.name, class: '' })),
      ...VRC_FOLDERS.map(f => ({ id: f.id, name: f.displayName, class: 'vrc' }))
    ];

    return new Promise((resolve) => {
      showFolderSelectModal({
        title: t('selectExtFolder'),
        description: t('selectExtFolderDesc', { name: worldName }),
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
    const worldName = await getWorldName(worldId);

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
        showNotification(t('savedSuccess', { name: worldData.name }), 'success');
        updateSaveButtonInCard(card, worldId, true);
      } else if (response.reason === 'already_exists') {
        showNotification(t('alreadySaved'), 'info');
        SAVED_WORLD_IDS.add(worldId);
        updateSaveButtonInCard(card, worldId, true);
      } else if (response.reason === 'private_world') {
        showNotification(t('privateWorldError', { name: response.worldName }), 'error');
      } else {
        showNotification(t('addFailed'), 'error');
      }
    } catch (error) {
      console.error('[Favorites] Failed to add to extension:', error);
      if (isExtensionInvalidatedError(error)) {
        showNotification(t('extInvalidated'), 'info');
      } else {
        showNotification(t('addFailed'), 'error');
      }
    }
  }

  async function deleteFromExtension(worldId) {
    if (!SAVED_WORLD_IDS.has(worldId)) return;

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
        SAVED_WORLD_IDS.delete(worldId);
        showNotification(t('removedSuccess'), 'success');

        document.querySelectorAll('.vrc-control-btn[data-button-type="save"][data-world-id="' + worldId + '"]').forEach(btn => {
          updateSaveButtonDisplay(btn, worldId);
        });
      } else {
        showNotification(t('deleteFailed'), 'error');
      }
    } catch (error) {
      console.error('[Favorites] Failed to delete from extension:', error);
      if (isExtensionInvalidatedError(error)) {
        showNotification(t('extInvalidated'), 'info');
      } else {
        showNotification(t('deleteFailed'), 'error');
      }
    }
  }

  function updateSaveButtonInCard(card, worldId, isSaved) {
    const saveBtn = card.querySelector('.vrc-control-btn[data-button-type="save"][data-world-id]');
    if (saveBtn) {
      saveBtn.dataset.worldId = worldId;
      updateSaveButtonDisplay(saveBtn, worldId);
    }
  }

  // ==================== カード更新 ====================
  function updateCard(card, worldId, data) {
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
    } else if (data.private) {
      const titleH4 = card.querySelector('h4');
      if (titleH4 && worldId) {
        titleH4.innerHTML = `🔒 [Private]<br><small style="font-size: 10px;">${worldId}</small>`;
        titleH4.style.color = '#f9e36a';
        titleH4.title = `World ID: ${worldId} (Private world)`;
        titleH4.parentElement.style.whiteSpace = 'normal';
      }

      const images = card.querySelectorAll('img[alt="???"]');
      images.forEach(img => {
        img.alt = '[Private]';
        img.src = "https://assets.vrchat.com/default/private-world.png";
      });
    } else if (data.fetchError) {
      const titleH4 = card.querySelector('h4');
      if (titleH4 && worldId) {
        titleH4.innerHTML = `⚠️ [Connection Error]<br><small style="font-size: 10px;">${worldId}</small>`;
        titleH4.style.color = '#f96a6a';
        titleH4.title = `World ID: ${worldId} (Failed to fetch info)`;
        titleH4.parentElement.style.whiteSpace = 'normal';
      }
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

    const saveBtn = card.querySelector('.vrc-control-btn[data-button-type="save"][data-world-id]');
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

  // ==================== DOM監視 ====================
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
    } catch (error) {
      console.error('[Favorites] Error loading favorites:', error);
    } finally {
      isLoadingFavorites = false;
    }
  }

  // ==================== 初期化 ====================
  async function init() {
    // 拡張機能コンテキストチェック
    if (!checkExtensionContext()) {
      if (DEBUG_LOG) {
        console.log('[Favorites] Extension context invalidated. Stopping script.');
      }
      return;
    }

    const isEnabled = await checkExtensionSettings();
    if (!isEnabled) {
      if (DEBUG_LOG) {
        console.log('[Favorites] Script execution stopped by settings.');
      }
      return;
    }

    if (!document.body) {
      setTimeout(init, 100);
      return;
    }

    if (DEBUG_LOG) {
      console.log('[Favorites] Initializing...');
    }

    await Promise.all([
      initContentScriptSettings(),
      loadSavedWorlds(),
      loadFolders(),
      loadVRCFolders(),
      loadVRCWorlds()
    ]);

    if (DEBUG_LOG) {
      console.log('[Favorites] ✓ Initialization complete');
      console.log('[Favorites] VRC worlds loaded:', vrcWorlds?.length || 0);
    }

    watchSettingsChanges(() => {
      if (DEBUG_LOG) {
        console.log('[Favorites] Language changed, reprocessing cards...');
      }
      PROCESSED_CARDS = new WeakSet();
      checkForWorldCards();
    });

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

  // ==================== アニメーションスタイル ====================
  const style = document.createElement('style');
  style.textContent = `
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

  // ==================== 起動処理 ====================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  if (DEBUG_LOG) {
    console.log('[Favorites] Script ready');
  }

})();