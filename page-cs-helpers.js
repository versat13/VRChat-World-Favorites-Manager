// page-cs-helpers.js v1.2.2
// Content Script 共通ヘルパー関数(page-favorites.js, page-world.js で使用)
// v1.2.2: フォルダモーダル・通知をpage-helpers-shared.jsに移動

(function (window) {
  'use strict';

  const DEBUG_LOG = false; // 本番=false, 開発=true

  // ==================== 翻訳データ ====================
  const translations = {
    ja: {
      extInvalidated: '拡張機能が更新されました。ページを再読み込みしてください',
      copyLinkBtn: 'リンク',
      chromeSaveBtn: 'Chrome保存',
      favoritesBtn: 'Favorites',
      deleteBtn: '削除',
      deleteConfirm: '確定',
      savedSuccess: '✓ {name} を追加しました',
      removedSuccess: '✓ Chromeから削除しました',
      linkCopied: 'リンクをコピーしました',
      alreadySaved: 'ℹ️ このワールドは既に保存されています',
      alreadyFavorited: 'ℹ️ 既にお気に入り済みです',
      alreadyFavoritedError: 'ℹ️ 既にお気に入り登録されています (エラー400)',
      privateWorldError: '✖ プライベートワールド「{name}」はVRCフォルダに保存できません',
      addFailed: '✖ 追加に失敗しました',
      deleteFailed: '✖ 削除に失敗しました',
      worldIdResolving: 'World IDを取得しています...',
      worldIdResolveFailed: 'World IDを取得できませんでした',
      worldIdUnresolved: 'World IDが未解決です',
      notInFavorites: 'お気に入りに登録されていません',
      deleteSuccess: 'お気に入りから削除しました',
      vrcDeleteFailed: 'お気に入り削除に失敗しました: {error}',
      addToFavorites: 'お気に入りに追加しました',
      addToFavoritesFailed: 'お気に入り追加に失敗しました: {error}',
      selectVRCFolder: '🗂 VRChatフォルダに追加',
      selectVRCFolderDesc: '「{name}」を追加するVRChatフォルダを選択してください',
      selectExtFolder: '🗂 保存先フォルダを選択',
      selectExtFolderDesc: '「{name}」を保存するフォルダを選択してください',
      cancel: 'キャンセル',
      moveFailed: 'フォルダ移動に失敗しました: {error}',
      moveSuccess: '✓ 「{folder}」フォルダに移動しました',
      uncategorized: '未分類',
      alreadyDeleted: 'ℹ️ 既に削除済みです',
      privateWorldCannotAdd: '🔒 プライベートワールドは追加できません',
      copyLink: 'リンクをコピー',
      saveToChrome: 'Chromeに保存',
      deleteFromChrome: 'Chromeから削除',
      deleteFromVRC: 'VRChatから削除',
      addedSuccess: '「{name}」を未分類に追加しました',
      selectFolder: '📁 フォルダを選択',
      selectFolderDesc: 'このワールドを保存するフォルダを選択してください',
      savedTo: '✓ {name} を追加しました',
      deletedSuccess: '✔ Chromeから削除しました',
      vrcDeleteSuccess: '✔ VRChatから削除しました',
      vrcDeleteNotFound: '✖ 削除ボタンが見つかりませんでした',
      vrcDeleteNotFavorited: 'ℹ️ このワールドはVRChatのお気に入りに登録されていません',
      worldIdNotFound: 'ワールドIDを取得できませんでした',
      error: 'エラーが発生しました',
      copyFailed: 'リンクのコピーに失敗しました',
      registered: '✓ 登録済み',
      addToWatchlist: 'ウォッチリストに追加',
      addedToWatchList: '{authorName} をウォッチリストに追加しました',
      alreadyInWatchList: '{authorName} は既にリストに登録済みです',
      addToWatchListFailed: 'ウォッチリストへの追加に失敗しました',
      authorInfoFetchFailed: '作者情報の取得に失敗しました',
      fetchingWorldDetails: 'ワールド情報を取得中...',
      worldDetailsFailed: 'ワールド情報の取得に失敗しました'
    },
    en: {
      extInvalidated: 'Extension context invalidated. Please reload the page.',
      copyLinkBtn: 'Link',
      chromeSaveBtn: 'Chrome Save',
      favoritesBtn: 'Favorites',
      deleteBtn: 'Delete',
      deleteConfirm: 'Confirm',
      savedSuccess: '✓ Added {name}',
      removedSuccess: '✓ Removed from Chrome',
      linkCopied: 'Link copied to clipboard',
      alreadySaved: 'ℹ️ This world is already saved',
      alreadyFavorited: 'ℹ️ Already favorited',
      alreadyFavoritedError: 'ℹ️ Already added to favorites (Error 400)',
      privateWorldError: '✖ Private world "{name}" cannot be saved to VRC folder',
      addFailed: '✖ Failed to add',
      deleteFailed: '✖ Failed to delete',
      worldIdResolving: 'Resolving World ID...',
      worldIdResolveFailed: 'Failed to resolve World ID',
      worldIdUnresolved: 'World ID is unresolved',
      notInFavorites: 'Not in favorites',
      deleteSuccess: 'Removed from favorites',
      vrcDeleteFailed: 'Failed to remove from favorites: {error}',
      addToFavorites: 'Added to favorites',
      addToFavoritesFailed: 'Failed to add to favorites: {error}',
      selectVRCFolder: '🗂 Add to VRChat Folder',
      selectVRCFolderDesc: 'Select VRChat folder to add "{name}"',
      selectExtFolder: '🗂 Select Folder',
      selectExtFolderDesc: 'Select folder to save "{name}"',
      cancel: 'Cancel',
      moveFailed: 'Failed to move folder: {error}',
      moveSuccess: '✓ Moved to "{folder}" folder',
      uncategorized: 'Uncategorized',
      alreadyDeleted: 'ℹ️ Already deleted',
      privateWorldCannotAdd: '🔒 Cannot add private world',
      copyLink: 'Copy Link',
      saveToChrome: 'Save to Chrome',
      deleteFromChrome: 'Remove from Chrome',
      deleteFromVRC: 'Delete from VRChat',
      addedSuccess: 'Added "{name}" to Uncategorized',
      selectFolder: '📁 Select Folder',
      selectFolderDesc: 'Select folder to save this world',
      savedTo: '✓ Added {name}',
      deletedSuccess: '✔ Removed from Chrome',
      vrcDeleteSuccess: '✔ Removed from VRChat',
      vrcDeleteNotFound: '✖ Delete button not found',
      vrcDeleteNotFavorited: 'ℹ️ This world is not in VRChat favorites',
      worldIdNotFound: 'Failed to get world ID',
      error: 'An error occurred',
      copyFailed: 'Failed to copy link',
      registered: '✓ Registered',
      addToWatchlist: 'Add to Watchlist',
      addedToWatchList: 'Added {authorName} to watch list',
      alreadyInWatchList: '{authorName} is already on the list',
      addToWatchListFailed: 'Failed to add to watch list',
      authorInfoFetchFailed: 'Failed to fetch author information',
      fetchingWorldDetails: 'Fetching world details...',
      worldDetailsFailed: 'Failed to fetch world details'
    }
  };

  let currentLang = 'ja';

  // ==================== 翻訳関数 ====================
  function t(key, params = {}) {
    let text = translations[currentLang][key] || key;
    Object.keys(params).forEach(param => {
      text = text.replace(`{${param}}`, params[param]);
    });
    return text;
  }

  async function initContentScriptSettings() {
    try {
      // 拡張機能コンテキストチェック
      if (!chrome.runtime?.id) {
        if (DEBUG_LOG) {
          console.log('[CS-Helpers] Extension context invalidated. Skipping settings load.');
        }
        return;
      }

      const result = await chrome.storage.sync.get('settings');
      if (result.settings) {
        currentLang = result.settings.language || 'ja';
      }
      if (DEBUG_LOG) {
        console.log(`[CS-Helpers] Initial language set to: ${currentLang}`);
      }
    } catch (error) {
      // Extension context invalidatedエラーの場合は静かに処理
      if (!error.message?.includes('Extension context invalidated')) {
        console.error('[CS-Helpers] Failed to load settings:', error);
      }
    }
  }

  function watchSettingsChanges(callback) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'sync' && changes.settings) {
        const newSettings = changes.settings.newValue;
        if (newSettings.language && newSettings.language !== currentLang) {
          currentLang = newSettings.language;
          if (DEBUG_LOG) {
            console.log(`[CS-Helpers] Language changed to: ${currentLang}`);
          }
          if (typeof callback === 'function') {
            callback();
          }
        }
      }
    });
  }

  // ==================== エラーチェック関数 ====================
  function isExtensionInvalidatedError(error) {
    return error && error.message && error.message.includes('Extension context invalidated');
  }

  function isAlreadyDeletedError(error) {
    return error && ['400', '404', 'not found'].some(code => error.includes(code));
  }

  function isPrivateWorldError(error) {
    return error && ['403', 'private'].some(code => error.includes(code));
  }

  // ==================== グローバルエクスポート ====================
  window.VRCHelpers = {
    t,
    initContentScriptSettings,
    watchSettingsChanges,
    isExtensionInvalidatedError,
    isAlreadyDeletedError,
    isPrivateWorldError,
    DEBUG_LOG
  };

  if (DEBUG_LOG) {
    console.log('[CS-Helpers] Loaded v1.2.2');
  }

})(window);