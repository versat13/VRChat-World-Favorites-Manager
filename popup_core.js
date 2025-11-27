// popup_core.js v1.2.1
// グローバル状態管理・設定・翻訳システム

// ============================================================
// デバッグモード設定
// 本番環境では DEBUG_ENABLED を false に設定してください
// ============================================================
const DEBUG_ENABLED = false; // 本番リリース時: false に変更
const DEBUG_LOG_ACTIONS = DEBUG_ENABLED && true; // アクションログ
const DEBUG_LOG_ERRORS = true; // エラーは常に出力

// ============================================================
// バージョン情報
// ============================================================
const APP_VERSION = '1.2.1';
const BUILD_DATE = '2025-01';

// ============================================================
// 翻訳データ
// ============================================================
const translations = {
    ja: {
        // ヘッダー
        headerTitle: '🌎 VRChat お気に入りワールド管理',
        openWindowBtn: '🪟 別ウィンドウで表示',
        openOptionsBtn: '⚙️',

        // 編集バナー
        editingBannerText: 'リスト編集中',
        changeCount: '{count}件の変更',

        // 検索
        searchPlaceholder: '🔍 ワールド名・作者名・IDで検索...',

        // ワールド追加
        addWorldUrlPlaceholder: 'wrld_... または https://vrchat.com/home/world/wrld_...',

        // 選択UI
        selectAllLabel: '全選択',

        // ソート
        sortAdded: '追加順',
        sortName: 'ワールド名',
        sortAuthor: '作者名',

        // ページャー
        itemsText: 'items',
        displayCountLabel: '表示数',
        selectionCount: '選択中: {count}個',
        updateSelectedText: '再取得',
        moveSelectedText: '移動',
        deleteSelectedText: '削除',
        prevPageText: '◀ Prev',
        nextPageText: 'Next ▶',
        currentPageOf: '{current} / {total}',

        // ボタン
        addWorldText: 'ワールドを追加',
        fetchDetailsText: 'サムネイル取得',
        syncText: 'VRChatと同期',
        refreshText: '再表示',
        confirmText: '確定',
        importText: 'インポート',
        exportText: 'エクスポート',

        // 状態表示
        emptyState: 'ワールドがありません',
        loadingState: '読み込み中...',
        folderNone: '未分類',
        folderAll: 'All',
        unknownAuthor: '不明',
        worldsNotFound: 'ワールドが見つかりません',

        // ワールドアクション
        openInNewTab: '新しいタブで開く',
        copyUrl: 'URLをコピー',
        refetchDetails: '詳細を再取得',
        deleteWorld: '削除',

        // 制限関連
        syncInProgress: '同期中は操作できません',
        vrcLimitExceeded: '{folder}は200件を超えるため移動できません',

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
        importTypeJsonTitle: 'JSON形式',
        importTypeJsonDesc: '拡張機能の標準形式(全データ)',
        importTypeCsvTitle: 'CSV形式',
        importTypeCsvDesc: 'VRCX等(WorldID, World Name)/ワールド情報のみ',

        deleteModalTitle: '🗑️ 削除確認',
        deleteConfirm: '削除',
        deleteCancel: 'キャンセル',
        deleteSelectedConfirm: '選択中の{count}個のワールドを削除しますか?',
        deleteSingleConfirm: '「{name}」を削除しますか?',

        // ステータスバッジ
        statusDeleted: '🗑️ Deleted',
        statusPrivate: '🔒 Private',
        statusPublic: '🌍 Public',

        // ウォッチリスト関連
        worldNotFound: 'ワールドが見つかりません',
        addedToWatchList: '{authorName} をウォッチリストに追加しました',
        alreadyInWatchList: '{authorName} は既にウォッチリスト中です',
        addToWatchListFailed: 'ウォッチリストへの追加に失敗しました',
        authorInfoFetchFailed: '作者情報の取得に失敗しました',

        // 通知メッセージ
        urlCopied: 'URLをコピーしました',
        copyFailed: 'コピーに失敗しました',
        detailsFetching: 'ワールド情報を取得中...',
        detailsUpdated: 'ワールド情報を更新しました',
        updateFailed: '更新に失敗しました',
        detailsFetchingFailed: 'ワールド情報の取得に失敗しました',
        errorOccurred: 'エラーが発生しました',
        worldDeleted: 'このワールドは削除されています',
        allDetailsFetched: '全てのワールド情報を取得済みです',
        thumbnailCancel: 'サムネイル取得をキャンセルしました',
        fetchComplete: '取得完了: 成功 {successCount}件 / 失敗 {failCount}件',
        updateComplete: '更新完了: 成功 {successCount}件 / 失敗 {failCount}件',
        commitInProgress: '確定中...',
        rateLimitWaiting: '60秒間の処理上限に達しました。しばらくお待ちください...',
        rateLimitTimeout: 'カウントダウンが中断されました',
        commitSuccess: '変更を確定しました(移動: {moved}件, 削除: {deleted}件)',
        commitSuccessNoChanges: '変更はありませんでした',
        commitFailed: '確定に失敗しました: {error}',
        commitProcessFailed: '確定処理に失敗しました',
        autoCommitPending: '追加の変更を自動で反映します...',
        loadingView: '読み込み中...',
        loadingText: '読み込み中...',
        reload: '再表示',
        reloadFailed: '再読み込みに失敗しました',
        operationDuringSync: '同期中は操作できません',
        vrcLimitExceededError: '{folder}は200件を超えているため追加できません',
        privateWorldsCannotMove: 'プライベート・削除済ワールドは移動できません: 「{names}{more}」',
        worldsMovedConfirm: '{count}個のワールドを移動しました(確定ボタンを押してください)',
        worldsMoved: '{count}個のワールドを移動しました(確定ボタンを押してください)',
        moveFailedError: '移動に失敗しました',
        moveFailed: '移動に失敗しました',
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
        addWorldUrlPlaceholder: 'wrld_... または https://vrchat.com/home/world/wrld_...',
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
        vrcLimitExceededAdd: 'VRCフォルダが200件を超えているため追加できません',
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
        vrcLimitExceededImport: 'VRCフォルダの上限(200件)を超えています',
        syncLimitExceededImport: '共有ストレージの上限(1000件)を超えています',
        limitExceededPartial: '一部のワールドが制限を超えたためインポートできませんでした',
        unknownError: '不明なエラー',
        importProcessFailed: 'インポート処理に失敗しました',
        fetchingVRCAll: 'VRChat公式から全フォルダを取得中...',
        fetchVRCComplete: '取得完了: {addedCount}件追加 / 全{totalFolders}フォルダ',
        syncFetchFailed: '同期に失敗しました: {error}',
        fetchingThumbnails: 'サムネイル情報を取得します...',
        updatingWorlds: '更新中',
        reflectComplete: '反映完了: {removedCount}件削除 / {movedCount}件移動 / {addedCount}件追加',
        contextMenuQuickAdd: 'このワールドを未分類に追加',
        contextMenuFolderSelect: 'このワールドをフォルダに保存...',
        contextMenuDisabled: 'コンテキストメニューは無効です',
        privateWorldsCannotMoveWarning: 'プライベート・削除済ワールドはVRCフォルダに移動できません: 「{names}{more}」',
        dataLoadFailed: 'データの読み込みに失敗しました',

        // 重複解消
        resolvingDuplicates: '重複ワールドを解消中...',
        duplicatesResolved: '{count}件の重複を解消しました',
        noDuplicatesFound: '重複は見つかりませんでした',
        duplicateResolveFailed: '重複解消に失敗しました: {error}'
    },
    en: {
        // Header
        headerTitle: '🌎 VRChat World Favorites Manager',
        openWindowBtn: '🪟 Open in New Window',
        openOptionsBtn: '⚙️',

        // Editing Banner
        editingBannerText: 'Editing List',
        changeCount: '{count} Changes',

        // Search
        searchPlaceholder: '🔍 Search by World Name, Author, or ID...',

        // Add World
        addWorldUrlPlaceholder: 'wrld_... or https://vrchat.com/home/world/wrld_...',

        // Selection UI
        selectAllLabel: 'Select All',

        // Sort
        sortAdded: 'Date Added',
        sortName: 'World Name',
        sortAuthor: 'Author Name',

        // Pager
        itemsText: 'items',
        displayCountLabel: 'Display Count',
        selectionCount: 'Selected: {count}',
        updateSelectedText: 'Refetch',
        moveSelectedText: 'Move',
        deleteSelectedText: 'Delete',
        prevPageText: '◀ Prev',
        nextPageText: 'Next ▶',
        currentPageOf: '{current} / {total}',

        // Buttons
        addWorldText: 'Add World',
        fetchDetailsText: 'Fetch Thumbnails',
        syncText: 'Sync with VRChat',
        refreshText: 'Refresh',
        confirmText: 'Commit',
        importText: 'Import',
        exportText: 'Export',

        // Status Display
        emptyState: 'No Worlds',
        loadingState: 'Loading...',
        folderNone: 'Uncategorized',
        folderAll: 'All',
        unknownAuthor: 'Unknown',
        worldsNotFound: 'Worlds not found',

        // World Actions
        openInNewTab: 'Open in New Tab',
        copyUrl: 'Copy URL',
        refetchDetails: 'Refetch Details',
        deleteWorld: 'Delete',

        // Restriction Related
        syncInProgress: 'Cannot operate during sync',
        vrcLimitExceeded: 'Cannot move to {folder} as it exceeds 200 items',

        // Modal Related
        renameFolderTitle: '✏️ Rename Folder',
        folderNamePlaceholder: 'Enter new folder name...',
        renameConfirm: 'Rename',
        renameCancel: 'Cancel',
        deleteFolderBtn: 'Delete',

        vrcFolderModalTitle: '🔄 Sync with VRChat',
        vrcFolderDescription1: 'Sync with the official VRChat favorite world list (all 4 folders):',
        vrcFolderWarning: '⚠️ Warning: The world list organized in the extension will be reflected in the official VRChat favorites.',
        vrcFolderFetchInfo: '📥 Fetch: Fetch all folders from VRChat official (for pre-sync review)',
        vrcFetchBtn: '📥 Fetch',
        vrcSyncBtn: '🔄 Sync',
        vrcCancelBtn: 'Cancel',

        importExportTitle: '📥 Import',
        exportTitle: '📤 Export',
        importExportCancel: 'Cancel',
        importTypeJsonTitle: 'JSON Format',
        importTypeJsonDesc: 'Standard extension format (all data)',
        importTypeCsvTitle: 'CSV Format',
        importTypeCsvDesc: 'VRCX, etc. (WorldID, World Name) / World info only',

        deleteModalTitle: '🗑️ Delete Confirmation',
        deleteConfirm: 'Delete',
        deleteCancel: 'Cancel',
        deleteSelectedConfirm: 'Are you sure you want to delete the {count} selected worlds?',
        deleteSingleConfirm: 'Are you sure you want to delete "{name}"?',

        // Status Badge
        statusDeleted: '🗑️ Deleted',
        statusPrivate: '🔒 Private',
        statusPublic: '🌍 Public',

        // Watch list related
        worldNotFound: 'World not found',
        addedToWatchList: 'Added {authorName} to watch list',
        alreadyInWatchList: '{authorName} is already in watch list',
        addToWatchListFailed: 'Failed to add to watch list',
        authorInfoFetchFailed: 'Failed to fetch author information',

        // Notification Messages
        urlCopied: 'URL copied',
        copyFailed: 'Failed to copy',
        detailsFetching: 'Fetching world details...',
        detailsUpdated: 'World details updated',
        updateFailed: 'Update failed',
        detailsFetchingFailed: 'Failed to fetch world details',
        errorOccurred: 'An error occurred',
        worldDeleted: 'This world has been deleted',
        allDetailsFetched: 'All world details have been fetched',
        thumbnailCancel: 'Thumbnail fetching cancelled',
        fetchComplete: 'Fetch Complete: Success {successCount} / Fail {failCount}',
        updateComplete: 'Update Complete: Success {successCount} / Fail {failCount}',
        commitInProgress: 'Committing changes...',
        rateLimitWaiting: 'Rate limit reached for 60 seconds. Please wait...',
        rateLimitTimeout: 'Countdown interrupted',
        commitSuccess: 'Changes committed (Moved: {moved}, Deleted: {deleted})',
        commitSuccessNoChanges: 'No changes were made',
        commitFailed: 'Commit failed: {error}',
        commitProcessFailed: 'Commit process failed',
        autoCommitPending: 'Automatically reflecting additional changes...',
        loadingView: 'Loading View...',
        loadingText: 'Loading...',
        reload: 'Reload',
        reloadFailed: 'Failed to reload',
        operationDuringSync: 'Cannot operate during sync',
        vrcLimitExceededError: 'Cannot add as VRC folder exceeds 200 items',
        privateWorldsCannotMove: 'Private/Deleted worlds cannot be moved: "{names}{more}"',
        worldsMovedConfirm: 'Moved {count} worlds (Please click the Commit button)',
        worldsMoved: 'Moved {count} worlds (Please click the Commit button)',
        moveFailedError: 'Move failed',
        moveFailed: 'Move failed',
        andOthers: ' and {count} others',
        deletedConfirm: 'Deleted (Please click the Commit button)',
        addFolderSuccess: 'Folder added successfully',
        addFolderFailed: 'Failed to add folder',
        renameInputWarning: 'Please enter a folder name',
        folderRenamed: 'Folder renamed successfully',
        renameFolderFailed: 'Failed to rename folder',
        deleteFolderSuccess: 'Folder "{folderName}" deleted ({worldCount} worlds moved to Uncategorized)',
        deleteFolderFailed: 'Failed to delete folder',
        vrcOver100Warning: '{folder} exceeds 100 items. Sync function cannot be used.',
        openSyncWindowFailed: 'Failed to open sync window',
        syncFailed: 'Cannot sync as {folders} exceed 100 items',
        vrcOver100Move: 'Cannot move as {folder} exceeds 100 items',
        addWorldTitle: 'Add World',
        addWorldInputPrompt: 'Enter World ID or URL:',
        addWorldUrlPlaceholder: 'wrld_... or https://vrchat.com/home/world/wrld_...',
        addWorldFolderPrompt: 'Select destination folder:',
        addWorldButton: 'Add',
        cancelButton: 'Cancel',
        inputRequiredWarning: 'Please enter a World ID or URL',
        folderSelectWarning: 'Please select a folder',
        invalidWorldIdOrUrl: 'Invalid World ID or URL',
        worldDetailsFailed: 'Failed to fetch world details',
        worldAdded: ' added',
        worldAlreadyRegistered: 'Already registered',
        worldExistsInFolder: 'Already registered in "{folderName}"',
        privateWorldCannotAdd: 'Cannot add "{worldName}" to VRC folder as it is private or deleted',
        vrcLimitExceededAdd: 'Cannot add as VRC folder exceeds 200 items',
        syncLimitExceededAdd: 'Cannot add as shared storage exceeds 1000 items',
        addWorldFailed: 'Failed to add world',
        fetchingWorldDetails: 'Fetching world details...',
        moveFolderTitle: 'Move Folder',
        worldsToMove: 'worlds to move',
        selectFolderTitle: 'Select Folder',
        selectFolderPrompt: 'Select destination folder:',
        registeredIn: 'Currently registered in "{folderName}"',
        registered: 'Registered',
        confirmButton: 'Confirm',
        exportSyncError: 'Export to VRChat must be performed from the Sync function',
        exportTargetTitle: 'Select Export Target',
        exportSelectPrompt: 'Select the folder to export:',
        importTargetTitle: 'Select Import Destination',
        importSelectPrompt: 'Select the destination folder for import:',
        allBackup: '📦 Full Backup',
        uncategorized: 'Uncategorized',
        limitReached: '(Limit Reached)',
        syncNotPossible: '(Sync Not Possible)',
        backupCreating: 'Creating full backup...',
        exportCompleteFull: 'Full backup export complete',
        dataFetchError: 'Failed to fetch data',
        exportFailed: 'Export failed: {error}',
        exportWorldsComplete: 'Exported {count} worlds',
        exportNoWorld: 'No worlds to export',
        importConfirm: '⚠️ Restoring a full backup will overwrite your current data. Do you want to continue?',
        importRestoring: 'Restoring full backup...',
        importRestored: 'Full backup restoration complete',
        importFailedGeneral: 'Import failed: {error}',
        importNoWorld: 'No worlds to import',
        importingWorlds: 'Importing {count} worlds...',
        importComplete: 'Import Complete: Added {addedCount} / Moved {movedCount} / Skipped {skippedCount}',
        vrcLimitExceededImport: 'VRC folder limit (200 items) exceeded',
        syncLimitExceededImport: 'Shared storage limit (1000 items) exceeded',
        limitExceededPartial: 'Some worlds could not be imported due to exceeding the limit',
        unknownError: 'Unknown Error',
        importProcessFailed: 'Import process failed',
        fetchingVRCAll: 'Fetching all folders from VRChat official...',
        fetchVRCComplete: 'Fetch Complete: {addedCount} added / Total {totalFolders} folders',
        syncFetchFailed: 'Sync failed: {error}',
        fetchingThumbnails: 'Fetching thumbnail details...',
        updatingWorlds: 'Updating Worlds',
        reflectComplete: 'Reflection Complete: {removedCount} removed / {movedCount} moved / {addedCount} added',
        contextMenuQuickAdd: 'Quick Add to Uncategorized',
        contextMenuFolderSelect: 'Save this world to folder...',
        contextMenuDisabled: 'Context menu disabled',
        privateWorldsCannotMoveWarning: 'Private/Deleted worlds cannot be moved to VRC folders: "{names}{more}"',
        dataLoadFailed: 'Failed to load data',

        // Duplicate Resolution
        resolvingDuplicates: 'Resolving duplicate worlds...',
        duplicatesResolved: 'Resolved {count} duplicates',
        noDuplicatesFound: 'No duplicates found',
        duplicateResolveFailed: 'Failed to resolve duplicates: {error}'
    },
};

