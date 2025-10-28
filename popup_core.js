// popup_core.js
// ==================== 翻訳データ ====================
// 翻訳データ (現状はpopup2_vrc_bridgeにも同一内容を揃えている)
const translations = {
  ja: {
    headerTitle: '🌎 VRChat World Favorites Manager',
    openWindowBtn: '🪟 別ウィンドウで表示',
    openOptionsBtn: '⚙️',
    editingBannerText: 'リスト編集中',
    searchPlaceholder: '🔍 ワールド名・作者名・IDで検索...',
    selectAllLabel: '全選択',
    sortAdded: '追加順',
    sortName: 'ワールド名',
    sortAuthor: '作者名',
    itemsText: 'items',
    displayCountLabel: '表示数',
    selectionCount: '選択中: {count}個',
    updateSelectedText: '再取得',
    moveSelectedText: '移動',
    deleteSelectedText: '削除',
    prevPageText: '◀ Prev',
    nextPageText: 'Next ▶',
    addWorldText: 'ワールドを追加',
    fetchDetailsText: 'サムネイル取得',
    syncText: 'VRChatと同期',
    refreshText: '再表示',
    importText: 'インポート',
    exportText: 'エクスポート',
    emptyState: 'ワールドがありません',
    folderNone: '未分類',
    folderAll: 'すべて',
    syncInProgress: '同期中は操作できません',
    vrcLimitExceeded: '{folder}は150件を超えるため移動できません',

    // モーダル関連
    renameFolderTitle: '✏️ フォルダ名を変更',
    folderNamePlaceholder: '新しいフォルダ名を入力...',
    renameConfirm: '変更',
    renameCancel: 'キャンセル',
    deleteFolderBtn: '削除',

    vrcFolderModalTitle: '🔄 VRChatと同期',
    vrcFolderDescription1: 'VRChat公式のお気に入りワールド一覧(4フォルダすべて)と同期します:',
    vrcFolderWarning: '⚠️ 注意: 拡張機能で整理したワールド一覧をVRChat公式に反映します',
    vrcFolderFetchInfo: '📥 取得: VRChat公式から全フォルダを取得(同期前の確認用)',
    vrcFetchBtn: '📥 取得',
    vrcSyncBtn: '🔄 同期',
    vrcCancelBtn: 'キャンセル',

    importExportTitle: '📥 インポート',
    exportTitle: '📤 エクスポート',
    importExportCancel: 'キャンセル',
    importTypeJson: 'JSON形式',
    importTypeJsonDesc: '拡張機能の標準形式(全データ)',
    importTypeCsv: 'CSV形式',
    importTypeCsvDesc: 'VRCX等(WorldID, World Name)/ワールド情報のみ',

    deleteModalTitle: '🗑️ 削除確認',
    deleteConfirm: '削除',
    deleteCancel: 'キャンセル',
    deleteConfirmText: 'を削除しますか?',

    // 通知メッセージ
    urlCopied: 'URLをコピーしました',
    copyFailed: 'コピーに失敗しました',
    detailsFetching: 'ワールド情報を取得中...',
    detailsUpdated: 'ワールド情報を更新しました',
    updateFailed: '更新に失敗しました',
    detailsFetchingFailed: 'ワールド情報の取得に失敗しました',
    errorOccurred: 'エラーが発生しました',
    allDetailsFetched: '全てのワールド情報を取得済みです',
    thumbnailCancel: 'サムネイル取得をキャンセルしました',
    fetchComplete: '取得完了: 成功 {successCount}件 / 失敗 {failCount}件',
    updateComplete: '更新完了: 成功 {successCount}件 / 失敗 {failCount}件',
    commitInProgress: '確定中...',
    commitSuccess: '変更を確定しました(移動: {moved}件, 削除: {deleted}件)',
    commitSuccessNoChanges: '変更はありませんでした',
    commitFailed: '確定に失敗しました: {error}',
    commitProcessFailed: '確定処理に失敗しました',
    loadingView: '読み込み中...',
    loadingText: '読み込み中...',
    reload: '再表示',
    reloadFailed: '再読み込みに失敗しました',
    operationDuringSync: '同期中は操作できません',
    vrcLimitExceededError: '{folder}は150件を超えているため追加できません',
    privateWorldsCannotMove: 'プライベート・削除済ワールドは移動できません: 「{names}{more}」',
    worldsMovedConfirm: '{count}個のワールドを移動しました(確定ボタンを押してください)',
    worldsMoved: '{count}個のワールドを移動しました(確定ボタンを押してください)',
    moveFailedError: '移動に失敗しました',
    andOthers: ' 他{count}件',
    deletedConfirm: '削除しました(確定ボタンを押してください)',
    addFolderSuccess: 'フォルダを追加しました',
    addFolderFailed: 'フォルダの追加に失敗しました',
    renameInputWarning: 'フォルダ名を入力してください',
    folderRenamed: 'フォルダ名を変更しました',
    renameFolderFailed: 'フォルダ名の変更に失敗しました',
    deleteFolderSuccess: 'フォルダ「{folderName}」を削除しました({worldCount}件のワールドは未分類に移動)',
    deleteFolderFailed: 'フォルダの削除に失敗しました',
    vrcOver100Warning: '{folder}は100件を超えています。同期機能は使用できません。',
    openSyncWindowFailed: '同期ウィンドウを開けませんでした',
    syncFailed: '{folders}が100件を超えているため同期できません',
    vrcOver100Move: '{folder}は100件を超えているため移動できません',
    addWorldTitle: 'ワールドを追加',
    addWorldInputPrompt: 'ワールドIDまたはURLを入力してください:',
    addWorldFolderPrompt: '追加先のフォルダを選択してください:',
    addWorldButton: '追加',
    cancelButton: 'キャンセル',
    inputRequiredWarning: 'ワールドIDまたはURLを入力してください',
    folderSelectWarning: 'フォルダを選択してください',
    invalidWorldIdOrUrl: '無効なワールドIDまたはURLです',
    worldDetailsFailed: 'ワールド情報の取得に失敗しました',
    worldAdded: 'を追加しました',
    worldAlreadyRegistered: '既に登録されています',
    worldExistsInFolder: '「{folderName}」に既に登録されています',
    privateWorldCannotAdd: '「{worldName}」はプライベートまたは削除済みのためVRCフォルダに追加できません',
    vrcLimitExceededAdd: 'VRCフォルダが150件を超えているため追加できません',
    syncLimitExceededAdd: '共有ストレージが1000件を超えているため追加できません',
    addWorldFailed: 'ワールドの追加に失敗しました',
    fetchingWorldDetails: 'ワールド情報を取得中...',
    moveFolderTitle: 'フォルダを移動',
    worldsToMove: '個のワールドを移動します',
    selectFolderTitle: 'フォルダを選択',
    selectFolderPrompt: '移動先のフォルダを選択してください:',
    registeredIn: '現在「{folderName}」に登録されています',
    registered: '登録済み',
    confirmButton: '確定',
    exportSyncError: 'VRChatへのエクスポートは同期機能から実行してください',
    exportTargetTitle: 'エクスポート対象を選択',
    exportSelectPrompt: 'エクスポートするフォルダを選択してください:',
    importTargetTitle: 'インポート先を選択',
    importSelectPrompt: 'インポート先のフォルダを選択してください:',
    allBackup: '📦 完全バックアップ',
    uncategorized: '未分類',
    limitReached: '(上限)',
    syncNotPossible: '(同期不可)',
    backupCreating: '完全バックアップを作成中...',
    exportCompleteFull: '完全バックアップのエクスポートが完了しました',
    dataFetchError: 'データの取得に失敗しました',
    exportFailed: 'エクスポートに失敗しました: {error}',
    exportWorldsComplete: '{count}件のワールドをエクスポートしました',
    exportNoWorld: 'エクスポートするワールドがありません',
    importConfirm: '⚠️ 完全バックアップを復元すると、現在のデータが上書きされます。続行しますか?',
    importRestoring: '完全バックアップを復元中...',
    importRestored: '完全バックアップの復元が完了しました',
    importFailedGeneral: 'インポートに失敗しました: {error}',
    importNoWorld: 'インポートするワールドがありません',
    importingWorlds: '{count}件のワールドをインポート中...',
    importComplete: 'インポート完了: 追加 {addedCount}件 / 移動 {movedCount}件 / スキップ {skippedCount}件',
    vrcLimitExceededImport: 'VRCフォルダの上限(150件)を超えています',
    syncLimitExceededImport: '共有ストレージの上限(1000件)を超えています',
    limitExceededPartial: '一部のワールドが制限を超えたためインポートできませんでした',
    unknownError: '不明なエラー',
    importProcessFailed: 'インポート処理に失敗しました',
    fetchingVRCAll: 'VRChat公式から全フォルダを取得中...',
    fetchVRCComplete: '取得完了: {addedCount}件追加 / 全{totalFolders}フォルダ',
    syncFetchFailed: '同期に失敗しました: {error}',
    fetchingThumbnails: 'サムネイル情報を取得します...',
    updatingWorlds: '更新中',
    contextMenuQuickAdd: 'このワールドを未分類に追加',
    contextMenuFolderSelect: 'このワールドをフォルダに保存...',
    contextMenuDisabled: 'コンテキストメニューは無効です',
    privateWorldsCannotMoveWarning: 'プライベート・削除済ワールドはVRCフォルダに移動できません: 「{names}{more}」'
  },
  en: {
    headerTitle: '🌎 VRChat World Favorites Manager',
    openWindowBtn: '🪟 Open in Window',
    openOptionsBtn: '⚙️',
    editingBannerText: 'List Editing',
    searchPlaceholder: '🔍 Search by world name, author, or ID...',
    selectAllLabel: 'Select All',
    sortAdded: 'Added',
    sortName: 'World Name',
    sortAuthor: 'Author',
    itemsText: 'items',
    displayCountLabel: 'Display',
    selectionCount: 'Selected: {count}',
    updateSelectedText: 'Refetch',
    moveSelectedText: 'Move',
    deleteSelectedText: 'Delete',
    prevPageText: '◀ Prev',
    nextPageText: 'Next ▶',
    addWorldText: 'Add World',
    fetchDetailsText: 'Fetch Thumbnails',
    syncText: 'Sync with VRChat',
    refreshText: 'Refresh',
    importText: 'Import',
    exportText: 'Export',
    emptyState: 'No worlds found',
    folderNone: 'Uncategorized',
    folderAll: 'All',
    syncInProgress: 'Cannot operate during sync',
    vrcLimitExceeded: '{folder} cannot exceed 150 items',

    renameFolderTitle: '✏️ Rename Folder',
    folderNamePlaceholder: 'Enter new folder name...',
    renameConfirm: 'Rename',
    renameCancel: 'Cancel',
    deleteFolderBtn: 'Delete',

    vrcFolderModalTitle: '🔄 Sync with VRChat',
    vrcFolderDescription1: 'Sync with VRChat official favorite worlds (all 4 folders):',
    vrcFolderWarning: '⚠️ Note: This will reflect your organized list to VRChat official',
    vrcFolderFetchInfo: '📥 Fetch: Get all folders from VRChat (for pre-sync check)',
    vrcFetchBtn: '📥 Fetch',
    vrcSyncBtn: '🔄 Sync',
    vrcCancelBtn: 'Cancel',

    importExportTitle: '📥 Import',
    exportTitle: '📤 Export',
    importExportCancel: 'Cancel',
    importTypeJson: 'JSON Format',
    importTypeJsonDesc: 'Standard format (full data)',
    importTypeCsv: 'CSV Format',
    importTypeCsvDesc: 'VRCX etc (WorldID, World Name) / World info only',

    deleteModalTitle: '🗑️ Confirm Deletion',
    deleteConfirm: 'Delete',
    deleteCancel: 'Cancel',
    deleteConfirmText: '?',

    urlCopied: 'URL copied',
    copyFailed: 'Failed to copy',
    detailsFetching: 'Fetching world details...',
    detailsUpdated: 'World details updated',
    updateFailed: 'Update failed',
    detailsFetchingFailed: 'Failed to fetch world details',
    errorOccurred: 'An error occurred',
    allDetailsFetched: 'All world details already fetched',
    thumbnailCancel: 'Thumbnail fetch cancelled',
    fetchComplete: 'Fetch complete: {successCount} success / {failCount} failed',
    updateComplete: 'Update complete: {successCount} success / {failCount} failed',
    commitInProgress: 'Committing...',
    commitSuccess: 'Changes committed (moved: {moved}, deleted: {deleted})',
    commitSuccessNoChanges: 'No changes to commit',
    commitFailed: 'Commit failed: {error}',
    commitProcessFailed: 'Commit process failed',
    loadingView: 'Loading...',
    loadingText: 'Loading...',
    reload: 'Refresh',
    reloadFailed: 'Failed to reload',
    operationDuringSync: 'Cannot operate during sync',
    vrcLimitExceededError: '{folder} exceeds 150 items limit',
    privateWorldsCannotMove: 'Private/deleted worlds cannot be moved: "{names}{more}"',
    worldsMovedConfirm: '{count} worlds moved (please confirm)',
    worldsMoved: '{count} worlds moved (please confirm)',
    moveFailedError: 'Failed to move',
    andOthers: ' and {count} more',
    deletedConfirm: 'Deleted (please confirm)',
    addFolderSuccess: 'Folder added',
    addFolderFailed: 'Failed to add folder',
    renameInputWarning: 'Please enter folder name',
    folderRenamed: 'Folder renamed',
    renameFolderFailed: 'Failed to rename folder',
    deleteFolderSuccess: 'Folder "{folderName}" deleted ({worldCount} worlds moved to uncategorized)',
    deleteFolderFailed: 'Failed to delete folder',
    vrcOver100Warning: '{folder} exceeds 100 items. Sync unavailable.',
    openSyncWindowFailed: 'Failed to open sync window',
    syncFailed: 'Cannot sync: {folders} exceeds 100 items',
    vrcOver100Move: '{folder} exceeds 100 items, cannot move',
    addWorldTitle: 'Add World',
    addWorldInputPrompt: 'Enter World ID or URL:',
    addWorldFolderPrompt: 'Select destination folder:',
    addWorldButton: 'Add',
    cancelButton: 'Cancel',
    inputRequiredWarning: 'Please enter World ID or URL',
    folderSelectWarning: 'Please select a folder',
    invalidWorldIdOrUrl: 'Invalid World ID or URL',
    worldDetailsFailed: 'Failed to fetch world details',
    worldAdded: ' added',
    worldAlreadyRegistered: 'Already registered',
    worldExistsInFolder: 'Already registered in "{folderName}"',
    privateWorldCannotAdd: '"{worldName}" is private/deleted and cannot be added to VRC folder',
    vrcLimitExceededAdd: 'VRC folder exceeds 150 items limit',
    syncLimitExceededAdd: 'Sync storage exceeds 1000 items limit',
    addWorldFailed: 'Failed to add world',
    fetchingWorldDetails: 'Fetching world details...',
    moveFolderTitle: 'Move Folder',
    worldsToMove: ' worlds to move',
    selectFolderTitle: 'Select Folder',
    selectFolderPrompt: 'Select destination folder:',
    registeredIn: 'Currently registered in "{folderName}"',
    registered: 'Registered',
    confirmButton: 'Confirm',
    exportSyncError: 'Export to VRChat via sync function',
    exportTargetTitle: 'Select Export Target',
    exportSelectPrompt: 'Select folder to export:',
    importTargetTitle: 'Select Import Destination',
    importSelectPrompt: 'Select destination folder:',
    allBackup: '📦 Full Backup',
    uncategorized: 'Uncategorized',
    limitReached: '(Limit)',
    syncNotPossible: '(No Sync)',
    backupCreating: 'Creating full backup...',
    exportCompleteFull: 'Full backup export completed',
    dataFetchError: 'Failed to fetch data',
    exportFailed: 'Export failed: {error}',
    exportWorldsComplete: '{count} worlds exported',
    exportNoWorld: 'No worlds to export',
    importConfirm: '⚠️ Restoring full backup will overwrite current data. Continue?',
    importRestoring: 'Restoring full backup...',
    importRestored: 'Full backup restored',
    importFailedGeneral: 'Import failed: {error}',
    importNoWorld: 'No worlds to import',
    importingWorlds: 'Importing {count} worlds...',
    importComplete: 'Import complete: {addedCount} added / {movedCount} moved / {skippedCount} skipped',
    vrcLimitExceededImport: 'VRC folder limit (150) exceeded',
    syncLimitExceededImport: 'Sync storage limit (1000) exceeded',
    limitExceededPartial: 'Some worlds exceeded limits',
    unknownError: 'Unknown error',
    importProcessFailed: 'Import process failed',
    fetchingVRCAll: 'Fetching all folders from VRChat...',
    fetchVRCComplete: 'Fetch complete: {addedCount} added / {totalFolders} folders total',
    syncFetchFailed: 'Sync failed: {error}',
    fetchingThumbnails: 'Fetching thumbnail information...',
    updatingWorlds: 'Updating',
    contextMenuQuickAdd: 'Add this world to Uncategorized',
    contextMenuFolderSelect: 'Save this world to folder...',
    contextMenuDisabled: 'Context menu is disabled',
    privateWorldsCannotMoveWarning: 'Private/deleted worlds cannot be moved to VRC folders: "{names}{more}"'
  }
};


