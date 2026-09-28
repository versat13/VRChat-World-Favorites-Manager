// page-vrclist-list.js v1.5.0
// VRClist (vrclist.com) の一覧ページ(トップページ・検索結果・関連ワールド一覧等)
// 各<world-card>要素の下部にボタン行(5個)を追加する。
// 個別ページ(page-vrclist.js)とは異なり、状態表示(登録済みかどうか)は行わない
// 方針: 一覧に多数並ぶカードそれぞれに対してVRChat公式APIを叩くとレート制限や
// 表示遅延の懸念があるため、常に同じ見た目の「登録」「解除」ボタンとする。

(function () {
  'use strict';

  const { t, initContentScriptSettings, watchSettingsChanges, isExtensionInvalidatedError,
    DEBUG_LOG } = window.VRCHelpers;
  const { showFolderSelectModal, showNotification } = window.PageHelpersShared;

  // ==================== 定数 ====================
  const BUTTON_ROW_CLASS = 'vrc-resolver-list-buttons';
  const PROCESSED_ATTR = 'data-vrc-resolver-processed';

  const COLORS = {
    PRIMARY: {
      BG: '#2a2d36',
      TEXT: '#e8e8ea',
      HOVER_BG: '#363a45'
    },
    SAVED: {
      BG: '#25373d',
      TEXT: '#a8d8e0',
      HOVER_BG: '#324750'
    },
    DANGER: {
      BG: '#3a2a2a',
      TEXT: '#f0a8a8',
      HOVER_BG: '#4a3232'
    }
  };

  // ==================== Shadow DOM貫通ヘルパー ====================
  // VRClistのトップページ(一覧)は <home-page> というカスタム要素の
  // open Shadow DOM内部、さらにそのネストしたコンポーネント
  // (world-gallery等)のShadow DOM内部に<world-card>が存在する。
  // document.querySelectorAll('world-card') では一切見つからないため、
  // 個別ページ(page-vrclist.js)と同様に再帰的に貫通探索する。
  function deepQuerySelectorAll(selector, root = document, results = []) {
    root.querySelectorAll(selector).forEach(el => results.push(el));
    root.querySelectorAll('*').forEach(el => {
      if (el.shadowRoot) {
        deepQuerySelectorAll(selector, el.shadowRoot, results);
      }
    });
    return results;
  }

  // ==================== 拡張機能コンテキストチェック ====================
  function checkExtensionContext() {
    try {
      return !!chrome.runtime?.id;
    } catch (error) {
      return false;
    }
  }

  // ==================== 設定チェック ====================
  async function isIntegrationEnabled() {
    try {
      if (!checkExtensionContext()) return false;
      const result = await chrome.storage.sync.get('settings');
      const settings = result.settings || {};
      return settings.enableVrcListIntegration !== false;
    } catch (error) {
      if (isExtensionInvalidatedError(error)) return false;
      console.error('[VRClist List] Failed to check settings:', error);
      return true;
    }
  }

  // ==================== グローバルキャッシュ ====================
  let savedWorldIds = new Set();
  let vrcFolders = [];
  let exFolders = [];
  let dataLoaded = false;

  async function loadCaches() {
    try {
      if (!checkExtensionContext()) return;
      const [worldsResp, foldersResp] = await Promise.all([
        chrome.runtime.sendMessage({ type: 'getAllWorlds' }),
        chrome.runtime.sendMessage({ type: 'getFolders' })
      ]);
      if (worldsResp && !worldsResp.error) {
        savedWorldIds = new Set((worldsResp.worlds || []).map(w => w.id));
      }
      if (foldersResp && !foldersResp.error) {
        vrcFolders = foldersResp.vrcFolders || [];
        exFolders = foldersResp.folders || [];
      }
      dataLoaded = true;
      if (DEBUG_LOG) {
        console.log('[VRClist List] Caches loaded. savedWorldIds size=', savedWorldIds.size, 'vrcFolders=', vrcFolders.length);
      }
    } catch (error) {
      if (!isExtensionInvalidatedError(error)) {
        console.error('[VRClist List] Failed to load caches:', error);
      }
    }
  }

  // ==================== world-cardからの情報取得 ====================
  // <world-card>のtemplate(Shadow DOM)の後に続く<span slot="...">はLight DOM上の
  // 子要素であり、通常のquerySelectorで直接取得できる(Shadow DOM貫通は不要)。
  function extractWorldCardInfo(cardEl) {
    const worldIdEl = cardEl.querySelector('span[slot="world-id"]');
    const nameEl = cardEl.querySelector('span[slot="name"]');
    const authorNameEl = cardEl.querySelector('span[slot="authorName"]');

    const worldId = worldIdEl ? worldIdEl.textContent.trim() : null;
    if (!worldId || !worldId.startsWith('wrld_')) return null;

    return {
      worldId,
      name: nameEl ? nameEl.textContent.trim() : worldId,
      authorName: authorNameEl ? authorNameEl.textContent.trim() : null
    };
  }

  // ==================== ボタン行の作成 ====================
  // 【v1.5.0再修正】CSS Gridでのレイアウト自動切り替えは、幅測定のズレや
  // 複雑さで不具合が続いたため撤去。ブラウザネイティブのflex-wrapに戻し、
  // 「VRChat登録・解除」の2つだけは分断されないよう専用のサブグループ
  // (別コンテナ)にまとめて1つの折り返し単位として扱う。
  // 並び順: [Chromeに保存] [ウォッチリスト] [リンクをコピー] [登録+解除のグループ]
  function createButtonRow(info) {
    const row = document.createElement('div');
    row.className = BUTTON_ROW_CLASS;
    row.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 8px;
    box-sizing: border-box;
  `;

    const singleButtons = [
      { key: 'save', icon: '☐', label: t('saveToChrome'), color: COLORS.PRIMARY },
      { key: 'watch', icon: '👤', label: t('addToWatchlist'), color: COLORS.PRIMARY },
      { key: 'copy', icon: '🔗', label: t('copyLink'), color: COLORS.PRIMARY }
    ];

    singleButtons.forEach(btnDef => {
      row.appendChild(createButton(btnDef));
    });

    // VRChat登録・解除はセットで扱い、折り返しの際も分断されないようにする
    const favGroup = document.createElement('div');
    favGroup.style.cssText = `
    display: flex;
    gap: 4px;
    flex: 1 1 auto;
    min-width: 200px;
  `;
    favGroup.appendChild(createButton({ key: 'favAdd', icon: '⭐', label: t('vrcFavRegisterBtn'), color: COLORS.SAVED }));
    favGroup.appendChild(createButton({ key: 'favRemove', icon: '🗑', label: t('vrcFavRemoveListLabel'), color: COLORS.DANGER }));
    row.appendChild(favGroup);

    return row;
  }

  function createButton(btnDef) {
    const btn = document.createElement('button');
    btn.dataset.action = btnDef.key;
    btn.style.cssText = `
    flex: 1 1 auto;
    min-width: 90px;
    padding: 6px 8px;
    background: ${btnDef.color.BG};
    border: none;
    border-radius: 5px;
    color: ${btnDef.color.TEXT};
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    font-family: inherit;
    transition: background 0.15s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `;
    btn.innerHTML = `${btnDef.icon} ${btnDef.label}`;
    btn.onmouseover = () => { btn.style.background = btnDef.color.HOVER_BG; };
    btn.onmouseout = () => { btn.style.background = btnDef.color.BG; };
    return btn;
  }

  function updateSaveButtonLabel(row, worldId) {
    const saveBtn = row.querySelector('[data-action="save"]');
    if (!saveBtn) return;
    const isSaved = savedWorldIds.has(worldId);
    saveBtn.innerHTML = isSaved ? `☑ ${t('deleteFromChrome')}` : `☐ ${t('saveToChrome')}`;
  }

  // ==================== ボタンイベント設定 ====================
  function setupButtonEvents(row, info) {
    const { worldId } = info;

    row.querySelector('[data-action="copy"]').onclick = () => {
      const url = `https://vrchat.com/home/world/${worldId}`;
      navigator.clipboard.writeText(url).then(() => {
        showNotification(t('linkCopied'), 'success');
      }).catch(error => {
        console.error('[VRClist List] Failed to copy:', error);
        showNotification(t('copyFailed'), 'error');
      });
    };

    row.querySelector('[data-action="save"]').onclick = () => {
      if (savedWorldIds.has(worldId)) {
        deleteFromExtension(worldId, row);
      } else {
        showExtFolderModal(info, row);
      }
    };

    row.querySelector('[data-action="watch"]').onclick = () => {
      addToWatchlist(worldId);
    };

    row.querySelector('[data-action="favAdd"]').onclick = () => {
      showVrcFolderModal(info);
    };

    setupConfirmableRemoveButton(row.querySelector('[data-action="favRemove"]'), () => {
      removeVrcFavorite(info);
    });

    updateSaveButtonLabel(row, worldId);
  }

  // ==================== 誤クリック防止: 2段階確認ボタン ====================
  // 1回目のクリックでは実行せず、ボタンを「本当に解除しますか？」の
  // 確認表示に切り替える。一定時間内に2回目のクリックがあれば実行し、
  // 何もなければ元の表示に自動で戻す。
  const CONFIRM_TIMEOUT_MS = 4000;

  function setupConfirmableRemoveButton(button, onConfirmed) {
    if (!button) return;

    const originalHTML = button.innerHTML;
    const originalBg = button.style.background;
    let confirming = false;
    let revertTimer = null;

    button.onclick = () => {
      if (!confirming) {
        confirming = true;
        button.innerHTML = t('clickAgainToRemove');
        button.style.background = COLORS.DANGER.HOVER_BG;

        revertTimer = setTimeout(() => {
          confirming = false;
          button.innerHTML = originalHTML;
          button.style.background = originalBg;
        }, CONFIRM_TIMEOUT_MS);
        return;
      }

      // 2回目のクリック: 確定実行
      clearTimeout(revertTimer);
      confirming = false;
      button.innerHTML = originalHTML;
      button.style.background = originalBg;
      onConfirmed();
    };
  }

  // ==================== フォルダ選択モーダル(拡張機能保存用) ====================
  function showExtFolderModal(info, row) {
    const folders = [
      { id: 'none', name: t('uncategorized'), class: 'none' },
      ...exFolders.map(f => ({ id: f.id, name: f.name, class: '' })),
      ...vrcFolders.map(f => ({ id: f.id, name: f.displayName, class: 'vrc' }))
    ];

    showFolderSelectModal({
      title: t('selectFolder'),
      description: t('selectFolderDesc'),
      folders: folders,
      cancelLabel: t('cancel'),
      onConfirm: (folderId) => {
        addToExtension(info, folderId, row);
      }
    });
  }

  async function addToExtension(info, folderId, row) {
    const { worldId, name } = info;
    try {
      let worldData = { id: worldId, name, folderId };

      try {
        const infoResponse = await chrome.runtime.sendMessage({ type: 'getWorldInfo', worldId });
        if (infoResponse && infoResponse.success && infoResponse.world) {
          const apiData = infoResponse.world;
          worldData = {
            id: worldId,
            name: apiData.name || name,
            authorName: apiData.authorName || info.authorName || null,
            releaseStatus: apiData.releaseStatus || null,
            thumbnailImageUrl: apiData.thumbnailImageUrl || null,
            folderId
          };
        }
      } catch (apiError) {
        if (DEBUG_LOG) {
          console.warn('[VRClist List] Failed to fetch world details via background, using basic info:', apiError);
        }
      }

      const response = await chrome.runtime.sendMessage({ type: 'addWorld', world: worldData });

      if (response.success) {
        savedWorldIds.add(worldId);
        showNotification(t('savedTo', { name: worldData.name }), 'success');
        if (row) updateSaveButtonLabel(row, worldId);
      } else if (response.reason === 'already_exists') {
        showNotification(t('alreadySaved', { name: worldData.name, folder: '' }), 'info');
        savedWorldIds.add(worldId);
        if (row) updateSaveButtonLabel(row, worldId);
      } else if (response.reason === 'private_world') {
        showNotification(t('privateWorldError', { name: response.worldName || worldData.name }), 'error');
      } else {
        showNotification(t('addFailed'), 'error');
      }
    } catch (error) {
      console.error('[VRClist List] Failed to add to extension:', error);
      if (isExtensionInvalidatedError(error)) {
        showNotification(t('extInvalidated'), 'info');
      } else {
        showNotification(t('error'), 'error');
      }
    }
  }

  async function deleteFromExtension(worldId, row) {
    if (!savedWorldIds.has(worldId)) return;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'getAllWorlds' });
      const world = (response.worlds || []).find(w => w.id === worldId);
      if (!world) {
        showNotification(t('deleteFailed'), 'error');
        return;
      }
      const deleteResponse = await chrome.runtime.sendMessage({
        type: 'removeWorld',
        worldId,
        folderId: world.folderId
      });
      if (deleteResponse.success) {
        savedWorldIds.delete(worldId);
        showNotification(t('deletedSuccess'), 'success');
        if (row) updateSaveButtonLabel(row, worldId);
      } else {
        showNotification(t('deleteFailed'), 'error');
      }
    } catch (error) {
      console.error('[VRClist List] Failed to delete from extension:', error);
      if (isExtensionInvalidatedError(error)) {
        showNotification(t('extInvalidated'), 'info');
      } else {
        showNotification(t('error'), 'error');
      }
    }
  }

  // ==================== ウォッチリスト ====================
  async function addToWatchlist(worldId) {
    try {
      showNotification(t('fetchingWorldDetails'), 'info');
      const response = await chrome.runtime.sendMessage({ type: 'addToWatchList', worldId });
      if (response && response.success) {
        const authorName = response.authorName || 'Unknown';
        const messageKey = response.isNew ? 'addedToWatchList' : 'alreadyInWatchList';
        showNotification(t(messageKey, { authorName }), response.isNew ? 'success' : 'info');
      } else {
        showNotification(response.userMessage || t('addToWatchListFailed'), 'error');
      }
    } catch (error) {
      console.error('[VRClist List] Failed to add to watchlist:', error);
      if (isExtensionInvalidatedError(error)) {
        showNotification(t('extInvalidated'), 'info');
      } else {
        showNotification(t('error'), 'error');
      }
    }
  }

  // ==================== VRChat公式お気に入り: 登録 ====================
  function showVrcFolderModal(info) {
    const folders = vrcFolders.map(f => ({ id: f.id, name: f.displayName, class: 'vrc' }));

    if (folders.length === 0) {
      addVrcFavorite(info, 'worlds1');
      return;
    }

    showFolderSelectModal({
      title: t('selectVRCFolder'),
      description: t('selectVRCFolderDesc', { name: info.name }),
      folders: folders,
      cancelLabel: t('cancel'),
      onConfirm: (folderId) => {
        addVrcFavorite(info, folderId);
      }
    });
  }

  async function addVrcFavorite(info, folderId) {
    const { worldId } = info;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'addVRCFavorite', worldId, folderId });
      if (DEBUG_LOG) {
        console.log('[VRClist List] addVRCFavorite response:', response);
      }
      if (response.reason === 'auth_required') {
        showNotification(t('vrcNotLoggedIn'), 'error');
        return;
      }
      if (response.success) {
        showNotification(t('addToFavorites'), 'success');
      } else if (response.groupFull) {
        showNotification(t('vrcFolderFull'), 'error');
      } else if (response.alreadyFavorited) {
        showNotification(
          response.ambiguous400 ? t('vrcAddFailedAmbiguous') : t('alreadyFavoritedError'),
          response.ambiguous400 ? 'error' : 'info'
        );
      } else if (response.privateWorld) {
        showNotification(t('privateWorldCannotAdd'), 'error');
      } else {
        showNotification(t('addToFavoritesFailed', { error: response.error || '' }), 'error');
      }
    } catch (error) {
      console.error('[VRClist List] Failed to add VRC favorite:', error);
      if (isExtensionInvalidatedError(error)) {
        showNotification(t('extInvalidated'), 'info');
      } else {
        showNotification(t('error'), 'error');
      }
    }
  }

  // ==================== VRChat公式お気に入り: 解除 ====================
  // 一覧ページでは登録状態を事前表示しないため、解除ボタンは押された時点で
  // getVRCFavoriteInfoを呼び、その場でfavoriteRecordIdを取得して削除する。
  // (worlds1-4だけでなくvrcPlusWorlds1-4も含めて横断的に検索する
  //  getVRCFavoriteInfoの修正が前提になっている)
  async function removeVrcFavorite(info) {
    const { worldId } = info;
    try {
      const infoResponse = await chrome.runtime.sendMessage({ type: 'getVRCFavoriteInfo', worldId });
      if (DEBUG_LOG) {
        console.log('[VRClist List] getVRCFavoriteInfo (for remove) response:', infoResponse);
      }
      if (infoResponse.reason === 'auth_required') {
        showNotification(t('vrcNotLoggedIn'), 'error');
        return;
      }
      if (infoResponse.error) {
        showNotification(t('error'), 'error');
        return;
      }
      if (!infoResponse.favorited) {
        showNotification(t('notInFavorites'), 'info');
        return;
      }

      const deleteResponse = await chrome.runtime.sendMessage({
        type: 'deleteVRCFavorite',
        favoriteRecordId: infoResponse.favoriteRecordId
      });
      if (deleteResponse.success) {
        showNotification(t('deleteSuccess'), 'success');
      } else {
        showNotification(t('vrcDeleteFailed', { error: deleteResponse.error || '' }), 'error');
      }
    } catch (error) {
      console.error('[VRClist List] Failed to remove VRC favorite:', error);
      if (isExtensionInvalidatedError(error)) {
        showNotification(t('extInvalidated'), 'info');
      } else {
        showNotification(t('error'), 'error');
      }
    }
  }

  // ==================== カードへのボタン行挿入 ====================
  function processCard(cardEl) {
    if (cardEl.hasAttribute(PROCESSED_ATTR)) return;

    const info = extractWorldCardInfo(cardEl);
    if (!info) return;

    const shadowRoot = cardEl.shadowRoot;
    if (!shadowRoot) return;

    const container = shadowRoot.querySelector('#container');
    if (!container) return;

    // 既に挿入済みでないか(再処理防止の二重チェック)
    if (container.querySelector(`.${BUTTON_ROW_CLASS}`)) {
      cardEl.setAttribute(PROCESSED_ATTR, '1');
      return;
    }

    const row = createButtonRow(info);
    container.appendChild(row);
    setupButtonEvents(row, info);

    cardEl.setAttribute(PROCESSED_ATTR, '1');
  }

  let lastLoggedCardCount = -1;
  function processAllCards() {
    const cards = deepQuerySelectorAll('world-card');
    if (DEBUG_LOG && cards.length !== lastLoggedCardCount) {
      console.log('[VRClist List] processAllCards found', cards.length, 'world-card elements.');
      lastLoggedCardCount = cards.length;
    }
    cards.forEach(processCard);
  }

  // ==================== カード検出(MutationObserver + ポーリング) ====================
  // 一覧ページはTrending/Recommended/Feed/Searchなどのタブ切り替えで
  // Shadow DOMごと動的に再構築されるため、個別ページのように「固定の
  // Shadow Rootを一つだけ事前特定して監視する」方式が使えない。
  // document.bodyの監視(トップレベルの変更検知用)に加えて、
  // 一定間隔でのポーリングを保険として併用する。
  let cardObserver = null;
  let cardPollInterval = null;

  function startCardObserver() {
    if (cardObserver) {
      try { cardObserver.disconnect(); } catch (error) { /* noop */ }
    }

    cardObserver = new MutationObserver((mutations) => {
      let shouldProcess = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes && mutation.addedNodes.length > 0) {
          shouldProcess = true;
          break;
        }
      }
      if (shouldProcess) {
        processAllCards();
      }
    });

    cardObserver.observe(document.body, {
      childList: true,
      subtree: true
    });

    if (cardPollInterval) clearInterval(cardPollInterval);
    cardPollInterval = setInterval(processAllCards, 2000);
  }

  // ==================== 初期化 ====================
  let initialized = false;

  async function init() {
    if (DEBUG_LOG) {
      console.log('[VRClist List] init() called. pathname=', window.location.pathname);
    }
    if (initialized) return;

    if (!checkExtensionContext()) {
      if (DEBUG_LOG) {
        console.log('[VRClist List] Extension context invalidated. Stopping script.');
      }
      return;
    }

    const enabled = await isIntegrationEnabled();
    if (!enabled) {
      if (DEBUG_LOG) {
        console.log('[VRClist List] Integration disabled by settings.');
      }
      return;
    }

    await initContentScriptSettings();
    watchSettingsChanges(() => {
      // 設定変更時、既存のボタン行は残したまま次回のカード追加分に反映する
      // (全カード再描画は負荷が高いため見送り)
    });

    if (!dataLoaded) {
      await loadCaches();
    }

    initialized = true;
    processAllCards();
    startCardObserver();

    if (DEBUG_LOG) {
      console.log('[VRClist List] Initialized. Watching for world-card elements.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

if (window.VRCHelpers && window.VRCHelpers.DEBUG_LOG) {
  console.log('[VRClist List] Script ready');
}