// ============================================================
// 設定変数
// ============================================================
let currentLang = 'ja';
let currentTheme = 'dark';
let autoResolveDuplicates = true;
let duplicateStrategy = 'keep_first';

// ============================================================
// 初期化処理
// ============================================================
async function initSettings() {
    try {
        const result = await chrome.storage.sync.get('settings');
        if (result.settings) {
            currentLang = result.settings.language || 'ja';
            currentTheme = result.settings.theme || 'dark';
            autoResolveDuplicates = result.settings.autoResolveDuplicates !== undefined
                ? result.settings.autoResolveDuplicates
                : true;
            duplicateStrategy = result.settings.duplicateStrategy || 'keep_first';
            applyTheme();
            applyLanguage();
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }

    // 🆕 v1.2.1: ユーザーウォッチバッジ更新
    await updateUserWatchBadge();
}

// ============================================================
// テーマ適用
// ============================================================
function applyTheme() {
    if (currentTheme === 'light') {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
    }
}

// ============================================================
// 言語適用
// ============================================================
function applyLanguage() {
    document.documentElement.lang = currentLang;

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

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.placeholder = translations[currentLang]['searchPlaceholder'];
    }
}

// ============================================================
// 翻訳関数(動的メッセージ用)
// ============================================================
function t(key, params = {}) {
    let text = translations[currentLang][key] || key;

    Object.keys(params).forEach(param => {
        text = text.replace(`{${param}}`, params[param]);
    });

    return text;
}

