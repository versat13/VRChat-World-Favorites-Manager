// bg_utils.js v1.2.0
console.log('[Utils] Loaded');

// ========================================
// ヘルパー関数
// ========================================

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 文字列からハッシュコードを生成（分割保存キー用）
 * @param {string} str - ハッシュ化する文字列
 * @returns {number} ハッシュ値
 */
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

// ========================================
// デバッグログ
// ========================================

function logAction(action, data) {
  if (!DEBUG_LOG) return;
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [ACTION] ${action}:`, JSON.stringify(data, null, 2));
}

function logError(action, error, data = null) {
  if (!DEBUG_LOG) return;
  const timestamp = new Date().toISOString();
  if (action.includes('LIMIT') || action.includes('RESTRICTED')) {
    console.warn(`[${timestamp}] [WARN] ${action}:`, error);
  } else {
    console.error(`[${timestamp}] [ERROR] ${action}:`, error);
  }
  if (data) console.log('Data:', data);
  
  // UNKNOWN_MESSAGE の場合はスタックトレースも出力
  if (action === 'UNKNOWN_MESSAGE') {
    console.trace('Stack trace for unknown message');
  }
}

function logBatch(phase, data) {
  if (!DEBUG_LOG) return;
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [BATCH ${phase}]:`, data);
}