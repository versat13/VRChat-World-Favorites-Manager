// popup3_translations.js - グローバル状態・翻訳辞書
// popup3_user_watch.js から機能分離(v1.4.0時点でのリファクタリング)

// popup3_user_watch.js v1.2.2 前半

// ============================================================
// グローバル状態
// ============================================================

let watchList = [];
let selectedUserId = null;
let selectedUserIds = new Set();
let currentLanguage = 'ja';
let currentTheme = 'light';
let isProcessing = false;
let deleteTarget = null;
let worldSortOrder = 'updated';
let userSortOrder = 'updated';
let globalNotificationSettings = { worldUpdate: true, newWorld: true };
let unreadNotifications = new Map();

let expandedWorldsCache = new Map();

// ============================================================
// 翻訳辞書
// ============================================================

const translations = {
  ja: {
    // ヘッダー
    title: '👤 ユーザーウォッチリスト',
    urlInputPlaceholder: 'ユーザーID https://vrchat.com/home/user/usr_xxxxx または ワールドID https://vrchat.com/home/world/wrld_xxxxx',
    addButton: '追加',
    importButton: '📥 インポート',
    exportButton: '📤 エクスポート',

    // コントロール
    selectAll: '全選択',
    sortUpdated: '最終更新日順',
    sortPublication: '新規作成日順',
    sortName: 'ユーザー名順',
    sortAdded: '登録日順',
    updateCount: '更新: {count}件',
    newCount: '新規: {count}件',

    // アクション
    deleteButton: '🗑 削除',
    lightCheckButton: '🔍 新着チェック',
    manualCheckButton: '🔄 全件更新',
    abortCheckButton: '⏹ 停止',
    clearAllUnreadButton: '✓ 未読クリア',
    selectionCount: '選択中: {count}件',
    importProgress: '追加中: {current}/{total}',

    // 空状態
    noUsers: 'ユーザーが登録されていません',
    selectUserPrompt: '左側からユーザーを選択してください',
    noWorldsForUser: 'このユーザーはワールドを作成していません',

    // モーダル
    deleteConfirmTitle: '🗑️ 削除確認',
    deleteConfirmSingle: '「{name}」をウォッチリストから削除しますか?',
    deleteConfirmMultiple: '選択中の{count}人のユーザーをウォッチリストから削除しますか?',
    confirmDelete: '削除',
    cancel: 'キャンセル',

    // 通知
    addUserSuccess: '{name} を追加しました',
    deleteUserSuccess: 'ユーザーを削除しました',
    deleteMultipleSuccess: '{count}人のユーザーを削除しました',
    clearAllUnreadSuccess: 'すべての未読をクリアしました',
    manualCheckSuccess: '更新完了: {count}件',
    manualCheckWithUnread: '更新完了: {count}件 - {unread}件の新しい更新があります',
    manualCheckNoUnread: '更新完了: {count}件 - 新しい更新はありません',

    // 【v1.3.3追加】新着チェック(軽量)・緊急停止
    progressLightCheckRunning: '新着を確認中...',
    lightCheckWithUnread: '確認完了 - {unread}件の新しい更新があります',
    lightCheckNoUnread: '確認完了 - 新しい更新はありません',
    checkAbortRequested: '停止をリクエストしました。安全な区切りで停止します',
    checkAbortedPartial: '途中で停止しました',
    checkAlreadyRunning: '既に巡回が実行中です。完了までお待ちください',

    importComplete: '完了: {success}件追加',
    importWithSkip: '完了: {success}件追加, {skip}件スキップ',
    importWithError: '完了: {success}件追加, {skip}件スキップ, {error}件エラー',
    exportSuccess: 'エクスポートしました',
    refetchSuccess: 'ユーザー情報を更新しました',
    refetchFullSuccess: 'ユーザー情報を取得しました',
    expandWorldsSuccess: '{count}件のワールドを表示しました',
    addWorldSuccess: '「{world}」を「{folder}」に追加しました',
    globalNotificationOn: '{type}をONにしました',
    globalNotificationOff: '{type}をOFFにしました',

    // エラー
    errorInputUrl: 'URLを入力してください',
    errorProcessing: '処理中です...',
    errorInvalidUrl: '有効なVRChat URLを入力してください',
    errorWorldNotFound: 'ワールドが見つかりませんでした',
    errorAlreadyAdded: '既に登録されています',
    errorAddUserFailed: 'ユーザーの追加に失敗しました',
    errorDeleteFailed: '削除に失敗しました',
    errorRefetchFailed: '更新に失敗しました',
    errorManualCheckFailed: 'チェックに失敗しました',
    errorClearUnreadFailed: '未読のクリアに失敗しました',
    errorImportFailed: 'CSVの読み込みに失敗しました',
    errorExportFailed: 'エクスポートに失敗しました',
    errorExpandWorldsFailed: 'ワールド情報の取得に失敗しました',
    errorAddWorldFailed: '保存に失敗しました',
    errorNoValidIds: '有効なIDが見つかりませんでした',
    errorUserNotFound: 'ユーザーが見つかりません',
    errorInvalidUserId: 'ユーザーIDが無効です',
    errorNoSelection: '削除するユーザーが選択されていません',
    errorGeneric: 'エラーが発生しました',
    errorFoldersFailed: 'フォルダ情報の取得に失敗しました',
    errorPageHelpersNotLoaded: 'エラー: page-helpers-shared.js が読み込まれていません',

    // 進捗メッセージ
    progressDetectedIds: '{count}件のIDを検出しました',
    progressAddingUser: '追加中: {current}/{total}',
    progressAddingWithSkip: '追加中: {current}/{total} (スキップ: {skip})',
    progressResolvingIds: 'ID確認中: {current}/{total}',
    progressSavingToList: 'リストに保存中...',
    progressFetchingWorld: 'ワールド情報を取得中...',
    progressFetchingUser: 'ユーザー情報を取得中...',
    progressRefetchingUser: 'ユーザー情報を更新中...',
    progressRefetchingFull: 'ユーザー情報を完全取得中...',
    progressFetchingAllWorlds: '全ワールド情報を取得中...',
    progressFetchingFolders: 'フォルダ情報を取得中...',
    progressSavingWorld: 'ワールドを保存中...',
    progressManualCheckPrepare: '更新準備中...',
    progressManualCheckUpdating: '更新中: {current}/{total} - {name}',
    progressLightCheckUpdating: '自動巡回中: {current}/{total} - {name}',

    // ワールド詳細
    worldSortUpdated: '更新日順',
    worldSortPublication: '公開日順',
    worldRefetchButton: '🔄',
    worldAddButton: '+ 追加',
    worldFavorites: '⭐ {count}',
    worldLabsBadge: '🧪',
    worldUpdatedAt: '更新日: {date}',
    worldPublicationDate: '公開日: {date}',
    worldPublicationLabs: '公開日: Labs',
    worldCreatedAt: '作成日: {date}',
    worldExpandButton: 'さらに表示',
    worldExpandCount: '+{count}件',

    // ユーザーカード
    userWorksCount: '{count}作品',
    userMissingInfo: '🔥 情報未取得',
    userNotifyOn: '通知ON',
    userNotifyOff: '通知OFF',
    userUpdateLabel: '[更新]{date}',
    userNewLabel: '[新規]{date}',

    // ユーザー詳細統計
    userStatsWorlds: '公開ワールド: {count}件',
    userStatsUpdate: '更新: {date}',
    userStatsNew: '新規: {date}',

    // 日付表示
    dateToday: '今日',
    dateYesterday: '昨日',
    dateFuture: '未来',
    dateDaysAgo: '{days}日前',
    dateNone: '-',

    // その他
    notificationType_worldUpdate: '更新通知',
    notificationType_newWorld: '新規通知',
    folderSelectTitle: '📁 保存先フォルダを選択',
    folderSelectDescription: '「{world}」を保存するフォルダを選択してください',
    folderNone: '未分類',

    // バックグラウンドエラー (reasonキーから解決)
    err_vrc_limit_exceeded: 'VRCフォルダの上限(200件)に達しています。これ以上追加できません。',
    err_vrc_sync_limit_exceeded: 'VRCフォルダが100件を超えているため、VRChatへの同期ができません。不要なワールドを削除してください。',
    err_sync_limit_exceeded: 'カスタムフォルダの上限(1000件)に達しています。不要なワールドを削除してください。',
    err_sync_bytes_exceeded: 'ストレージ容量が上限に達しています。不要なワールドを削除してください。',
    err_rate_limit_exceeded: '短時間に多くの変更を行ったため、処理を一時停止しています。約{waitSeconds}秒お待ちください。',
    err_limit_exceeded: '操作の制限に達しました。しばらく待ってから再度お試しください。',
    err_private_world: '「{worldName}」はプライベートまたは削除済みのため、VRCフォルダには追加できません。',
    err_already_exists_different_folder: '「{worldName}」は既に別のフォルダに登録されています。',
    err_already_exists_same_folder: 'このワールドは既にこのフォルダに登録されています。',
    err_already_exists: '既に「{folderName}」に登録済みです。',
    err_auth_required: 'VRChatにログインしていません。vrchat.comでログインしてから再度お試しください。',
    openVrchatLoginBtn: 'VRChat公式サイトを開く',
    openVrchatLoginBtnDone: 'タブを開きました',
    err_not_found: 'ワールドが見つかりませんでした。削除された可能性があります。',
    err_world_not_found: 'ワールドが見つかりませんでした。',
    err_world_details_fetch_failed: 'ワールド情報の取得に失敗しました。',
    err_user_not_found: 'ユーザーが見つかりませんでした。',
    err_invalid_data: '無効なデータ形式です。',
    err_data_inconsistency: 'データに不整合が見つかりました。重複検出機能で修復を試してください。',
    err_missing_parameter: '必要な情報が不足しています。',
    err_author_fetch_failed: '作者情報の取得に失敗しました。',
    err_no_user_id: 'ユーザーIDが指定されていません。',
    err_rate_limit: 'VRChatのAPI制限に達しました。しばらく待ってから再度お試しください。',
    err_server_error: 'VRChatのサーバーで問題が発生しています。しばらく待ってから再度お試しください。',
    err_api_error: 'VRChatとの通信でエラーが発生しました。',
    err_unexpected: '予期しないエラーが発生しました: {detail}',

    // 進捗メッセージ (バックグラウンドのmessageKeyから解決)
    progress_fetchingCreatedWorlds: '作成ワールドを取得中...',
    progress_fetchingCount: '取得中: {count}件',
    progress_fetchComplete: '取得完了: {count}件',
    progress_fetchingWorldDetails: 'ワールド情報取得中: {current}/{total}',
    progress_fetchingUserInfo: 'ユーザー情報を取得中...',
    progress_fetchingWorldList: 'ワールド一覧を取得中...',
    progress_updated: '情報を更新しました',
    progress_added: '追加完了',
    progress_error: 'エラーが発生しました: {detail}'
  },
  en: {
    // Header
    title: '👤 User Watch List',
    urlInputPlaceholder: 'User ID https://vrchat.com/home/user/usr_xxxxx or World ID https://vrchat.com/home/world/wrld_xxxxx',
    addButton: 'Add',
    importButton: '📥 Import',
    exportButton: '📤 Export',

    // Controls
    selectAll: 'Select All',
    sortUpdated: 'Last Updated',
    sortPublication: 'Publication Date',
    sortName: 'User Name',
    sortAdded: 'Added Date',
    updateCount: 'Updates: {count}',
    newCount: 'New: {count}',

    // Actions
    deleteButton: '🗑 Delete',
    lightCheckButton: '🔍 Check New',
    manualCheckButton: '🔄 Full Update',
    abortCheckButton: '⏹ Stop',
    clearAllUnreadButton: '✓ Clear Unread',
    selectionCount: 'Selected: {count}',
    importProgress: 'Adding: {current}/{total}',

    // Empty states
    noUsers: 'No users registered',
    selectUserPrompt: 'Select a user from the left',
    noWorldsForUser: 'This user has not created any worlds',

    // Modal
    deleteConfirmTitle: '🗑️ Confirm Deletion',
    deleteConfirmSingle: 'Remove "{name}" from watch list?',
    deleteConfirmMultiple: 'Remove {count} selected users from watch list?',
    confirmDelete: 'Delete',
    cancel: 'Cancel',

    // Notifications
    addUserSuccess: 'Added {name}',
    deleteUserSuccess: 'User deleted',
    deleteMultipleSuccess: '{count} users deleted',
    clearAllUnreadSuccess: 'All unread cleared',
    manualCheckSuccess: 'Update complete: {count}',
    manualCheckWithUnread: 'Update complete: {count} - {unread} new updates',
    manualCheckNoUnread: 'Update complete: {count} - No new updates',

    // Light check (fast) / abort
    progressLightCheckRunning: 'Checking for new updates...',
    lightCheckWithUnread: 'Check complete - {unread} new updates',
    lightCheckNoUnread: 'Check complete - No new updates',
    checkAbortRequested: 'Stop requested. Will stop at a safe point',
    checkAbortedPartial: 'Stopped partway through',
    checkAlreadyRunning: 'A check is already running. Please wait for it to finish',

    importComplete: 'Complete: {success} added',
    importWithSkip: 'Complete: {success} added, {skip} skipped',
    importWithError: 'Complete: {success} added, {skip} skipped, {error} errors',
    exportSuccess: 'Exported',
    refetchSuccess: 'User info updated',
    refetchFullSuccess: 'User info retrieved',
    expandWorldsSuccess: '{count} worlds displayed',
    addWorldSuccess: '"{world}" added to "{folder}"',
    globalNotificationOn: '{type} turned ON',
    globalNotificationOff: '{type} turned OFF',

    // Errors
    errorInputUrl: 'Please enter a URL',
    errorProcessing: 'Processing...',
    errorInvalidUrl: 'Please enter a valid VRChat URL',
    errorWorldNotFound: 'World not found',
    errorAlreadyAdded: 'Already registered',
    errorAddUserFailed: 'Failed to add user',
    errorDeleteFailed: 'Failed to delete',
    errorRefetchFailed: 'Failed to update',
    errorManualCheckFailed: 'Check failed',
    errorClearUnreadFailed: 'Failed to clear unread',
    errorImportFailed: 'Failed to read CSV',
    errorExportFailed: 'Failed to export',
    errorExpandWorldsFailed: 'Failed to get world info',
    errorAddWorldFailed: 'Failed to save',
    errorNoValidIds: 'No valid IDs found',
    errorUserNotFound: 'User not found',
    errorInvalidUserId: 'Invalid user ID',
    errorNoSelection: 'No users selected for deletion',
    errorGeneric: 'An error occurred',
    errorFoldersFailed: 'Failed to get folder info',
    errorPageHelpersNotLoaded: 'Error: page-helpers-shared.js not loaded',

    // Progress messages
    progressDetectedIds: '{count} IDs detected',
    progressAddingUser: 'Adding: {current}/{total}',
    progressAddingWithSkip: 'Adding: {current}/{total} (Skipped: {skip})',
    progressResolvingIds: 'Resolving IDs: {current}/{total}',
    progressSavingToList: 'Saving to list...',
    progressFetchingWorld: 'Fetching world info...',
    progressFetchingUser: 'Fetching user info...',
    progressRefetchingUser: 'Updating user info...',
    progressRefetchingFull: 'Fully fetching user info...',
    progressFetchingAllWorlds: 'Fetching all world info...',
    progressFetchingFolders: 'Fetching folder info...',
    progressSavingWorld: 'Saving world...',
    progressManualCheckPrepare: 'Preparing update...',
    progressManualCheckUpdating: 'Updating: {current}/{total} - {name}',
    progressLightCheckUpdating: 'Auto-checking: {current}/{total} - {name}',

    // World details
    worldSortUpdated: 'Updated Date',
    worldSortPublication: 'Publication Date',
    worldRefetchButton: '🔄',
    worldAddButton: '+ Add',
    worldFavorites: '⭐ {count}',
    worldLabsBadge: '🧪',
    worldUpdatedAt: 'Updated: {date}',
    worldPublicationDate: 'Published: {date}',
    worldPublicationLabs: 'Published: Labs',
    worldCreatedAt: 'Created: {date}',
    worldExpandButton: 'Show More',
    worldExpandCount: '+{count}',

    // User card
    userWorksCount: '{count} works',
    userMissingInfo: '🔥 Info not fetched',
    userNotifyOn: 'Notify ON',
    userNotifyOff: 'Notify OFF',
    userUpdateLabel: '[Updated]{date}',
    userNewLabel: '[New]{date}',

    // User detail stats
    userStatsWorlds: 'Public Worlds: {count}',
    userStatsUpdate: 'Updated: {date}',
    userStatsNew: 'New: {date}',

    // Date display
    dateToday: 'Today',
    dateYesterday: 'Yesterday',
    dateFuture: 'Future',
    dateDaysAgo: '{days}d ago',
    dateNone: '-',

    // Others
    notificationType_worldUpdate: 'update notification',
    notificationType_newWorld: 'new world notification',
    folderSelectTitle: '📁 Select Destination Folder',
    folderSelectDescription: 'Select a folder to save "{world}"',
    folderNone: 'Uncategorized',

    // Background Errors (resolved from reason key)
    err_vrc_limit_exceeded: 'VRC folder limit (200) reached. No more worlds can be added.',
    err_vrc_sync_limit_exceeded: 'This VRC folder exceeds 100 items, so it cannot be synced to VRChat. Please remove some worlds.',
    err_sync_limit_exceeded: 'Custom folder limit (1000) reached. Please remove some worlds.',
    err_sync_bytes_exceeded: 'Storage capacity limit reached. Please remove some worlds.',
    err_rate_limit_exceeded: 'Too many changes were made in a short time. Processing is paused. Please wait about {waitSeconds} seconds and try again.',
    err_limit_exceeded: 'An operation limit was reached. Please wait a moment and try again.',
    err_private_world: '"{worldName}" is private or deleted, so it cannot be added to a VRC folder.',
    err_already_exists_different_folder: '"{worldName}" is already registered in another folder.',
    err_already_exists_same_folder: 'This world is already registered in this folder.',
    err_already_exists: 'Already registered in "{folderName}".',
    err_auth_required: 'Not logged in to VRChat. Please log in at vrchat.com and try again.',
    openVrchatLoginBtn: 'Open VRChat Website',
    openVrchatLoginBtnDone: 'Tab opened',
    err_not_found: 'World not found. It may have been deleted.',
    err_world_not_found: 'World not found.',
    err_world_details_fetch_failed: 'Failed to fetch world details.',
    err_user_not_found: 'User not found.',
    err_invalid_data: 'Invalid data format.',
    err_data_inconsistency: 'A data inconsistency was found. Please try the duplicate-resolution feature.',
    err_missing_parameter: 'Required information is missing.',
    err_author_fetch_failed: 'Failed to fetch author information.',
    err_no_user_id: 'No user ID was specified.',
    err_rate_limit: 'VRChat API rate limit reached. Please wait a moment and try again.',
    err_server_error: 'VRChat is experiencing server issues. Please wait a moment and try again.',
    err_api_error: 'An error occurred while communicating with VRChat.',
    err_unexpected: 'An unexpected error occurred: {detail}',

    // Progress Messages (resolved from background messageKey)
    progress_fetchingCreatedWorlds: 'Fetching created worlds...',
    progress_fetchingCount: 'Fetching: {count} items',
    progress_fetchComplete: 'Fetch complete: {count} items',
    progress_fetchingWorldDetails: 'Fetching world details: {current}/{total}',
    progress_fetchingUserInfo: 'Fetching user info...',
    progress_fetchingWorldList: 'Fetching world list...',
    progress_updated: 'Updated',
    progress_added: 'Added',
    progress_error: 'An error occurred: {detail}'
  }
};