let currentLang = 'ja';
let currentTheme = 'dark';

// ==================== 初期化 ====================
async function initSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    if (result.settings) {
      currentLang = result.settings.language || 'ja';
      currentTheme = result.settings.theme || 'dark';
      applyTheme();
      applyLanguage();
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// ==================== テーマ適用 ====================
function applyTheme() {
  if (currentTheme === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }
}

// ==================== 言語適用 ====================
function applyLanguage() {
  document.documentElement.lang = currentLang;

  // 各要素のテキストを更新
  Object.keys(translations[currentLang]).forEach(key => {
    const element = document.getElementById(key);
    if (element) {
      if (element.tagName === 'INPUT') {
        element.placeholder = translations[currentLang][key];
      } else if (element.tagName === 'OPTION') {
        element.textContent = translations[currentLang][key];
      } else if (element.tagName === 'SPAN' && element.parentElement.tagName === 'BUTTON') {
        element.textContent = translations[currentLang][key];
      } else {
        element.textContent = translations[currentLang][key];
      }
    }
  });
}

// 翻訳関数（動的メッセージ用）
function t(key, params = {}) {
  let text = translations[currentLang][key] || key;
  // パラメータ置換
  Object.keys(params).forEach(param => {
    text = text.replace(`{${param}}`, params[param]);
  });
  return text;
}

// ==================== 設定変更監視 ====================
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.settings) {
    const newSettings = changes.settings.newValue;
    if (newSettings.language && newSettings.language !== currentLang) {
      currentLang = newSettings.language;
      applyLanguage();
    }
    if (newSettings.theme && newSettings.theme !== currentTheme) {
      currentTheme = newSettings.theme;
      applyTheme();
    }
  }
});

