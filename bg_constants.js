// bg_constants.js
console.log('[Constants] Loaded');

// ========================================
// ストレージ制限
// ========================================
const SYNC_WORLD_LIMIT = 1000;           // Sync Storageに保存できる最大ワールド数
const VRC_FOLDER_LIMIT = 150;            // VRCフォルダあたりの絶対上限
const VRC_FOLDER_SYNC_LIMIT = 100;       // VRC同期可能な上限（100件以下）
const SYNC_BYTES_SAFE_LIMIT = 0.95;      // Sync Storageの安全マージン（95%）

// ========================================
// API設定
// ========================================
const API_BASE = 'https://vrchat.com/api/1';

// ========================================
// チャンクサイズ（分割保存用）
// ========================================
const DETAILS_CHUNK_SIZE = 50;           // worldDetails分割保存用（50チャンク）
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
// デバッグ設定
// ========================================
const DEBUG_LOG = true;

// ========================================
// エラーメッセージ定数
// ========================================
const ERROR_MESSAGES = {
  // 認証エラー
  AUTH_REQUIRED: 'VRChatにログインしていません',
  
  // 制限エラー
  VRC_LIMIT_EXCEEDED: 'VRCフォルダが150件を超えています',
  VRC_SYNC_LIMIT_EXCEEDED: 'VRCフォルダが100件を超えているため同期できません',
  SYNC_LIMIT_EXCEEDED: '共有ストレージが1000件を超えています',
  SYNC_BYTES_EXCEEDED: '共有ストレージの容量上限を超えています',
  
  // 操作エラー
  SYNC_IN_PROGRESS: '同期処理中のため操作できません',
  WORLD_NOT_FOUND: 'ワールドが見つかりません',
  FOLDER_NOT_FOUND: 'フォルダが見つかりません',
  ALREADY_EXISTS: 'このワールドは既に登録されています',
  
  // データエラー
  INVALID_WORLD_DATA: '無効なワールドデータです',
  INVALID_FOLDER_DATA: '無効なフォルダデータです',
  
  // APIエラー
  API_ERROR: 'VRChat APIエラーが発生しました',
  NETWORK_ERROR: 'ネットワークエラーが発生しました',
  
  // Private/Deleted
  PRIVATE_WORLD_RESTRICTION: 'プライベート・削除済ワールドはVRCフォルダに追加できません'
};

// ========================================
// エクスポート（Service Worker用）
// ========================================
// Service Workerでは通常のexportが使えないため、
// グローバルスコープに定義することで他のファイルから参照可能にする