// ============================================================
// 設定変更監視
// ============================================================
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
        if (newSettings.autoResolveDuplicates !== undefined) {
            autoResolveDuplicates = newSettings.autoResolveDuplicates;
        }
        if (newSettings.duplicateStrategy) {
            duplicateStrategy = newSettings.duplicateStrategy;
        }
    }
});

// ============================================================
// グローバル状態管理
// ============================================================

// ワールド・フォルダデータ
let allWorlds = [];
let folders = [];
let vrcFolders = [];

// UI状態
let selectedWorldIds = new Set();
let currentFolder = 'all';
let currentPage = 1;
let itemsPerPage = 20;

// 処理中フラグ
let isFetchingDetails = false;
let shouldCancelFetch = false;
let isSyncing = false;

// ソート設定
let sortBy = 'added';
let sortAscending = false;

// リスト編集状態
let isEditingList = false;
let editingBuffer = {
    movedWorlds: [],
    deletedWorlds: []
};

// コミット処理状態
let isCommitting = false;
let committingData = null;

// モーダル状態
let pendingWorldData = null;
let currentRenamingFolder = null;
let currentMovingWorldIds = [];
let currentImportExportMode = null;
let pendingDeleteAction = null;

// フォルダ並び順
let folderOrder = [];

// ============================================================
// 設定管理
// ============================================================

