// bg_error_handler.js v1.2.0
console.log('[ErrorHandler] Loaded');

/**
 * エラーハンドリングユーティリティ
 * 統一されたエラーレスポンス形式を提供
 */

// ========================================
// 成功レスポンス生成
// ========================================

function createSuccessResponse(data = {}) {
  return {
    success: true,
    ...data
  };
}

// ========================================
// エラーレスポンス生成(統一形式)
// ========================================

/**
 * 制限エラーを生成
 */
function createLimitError(limitType, details = {}) {
  const errorMap = {
    'vrc_limit': {
      reason: 'vrc_limit_exceeded',
      message: 'VRCフォルダが150件を超えています',
      userMessage: 'VRCフォルダの上限(150件)に達しています。これ以上追加できません。'
    },
    'vrc_sync_limit': {
      reason: 'vrc_sync_limit_exceeded',
      message: 'VRCフォルダが100件を超えているため同期できません',
      userMessage: 'VRCフォルダが100件を超えているため、VRChatへの同期ができません。不要なワールドを削除してください。'
    },
    'sync_limit': {
      reason: 'sync_limit_exceeded',
      message: '共有ストレージが1000件を超えています',
      userMessage: 'カスタムフォルダの上限(1000件)に達しています。不要なワールドを削除してください。'
    },
    'sync_bytes': {
      reason: 'sync_bytes_exceeded',
      message: '共有ストレージの容量上限を超えています',
      userMessage: 'ストレージ容量が上限に達しています。不要なワールドを削除してください。'
    },
    'rate_limit': {
      reason: 'rate_limit_exceeded',
      message: '書き込み速度制限に達しました',
      userMessage: '短時間に多くの変更を行ったため、処理を一時停止しています。1分ほど待ってから再度お試しください。'
    }
  };
  
  const errorInfo = errorMap[limitType] || {
    reason: 'limit_exceeded',
    message: '制限を超えています',
    userMessage: '操作の制限に達しました。しばらく待ってから再度お試しください。'
  };
  
  return {
    success: false,
    reason: errorInfo.reason,
    message: errorInfo.message,
    userMessage: errorInfo.userMessage,
    ...details
  };
}

/**
 * プライベート/削除済みワールド制限エラーを生成
 */
function createPrivateWorldError(worldName) {
  return {
    success: false,
    reason: 'private_world',
    message: 'プライベート・削除済ワールドはVRCフォルダに追加できません',
    userMessage: `「${worldName}」はプライベートまたは削除済みのため、VRCフォルダには追加できません。`,
    worldName
  };
}

/**
 * 既存エラーを生成
 */
function createAlreadyExistsError(existingFolder, worldName) {
  return {
    success: false,
    reason: 'already_exists_different_folder',
    message: 'このワールドは既に登録されています',
    userMessage: `「${worldName}」は既に別のフォルダに登録されています。`,
    existingFolder,
    worldName
  };
}

/**
 * 認証エラーを生成
 */
function createAuthError() {
  return {
    success: false,
    reason: 'auth_required',
    message: 'VRChatにログインしていません',
    userMessage: 'VRChatにログインしていません。vrchat.comでログインしてから再度お試しください。'
  };
}

/**
 * APIエラーを生成
 */
function createApiError(status, context = {}) {
  let message = 'VRChat APIエラーが発生しました';
  let userMessage = 'VRChatとの通信でエラーが発生しました。';
  let reason = 'api_error';
  
  if (status === 401) {
    return createAuthError();
  } else if (status === 404) {
    message = 'ワールドが見つかりません';
    userMessage = 'ワールドが見つかりませんでした。削除された可能性があります。';
    reason = 'not_found';
  } else if (status === 429) {
    message = 'APIリクエスト制限に達しました';
    userMessage = 'VRChatのAPI制限に達しました。しばらく待ってから再度お試しください。';
    reason = 'rate_limit';
  } else if (status >= 500) {
    message = 'VRChatサーバーエラーが発生しました';
    userMessage = 'VRChatのサーバーで問題が発生しています。しばらく待ってから再度お試しください。';
    reason = 'server_error';
  }
  
  return {
    success: false,
    reason: reason,
    message: message,
    userMessage: userMessage,
    status: status,
    ...context
  };
}

/**
 * レート制限エラーを生成
 */
function createRateLimitError(waitSeconds = 60) {
  return {
    success: false,
    reason: 'rate_limit_exceeded',
    message: '書き込み速度制限に達しました',
    userMessage: `短時間に多くの変更を行ったため、処理を一時停止しています。約${waitSeconds}秒お待ちください。`,
    waitSeconds: waitSeconds,
    retryable: true
  };
}

/**
 * 汎用エラーを生成
 */
function createGenericError(message, reason = 'unknown_error') {
  return {
    success: false,
    reason: reason,
    message: message,
    userMessage: message || '予期しないエラーが発生しました。'
  };
}

/**
 * データ不整合エラーを生成
 */
function createDataInconsistencyError(worldId, detail) {
  return {
    success: false,
    reason: 'data_inconsistency',
    message: 'データの不整合が検出されました',
    userMessage: 'データに不整合が見つかりました。重複検出機能で修復を試してください。',
    worldId: worldId,
    detail: detail
  };
}