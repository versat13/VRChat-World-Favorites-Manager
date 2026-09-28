// bg_msg_world_folder.js - ワールド・フォルダ管理 メッセージハンドラー
// background.js のメッセージルーターから分離（v1.4.0時点でのリファクタリング）
// 各関数は (request, sendResponse) を受け取り、真偽値を返す(true=非同期でsendResponseする)

function handleMsg_VRC_SYNC_COMPLETED(request, sendResponse) {
  sendResponse({ received: true });
  return true;
}

function handleMsg_getAllWorlds(request, sendResponse) {
  getAllWorlds(sendResponse);
  return true;
}

function handleMsg_getVRCWorlds(request, sendResponse) {
  getVRCWorlds(sendResponse);
  return true;
}

function handleMsg_addWorld(request, sendResponse) {
  addWorld(request.world, sendResponse);
  return true;
}

function handleMsg_removeWorld(request, sendResponse) {
  removeWorld(request.worldId, request.folderId, sendResponse);
  return true;
}

function handleMsg_updateWorld(request, sendResponse) {
  updateWorld(request.world, sendResponse);
  return true;
}

function handleMsg_moveWorld(request, sendResponse) {
  moveWorld(request.worldId, request.fromFolder, request.toFolder, request.newFavoriteId, sendResponse);
  return true;
}

function handleMsg_batchUpdateWorlds(request, sendResponse) {
  batchUpdateWorlds(request.changes, sendResponse);
  return true;
}

function handleMsg_COMMIT_BUFFER(request, sendResponse) {
  commitBuffer(request, sendResponse, (progress) => {
    chrome.runtime.sendMessage(progress, (response) => {
      if (chrome.runtime.lastError) {
        // エラーログは出さない(正常動作)
      }
    });
  });
  return true;
}

function handleMsg_CHECK_RATE_LIMIT(request, sendResponse) {
  const waitMs = rateLimiter.getWaitTime();
  sendResponse({
    needsWait: waitMs > 0,
    waitSeconds: Math.ceil(waitMs / 1000)
  });
  return true;
}

function handleMsg_detectDuplicates(request, sendResponse) {
  detectDuplicates(sendResponse);
  return true;
}

function handleMsg_resolveDuplicates(request, sendResponse) {
  resolveDuplicates(request.strategy || 'keep_first', sendResponse);
  return true;
}

function handleMsg_getFolders(request, sendResponse) {
  getFolders(sendResponse);
  return true;
}

function handleMsg_addFolder(request, sendResponse) {
  addFolder(sendResponse);
  return true;
}

function handleMsg_removeFolder(request, sendResponse) {
  removeFolder(request.folderId, sendResponse);
  return true;
}

function handleMsg_renameFolder(request, sendResponse) {
  renameFolder(request.folderId, request.newName, sendResponse);
  return true;
}

function handleMsg_getStorageStats(request, sendResponse) {
  getStorageStats(sendResponse);
  return true;
}