/**
 * 翻訳関数
 * @param {string} key - 翻訳キー
 * @param {object} params - 置換パラメータ
 * @returns {string} 翻訳されたテキスト
 */
function t(key, params = {}) {
  const dict = translations[currentLanguage] || translations['ja'];
  let text = dict[key] || key;

  // パラメータ置換
  Object.keys(params).forEach(param => {
    text = text.replace(`{${param}}`, params[param]);
  });

  return text;
}

/**
 * バックグラウンドエラー解決(response.reason -> ローカライズ文面)
 * @param {object} response - バックグラウンドからのレスポンス
 * @returns {string} 現在の表示言語のエラーメッセージ
 */
function resolveErrorMessage(response) {
  if (!response) return t('err_unexpected', { detail: 'Unknown error' });

  const dict = translations[currentLanguage] || translations['ja'];
  const reasonKey = response.reason ? `err_${response.reason}` : null;
  const hasTranslation = reasonKey && dict[reasonKey];

  if (hasTranslation) {
    return t(reasonKey, {
      waitSeconds: response.waitSeconds,
      worldName: response.worldName,
      folderName: response.folderName,
      detail: response.message || ''
    });
  }

  const detail = response.message || response.error || response.reason || 'Unknown error';
  return t('err_unexpected', { detail });
}

// ============================================================
