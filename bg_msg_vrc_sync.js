// bg_msg_vrc_sync.js - VRC同期・お気に入り連携 メッセージハンドラー
// background.js のメッセージルーターから分離（v1.4.0時点でのリファクタリング）
// 各関数は (request, sendResponse) を受け取り、真偽値を返す(true=非同期でsendResponseする)

function handleMsg_START_VRC_ACTION(request, sendResponse) {
  handleVRCAction(request, sendResponse);
  return true;
}

function handleMsg_CANCEL_VRC_ACTION(request, sendResponse) {
  abortVRCAction(request.windowId);
  sendResponse({ success: true });
  return true;
}

function handleMsg_getSettings(request, sendResponse) {
  getSettings(sendResponse);
  return true;
}

function handleMsg_saveSettings(request, sendResponse) {
  saveSettings(request.settings, sendResponse);
  return true;
}

function handleMsg_updateContextMenus(request, sendResponse) {
  initializeContextMenus().then(() => sendResponse({ success: true }));
  return true;
}

function handleMsg_resetAllData(request, sendResponse) {
  resetAllData(sendResponse);
  return true;
}

function handleMsg_fetchAllVRCFolders(request, sendResponse) {
  if (WARN_LOG) console.warn('[Background] Deprecated: fetchAllVRCFolders called. Use START_VRC_ACTION.');
  fetchAllVRCFolders(sendResponse);
  return true;
}

function handleMsg_syncAllFavorites(request, sendResponse) {
  if (WARN_LOG) console.warn('[Background] Deprecated: syncAllFavorites called. Use START_VRC_ACTION.');
  syncAllFavorites(sendResponse);
  return true;
}

function handleMsg_getSingleWorldDetails(request, sendResponse) {
  getSingleWorldDetails(request.worldId, sendResponse);
  return true;
}

function handleMsg_getVRCFavoriteInfo(request, sendResponse) {
  getVRCFavoriteInfo(request.worldId, sendResponse);
  return true;
}

function handleMsg_moveVRCWorldFolder(request, sendResponse) {
  moveVRCWorldFolder(request.worldId, request.favoriteRecordId, request.fromFolder, request.toFolder, sendResponse);
  return true;
}

function handleMsg_addVRCFavorite(request, sendResponse) {
  addVRCFavorite(request.worldId, request.folderId, sendResponse);
  return true;
}

function handleMsg_deleteVRCFavorite(request, sendResponse) {
  deleteVRCFavorite(request.favoriteRecordId, sendResponse);
  return true;
}

function handleMsg_batchImportWorlds(request, sendResponse) {
  batchImportWorlds(request, sendResponse);
  return true;
}

function handleMsg_getWorldDetailsForExport(request, sendResponse) {
  getAllWorldDetailsForExport(sendResponse);
  return true;
}

function handleMsg_COMMIT_BUFFER_ERROR(request, sendResponse) {
  chrome.runtime.sendMessage({
    action: 'COMMIT_BUFFER_ERROR',
    error: request.error || 'Unknown error'
  }, (response) => {
    if (chrome.runtime.lastError) {
      // 受信側がない場合は無視
    }
  });
  sendResponse({ received: true });
  return true;
}
