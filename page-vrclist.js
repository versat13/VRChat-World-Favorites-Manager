// page-vrclist.js v1.5.0
// VRClist (vrclist.com) ワールド詳細ページへのボタンパネル注入
// page-world.js (VRChat公式サイト版) と対になる実装。
// 既存のUI/翻訳/通知/モーダルヘルパーおよびbackground.jsのメッセージAPIをそのまま再利用する。

(function () {
  'use strict';

  const { t, initContentScriptSettings, watchSettingsChanges, isExtensionInvalidatedError,
    DEBUG_LOG } = window.VRCHelpers;
  const { showFolderSelectModal, showNotification } = window.PageHelpersShared;

  // ==================== 拡張機能コンテキストチェック ====================
  function checkExtensionContext() {
    try {
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
      if (!checkExtensionContext()) {
        showNotification(t('extInvalidated'), 'warning');
        stopAllObservers();
        return false;
      }

      const result = await chrome.storage.sync.get('settings');
      const settings = result.settings || {};

      // VRClist連携は公式サイト連携(enableVrcSiteIntegration)とは別トグルで管理する。
      // 未設定時のデフォルトはtrue(有効)。
      if (settings.enableVrcListIntegration === false) {
        if (DEBUG_LOG) {
          console.log('[VRClist Page] VRClist Integration is disabled. Script will not run.');
        }
        return false;
      }

      return true;
    } catch (error) {
      if (isExtensionInvalidatedError(error)) {
        showNotification(t('extInvalidated'), 'warning');
        stopAllObservers();
        return false;
      }
      console.error('[VRClist Page] Failed to check settings:', error);
      return true;
    }
  }

  // ==================== 定数 ====================
  // VRClistのワールド詳細ページは #world-details 内に
  // VRClistのワールド詳細ページは #world 直下に
  // fave-circle / playlist-circle / visited-circle / boost-world-link /
  // img#world-thumbnail / div#world-details / div#right-items
  // の順で並ぶ(#worldはflexだがflex-wrap未指定=nowrapのため、
  // ここに割り込む形での配置は他要素の圧縮を招き危険)。
  // #world-details自体はdisplay:flexではなく通常のブロック要素のため、
  // その内部(#outdated直後、#user-activity=区切り線の直前)への挿入は安全。
  const SELECTORS = {
    INSERT_TARGET: '#world-details',
    THUMBNAIL: '#world-thumbnail',
    OUTDATED: '#outdated',
    USER_ACTIVITY: '#user-activity',
    LAUNCH_CONTAINER: '#launch-instance-container',
    WORLD_LINK: '#world-link',
    FALLBACK_CONTAINER: '#world'
  };

  // VRClistサイトの既存ボタン(Launch Instance/Open on VRChat Site)は
  // 半透明グローではなく単色塗りつぶし・控えめな角丸のフラットデザインのため、
  // それに合わせた配色に変更(公式ページ版のCOLORSとは別定義)。
  const COLORS = {
    PRIMARY: {
      BG: '#2a2d36',
      BORDER: '#2a2d36',
      TEXT: '#e8e8ea',
      HOVER_BG: '#363a45',
      HOVER_BORDER: '#363a45'
    },
    SAVED: {
      BG: '#1fd1ed',
      BORDER: '#1fd1ed',
      TEXT: '#0d1117',
      HOVER_BG: '#3ddbf2',
      HOVER_BORDER: '#3ddbf2'
    },
    DANGER: {
      BG: '#c8433f',
      BORDER: '#c8433f',
      TEXT: '#ffffff',
      HOVER_BG: '#d85652',
      HOVER_BORDER: '#d85652'
    }
  };

  const TIMEOUTS = {
    ELEMENT_WAIT: 10000,
    URL_CHANGE_DELAY: 800,
    URL_CHECK_INTERVAL: 500
  };

  const PANEL_ID = 'vrc-resolver-buttons-vrclist';

  // ==================== Shadow DOM貫通ヘルパー ====================
  // VRClistは Web Components (<world-page>, <world-card> 等) + open Shadow DOM
  // で構成されており、#world-link や #world-details は document.querySelector
  // では見つからず、<world-page>要素のshadowRoot内部に存在する。
  // 以下のヘルパーで、通常DOM→Shadow DOMを再帰的に貫通して要素を探索する。
  function deepQuerySelector(selector, root = document) {
    const found = root.querySelector(selector);
    if (found) return found;

    const allElements = root.querySelectorAll('*');
    for (const el of allElements) {
      if (el.shadowRoot) {
        const result = deepQuerySelector(selector, el.shadowRoot);
        if (result) return result;
      }
    }
    return null;
  }

  function deepQuerySelectorAll(selector, root = document, results = []) {
    root.querySelectorAll(selector).forEach(el => results.push(el));

    root.querySelectorAll('*').forEach(el => {
      if (el.shadowRoot) {
        deepQuerySelectorAll(selector, el.shadowRoot, results);
      }
    });
    return results;
  }

  // ==================== グローバル変数 ====================
  let savedWorldIds = new Set();
  let vrcFolders = [];
  let exFolders = [];
  let vrcWorlds = [];
  let lastUrl = location.href;
  let checkInterval = null;
  let insertTargetObserver = null;
  let currentPanelElement = null;

  // ==================== データロード ====================
  async function loadSavedWorlds() {
    try {
      if (!checkExtensionContext()) return;
      const response = await chrome.runtime.sendMessage({ type: 'getAllWorlds' });
      if (response.error) {
        console.error('[VRClist Page] Error loading saved worlds:', response.error);
        return;
      }
      savedWorldIds = new Set((response.worlds || []).map(w => w.id));
    } catch (error) {
      if (!isExtensionInvalidatedError(error)) {
        console.error('[VRClist Page] Failed to communicate with background:', error);
      }
    }
  }

  async function loadFolders() {
    try {
      if (!checkExtensionContext()) return;
      const response = await chrome.runtime.sendMessage({ type: 'getFolders' });
      if (DEBUG_LOG) {
        console.log('[VRClist Page] getFolders raw response:', response);
      }
      if (response.error) {
        console.error('[VRClist Page] Error loading folders:', response.error);
        return;
      }
      vrcFolders = response.vrcFolders || [];
      exFolders = response.folders || [];
      if (DEBUG_LOG) {
        console.log('[VRClist Page] loadFolders assigned. vrcFolders=', vrcFolders, 'exFolders=', exFolders);
      }
    } catch (error) {
      console.error('[VRClist Page] Failed to load folders (exception):', error);
    }
  }

  async function loadVRCWorlds() {
    try {
      if (!checkExtensionContext()) return;
      const response = await chrome.runtime.sendMessage({ type: 'getVRCWorlds' });
      if (response.error) {
        console.error('[VRClist Page] Error loading VRC worlds:', response.error);
        return;
      }
      vrcWorlds = response.vrcWorlds || [];
    } catch (error) {
      if (!isExtensionInvalidatedError(error)) {
        console.error('[VRClist Page] Failed to load VRC worlds:', error);
      }
    }
  }

  // ==================== World ID取得 ====================
  // VRClistのワールド詳細ページURL (vrclist.com/world/12345) にはVRChat公式の
  // wrld_... IDが含まれないため、ページ内の「Open on VRChat Site」リンク
  // (#world-link) のhref属性から取得する。
  // #world-link は <world-page> カスタム要素のShadow DOM内部にあるため、
  // 通常のdocument.querySelectorでは見つからずdeepQuerySelectorで探索する。
  function getWorldIdFromPage() {
    const link = deepQuerySelector(SELECTORS.WORLD_LINK);
    if (link && link.href) {
      const match = link.href.match(/\/world\/(wrld_[a-zA-Z0-9-]+)/);
      if (match) return match[1];
    }

    // フォールバック: ページ内(Shadow DOM含む)のいずれかのvrchat.comリンクから拾う
    const anyLink = deepQuerySelectorAll('a[href*="vrchat.com/home/world/wrld_"]')[0];
    if (anyLink) {
      const match = anyLink.href.match(/\/world\/(wrld_[a-zA-Z0-9-]+)/);
      if (match) return match[1];
    }

    return null;
  }

  function getWorldName() {
    const nameEl = deepQuerySelector('#name');
    return nameEl ? nameEl.textContent.trim() : null;
  }

  function isTargetPage() {
    return /^\/world\/\d+/.test(window.location.pathname);
  }

  // ==================== ボタンパネル作成 ====================
  function createButtonPanel(worldId) {
    if (deepQuerySelector(`#${PANEL_ID}`)) return;

    // 優先1: 「Data looks outdated/world deleted?」と「Latest world activity」
    // の間の区切り線(#user-activity内のdivider)の直前、つまり#outdatedの
    // 直後に挿入する。
    // 経緯: #worldはdisplay:flexだがflex-wrap未指定(nowrap)のコンテナで、
    // ここに割り込む形での配置(flex-basis:100%やposition:absolute)は
    // 全体のレイアウト計算に影響し、崩れの原因になった。
    // 一方#world-details自体は通常のブロック要素(縦積み)なので、
    // その内部への挿入はflexレイアウトに一切影響しない安全な方法。
    const outdated = deepQuerySelector(SELECTORS.OUTDATED);
    if (outdated && outdated.parentElement) {
      const panel = createPanelElement(worldId);
      outdated.insertAdjacentElement('afterend', panel);
      setupButtonEvents(worldId);
      if (DEBUG_LOG) {
        console.log('[VRClist Page] Panel inserted after #outdated (before the divider/Latest world activity section).');
      }
      return;
    }

    if (DEBUG_LOG) {
      console.warn('[VRClist Page] #outdated not found. Falling back to #world-details.');
    }

    // 優先2: #world-details内(従来方式)
    const worldDetails = deepQuerySelector(SELECTORS.INSERT_TARGET);
    if (worldDetails) {
      const panel = createPanelElement(worldId);
      worldDetails.appendChild(panel);
      setupButtonEvents(worldId);
      if (DEBUG_LOG) {
        console.log('[VRClist Page] Panel inserted into #world-details (inside Shadow DOM).');
      }
      return;
    }

    if (DEBUG_LOG) {
      console.warn('[VRClist Page] #world-details not found (even inside Shadow DOM). Falling back.');
    }

    const fallbackContainer = deepQuerySelector(SELECTORS.FALLBACK_CONTAINER);
    if (fallbackContainer) {
      const panel = createPanelElement(worldId);
      fallbackContainer.appendChild(panel);
      setupButtonEvents(worldId);
      if (DEBUG_LOG) {
        console.log('[VRClist Page] Inserted via fallback container (#world, inside Shadow DOM).');
      }
      return;
    }

    if (DEBUG_LOG) {
      console.warn('[VRClist Page] Neither #world-details nor #world found. Using floating panel.');
    }
    createFloatingPanel(worldId);
  }

  function createFloatingPanel(worldId) {
    const panel = createPanelElement(worldId);
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
    setupButtonEvents(worldId);
  }

  function createPanelElement(worldId) {
    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    // 「Data looks outdated/world deleted?」と「Latest world activity」の
    // 区切り線の直前(#world-details内)に配置。親要素の幅に合わせて伸びる。
    // 拡張機能自身の機能であることが一目でわかるよう、ヘッダー行を付ける。
    panel.style.cssText = `
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 16px;
    margin-bottom: 16px;
    padding: 12px;
    width: 100%;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    box-sizing: border-box;
  `;

    currentPanelElement = panel;

    const isSaved = savedWorldIds.has(worldId);

    panel.innerHTML = `
    <div style="
      font-size: 12px;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.55);
      letter-spacing: 0.02em;
      margin-bottom: 4px;
    ">${t('extensionPanelHeader')}</div>

    <div style="
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    ">
    <button id="vrclist-copy-link-btn" style="
      flex: 1 1 0;
      min-width: 120px;
      padding: 10px 14px;
      background: ${COLORS.PRIMARY.BG};
      border: none;
      border-radius: 6px;
      color: ${COLORS.PRIMARY.TEXT};
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      transition: background 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      white-space: nowrap;
    ">
      <span>🔗</span>
      <span>${t('vrclistCopyLinkShort')}</span>
    </button>

    <button id="vrclist-ext-save-btn" style="
      flex: 1 1 0;
      min-width: 120px;
      padding: 10px 14px;
      background: ${isSaved ? COLORS.SAVED.BG : COLORS.PRIMARY.BG};
      border: none;
      border-radius: 6px;
      color: ${isSaved ? COLORS.SAVED.TEXT : COLORS.PRIMARY.TEXT};
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      transition: background 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      white-space: nowrap;
    ">
      <span>${isSaved ? '☑' : '☐'}</span>
      <span>${isSaved ? t('vrclistDeleteShort') : t('vrclistSaveShort')}</span>
    </button>

    <button id="vrclist-vrc-fav-btn" style="
      flex: 1 1 0;
      min-width: 120px;
      padding: 10px 14px;
      background: ${COLORS.PRIMARY.BG};
      border: none;
      border-radius: 6px;
      color: ${COLORS.PRIMARY.TEXT};
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      transition: background 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      white-space: nowrap;
    ">
      <span>⭐</span>
      <span>${t('vrclistLoadingFavState')}</span>
    </button>

    <button id="vrclist-watchlist-btn" style="
      flex: 1 1 0;
      min-width: 120px;
      padding: 10px 14px;
      background: ${COLORS.PRIMARY.BG};
      border: none;
      border-radius: 6px;
      color: ${COLORS.PRIMARY.TEXT};
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      transition: background 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      white-space: nowrap;
    ">
      <span>👤</span>
      <span>${t('vrclistWatchlistShort')}</span>
    </button>
    </div>
  `;

    return panel;
  }

  // ==================== ボタンイベント設定 ====================
  function setupButtonEvents(worldId) {
    setupCopyButton();
    setupExtButton(worldId);
    setupVrcFavButton(worldId);
    setupWatchlistButton(worldId);
  }

  function setupCopyButton() {
    const copyBtn = currentPanelElement?.querySelector('#vrclist-copy-link-btn');
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
      const worldId = getWorldIdFromPage();
      if (!worldId) return;
      const url = `https://vrchat.com/home/world/${worldId}`;
      navigator.clipboard.writeText(url).then(() => {
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = `<span>✔</span><span>${t('linkCopied')}</span>`;
        setTimeout(() => {
          copyBtn.innerHTML = originalHTML;
        }, 2000);
      }).catch(error => {
        console.error('[VRClist Page] Failed to copy:', error);
        showNotification(t('copyFailed'), 'error');
      });
    };
  }

  function setupExtButton(worldId) {
    const extBtn = currentPanelElement?.querySelector('#vrclist-ext-save-btn');
    if (!extBtn) return;

    const applyHoverColors = () => {
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

    applyHoverColors();

    extBtn.onclick = () => {
      if (savedWorldIds.has(worldId)) {
        deleteFromExtension(worldId);
      } else {
        showExtFolderModal(worldId);
      }
    };
  }

  function updateExtButton(worldId, isSaved) {
    const extBtn = currentPanelElement?.querySelector('#vrclist-ext-save-btn');
    if (!extBtn) return;

    const checkSpan = extBtn.querySelector('span:first-child');
    const textSpan = extBtn.querySelector('span:last-child');

    if (checkSpan) checkSpan.textContent = isSaved ? '☑' : '☐';
    if (textSpan) textSpan.textContent = isSaved ? t('vrclistDeleteShort') : t('vrclistSaveShort');

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

  // ==================== VRChat公式お気に入りボタン ====================
  // VRClist独自の#fave-circle(VRClist内お気に入り)とは別物。
  // 本拡張が管理するのはあくまでVRChat公式のお気に入り(favorites API)。
  let currentFavoriteRecordId = null;
  let vrcLoggedIn = true;

  async function refreshVrcFavButtonState(worldId) {
    const btn = currentPanelElement?.querySelector('#vrclist-vrc-fav-btn');
    if (!btn) return;

    // 状態を再取得するタイミングでは、確認待ち状態(2段階確認)を必ずクリアする
    resetVrcFavRemoveConfirm(btn);

    try {
      const response = await chrome.runtime.sendMessage({ type: 'getVRCFavoriteInfo', worldId });
      if (response.reason === 'auth_required') {
        vrcLoggedIn = false;
        currentFavoriteRecordId = null;
        setVrcFavButtonState(btn, 'logged_out', '⭐', t('vrcNotLoggedIn'));
        return;
      }
      if (response.error) {
        setVrcFavButtonState(btn, null, '⭐', t('error'));
        return;
      }
      vrcLoggedIn = true;
      if (response.favorited) {
        currentFavoriteRecordId = response.favoriteRecordId;
        setVrcFavButtonState(btn, true, '⭐', t('vrcFavRegisteredBtn'));
      } else {
        currentFavoriteRecordId = null;
        setVrcFavButtonState(btn, false, '⭐', t('vrclistFavRegisterShort'));
      }
    } catch (error) {
      if (!isExtensionInvalidatedError(error)) {
        console.error('[VRClist Page] Failed to fetch favorite info:', error);
      }
      setVrcFavButtonState(btn, null, '⭐', t('error'));
    }
  }

  function setVrcFavButtonState(btn, isFavorited, icon, label) {
    const iconSpan = btn.querySelector('span:first-child');
    const textSpan = btn.querySelector('span:last-child');
    // 2段階確認中に⚠️へ書き換えていた場合も、状態が確定した時点で
    // 必ず本来のアイコン(⭐)に戻す。
    if (iconSpan) iconSpan.textContent = icon;
    if (textSpan) textSpan.textContent = label;

    if (isFavorited === 'logged_out') {
      btn.style.background = 'rgba(255, 255, 255, 0.06)';
      btn.style.borderColor = 'rgba(255, 255, 255, 0.06)';
      btn.style.color = 'rgba(255, 255, 255, 0.5)';
      return;
    }

    if (isFavorited === true) {
      btn.style.background = COLORS.SAVED.BG;
      btn.style.borderColor = COLORS.SAVED.BORDER;
      btn.style.color = COLORS.SAVED.TEXT;
    } else {
      btn.style.background = COLORS.PRIMARY.BG;
      btn.style.borderColor = COLORS.PRIMARY.BORDER;
      btn.style.color = COLORS.PRIMARY.TEXT;
    }
  }

  // ==================== 誤クリック防止: 2段階確認 ====================
  // お気に入り解除は1クリックで即実行せず、1回目のクリックで
  // 「もう一度押すと解除」の警告表示に切り替え、一定時間内に再度
  // 押されたら実行する。時間経過で自動的に元の表示へ戻す。
  const CONFIRM_TIMEOUT_MS = 4000;
  let vrcFavRemoveConfirming = false;
  let vrcFavRemoveConfirmTimer = null;

  function resetVrcFavRemoveConfirm(btn) {
    vrcFavRemoveConfirming = false;
    if (vrcFavRemoveConfirmTimer) {
      clearTimeout(vrcFavRemoveConfirmTimer);
      vrcFavRemoveConfirmTimer = null;
    }
  }

  function setupVrcFavButton(worldId) {
    const btn = currentPanelElement?.querySelector('#vrclist-vrc-fav-btn');
    if (!btn) return;

    resetVrcFavRemoveConfirm(btn);

    btn.onmouseover = () => {
      if (!vrcLoggedIn) {
        btn.style.background = 'rgba(255, 255, 255, 0.1)';
        return;
      }
      if (vrcFavRemoveConfirming) return; // 確認表示中は色を変えない
      const isFav = !!currentFavoriteRecordId;
      btn.style.borderColor = isFav ? COLORS.SAVED.HOVER_BORDER : COLORS.PRIMARY.HOVER_BORDER;
      btn.style.background = isFav ? COLORS.SAVED.HOVER_BG : COLORS.PRIMARY.HOVER_BG;
    };
    btn.onmouseout = () => {
      if (!vrcLoggedIn) {
        btn.style.background = 'rgba(255, 255, 255, 0.06)';
        return;
      }
      if (vrcFavRemoveConfirming) return;
      const isFav = !!currentFavoriteRecordId;
      btn.style.borderColor = isFav ? COLORS.SAVED.BORDER : COLORS.PRIMARY.BORDER;
      btn.style.background = isFav ? COLORS.SAVED.BG : COLORS.PRIMARY.BG;
    };

    btn.onclick = () => {
      if (!vrcLoggedIn) {
        window.open('https://vrchat.com/home/login', '_blank');
        return;
      }

      if (!currentFavoriteRecordId) {
        showVrcFolderModal(worldId);
        return;
      }

      if (!vrcFavRemoveConfirming) {
        // 1回目のクリック: 確認表示に切り替える(アイコン・テキストとも変更)
        vrcFavRemoveConfirming = true;
        const iconSpan = btn.querySelector('span:first-child');
        const textSpan = btn.querySelector('span:last-child');
        if (iconSpan) iconSpan.textContent = '⚠️';
        if (textSpan) textSpan.textContent = t('vrcFavRemoveShort');
        btn.style.background = COLORS.DANGER.HOVER_BG;
        btn.style.borderColor = COLORS.DANGER.HOVER_BORDER;

        vrcFavRemoveConfirmTimer = setTimeout(() => {
          resetVrcFavRemoveConfirm(btn);
          refreshVrcFavButtonState(worldId);
        }, CONFIRM_TIMEOUT_MS);
        return;
      }

      // 2回目のクリック: 確定実行
      resetVrcFavRemoveConfirm(btn);
      deleteVrcFavorite(worldId);
    };

    refreshVrcFavButtonState(worldId);
  }

  function showVrcFolderModal(worldId) {
    const worldName = getWorldName() || worldId;
    const folders = vrcFolders.map(f => ({ id: f.id, name: f.displayName, class: 'vrc' }));

    if (DEBUG_LOG) {
      console.log('[VRClist Page] showVrcFolderModal called. vrcFolders.length =', vrcFolders.length, vrcFolders);
    }

    if (folders.length === 0) {
      // フォルダ情報が未取得の場合は既定フォルダに追加する
      if (DEBUG_LOG) {
        console.warn('[VRClist Page] vrcFolders is empty. Skipping modal, adding to default folder "worlds1".');
      }
      addVrcFavorite(worldId, 'worlds1');
      return;
    }

    showFolderSelectModal({
      title: t('selectVRCFolder'),
      description: t('selectVRCFolderDesc', { name: worldName }),
      folders: folders,
      cancelLabel: t('cancel'),
      onConfirm: (folderId) => {
        addVrcFavorite(worldId, folderId);
      }
    });
  }

  async function addVrcFavorite(worldId, folderId) {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'addVRCFavorite', worldId, folderId });
      if (DEBUG_LOG) {
        console.log('[VRClist Page] addVRCFavorite response:', response);
      }
      if (response.success) {
        currentFavoriteRecordId = response.favoriteRecordId;
        showNotification(t('addToFavorites'), 'success');
        refreshVrcFavButtonState(worldId);
      } else if (response.groupFull) {
        showNotification(t('vrcFolderFull'), 'error');
      } else if (response.alreadyFavorited) {
        showNotification(
          response.ambiguous400 ? t('vrcAddFailedAmbiguous') : t('alreadyFavoritedError'),
          response.ambiguous400 ? 'error' : 'info'
        );
        refreshVrcFavButtonState(worldId);
      } else if (response.privateWorld) {
        showNotification(t('privateWorldCannotAdd'), 'error');
      } else {
        showNotification(t('addToFavoritesFailed', { error: response.error || '' }), 'error');
      }
    } catch (error) {
      console.error('[VRClist Page] Failed to add VRC favorite:', error);
      if (isExtensionInvalidatedError(error)) {
        showNotification(t('extInvalidated'), 'info');
      } else {
        showNotification(t('error'), 'error');
      }
    }
  }

  async function deleteVrcFavorite(worldId) {
    if (!currentFavoriteRecordId) {
      showNotification(t('notInFavorites'), 'info');
      return;
    }
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'deleteVRCFavorite',
        favoriteRecordId: currentFavoriteRecordId
      });
      if (response.success) {
        showNotification(t('deleteSuccess'), 'success');
        currentFavoriteRecordId = null;
        refreshVrcFavButtonState(worldId);
      } else {
        showNotification(t('vrcDeleteFailed', { error: response.error || '' }), 'error');
      }
    } catch (error) {
      console.error('[VRClist Page] Failed to delete VRC favorite:', error);
      if (isExtensionInvalidatedError(error)) {
        showNotification(t('extInvalidated'), 'info');
      } else {
        showNotification(t('error'), 'error');
      }
    }
  }

  // ==================== フォルダ選択モーダル(拡張機能保存用) ====================
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
      cancelLabel: t('cancel'),
      onConfirm: (folderId) => {
        addToExtension(worldId, folderId);
      }
    });
  }

  // ==================== ワールド管理機能(Chrome保存) ====================
  async function addToExtension(worldId, folderId) {
    const worldName = getWorldName() || worldId;

    try {
      let worldData = {
        id: worldId,
        name: worldName,
        folderId: folderId
      };

      // 注意: vrclist.com上のcontent scriptからvrchat.comへ直接fetchすると
      // クロスオリジンリクエストとなりCORSでブロックされるため、
      // background.js経由(同一拡張機能の特権コンテキスト)で取得する。
      try {
        const infoResponse = await chrome.runtime.sendMessage({ type: 'getWorldInfo', worldId });
        if (infoResponse && infoResponse.success && infoResponse.world) {
          const apiData = infoResponse.world;
          worldData = {
            id: worldId,
            name: apiData.name || worldName,
            authorName: apiData.authorName || null,
            releaseStatus: apiData.releaseStatus || null,
            thumbnailImageUrl: apiData.thumbnailImageUrl || null,
            folderId: folderId
          };
        } else if (DEBUG_LOG) {
          console.warn('[VRClist Page] getWorldInfo did not return success, using basic info:', infoResponse);
        }
      } catch (apiError) {
        if (DEBUG_LOG) {
          console.warn('[VRClist Page] Failed to fetch world details via background, using basic info:', apiError);
        }
      }

      const response = await chrome.runtime.sendMessage({ type: 'addWorld', world: worldData });

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
      console.error('[VRClist Page] Failed to add to extension:', error);
      if (isExtensionInvalidatedError(error)) {
        showNotification(t('extInvalidated'), 'info');
      } else {
        showNotification(t('error'), 'error');
      }
    }
  }

  async function deleteFromExtension(worldId) {
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
      console.error('[VRClist Page] Failed to delete from extension:', error);
      if (isExtensionInvalidatedError(error)) {
        showNotification(t('extInvalidated'), 'info');
      } else {
        showNotification(t('error'), 'error');
      }
    }
  }

  // ==================== ウォッチリスト管理 ====================
  async function addToWatchlist(worldId) {
    try {
      showNotification(t('fetchingWorldDetails'), 'info');

      const response = await chrome.runtime.sendMessage({ type: 'addToWatchList', worldId: worldId });

      if (response && response.success) {
        const authorName = response.authorName || 'Unknown';
        const messageKey = response.isNew ? 'addedToWatchList' : 'alreadyInWatchList';
        const messageType = response.isNew ? 'success' : 'info';
        showNotification(t(messageKey, { authorName: authorName }), messageType);
      } else {
        showNotification(response.userMessage || t('addToWatchListFailed'), 'error');
      }
    } catch (error) {
      console.error('[VRClist Page] Failed to add to watchlist:', error);
      if (isExtensionInvalidatedError(error)) {
        showNotification(t('extInvalidated'), 'info');
      } else {
        showNotification(t('error'), 'error');
      }
    }
  }

  function setupWatchlistButton(worldId) {
    const watchlistBtn = currentPanelElement?.querySelector('#vrclist-watchlist-btn');
    if (!watchlistBtn) return;

    watchlistBtn.onmouseover = () => {
      watchlistBtn.style.borderColor = COLORS.PRIMARY.HOVER_BORDER;
      watchlistBtn.style.background = COLORS.PRIMARY.HOVER_BG;
    };
    watchlistBtn.onmouseout = () => {
      watchlistBtn.style.borderColor = COLORS.PRIMARY.BORDER;
      watchlistBtn.style.background = COLORS.PRIMARY.BG;
    };
    watchlistBtn.onclick = async () => {
      await addToWatchlist(worldId);
    };
  }

  // ==================== 挿入先コンテナの監視(SPA遷移対応) ====================
  // 注意: MutationObserverはdocument.documentElementをsubtree:trueで監視しても
  // Shadow DOM内部の変更までは捕捉できない。そのためworld-page等のホスト要素の
  // shadowRootを個別に見つけてobserveする。
  function monitorInsertTargetAndMigrate(worldId) {
    let hasTriggered = false;

    if (insertTargetObserver) {
      try { insertTargetObserver.disconnect(); } catch (error) { /* noop */ }
    }

    const observeRoot = findShadowRootContainingSelector(SELECTORS.INSERT_TARGET) || document.documentElement;

    insertTargetObserver = new MutationObserver(() => {
      if (hasTriggered) return;

      const worldDetails = deepQuerySelector(SELECTORS.INSERT_TARGET);
      const existingPanel = deepQuerySelector(`#${PANEL_ID}`);
      if (worldDetails && !worldDetails.contains(existingPanel)) {
        hasTriggered = true;
        try { insertTargetObserver.disconnect(); } catch (error) { /* noop */ }
        clearTimeout(timer);

        deepQuerySelectorAll(`[id="${PANEL_ID}"]`).forEach(panel => panel.remove());

        const panel = createPanelElement(worldId);
        worldDetails.appendChild(panel);
        setupButtonEvents(worldId);
      }
    });

    insertTargetObserver.observe(observeRoot, {
      childList: true,
      subtree: true
    });

    const timer = setTimeout(() => {
      if (!hasTriggered && insertTargetObserver) {
        try { insertTargetObserver.disconnect(); } catch (error) { /* noop */ }
      }
    }, TIMEOUTS.ELEMENT_WAIT);
  }

  // 指定セレクタが見つかるShadow Root(なければnull=通常DOM)を探す
  function findShadowRootContainingSelector(selector) {
    if (document.querySelector(selector)) return document.documentElement;

    let found = null;
    document.querySelectorAll('*').forEach(el => {
      if (found) return;
      if (el.shadowRoot) {
        if (el.shadowRoot.querySelector(selector)) {
          found = el.shadowRoot;
        } else {
          const nested = findShadowRootInNode(el.shadowRoot, selector);
          if (nested) found = nested;
        }
      }
    });
    return found;
  }

  function findShadowRootInNode(root, selector) {
    let found = null;
    root.querySelectorAll('*').forEach(el => {
      if (found) return;
      if (el.shadowRoot) {
        if (el.shadowRoot.querySelector(selector)) {
          found = el.shadowRoot;
        } else {
          const nested = findShadowRootInNode(el.shadowRoot, selector);
          if (nested) found = nested;
        }
      }
    });
    return found;
  }

  // ==================== URL変更監視(SPAルーティング対応) ====================
  function startUrlMonitoring() {
    if (checkInterval) clearInterval(checkInterval);

    checkInterval = setInterval(() => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        handleUrlChange();
      }
    }, TIMEOUTS.URL_CHECK_INTERVAL);
  }

  function handleUrlChange() {
    deepQuerySelectorAll(`[id="${PANEL_ID}"]`).forEach(panel => panel.remove());
    deepQuerySelectorAll(`[id="${PANEL_ID}-spacer"]`).forEach(spacer => spacer.remove());

    if (insertTargetObserver) {
      try { insertTargetObserver.disconnect(); } catch (error) { /* noop */ }
      insertTargetObserver = null;
    }

    currentPanelElement = null;
    currentFavoriteRecordId = null;

    setTimeout(() => {
      init();
    }, TIMEOUTS.URL_CHANGE_DELAY);
  }

  function stopAllObservers() {
    if (checkInterval) clearInterval(checkInterval);
    if (insertTargetObserver) {
      try { insertTargetObserver.disconnect(); } catch (error) { /* noop */ }
    }
  }

  // ==================== World ID解決待機 ====================
  // VRClistはSPAのため、URL遷移直後は#world-linkがまだDOMに存在しない
  // ことがある。ポーリングで一定時間待機してから初期化する。
  function waitForWorldId(maxWaitMs = TIMEOUTS.ELEMENT_WAIT) {
    return new Promise((resolve) => {
      const existing = getWorldIdFromPage();
      if (existing) {
        resolve(existing);
        return;
      }

      const start = Date.now();
      const interval = setInterval(() => {
        const worldId = getWorldIdFromPage();
        if (worldId) {
          clearInterval(interval);
          resolve(worldId);
        } else if (Date.now() - start > maxWaitMs) {
          clearInterval(interval);
          resolve(null);
        }
      }, 300);
    });
  }

  // ==================== 初期化 ====================
  async function init() {
    if (DEBUG_LOG) {
      console.log('[VRClist Page] init() called. pathname=', window.location.pathname);
    }
    if (!isTargetPage()) {
      if (DEBUG_LOG) {
        console.log('[VRClist Page] Not a target page (isTargetPage() = false). Skipping.');
      }
      return;
    }

    if (!checkExtensionContext()) {
      if (DEBUG_LOG) {
        console.log('[VRClist Page] Extension context invalidated. Stopping script.');
      }
      return;
    }

    const isEnabled = await checkExtensionSettings();
    if (!isEnabled) {
      if (DEBUG_LOG) {
        console.log('[VRClist Page] Integration disabled by settings (enableVrcListIntegration=false), or settings check returned false.');
      }
      return;
    }

    await initContentScriptSettings();
    watchSettingsChanges(() => {
      const existingPanel = deepQuerySelector(`#${PANEL_ID}`);
      if (existingPanel) {
        existingPanel.remove();
        currentPanelElement = null;
        init();
      }
    });

    if (deepQuerySelector(`#${PANEL_ID}`)) return;

    if (DEBUG_LOG) {
      console.log('[VRClist Page] Waiting for #world-link to resolve wrld_ ID...');
    }
    const worldId = await waitForWorldId();
    if (!worldId) {
      if (DEBUG_LOG) {
        console.warn('[VRClist Page] Could not resolve wrld_ ID from page after waiting. #world-link element (deep):', deepQuerySelector(SELECTORS.WORLD_LINK));
      }
      return;
    }
    if (DEBUG_LOG) {
      console.log('[VRClist Page] Resolved worldId =', worldId, ' Inserting panel...');
    }

    await Promise.all([
      loadSavedWorlds(),
      loadFolders(),
      loadVRCWorlds()
    ]);

    createButtonPanel(worldId);
    monitorInsertTargetAndMigrate(worldId);
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

})();

if (window.VRCHelpers && window.VRCHelpers.DEBUG_LOG) {
  console.log('[VRClist Page] Script ready');
}
