// bg_error_handler.js
console.log('[ErrorHandler] Loaded');

/**
 * エラーハンドリングユーティリティ
 * 統一されたエラーレスポンス形式を提供
 */

// ========================================
// エラータイプ定義
// ========================================
const ERROR_TYPES = {
  AUTH: 'AUTH',
  LIMIT: 'LIMIT',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  INVALID_DATA: 'INVALID_DATA',
  API: 'API',
  NETWORK: 'NETWORK',
  SYNC_IN_PROGRESS: 'SYNC_IN_PROGRESS',
  RESTRICTION: 'RESTRICTION',
  UNKNOWN: 'UNKNOWN'
};

// ========================================
// APIエラーハンドラー
// ========================================

/**
 * VRChat APIのレスポンスエラーを処理
 * @param {Response} response - Fetch APIのレスポンス
 * @param {Object} context - エラーコンテキスト情報
 * @returns {Object} 統一されたエラーオブジェクト
 */
function handleAPIError(response, context = {}) {
  const status = response.status;
  
  // 401 Unauthorized
  if (status === 401) {
    return {
      success: false,
      errorType: ERROR_TYPES.AUTH,
      message: ERROR_MESSAGES.AUTH_REQUIRED,
      status: 401,
      context
    };
  }
  
  // 404 Not Found
  if (status === 404) {
    return {
      success: false,
      errorType: ERROR_TYPES.NOT_FOUND,
      message: ERROR_MESSAGES.WORLD_NOT_FOUND,
      status: 404,
      context
    };
  }
  
  // 429 Too Many Requests
  if (status === 429) {
    return {
      success: false,
      errorType: ERROR_TYPES.API,
      message: 'APIリクエスト制限に達しました。しばらく待ってから再試行してください',
      status: 429,
      context
    };
  }
  
  // 500系エラー
  if (status >= 500) {
    return {
      success: false,
      errorType: ERROR_TYPES.API,
      message: 'VRChatサーバーエラーが発生しました',
      status,
      context
    };
  }
  
  // その他のエラー
  return {
    success: false,
    errorType: ERROR_TYPES.API,
    message: `${ERROR_MESSAGES.API_ERROR} (${status})`,
    status,
    context
  };
}

/**
 * 例外エラーを処理
 * @param {Error} error - JavaScriptエラーオブジェクト
 * @param {Object} context - エラーコンテキスト情報
 * @returns {Object} 統一されたエラーオブジェクト
 */
function handleException(error, context = {}) {
  // ネットワークエラー
  if (error.name === 'TypeError' && error.message.includes('fetch')) {
    return {
      success: false,
      errorType: ERROR_TYPES.NETWORK,
      message: ERROR_MESSAGES.NETWORK_ERROR,
      error: error.message,
      context
    };
  }
  
  // その他の例外
  return {
    success: false,
    errorType: ERROR_TYPES.UNKNOWN,
    message: error.message || '不明なエラーが発生しました',
    error: error.message,
    context
  };
}

// ========================================
// ビジネスロジックエラーハンドラー
// ========================================

/**
 * 制限エラーを生成
 * @param {string} limitType - 制限の種類
 * @param {Object} details - 詳細情報
 * @returns {Object} エラーオブジェクト
 */
function createLimitError(limitType, details = {}) {
  const errorMap = {
    'vrc_limit': {
      reason: 'vrc_limit_exceeded',
      message: ERROR_MESSAGES.VRC_LIMIT_EXCEEDED
    },
    'vrc_sync_limit': {
      reason: 'vrc_sync_limit_exceeded',
      message: ERROR_MESSAGES.VRC_SYNC_LIMIT_EXCEEDED
    },
    'sync_limit': {
      reason: 'sync_limit_exceeded',
      message: ERROR_MESSAGES.SYNC_LIMIT_EXCEEDED
    },
    'sync_bytes': {
      reason: 'sync_bytes_exceeded',
      message: ERROR_MESSAGES.SYNC_BYTES_EXCEEDED
    }
  };
  
  const errorInfo = errorMap[limitType] || {
    reason: 'limit_exceeded',
    message: '制限を超えています'
  };
  
  return {
    success: false,
    errorType: ERROR_TYPES.LIMIT,
    reason: errorInfo.reason,
    message: errorInfo.message,
    ...details
  };
}

/**
 * プライベート/削除済みワールド制限エラーを生成
 * @param {string} worldName - ワールド名
 * @returns {Object} エラーオブジェクト
 */
function createPrivateWorldError(worldName) {
  return {
    success: false,
    errorType: ERROR_TYPES.RESTRICTION,
    reason: 'private_world',
    message: ERROR_MESSAGES.PRIVATE_WORLD_RESTRICTION,
    worldName
  };
}

/**
 * 既存エラーを生成
 * @param {string} existingFolder - 既存のフォルダID
 * @param {string} worldName - ワールド名
 * @returns {Object} エラーオブジェクト
 */
function createAlreadyExistsError(existingFolder, worldName) {
  return {
    success: false,
    errorType: ERROR_TYPES.ALREADY_EXISTS,
    reason: 'already_exists_different_folder',
    message: ERROR_MESSAGES.ALREADY_EXISTS,
    existingFolder,
    worldName
  };
}

/**
 * 同期中エラーを生成
 * @returns {Object} エラーオブジェクト
 */
function createSyncInProgressError() {
  return {
    success: false,
    errorType: ERROR_TYPES.SYNC_IN_PROGRESS,
    error: 'SYNC_IN_PROGRESS',
    message: ERROR_MESSAGES.SYNC_IN_PROGRESS
  };
}

// ========================================
// レスポンス成功オブジェクト生成
// ========================================

/**
 * 成功レスポンスを生成
 * @param {Object} data - レスポンスデータ
 * @returns {Object} 成功オブジェクト
 */
function createSuccessResponse(data = {}) {
  return {
    success: true,
    ...data
  };
}

// ========================================
// ログ出力ヘルパー
// ========================================

/**
 * エラーをログに記録
 * @param {string} operation - 操作名
 * @param {Object} error - エラーオブジェクト
 */
function logErrorResponse(operation, error) {
  if (!DEBUG_LOG) return;
  
  const timestamp = new Date().toISOString();
  const logLevel = error.errorType === ERROR_TYPES.LIMIT || 
                   error.errorType === ERROR_TYPES.RESTRICTION 
                   ? 'WARN' : 'ERROR';
  
  console[logLevel === 'WARN' ? 'warn' : 'error'](
    `[${timestamp}] [${logLevel}] ${operation}:`,
    {
      type: error.errorType,
      reason: error.reason,
      message: error.message,
      context: error.context
    }
  );
}

// ========================================
// エクスポート用グローバル定義
// ========================================
// Service Workerでは通常のexportが使えないため、
// グローバルスコープに定義することで他のファイルから参照可能にする