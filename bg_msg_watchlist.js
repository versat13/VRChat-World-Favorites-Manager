// bg_msg_watchlist.js - ウォッチリスト・通知 メッセージハンドラー
// background.js のメッセージルーターから分離（v1.4.0時点でのリファクタリング）
// 各関数は (request, sendResponse) を受け取り、真偽値を返す(true=非同期でsendResponseする)

function handleMsg_loadWatchList(request, sendResponse) {
  (async () => {
    try {
      const watchList = await loadWatchList();
      sendResponse({ success: true, watchList });
    } catch (error) {
      logError('LOAD_WATCH_LIST_HANDLER', error);
      sendResponse(createGenericError(error.message));
    }
  })();
  return true;
}

function handleMsg_addUserToWatchList(request, sendResponse) {
  (async () => {
    try {
      const progressCallback = (progress) => {
        chrome.runtime.sendMessage({
          type: 'watchListProgress',
          data: progress
        }).catch(() => {
          // ウィンドウが閉じられている場合はエラーを無視
        });
      };

      const result = await addUserToWatchList(
        request.userId,
        progressCallback
      );

      sendResponse(result);
    } catch (error) {
      logError('ADD_USER_TO_WATCH_LIST_HANDLER', error);
      sendResponse(createGenericError(error.message));
    }
  })();
  return true;

    // 【v1.3.3追加】軽量インポート: APIを叩かず複数IDをまとめて登録する
    // (書き込み回数の上限対策のため、1件ずつでなく配列で受け取る)
}

function handleMsg_addUserIdsBulk(request, sendResponse) {
  (async () => {
    try {
      const result = await addUserIdsBulk(request.userIds);
      sendResponse(result);
    } catch (error) {
      logError('ADD_USER_IDS_BULK_HANDLER', error);
      sendResponse(createGenericError(error.message));
    }
  })();
  return true;
}

function handleMsg_removeUserFromWatchList(request, sendResponse) {
  (async () => {
    try {
      const result = await removeUserFromWatchList(request.userId);
      sendResponse(result);
    } catch (error) {
      logError('REMOVE_USER_FROM_WATCH_LIST_HANDLER', error);
      sendResponse(createGenericError(error.message));
    }
  })();
  return true;
}

/**
 * 【v1.5.0追加】複数ユーザーの一括削除。
 * MAX_WRITE_OPERATIONS_PER_MINUTE対策として、popup側からのループ呼び出しを
 * やめ、対象IDを配列でまとめて渡してbackground側で1回だけ保存する。
 */
function handleMsg_removeMultipleUsersFromWatchList(request, sendResponse) {
  (async () => {
    try {
      const result = await removeMultipleUsersFromWatchList(request.userIds);
      sendResponse(result);
    } catch (error) {
      logError('REMOVE_MULTIPLE_USERS_FROM_WATCH_LIST_HANDLER', error);
      sendResponse(createGenericError(error.message));
    }
  })();
  return true;
}

function handleMsg_refreshUserWorlds(request, sendResponse) {
  (async () => {
    try {
      const progressCallback = (progress) => {
        chrome.runtime.sendMessage({
          type: 'watchListProgress',
          data: progress
        }).catch(() => { });
      };

      const result = await refreshUserWorlds(
        request.userId,
        progressCallback
      );

      sendResponse(result);
    } catch (error) {
      logError('REFRESH_USER_WORLDS_HANDLER', error);
      sendResponse(createGenericError(error.message));
    }
  })();
  return true;
}

function handleMsg_markUserAsChecked(request, sendResponse) {
  (async () => {
    try {
      const result = await markUserAsChecked(request.userId);
      sendResponse(result);
    } catch (error) {
      logError('MARK_USER_AS_CHECKED_HANDLER', error);
      sendResponse(createGenericError(error.message));
    }
  })();
  return true;
}