// ========================================
// グローバル状態
// ========================================
let allWorlds = [];
let folders = [];
let vrcFolders = [];
let selectedWorldIds = new Set();
let currentFolder = 'all';
let currentPage = 1;
let itemsPerPage = 20;
let isFetchingDetails = false;
let shouldCancelFetch = false;
let sortBy = 'added';
let sortAscending = false;

// 🔥 同期中フラグ追加
let isSyncing = false;

// リスト編集中の状態管理
let isEditingList = false;
let editingBuffer = {
  movedWorlds: [],
  deletedWorlds: []
};

// モーダル状態
let pendingWorldData = null;
let currentRenamingFolder = null;
let currentMovingWorldIds = [];
let currentImportExportMode = null;
let pendingDeleteAction = null;

// フォルダ並び順
let folderOrder = [];

// デバッグログ
const DEBUG_LOG = true;

function logAction(action, data) {
  if (!DEBUG_LOG) return;
  console.log(`[${new Date().toISOString()}] [UI-ACTION] ${action}:`, data);
}

function logError(action, error, data = null) {
  if (!DEBUG_LOG) return;
  if (action.includes('LIMIT') || action.includes('RESTRICTED')) {
    console.warn(`[${new Date().toISOString()}] [UI-WARN] ${action}:`, error);
  } else {
    console.error(`[${new Date().toISOString()}] [UI-ERROR] ${action}:`, error);
  }
  if (data) console.log('Data:', data);
}

