console.log("[VRC Resolver] Favorites Page Script v4.5 - Final Layout & Link Fix");

(function() {
  'use strict';

  // === グローバル状態と定数 ===
  const RESOLVED_WORLDS = new Map();
  const FAVORITE_ID_TO_WORLD_ID = new Map();
  let PROCESSED_CARDS = new WeakSet();
  let SAVED_WORLD_IDS = new Set();
  let currentUrl = window.location.href;
  let isLoadingFavorites = false;
  let currentDropdownText = '';
  let pendingFavoriteId = null; // フォルダ移動モーダル用

  // VRChatのお気に入りフォルダ（タグ）の仮データ
  const VRC_FOLDERS = [
      { id: 'group_1', name: 'VRChat.1', isSync: false },
      { id: 'group_2', name: 'VRChat.2', isSync: false },
      { id: 'group_3', name: 'VRChat.3', isSync: false },
      { id: 'group_4', name: 'VRChat.4 (Sync Mock)', isSync: true } // VRChat.4をsyncのモックとして使用
  ];

  // 元のfetch関数を保持
  const origFetch = window.fetch;

  // === 監視・リロードロジック ===

  function watchChanges() {
    setInterval(() => {
      // URL変更の監視
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        if (currentUrl.includes('/favorites/world/') || currentUrl.includes('/home')) {
          resetAndReload();
        }
      }

      // ドロップダウン変更の監視
      const dropdown = document.querySelector('[aria-label="Favorite Collection Selector"] [role="note"]');
      if (dropdown) {
        const newText = dropdown.textContent.trim();
        if (newText && newText !== currentDropdownText) {
          currentDropdownText = newText;
          resetAndReload();
        }
      }
    }, 500);
  }

  function resetAndReload() {
    console.log('[Favorites] Favorites view changed. Resetting processed cards.');
    PROCESSED_CARDS = new WeakSet();
    setTimeout(() => {
      loadFavoritesManually().then(() => checkForWorldCards());
    }, 500);
  }

  // === データ処理・キャッシュ ===

  // Saved Worldsの読み込み
  async function loadSavedWorlds() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'getSavedWorlds' });
      if (response?.worlds) {
        SAVED_WORLD_IDS = new Set(response.worlds.map(w => w.id));
      }
    } catch (e) {
      console.error('[Favorites] Failed to communicate with background:', e);
    }
  }

  // Fetchの横取り（APIレスポンスからお気に入り情報を抽出）
  window.fetch = async (...args) => {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    const response = await origFetch(...args);

    if (url?.includes('/api/1/favorites')) {
      try {
        const clone = response.clone();
        processFavoritesData(await clone.json());
        setTimeout(() => checkForWorldCards(), 300);
      } catch {}
    }

    if (url?.includes('/api/1/worlds/wrld_')) {
      try {
        const clone = response.clone();
        const worldData = await clone.json();
        if (worldData?.id && worldData?.name) {
          RESOLVED_WORLDS.set(worldData.id, worldData);
          updateAllMatchingCards(worldData.id, worldData);
        }
      } catch {}
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
      const res = await origFetch(`https://vrchat.com/api/1/worlds/${worldId}`, { credentials: 'include' });

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

  // === DOM操作とボタン生成 ===

  /**
   * World Cardにコントロールボタンを追加し、レイアウトを調整する。
   */
  function addControlButtons(card) {
    if (PROCESSED_CARDS.has(card)) return;

    // Favorite IDの取得
    const unfavBtn = card.querySelector('button[id^="Tooltip-Unfavorite-"]');
    if (!unfavBtn) return;
    const favoriteId = unfavBtn.id.replace('Tooltip-Unfavorite-', '');
    if (!favoriteId) return;

    // レイアウト修正 (ホバーずれ修正)
    card.style.position = 'relative';
    const statsContainer = card.querySelector('.flex-grow-1.css-kfjcvw.e18c1r7j40');
    if (statsContainer) {
        statsContainer.style.paddingBottom = '40px';
    }

    PROCESSED_CARDS.add(card);

    const worldId = FAVORITE_ID_TO_WORLD_ID.get(favoriteId);

    // === ボタンコンテナ（下端固定） ===
    const container = document.createElement('div');
    container.className = 'vrc-fixed-controls';
    container.style.cssText = `
      position: absolute; bottom: 8px; right: 8px;
      display: flex; gap: 6px;
      background: transparent; border-radius: 8px;
      padding: 4px 6px; z-index: 5;
    `;

    // === 統一されたボタンセットの追加 ===

    // 1. 拡張機能に保存 (Save to Extension)
    const saveBtn = createSaveButton(worldId, card);
    
    // 2. 情報を更新 (Refresh Info)
    const refreshBtn = createButton('🔄', '情報を更新', async () => {
        await resolveWorld(favoriteId, card, refreshBtn);
    });

    // 3. URLをコピー (Copy URL)
    const linkBtn = createButton('🔗', 'URLをコピー', async () => {
        const wid = FAVORITE_ID_TO_WORLD_ID.get(favoriteId);
        if (!wid) return alert('World IDが未解決です。🔄を押して解決してください。');
        await navigator.clipboard.writeText(`https://vrchat.com/home/world/${wid}`);
        linkBtn.textContent = '✓';
        setTimeout(() => (linkBtn.textContent = '🔗'), 1500);
    });
    
    // 4. フォルダ移動 (Move Folder)
    const moveBtn = createButton('➡️', 'フォルダ移動', () => {
        openMoveFolderModal(favoriteId, card);
    });

    // 5. セパレーター (Spacer)
    const spacer = document.createElement('div');
    spacer.style.width = '8px';

    // 6. 削除 (Unfavorite)
    const deleteBtn = createUnfavoriteButton(favoriteId, card);


    container.appendChild(saveBtn);
    container.appendChild(refreshBtn);
    container.appendChild(linkBtn);
    container.appendChild(moveBtn);
    container.appendChild(spacer); // ⬅️ ボタン1つ分のスペース
    container.appendChild(deleteBtn);
    
    card.appendChild(container);

    // 解決済みデータがある場合は、ここでカードを更新
    const worldData = worldId ? RESOLVED_WORLDS.get(worldId) : null;
    if (worldId && worldData) {
        updateCard(card, worldId, worldData);
    }
  }

  // World IDがないカードに対して手動で解決を試みる
  async function resolveWorld(favoriteId, card, btn) {
    try {
      btn.disabled = true;
      btn.textContent = '⏳';
      let worldId = FAVORITE_ID_TO_WORLD_ID.get(favoriteId);

      if (!worldId) {
        await loadFavoritesManually();
        worldId = FAVORITE_ID_TO_WORLD_ID.get(favoriteId);
      }
      if (!worldId) throw new Error('World ID not found');

      let data = RESOLVED_WORLDS.get(worldId);
      if (!data) {
        const res = await origFetch(`https://vrchat.com/api/1/worlds/${worldId}`, { credentials: 'include' });
        if (res.status === 404) {
            data = { id: worldId, name: '[Deleted]', deleted: true };
        } else {
            data = await res.json();
        }
        RESOLVED_WORLDS.set(worldId, data);
      }

      updateCard(card, worldId, data);
      
      const saveBtn = card.querySelector('.vrc-fixed-controls > button[title*="保存"]');
      if (saveBtn) updateSaveButtonDisplay(saveBtn, worldId);

      btn.textContent = '✓';
    } catch (e) {
      alert(`Error resolving world: ${e.message}`);
      btn.textContent = '❌';
    } finally {
      setTimeout(() => {
        btn.textContent = '🔄';
        btn.disabled = false;
      }, 1500);
    }
  }

  // Saveボタンの生成
  function createSaveButton(worldId, card) {
    const isSaved = worldId ? SAVED_WORLD_IDS.has(worldId) : false;
    const btn = createButton(isSaved ? '☑️' : '☐', isSaved ? '拡張機能に保存' : '拡張機能に保存', async () => {
        if (!worldId) {
            alert('World IDが未解決です。🔄を押して解決してください。');
            return;
        }
        btn.disabled = true;
        btn.textContent = '⏳';
        try {
          if (SAVED_WORLD_IDS.has(worldId)) {
            const r = await chrome.runtime.sendMessage({ type: 'removeWorld', worldId });
            if (r.success) SAVED_WORLD_IDS.delete(worldId);
          } else {
            const name = getWorldName(card, worldId);
            const r = await chrome.runtime.sendMessage({ type: 'addWorld', world: { id: worldId, name } });
            if (r.success || r.reason === 'already_exists') SAVED_WORLD_IDS.add(worldId);
          }
        } catch (err) {
          alert(`Failed to save: ${err.message}`);
          btn.textContent = '❌';
        } finally {
          setTimeout(() => {
            updateSaveButtonDisplay(btn, worldId);
            btn.disabled = false;
          }, 1200);
        }
    });
    if (!worldId) btn.disabled = true;
    return btn;
  }

  // Saveボタンの表示を更新
  function updateSaveButtonDisplay(btn, worldId) {
    if (!worldId) {
        btn.textContent = '☐';
        btn.title = '拡張機能に保存 (未解決)';
        btn.disabled = true;
        return;
    }
    const isSaved = SAVED_WORLD_IDS.has(worldId);
    btn.textContent = isSaved ? '☑️' : '☐';
    btn.title = '拡張機能に保存';
    btn.disabled = false;
  }
  
  // Unfavoriteボタンの生成
  function createUnfavoriteButton(favoriteId, card) {
    const btn = createButton('🗑️', '削除', async () => {
        if (!confirm('このお気に入りを削除しますか？')) return;
        
        btn.textContent = '⏳';
        btn.disabled = true;
        
        try {
            const response = await origFetch(`https://vrchat.com/api/1/favorites/${favoriteId}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            
            if (response.ok) {
                btn.textContent = '✓';
                // カードをフェードアウト
                setTimeout(() => {
                    card.style.transition = 'opacity 0.3s';
                    card.style.opacity = '0';
                    setTimeout(() => card.remove(), 300);
                }, 500);
            } else {
                throw new Error(`Failed to delete (${response.status})`);
            }
        } catch (err) {
            alert(`Failed to remove favorite:\n${err.message}`);
            btn.textContent = '❌';
            setTimeout(() => {
                btn.textContent = '🗑️';
                btn.disabled = false;
            }, 1500);
        }
    });
    return btn;
  }

  function createButton(text, title, onClick) {
    const b = document.createElement('button');
    b.textContent = text;
    b.title = title;
    b.style.cssText = `
      width: 30px; height: 30px; border: none; border-radius: 6px;
      background: rgba(31,209,237,0.2); color: #1fd1ed; font-size: 16px;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      transition: all 0.2s; padding: 0;
    `;
    b.onmouseover = () => (b.style.background = 'rgba(31,209,237,0.4)');
    b.onmouseout = () => (b.style.background = 'rgba(31,209,237,0.2)');
    b.onclick = e => { e.stopPropagation(); e.preventDefault(); onClick(); };
    return b;
  }

  function getWorldName(card, worldId) {
    if (RESOLVED_WORLDS.has(worldId)) return RESOLVED_WORLDS.get(worldId).name;
    const h4 = card.querySelector('h4');
    return h4 ? h4.textContent.trim() : worldId;
  }

  // === カード要素の更新 ===
  function updateCard(card, worldId, data) {
    
    // data-scrollkeyを更新
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
        // 通常/プライベートワールドの場合の表示更新
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

    // === 【修正】リンクがクリックされたときに、正しいURLへ遷移するように上書き ===
    if (worldId) {
        const correctUrl = `/home/world/${worldId}`;
        links.forEach(link => {
            link.href = correctUrl;
            link.setAttribute('href', correctUrl);
            
            // 既存のイベントを全て削除し、新しいイベントを追加して誤った遷移を防ぐ
            // 既存のイベントハンドラを削除することは難しいので、イベント伝播を止める
            link.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                // リンクを直接開く
                window.location.href = correctUrl; 
            };
        });
    }
    // ====================================================================

    const saveBtn = card.querySelector('.vrc-fixed-controls > button[title*="保存"]');
    if (saveBtn) updateSaveButtonDisplay(saveBtn, worldId);
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
  
  // === モーダルとフォルダ移動機能 (VRChatタグ更新) ===

  function openMoveFolderModal(favoriteId, card) {
    pendingFavoriteId = favoriteId;
    const worldId = FAVORITE_ID_TO_WORLD_ID.get(favoriteId);
    if (!worldId) {
        alert('World IDが未解決のため、フォルダ移動はできません。🔄ボタンを押して情報を更新してください。');
        return;
    }
    const worldTitle = getWorldName(card, worldId);

    const modal = document.getElementById('moveFolderModal');
    if (!modal) return;

    modal.querySelector('.vrc-resolver-modal-header').textContent = `📁 ${worldTitle}`;

    const container = document.getElementById('moveFolderList');
    
    const optionsHtml = VRC_FOLDERS.map((opt, index) => `
        <div class="folder-option ${opt.isSync ? 'sync' : ''} ${index === 0 ? 'selected' : ''}" data-folder-tag="${opt.id}">
          <span class="folder-option-icon">📁</span>
          <span class="folder-option-name">${opt.name}</span>
        </div>
    `).join('');

    container.innerHTML = optionsHtml;

    container.querySelectorAll('.folder-option').forEach(option => {
        option.addEventListener('click', () => {
          container.querySelectorAll('.folder-option').forEach(o => o.classList.remove('selected'));
          option.classList.add('selected');
        });
    });

    modal.style.display = 'flex';
  }

  async function confirmMoveFolder() {
    if (!pendingFavoriteId) return;

    const modal = document.getElementById('moveFolderModal');
    const confirmBtn = document.getElementById('moveFolderConfirm');
    const selected = document.querySelector('#moveFolderList .folder-option.selected');

    if (!selected) {
        alert('移動先のフォルダを選択してください。');
        return;
    }
    
    confirmBtn.disabled = true;
    confirmBtn.textContent = '移動中...';

    const newTag = selected.dataset.folderTag;
    
    try {
        const response = await origFetch(`https://vrchat.com/api/1/favorites/${pendingFavoriteId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag: newTag }),
            credentials: 'include'
        });

        if (response.ok) {
            alert(`お気に入りを「${selected.textContent.trim()}」フォルダに移動しました。ページを再読み込みします。`);
            window.location.reload();
        } else {
            throw new Error(`API failed with status: ${response.status}`);
        }
    } catch (error) {
        alert(`フォルダ移動に失敗しました:\n${error.message}`);
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = '移動';
        modal.style.display = 'none';
        pendingFavoriteId = null;
    }
  }

  // === スタイルとモーダルの注入 ===
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* --- Modal Base --- */
      .vrc-resolver-modal {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background-color: rgba(0, 0, 0, 0.7); z-index: 10000;
        display: none; justify-content: center; align-items: center;
      }
      .vrc-resolver-modal-content {
        background: #191c24; color: #e0e0e0; border-radius: 12px;
        width: 90%; max-width: 400px; padding: 20px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        border: 1px solid #333;
      }
      .vrc-resolver-modal-header {
        font-size: 16px; font-weight: bold; margin-bottom: 12px; border-bottom: 1px solid #333; padding-bottom: 8px;
      }
      .vrc-resolver-modal-body {
        max-height: 400px; overflow-y: auto;
      }
      .vrc-resolver-modal-actions {
        display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px;
      }
      .vrc-resolver-modal .btn-confirm {
        background: #1fd1ed; color: #191c24; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: bold;
      }
      .vrc-resolver-modal .btn-cancel {
        background: #333; color: #e0e0e0; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;
      }

      /* --- フォルダ選択 (Folder Selection) --- */
      .folder-selection {
        display: flex; flex-direction: column; gap: 8px; margin: 12px 0; max-height: 300px; overflow-y: auto;
      }
      .folder-option {
        padding: 10px; background: #0f1419; border: 2px solid #333; border-radius: 8px;
        cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px;
      }
      .folder-option:hover {
        border-color: #1fd1ed; background: #1a1f2e;
      }
      .folder-option.selected {
        border-color: #1fd1ed; background: #1a1f2e; box-shadow: 0 0 12px rgba(31, 209, 237, 0.3);
      }
      .folder-option.sync {
        border-color: #9d4edd;
      }
      .folder-option.sync.selected {
        background: #2a1f3e; box-shadow: 0 0 12px rgba(157, 78, 221, 0.3);
      }
      .folder-option-icon { font-size: 18px; }
      .folder-option-name { font-size: 12px; color: #e0e0e0; flex: 1; }
    `;
    document.head.appendChild(style);
  }

  function injectModalHtml() {
    const modalHtml = `
      <div id="moveFolderModal" class="vrc-resolver-modal">
        <div class="vrc-resolver-modal-content">
          <div class="vrc-resolver-modal-header">📁 VRChatフォルダへ移動</div>
          <div class="vrc-resolver-modal-body">
            <p style="margin-bottom: 12px;">このお気に入りを移動するVRChat内のフォルダを選択してください:</p>
            <div class="folder-selection" id="moveFolderList">
              </div>
          </div>
          <div class="vrc-resolver-modal-actions">
            <button id="moveFolderConfirm" class="btn-confirm">移動</button>
            <button id="moveFolderCancel" class="btn-cancel">キャンセル</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    document.getElementById('moveFolderCancel').addEventListener('click', () => {
        document.getElementById('moveFolderModal').style.display = 'none';
        pendingFavoriteId = null;
    });
    document.getElementById('moveFolderConfirm').addEventListener('click', confirmMoveFolder);
  }


  // === 初期化とDOM監視 ===

  const observer = new MutationObserver(() => checkForWorldCards());

  function checkForWorldCards() {
    const cards = document.querySelectorAll('div[data-scrollkey^="wrld_"], div[data-scrollkey="???"]');
    cards.forEach(card => {
      if (!PROCESSED_CARDS.has(card)) addControlButtons(card);
    });
  }

  async function loadFavoritesManually() {
    if (isLoadingFavorites) return;
    
    const url = window.location.href;
    const match = url.match(/favorites\/(\w+)\/([\w\d\-]+)/);
    
    let apiUrl = 'https://vrchat.com/api/1/favorites?type=world&n=100'; 
    
    if (match) {
        const [, type, group] = match;
        apiUrl = `https://vrchat.com/api/1/favorites?type=${type}&n=100`;
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

  async function init() {
    injectStyles();
    injectModalHtml();
    
    if (!document.body) {
      setTimeout(init, 100);
      return;
    }
    
    await loadSavedWorlds();
    
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
    }, 1000);
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else init();
})();