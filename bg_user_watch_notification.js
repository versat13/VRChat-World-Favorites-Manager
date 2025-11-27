// bg_user_watch_notification.js v1.2.2

// ============================================================
// グローバル状態
// ============================================================

let lastCheckTime = null;
let unreadNotifications = new Map(); // userId -> { type, count, latestDate }
let globalNotificationSettings = { worldUpdate: true, newWorld: true };

// ============================================================
// 初期化
// ============================================================

async function initWatchNotificationService() {
  try {
    console.log('[WatchNotification] Initializing service...');

    if (DEBUG_LOG) {
      logAction('INIT_WATCH_NOTIFICATION_SERVICE');
    }

    // グローバル通知設定を読み込み
    await loadGlobalNotificationSettings();

    // 前回のチェック時刻を復元
    const result = await chrome.storage.local.get(['lastNotificationCheck']);
    lastCheckTime = result.lastNotificationCheck
      ? new Date(result.lastNotificationCheck)
      : new Date(0);

    console.log('[WatchNotification] Scheduling startup check in 5 seconds...');

    // 起動時チェック(5秒遅延)
    setTimeout(() => {
      console.log('[WatchNotification] Running startup check now...');
      checkWatchListUpdates(true);
    }, NOTIFICATION_SETTINGS.STARTUP_DELAY);

    console.log('[WatchNotification] Service initialized successfully');

    if (DEBUG_LOG) {
      logAction('WATCH_NOTIFICATION_SERVICE_STARTED', {
        lastCheckTime: lastCheckTime.toISOString()
      });
    }

  } catch (error) {
    console.error('[WatchNotification] Initialization error:', error);
    logError('INIT_WATCH_NOTIFICATION_SERVICE_ERROR', error);
  }
}

/**
 * グローバル通知設定を読み込み
 */
async function loadGlobalNotificationSettings() {
  try {
    const sync = await chrome.storage.sync.get(['globalNotificationSettings']);
    globalNotificationSettings = sync.globalNotificationSettings || {
      worldUpdate: true,
      newWorld: true
    };

    if (DEBUG_LOG) {
      logAction('LOAD_GLOBAL_NOTIFICATION_SETTINGS', globalNotificationSettings);
    }
  } catch (error) {
    logError('LOAD_GLOBAL_NOTIFICATION_SETTINGS_ERROR', error);
    globalNotificationSettings = { worldUpdate: true, newWorld: true };
  }
}

// ============================================================
// 更新チェック
// ============================================================

/**
 * 【v1.2.2 修正】ウォッチリストの更新をチェック
 * - 各ユーザーの最新6件を取得して未読を検出
 * @param {boolean} isStartup - 起動時チェックかどうか
 */
