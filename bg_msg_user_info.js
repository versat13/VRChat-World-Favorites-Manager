// bg_msg_user_info.js - ユーザー情報・CSV出力 メッセージハンドラー
// background.js のメッセージルーターから分離（v1.4.0時点でのリファクタリング）
// 各関数は (request, sendResponse) を受け取り、真偽値を返す(true=非同期でsendResponseする)

function handleMsg_getWorldInfo(request, sendResponse) {
  (async () => {
    try {
      const result = await fetchWorldInfo(request.worldId);
      sendResponse(result);
    } catch (error) {
      logError('GET_WORLD_INFO_HANDLER', error);
      sendResponse(createGenericError(error.message));
    }
  })();
  return true;
}

function handleMsg_fetchUserInfo(request, sendResponse) {
  (async () => {
    try {
      const result = await fetchUserInfo(request.userIdOrName);
      sendResponse(result);
    } catch (error) {
      logError('FETCH_USER_INFO_HANDLER', error);
      sendResponse(createGenericError(error.message));
    }
  })();
  return true;
}

function handleMsg_fetchUserCreatedWorlds(request, sendResponse) {
  (async () => {
    try {
      const progressCallback = (progress) => {
        chrome.runtime.sendMessage({
          type: 'userCreatedWorldsProgress',
          data: progress
        }).catch(() => {
          // ウィンドウが閉じられている場合はエラーを無視
        });
      };

      const result = await fetchUserCreatedWorlds(
        request.userId,
        progressCallback
      );

      sendResponse(result);
    } catch (error) {
      logError('FETCH_USER_CREATED_WORLDS_HANDLER', error);
      sendResponse(createGenericError(error.message));
    }
  })();
  return true;
}

function handleMsg_fetchWorldDetailsBatch(request, sendResponse) {
  (async () => {
    try {
      const progressCallback = (progress) => {
        chrome.runtime.sendMessage({
          type: 'userFavoritesProgress',
          data: progress
        }).catch(() => { });
      };

      const result = await fetchWorldDetailsBatch(
        request.worldIds,
        progressCallback
      );

      sendResponse(result);
    } catch (error) {
      logError('FETCH_WORLD_DETAILS_BATCH_HANDLER', error);
      sendResponse(createGenericError(error.message));
    }
  })();
  return true;
}

function handleMsg_generateFavoritesCSV(request, sendResponse) {
  try {
    const csv = generateFavoritesCSV(
      request.favorites,
      request.worldDetails || {},
      request.includeDetails
    );

    sendResponse({
      success: true,
      csv: csv
    });
  } catch (error) {
    logError('GENERATE_FAVORITES_CSV_HANDLER', error);
    sendResponse(createGenericError(error.message));
  }
  return true;
}

function handleMsg_generateCreatedWorldsCSV(request, sendResponse) {
  try {
    const csv = generateCreatedWorldsCSV(request.worlds);

    sendResponse({
      success: true,
      csv: csv
    });
  } catch (error) {
    logError('GENERATE_CREATED_WORLDS_CSV_HANDLER', error);
    sendResponse(createGenericError(error.message));
  }
  return true;
}

function handleMsg_fetchUserWorldCount(request, sendResponse) {
  (async () => {
    try {
      const result = await fetchUserWorldCount(request.userId);
      sendResponse(result);
    } catch (error) {
      logError('FETCH_USER_WORLD_COUNT_HANDLER', error);
      sendResponse(createGenericError(error.message));
    }
  })();
  return true;
}