function handleMsg_toggleUserNotification(request, sendResponse) {
  (async () => {
    try {
      const result = await toggleUserNotification(request.userId, request.enabled);
      sendResponse(result);
    } catch (error) {
      logError('TOGGLE_USER_NOTIFICATION_HANDLER', error);
      sendResponse(createGenericError(error.message));
    }
  })();
  return true;
}

function handleMsg_updateNotificationSetting(request, sendResponse) {
  (async () => {
    try {
      const result = await updateNotificationSetting(
        request.userId,
        request.setting,
        request.enabled
      );
      sendResponse(result);
    } catch (error) {
      logError('UPDATE_NOTIFICATION_SETTING_HANDLER', error);
      sendResponse(createGenericError(error.message));
    }
  })();
  return true;
}

function handleMsg_updateGlobalNotificationSetting(request, sendResponse) {
  (async () => {
    try {
      const result = await updateGlobalNotificationSetting(
        request.setting,
        request.enabled
      );
      sendResponse(result);
    } catch (error) {
      logError('UPDATE_GLOBAL_NOTIFICATION_SETTING_HANDLER', error);
      sendResponse(createGenericError(error.message));
    }
  })();
  return true;
}

function handleMsg_exportWatchList(request, sendResponse) {
  (async () => {
    try {
      const result = await exportWatchListData();
      sendResponse(result);
    } catch (error) {
      logError('EXPORT_WATCH_LIST_HANDLER', error);
      sendResponse(createGenericError(error.message));
    }
  })();
  return true;
}

function handleMsg_importWatchList(request, sendResponse) {
  (async () => {
    try {
      const result = await importWatchListData(request.watchListIds);
      sendResponse(result);
    } catch (error) {
      logError('IMPORT_WATCH_LIST_HANDLER', error);
      sendResponse(createGenericError(error.message));
    }
  })();
  return true;


    // 【v1.2.2 新規追加】ウォッチリストからワールドをフォルダに追加
}

function handleMsg_addWorldToFolderFromWatch(request, sendResponse) {
  (async () => {
    try {
      // 1. ワールド詳細取得
      const details = await getSingleWorldDetailsInternal(request.worldId);

      if (!details) {
        sendResponse(createGenericError('Failed to fetch world details', 'world_details_fetch_failed'));
        return;
      }

      // 2. 既存チェック（重複防止）
      const allWorlds = await getAllWorldsInternal();
      const existing = allWorlds.find(w => w.id === request.worldId);

      if (existing) {
        // フォルダ名を取得して通知
        let folderName = '未分類';
        if (existing.folderId !== 'none') {
          if (existing.folderId.startsWith('worlds')) {
            folderName = `VRC ${existing.folderId.replace('worlds', '')}`;
          } else {
            const sync = await chrome.storage.sync.get(['folders']);
            const folder = (sync.folders || []).find(f => f.id === existing.folderId);
            folderName = folder ? folder.name : existing.folderId;
          }
        }

        sendResponse({
          success: false,
          reason: ErrorReason.ALREADY_EXISTS,
          folderName: folderName,
          worldName: details.name,
          userMessage: `「${details.name}」は既に「${folderName}」に登録済みです`
        });
        return;
      }

      // 3. フォルダに追加（既存関数を利用）
      const result = await addWorldToFolder({
        ...details,
        folderId: request.folderId
      });

      sendResponse(result);
    } catch (error) {
      logError('ADD_WORLD_TO_FOLDER_FROM_WATCH_ERROR', error);
      sendResponse(createGenericError(error.message));
    }
  })();
  return true;

    // ============================================================
    // 【新規追加 v1.2.1】通知関連
    // ============================================================
}

function handleMsg_getUnreadNotifications(request, sendResponse) {
  try {
    const result = getUnreadNotifications();
    sendResponse(result);
  } catch (error) {
    logError('GET_UNREAD_NOTIFICATIONS_HANDLER', error);
    sendResponse(createGenericError(error.message));
  }
  return true;
}