async function checkWatchListUpdates(isStartup = false) {
  try {
    console.log('[WatchNotification] Starting check...', { isStartup });

    if (DEBUG_LOG) {
      logAction('CHECK_WATCH_LIST_UPDATES', { isStartup });
    }

    // グローバル設定を再読み込み(変更されている可能性)
    await loadGlobalNotificationSettings();

    // ウォッチリスト読み込み
    const watchList = await loadWatchList();

    console.log('[WatchNotification] Watch list loaded:', watchList.length, 'users');

    if (!watchList || watchList.length === 0) {
      await updateBadge(0);
      return {
        success: true,
        hasUpdates: false,
        totalUnread: 0
      };
    }

    const now = new Date();
    let totalUnread = 0;
    let todayUpdates = [];
    const newNotifications = new Map();

    // 各ユーザーの最新6件を取得
    for (const user of watchList) {
      // 通知無効ユーザーはスキップ
      if (!user.notificationEnabled) continue;

      // 【重要】最新6件を API から取得
      const recentResult = await fetchUserRecentWorlds(user.userId, 6);

      if (!recentResult.success || !recentResult.worlds || recentResult.worlds.length === 0) {
        // API エラーまたはワールドなし → 既存データで判定
        const unreadWorlds = getUnreadWorlds(user);

        if (unreadWorlds.newCount > 0 || unreadWorlds.updatedCount > 0) {
          const displayCount =
            (globalNotificationSettings.newWorld ? unreadWorlds.newCount : 0) +
            (globalNotificationSettings.worldUpdate ? unreadWorlds.updatedCount : 0);

          if (displayCount > 0) {
            totalUnread += displayCount;
            newNotifications.set(user.userId, {
              type: unreadWorlds.newCount > 0 ? 'new' : 'updated',
              count: displayCount,
              latestDate: user.latestPublicationDate || user.lastUpdatedAt,
              displayName: user.displayName
            });
          }
        }

        // レート制限対策
        await sleep(1000);
        continue;
      }

      // 取得した最新6件から未読を検出
      const lastChecked = new Date(user.lastCheckedAt);
      let newCount = 0;
      let updatedCount = 0;

      for (const world of recentResult.worlds) {
        const pub = world.publicationDate;
        const updated = new Date(world.updatedAt || 0);

        // 公開日の取得(Labs対応)
        let publicationDate;
        if (!pub || pub === 'none' || pub === 'null' || isNaN(new Date(pub).getTime())) {
          publicationDate = new Date(world.updatedAt || world.createdAt || 0);
        } else {
          publicationDate = new Date(pub);
        }

        // 新規判定: 公開日が最終確認日より新しい
        const isNew = publicationDate > lastChecked;

        // 更新判定: 公開日が最終確認日以前 かつ 更新日が最終確認日より新しい
        const isUpdated = publicationDate <= lastChecked && updated > lastChecked;

        // 重複排除: 新規優先
        if (isNew) {
          newCount++;
        } else if (isUpdated) {
          updatedCount++;
        }
      }

      // グローバル設定に応じてカウント
      let displayCount = 0;
      let displayType = 'updated';

      if (globalNotificationSettings.newWorld && newCount > 0) {
        displayCount += newCount;
        displayType = 'new';
      }

      if (globalNotificationSettings.worldUpdate && updatedCount > 0) {
        displayCount += updatedCount;
        if (displayType !== 'new') {
          displayType = 'updated';
        }
      }

      if (displayCount > 0) {
        totalUnread += displayCount;

        newNotifications.set(user.userId, {
          type: displayType,
          count: displayCount,
          latestDate: recentResult.worlds[0].publicationDate || recentResult.worlds[0].updatedAt,
          displayName: user.displayName
        });

        // 今日の更新判定(24時間以内)
        const lastUpdated = new Date(recentResult.worlds[0].updatedAt);
        const hoursSinceUpdate = (now - lastUpdated) / (1000 * 60 * 60);
        if (hoursSinceUpdate <= NOTIFICATION_SETTINGS.TODAY_HOURS) {
          todayUpdates.push({
            userId: user.userId,
            displayName: user.displayName,
            count: displayCount,
            type: displayType
          });
        }
      }

      // レート制限対策(1秒待機)
      await sleep(1000);
    }

    // 未読情報を保存
    unreadNotifications = newNotifications;

    // バッジ更新
    await updateBadge(totalUnread);

    // ブラウザ通知(起動時のみ、かつ更新があれば)
    if (isStartup && totalUnread > 0) {
      await showBrowserNotification(totalUnread, todayUpdates.length);
    }

    // チェック時刻を保存
    await chrome.storage.local.set({
      lastNotificationCheck: now.toISOString()
    });
    lastCheckTime = now;

    if (DEBUG_LOG) {
      logAction('CHECK_COMPLETE', {
        totalUnread,
        todayUpdates: todayUpdates.length,
        notifiedUsers: newNotifications.size
      });
    }

    return {
      success: true,
      hasUpdates: totalUnread > 0,
      totalUnread,
      todayUpdates,
      notifications: Array.from(newNotifications.entries()).map(([userId, data]) => ({
        userId,
        ...data
      }))
    };

  } catch (error) {
    logError('CHECK_WATCH_LIST_UPDATES_ERROR', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 【v1.2.2 修正】未読ワールドを取得(新規・更新を分けてカウント、重複排除)
 * Labs中のワールドは更新日=公開日として扱う
 * @param {Object} user - ユーザーオブジェクト
 * @returns {Object} { newCount, updatedCount }
 */
function getUnreadWorlds(user) {
  if (!user.worlds || user.worlds.length === 0) {
    return { newCount: 0, updatedCount: 0 };
  }

  const lastChecked = new Date(user.lastCheckedAt);
  let newCount = 0;
  let updatedCount = 0;

  for (const world of user.worlds) {
    const pub = world.publicationDate;
    const updated = new Date(world.updatedAt || 0);

    // 公開日の取得(Labs対応)
    let publicationDate;
    if (!pub || pub === 'none' || pub === 'null' || isNaN(new Date(pub).getTime())) {
      // Labs中は更新日を公開日として扱う(更新日=公開日)
      publicationDate = new Date(world.updatedAt || world.createdAt || 0);
    } else {
      publicationDate = new Date(pub);
    }

    // 新規判定: 公開日が最終確認日より新しい
    const isNew = publicationDate > lastChecked;

    // 更新判定: 公開日が最終確認日以前 かつ 更新日が最終確認日より新しい
    const isUpdated = publicationDate <= lastChecked && updated > lastChecked;

    // 重複排除: 新規優先
    if (isNew) {
      newCount++;
    } else if (isUpdated) {
      updatedCount++;
    }
  }

  if (DEBUG_LOG) {
    logAction('GET_UNREAD_WORLDS', {
      userId: user.userId,
      newCount,
      updatedCount,
      total: newCount + updatedCount
    });
  }

  return { newCount, updatedCount };
}

// ============================================================
// バッジ管理
// ============================================================

/**
 * 拡張機能アイコンのバッジを更新
 * @param {number} count - 未読数
 */
async function updateBadge(count) {
  try {
    if (count > 0) {
      const displayCount = count > NOTIFICATION_SETTINGS.BADGE_MAX
        ? `${NOTIFICATION_SETTINGS.BADGE_MAX}+`
        : String(count);

      await chrome.action.setBadgeText({ text: displayCount });
      await chrome.action.setBadgeBackgroundColor({ color: '#d34b4b' });
      await chrome.action.setBadgeTextColor({ color: '#ffffff' });
    } else {
      await chrome.action.setBadgeText({ text: '' });
    }

    if (DEBUG_LOG) {
      logAction('BADGE_UPDATED', { count });
    }

  } catch (error) {
    logError('UPDATE_BADGE_ERROR', error);
  }
}

/**
 * バッジをクリア
 */
async function clearBadge() {
  await updateBadge(0);
}

// ============================================================
// ブラウザ通知
// ============================================================

/**
 * デスクトップ通知を表示
 * @param {number} totalCount - 総未読数
 * @param {number} todayCount - 今日の更新数
 */
async function showBrowserNotification(totalCount, todayCount) {
  try {
    // 設定を確認
    const result = await chrome.storage.sync.get('settings');
    const settings = result.settings || {};

    // デスクトップ通知が無効の場合はスキップ
    if (settings.enableDesktopNotification === false) {
      if (DEBUG_LOG) {
        logAction('DESKTOP_NOTIFICATION_DISABLED');
      }
      return;
    }

    const permission = await chrome.permissions.contains({
      permissions: ['notifications']
    });

    if (!permission) {
      if (DEBUG_LOG) {
        logAction('NOTIFICATION_PERMISSION_DENIED');
      }
      return;
    }

    let message = `${totalCount}件の新しい更新があります`;
    if (todayCount > 0) {
      message += `\n(うち今日: ${todayCount}件)`;
    }

    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'VRChat ワールド更新通知',
      message: message,
      priority: 1
    });

    if (DEBUG_LOG) {
      logAction('BROWSER_NOTIFICATION_SHOWN', { totalCount, todayCount });
    }

  } catch (error) {
    logError('SHOW_BROWSER_NOTIFICATION_ERROR', error);
  }
}

// ============================================================
// 未読情報取得
// ============================================================

/**
 * 現在の未読情報を取得
 * @returns {Object} 未読情報
 */
function getUnreadNotifications() {
  return {
    success: true,
    totalUnread: Array.from(unreadNotifications.values())
      .reduce((sum, n) => sum + n.count, 0),
    notifications: Array.from(unreadNotifications.entries()).map(([userId, data]) => ({
      userId,
      ...data
    })),
    lastCheckTime: lastCheckTime?.toISOString() || null
  };
}

/**
 * 特定ユーザーの未読をクリア
 * @param {string} userId
 */
async function clearUserNotifications(userId) {
  try {
    unreadNotifications.delete(userId);

    const totalUnread = Array.from(unreadNotifications.values())
      .reduce((sum, n) => sum + n.count, 0);

    await updateBadge(totalUnread);
    try {
      chrome.runtime.sendMessage({
        type: 'notificationUpdated'
      }).catch(() => { });
    } catch (error) {
    }

    if (DEBUG_LOG) {
      logAction('USER_NOTIFICATIONS_CLEARED', { userId, remainingTotal: totalUnread });
    }

    return { success: true };

  } catch (error) {
    logError('CLEAR_USER_NOTIFICATIONS_ERROR', error);
    return { success: false, error: error.message };
  }
}

/**
 * 全ての未読をクリア
 */
async function clearAllNotifications() {
  try {
    unreadNotifications.clear();
    await updateBadge(0);
    try {
      chrome.runtime.sendMessage({
        type: 'notificationUpdated'
      }).catch(() => { });
    } catch (error) {
      // 無視
    }

    if (DEBUG_LOG) {
      logAction('ALL_NOTIFICATIONS_CLEARED');
    }

    return { success: true };

  } catch (error) {
    logError('CLEAR_ALL_NOTIFICATIONS_ERROR', error);
    return { success: false, error: error.message };
  }
}

// ============================================================
// 手動チェック
// ============================================================

/**
 * 【v1.2.2 修正】手動で即座に更新チェック
 * - 全ユーザーのワールド情報を再取得
 * - 情報未取得ユーザーは addUserToWatchList で完全取得
 */
async function manualCheckUpdates() {
  try {
    if (DEBUG_LOG) {
      logAction('MANUAL_CHECK_UPDATES_START');
    }

    const watchList = await loadWatchList();

    if (!watchList || watchList.length === 0) {
      return {
        success: true,
        hasUpdates: false,
        totalUnread: 0,
        message: 'ウォッチリストが空です'
      };
    }

    let refreshedCount = 0;
    let errorCount = 0;

    // 各ユーザーの情報を更新
    for (let i = 0; i < watchList.length; i++) {
      const user = watchList[i];

      try {
        // 進捗通知を送信
        chrome.runtime.sendMessage({
          type: 'manualCheckProgress',
          data: {
            current: i + 1,
            total: watchList.length,
            userId: user.userId,
            displayName: user.displayName
          }
        }).catch(() => {
          // ウィンドウが閉じられている場合はエラーを無視
        });

        // 情報未取得判定
        const isMissing = !user.profilePicUrl ||
          !user.worlds ||
          user.worlds.length === 0 ||
          !user.totalWorldCount;

        if (isMissing) {
          // 完全再取得(addUserToWatchList を使用)
          if (DEBUG_LOG) {
            logAction('MANUAL_CHECK_REFETCH_MISSING', {
              userId: user.userId,
              displayName: user.displayName
            });
          }

          await addUserToWatchList(user.userId);
        } else {
          // 通常のワールド情報更新
          await refreshUserWorlds(user.userId);
        }

        refreshedCount++;

        // レート制限対策(1秒待機)
        await sleep(1000);

      } catch (error) {
        logError('MANUAL_CHECK_USER_ERROR', error, {
          userId: user.userId
        });
        errorCount++;
      }
    }

    if (DEBUG_LOG) {
      logAction('MANUAL_CHECK_REFRESH_COMPLETE', {
        total: watchList.length,
        refreshed: refreshedCount,
        errors: errorCount
      });
    }

    // 更新後、未読チェック実行
    const checkResult = await checkWatchListUpdates(false);

    return {
      ...checkResult,
      refreshedCount,
      errorCount
    };

  } catch (error) {
    logError('MANUAL_CHECK_UPDATES_ERROR', error);
    return {
      success: false,
      error: error.message
    };
  }
}