// bg_utils.js v1.2.1

// モジュール読み込みログ（開発時のみ）
if (INFO_LOG) console.log('[Utils] Loaded v1.2.1');

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

/**
 * pendingEditBufferとeditingBufferをマージする関数
 * 同じワールドIDの移動予約がある場合、最新の移動先(toFolder)で上書き
 * 元の出発点(fromFolder)は保持される
 * 
 * @param {Object} baseBuffer - 基本となるバッファ (editingBuffer)
 * @param {Object} pendingBuffer - マージするバッファ (pendingEditBuffer)
 * @returns {Object} マージされたバッファ
 */
function mergeEditBuffers(baseBuffer, pendingBuffer) {
  const mergedBuffer = {
    movedWorlds: [...baseBuffer.movedWorlds],
    deletedWorlds: [...baseBuffer.deletedWorlds]
  };

  // pendingBufferの移動予約をマージ
  pendingBuffer.movedWorlds.forEach(pendingMove => {
    const existingIndex = mergedBuffer.movedWorlds.findIndex(
      m => m.worldId === pendingMove.worldId
    );
    
    if (existingIndex !== -1) {
      // 既存の移動予約がある場合: 移動先のみ更新(fromFolderは保持)
      mergedBuffer.movedWorlds[existingIndex].toFolder = pendingMove.toFolder;
    } else {
      // 新規移動予約として追加
      mergedBuffer.movedWorlds.push(pendingMove);
    }
  });

  // pendingBufferの削除予約をマージ(重複排除)
  pendingBuffer.deletedWorlds.forEach(pendingDelete => {
    const exists = mergedBuffer.deletedWorlds.some(
      d => d.worldId === pendingDelete.worldId
    );
    
    if (!exists) {
      mergedBuffer.deletedWorlds.push(pendingDelete);
    }
  });

  return mergedBuffer;
}

// ========================================
// デバッグログ
// ========================================

function logAction(action, data) {
  // INFO以上のログレベルでのみ出力
  if (!INFO_LOG) return;
  
  const timestamp = new Date().toISOString();
  
  // オブジェクトの場合のみ stringify
  let formattedData = data;
  if (typeof data === 'object' && data !== null) {
    try {
      formattedData = JSON.stringify(data, null, 2);
    } catch (e) {
      // JSON.stringify が失敗した場合（循環参照など）
      formattedData = '[Circular or Non-Serializable Object]';
    }
  }
  
  console.log(`[${timestamp}] [ACTION] ${action}:`, formattedData);
}

function logError(action, error, data = null) {
  // ERROR以上のログレベルでのみ出力
  if (!ERROR_LOG) return;
  
  const timestamp = new Date().toISOString();
  
  // 制限系エラーは警告レベル
  if (action.includes('LIMIT') || action.includes('RESTRICTED')) {
    if (WARN_LOG) {
      console.warn(`[${timestamp}] [WARN] ${action}:`, error);
    }
  } else {
    console.error(`[${timestamp}] [ERROR] ${action}:`, error);
  }
  
  if (data && INFO_LOG) {
    // オブジェクトの場合のみ stringify
    let formattedData = data;
    if (typeof data === 'object' && data !== null) {
      try {
        formattedData = JSON.stringify(data, null, 2);
      } catch (e) {
        formattedData = '[Circular or Non-Serializable Object]';
      }
    }
    console.log('Data:', formattedData);
  }
  
  // UNKNOWN_MESSAGE の場合はスタックトレースも出力
  if (action === 'UNKNOWN_MESSAGE' && DEBUG_LOG) {
    console.trace('Stack trace for unknown message');
  }
}

function logBatch(phase, data) {
  // INFO以上のログレベルでのみ出力
  if (!INFO_LOG) return;
  
  const timestamp = new Date().toISOString();
  
  // オブジェクトの場合のみ stringify
  let formattedData = data;
  if (typeof data === 'object' && data !== null) {
    try {
      formattedData = JSON.stringify(data, null, 2);
    } catch (e) {
      formattedData = '[Circular or Non-Serializable Object]';
    }
  }
  
  console.log(`[${timestamp}] [BATCH ${phase}]:`, formattedData);
}