// ========================================
// 設定管理
// ========================================
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get([
      'currentFolder', 'itemsPerPage', 'sortBy', 'sortAscending', 'folderOrder'
    ]);

    if (result.currentFolder) currentFolder = result.currentFolder;
    if (result.itemsPerPage) {
      itemsPerPage = result.itemsPerPage;
      document.getElementById('itemsPerPageInput').value = itemsPerPage;
    }
    if (result.sortBy) {
      sortBy = result.sortBy;
      document.getElementById('sortSelect').value = sortBy;
    }
    if (result.sortAscending !== undefined) {
      sortAscending = result.sortAscending;
      document.getElementById('sortOrder').textContent = sortAscending ? '⬆️' : '⬇️';
    }
    if (result.folderOrder) {
      folderOrder = result.folderOrder;
    }
  } catch (error) {
    console.error('[Popup] Failed to load settings:', error);
  }
}

async function saveSettings() {
  try {
    await chrome.storage.local.set({
      currentFolder,
      itemsPerPage,
      sortBy,
      sortAscending,
      folderOrder
    });
  } catch (error) {
    console.error('[Popup] Failed to save settings:', error);
  }
}

// ========================================
// 通知表示
// ========================================
function showNotification(message, type = 'info') {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.className = `notification ${type} show`;

  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

// ========================================
// ユーティリティ
// ========================================
function isValidWorldId(str) {
  return /^wrld_[a-f0-9-]+$/i.test(str.trim());
}