// bg_constants.js
console.log('[Constants] Loaded');

const SYNC_WORLD_LIMIT = 1000;
const VRC_FOLDER_LIMIT = 150;
const VRC_FOLDER_SYNC_LIMIT = 100;
const API_BASE = 'https://vrchat.com/api/1';
const DETAILS_CHUNK_SIZE = 50; // worldDetails分割保存用
const WORLDS_CHUNK_SIZE = 100; // 1チャンクあたり100件（約8,000バイト）
const MAX_WORLDS_CHUNKS = 10;   // 最大10チャンク = 1000件

// バッチサイズ
const BATCH_SIZE = {
  sync: 50,
  local: 50
};

// デバッグログ
const DEBUG_LOG = true;