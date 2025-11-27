// bg_constants.js v1.2.1

// ========================================
// ログレベル設定
// ========================================
// 本番環境では 'ERROR' に、開発時は 'DEBUG' に設定してください
// 'NONE': ログ出力なし
// 'ERROR': エラーのみ
// 'WARN': 警告以上
// 'INFO': 情報以上
// 'DEBUG': すべてのログ
const LOG_LEVEL = 'ERROR'; // 本番リリース時は 'ERROR' に変更してください

const DEBUG_LOG = LOG_LEVEL === 'DEBUG';
const INFO_LOG = ['DEBUG', 'INFO'].includes(LOG_LEVEL);
const WARN_LOG = ['DEBUG', 'INFO', 'WARN'].includes(LOG_LEVEL);
const ERROR_LOG = LOG_LEVEL !== 'NONE';

// モジュール読み込みログ（開発時のみ）
if (INFO_LOG) console.log('[Constants] Loaded v1.2.1');

// ========================================
// ストレージ制限
// ========================================
const SYNC_WORLD_LIMIT = 1000;           // Sync Storageに保存できる最大ワールド数
const VRC_FOLDER_LIMIT = 200;            // VRCフォルダあたりの絶対上限
const VRC_FOLDER_SYNC_LIMIT = 100;       // VRC同期可能な上限（100件以下）
const SYNC_BYTES_SAFE_LIMIT = 0.95;      // Sync Storageの安全マージン（95%）

// ========================================
// API設定
// ========================================
const API_BASE = 'https://vrchat.com/api/1';

// ========================================
// チャンクサイズ（分割保存用）
// ========================================
const DETAILS_CHUNK_SIZE = 20;           // worldDetails分割保存用（20チャンク）
const WORLDS_CHUNK_SIZE = 100;           // 1チャンクあたり100件（約8,000バイト）
const MAX_WORLDS_CHUNKS = 10;            // 最大10チャンク = 1000件

// ========================================
// バッチサイズ
// ========================================
const BATCH_SIZE = {
  sync: 50,                              // VRC同期時のバッチサイズ
  local: 50,                             // ローカル処理のバッチサイズ
  apiParallel: 5                         // API並列リクエスト数
};

// ========================================
// API遅延設定
// ========================================
const API_DELAYS = {
  standard: 500,                         // 標準的なAPI呼び出し間隔（ms）
  short: 100,                            // 短い遅延（バッチ処理用）
  long: 300                              // 長い遅延（削除後の待機等）
};

// ========================================
// UI設定
// ========================================
const UI_DEFAULTS = {
  itemsPerPage: 20,                      // デフォルト表示件数
  notificationDuration: 3000             // 通知表示時間（ms）
};

// ========================================
// 【新規追加 v1.2.1】通知設定
// ========================================
const NOTIFICATION_SETTINGS = {
  CHECK_INTERVALS: {
    ON_STARTUP: 0,           // 起動時のみ
    ONE_HOUR: 3600000,       // 1時間（ミリ秒）
    THREE_HOURS: 10800000,   // 3時間（ミリ秒）
    TWELVE_HOURS: 43200000   // 12時間（ミリ秒）
  },
  STARTUP_DELAY: 5000,       // 起動後5秒待機
  TODAY_HOURS: 24,           // 「今日」判定（24時間以内）
  BADGE_MAX: 99              // バッジ最大表示数
};

// ========================================
// Progress Message Types（統一型定義）
// ========================================

const ProgressMessageType = {
  // レート制限関連
  RATE_LIMIT_COUNTDOWN: 'RATE_LIMIT_COUNTDOWN',
  RATE_LIMIT_FINISHED: 'WAIT_FINISHED',

  // コミット処理関連
  COMMIT_COMPLETE: 'COMMIT_BUFFER_COMPLETE',
  COMMIT_ERROR: 'COMMIT_BUFFER_ERROR',

  // VRC同期関連
  VRC_ACTION_PROGRESS: 'VRC_ACTION_PROGRESS',
  VRC_ACTION_COMPLETE: 'VRC_ACTION_COMPLETE',
  VRC_ACTION_ERROR: 'VRC_ACTION_ERROR'
};

/**
 * メッセージビルダー（型安全なメッセージ生成）
 * 全てのprogressCallbackはこれらの関数を使用してメッセージを生成する
 */
const ProgressMessage = {
  /**
   * レート制限カウントダウンメッセージ
   * @param {number} remainingSeconds - 残り秒数
   * @param {number} totalWaitSeconds - 合計待機秒数
   */
  rateLimitCountdown: (remainingSeconds, totalWaitSeconds) => ({
    action: ProgressMessageType.RATE_LIMIT_COUNTDOWN,
    remainingSeconds,
    totalWaitSeconds
  }),

  /**
   * レート制限終了メッセージ
   */
  rateLimitFinished: () => ({
    action: ProgressMessageType.RATE_LIMIT_FINISHED
  }),

  /**
   * コミット処理完了メッセージ
   * @param {boolean} success - 成功したかどうか
   * @param {number} movedCount - 移動した件数
   * @param {number} deletedCount - 削除した件数
   */
  commitComplete: (success, movedCount, deletedCount) => ({
    type: ProgressMessageType.COMMIT_COMPLETE,
    success,
    movedCount,
    deletedCount
  }),

  /**
   * コミット処理エラーメッセージ
   * @param {string} error - エラーメッセージ
   */
  commitError: (error) => ({
    type: ProgressMessageType.COMMIT_ERROR,
    action: ProgressMessageType.COMMIT_ERROR, // popup側の互換性のため両方のキーを持つ
    error
  }),

  /**
   * VRC同期進捗メッセージ
   * @param {string} message - 進捗メッセージキー
   * @param {number} percent - 進捗率（0-100）
   * @param {Object} params - 追加パラメータ
   */
  vrcActionProgress: (message, percent, params = {}) => ({
    action: ProgressMessageType.VRC_ACTION_PROGRESS,
    message,
    percent,
    ...params
  }),

  /**
   * VRC同期完了メッセージ
   * @param {Object} result - 結果オブジェクト
   */
  vrcActionComplete: (result) => ({
    action: ProgressMessageType.VRC_ACTION_COMPLETE,
    ...result
  }),

  /**
   * VRC同期エラーメッセージ
   * @param {string} error - エラーメッセージ
   */
  vrcActionError: (error) => ({
    action: ProgressMessageType.VRC_ACTION_ERROR,
    error
  })
};