async function loadSettings() {
    try {
        const result = await chrome.storage.local.get([
            'currentFolder', 'itemsPerPage', 'sortBy', 'sortAscending', 'folderOrder'
        ]);

        if (result.currentFolder) currentFolder = result.currentFolder;
        if (result.itemsPerPage) {
            itemsPerPage = result.itemsPerPage;
            const input = document.getElementById('itemsPerPageInput');
            if (input) input.value = itemsPerPage;
        }
        if (result.sortBy) {
            sortBy = result.sortBy;
            const select = document.getElementById('sortSelect');
            if (select) select.value = sortBy;
        }
        if (result.sortAscending !== undefined) {
            sortAscending = result.sortAscending;
            const orderBtn = document.getElementById('sortOrder');
            if (orderBtn) orderBtn.textContent = sortAscending ? '⬆️' : '⬇️';
        }
        if (result.folderOrder) {
            folderOrder = result.folderOrder;
        }
    } catch (error) {
        logError('LOAD_SETTINGS_FAILED', error);
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
        logError('SAVE_SETTINGS_FAILED', error);
    }
}

// ============================================================
// ユーティリティ関数
// ============================================================

function isValidWorldId(str) {
    return /^wrld_[a-f0-9-]+$/i.test(str.trim());
}

// ============================================================
// デバッグログ関数
// ============================================================