function handleMsg_clearUserNotifications(request, sendResponse) {
  (async () => {
    try {
      const result = await clearUserNotifications(request.userId);
      sendResponse(result);
    } catch (error) {
      logError('CLEAR_USER_NOTIFICATIONS_HANDLER', error);
      sendResponse(createGenericError(error.message));
    }
  })();
  return true;
}

function handleMsg_clearAllNotifications(request, sendResponse) {
  (async () => {
    try {
      const result = await clearAllNotifications();
      sendResponse(result);
    } catch (error) {
      logError('CLEAR_ALL_NOTIFICATIONS_HANDLER', error);
      sendResponse(createGenericError(error.message));
    }
  })();
  return true;
}

function handleMsg_manualCheckUpdates(request, sendResponse) {
  (async () => {
    try {
      const result = await manualCheckUpdates();
      sendResponse(result || { success: false, error: 'No response from manualCheckUpdates' });
    } catch (error) {
      logError('MANUAL_CHECK_UPDATES_HANDLER', error);
      sendResponse(createGenericError(error.message));
    }
  })();
  return true;

    // 【v1.4.0追加】ポップアップ再オープン時に、既に実行中の「全件更新」の
    // 進捗を復元するための現在地取得
}

function handleMsg_getManualCheckProgress(request, sendResponse) {
  sendResponse({ success: true, progress: getManualCheckProgressState() });
  return true;

    // 【v1.3.3追加】軽量チェック(最新6件だけ確認、ポップアップ起動時・定期実行用)
}

function handleMsg_lightCheckUpdates(request, sendResponse) {
  (async () => {
    try {
      const result = await checkWatchListUpdates(false);
      sendResponse(result || { success: false, error: 'No response from checkWatchListUpdates' });
    } catch (error) {
      logError('LIGHT_CHECK_UPDATES_HANDLER', error);
      sendResponse(createGenericError(error.message));
    }
  })();
  return true;

    // 【v1.3.3追加】実行中の巡回(軽量チェック・全件更新どちらも)を緊急停止する
}

function handleMsg_abortWatchListCheck(request, sendResponse) {
  abortWatchListCheck();
  sendResponse({ success: true });
  return true;

    // ============================================================
    // ウォッチリスト件数取得
    // ============================================================
}

function handleMsg_getWatchListCount(request, sendResponse) {
  (async () => {
    try {
      const result = await getWatchListCount();
      sendResponse(result);
    } catch (error) {
      logError('GET_WATCH_LIST_COUNT_HANDLER', error);
      sendResponse({ success: false, count: 0, error: error.message });
    }
  })();
  return true;

    // ============================================================
    // ウォッチリスト追加（エイリアス）
    // ============================================================
}

function handleMsg_addToWatchList(request, sendResponse) {
  (async () => {
    try {
      let userId = request.userId;
      let authorName = request.authorName;

      // worldIdが渡された場合は、まず作者情報を取得
      if (request.worldId && !userId) {
        const worldInfoResponse = await fetchWorldInfo(request.worldId);
        if (!worldInfoResponse.success || !worldInfoResponse.world.authorId) {
          sendResponse({
            success: false,
            reason: ErrorReason.AUTHOR_FETCH_FAILED,
            userMessage: '作者情報の取得に失敗しました'
          });
          return;
        }
        userId = worldInfoResponse.world.authorId;
        authorName = worldInfoResponse.world.authorName;
      }

      if (!userId) {
        sendResponse({
          success: false,
          reason: ErrorReason.NO_USER_ID,
          userMessage: 'ユーザーIDが指定されていません'
        });
        return;
      }

      const result = await addUserToWatchList(userId);

      // 成功レスポンスにauthorNameを追加して返す
      if (result.success) {
        sendResponse({
          ...result,
          authorName: authorName || result.user?.displayName
        });
      } else {
        sendResponse(result);
      }
    } catch (error) {
      logError('ADD_TO_WATCH_LIST_HANDLER', error);
      sendResponse(createGenericError(error.message));
    }
  })();
  return true;

    // ============================================================
    // デフォルト(不明なメッセージ)
    // ============================================================
}
