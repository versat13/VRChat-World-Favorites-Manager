// bg_utils.js
console.log('[Utils] Loaded');

// ========================================
// ヘルパー関数
// ========================================

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
}

function logBatch(phase, data) {
  if (!DEBUG_LOG) return;
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [BATCH ${phase}]:`, data);
}