function logAction(action, data) {
    if (!DEBUG_LOG_ACTIONS) return;
    console.log(`[${new Date().toISOString()}] [UI-ACTION] ${action}:`, data);
}

function logError(action, error, data = null) {
    if (!DEBUG_LOG_ERRORS) return;

    if (action.includes('LIMIT') || action.includes('RESTRICTED')) {
        console.warn(`[${new Date().toISOString()}] [UI-WARN] ${action}:`, error);
    } else {
        console.error(`[${new Date().toISOString()}] [UI-ERROR] ${action}:`, error);
    }

    if (data) console.log('Data:', data);
}

// ============================================================
// 【v1.2.1 追加】ユーザーウォッチバッジ更新
// ============================================================

/**
 * ユーザーウォッチリストの未読通知バッジを更新
 * @param {boolean} forceUpdate - 強制更新フラグ（デフォルト: false）
 */
async function updateUserWatchBadge(forceUpdate = false) {
    try {
        // バッジ要素の取得（存在確認は後で行う）
        const badge = document.getElementById('userWatchBadge');

        if (DEBUG_LOG_ACTIONS) {
            logAction('UPDATE_USER_WATCH_BADGE_START', {
                badgeExists: !!badge,
                forceUpdate
            });
        }

        // background から未読通知を取得
        const response = await chrome.runtime.sendMessage({
            type: 'getUnreadNotifications'
        });

        if (DEBUG_LOG_ACTIONS) {
            logAction('UPDATE_USER_WATCH_BADGE_RESPONSE', {
                success: response?.success,
                totalUnread: response?.totalUnread,
                notificationCount: response?.notifications?.length
            });
        }

        // レスポンス検証
        if (!response) {
            if (DEBUG_LOG_ERRORS) {
                logError('UPDATE_USER_WATCH_BADGE_NO_RESPONSE', 'No response from background');
            }
            return;
        }

        if (!response.success) {
            if (DEBUG_LOG_ERRORS) {
                logError('UPDATE_USER_WATCH_BADGE_FAILED', 'Background returned failure', response);
            }
            return;
        }

        // バッジ要素が存在しない場合は警告
        if (!badge) {
            if (DEBUG_LOG_ERRORS) {
                console.warn('[updateUserWatchBadge] Badge element not found: #userWatchBadge');
            }
            return;
        }

        const totalUnread = response.totalUnread || 0;

        if (DEBUG_LOG_ACTIONS) {
            logAction('UPDATE_USER_WATCH_BADGE_APPLY', {
                totalUnread,
                willShow: totalUnread > 0
            });
        }

        // バッジ更新
        if (totalUnread > 0) {
            badge.textContent = totalUnread > 99 ? '99+' : String(totalUnread);
            badge.style.display = 'block';
            badge.classList.add('visible'); // アニメーション用クラス（任意）
        } else {
            badge.style.display = 'none';
            badge.classList.remove('visible');
        }

        if (DEBUG_LOG_ACTIONS) {
            logAction('UPDATE_USER_WATCH_BADGE_COMPLETE', {
                totalUnread,
                displayed: badge.style.display === 'block'
            });
        }

    } catch (error) {
        if (DEBUG_LOG_ERRORS) {
            logError('UPDATE_USER_WATCH_BADGE_ERROR', error);
        }

        // エラー時はバッジを非表示にしない（既存の表示を維持）
        console.error('[updateUserWatchBadge] Error:', error);
    }
}

// ============================================================
// 【v1.2.1 追加】ユーザーフェイバリット画面を開く
// ============================================================

/**
 * ユーザーフェイバリット画面を新しいウィンドウで開く
 */
async function openUserFavoritesWindow() {
    try {
        await chrome.windows.create({
            url: chrome.runtime.getURL('popup3_user_watch.html'),
            type: 'popup',
            width: 1000,
            height: 700
        });

        if (DEBUG_LOG_ACTIONS) {
            logAction('USER_FAVORITES_WINDOW_OPENED');
        }
    } catch (error) {
        logError('OPEN_USER_FAVORITES_FAILED', error);
        showNotification('ウィンドウを開けませんでした', 'error');
    }
}

// ============================================================
// 【v1.2.1 追加】メッセージリスナー（通知更新を受信）
// ============================================================

chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'notificationUpdated') {
        updateUserWatchBadge();
    }
});