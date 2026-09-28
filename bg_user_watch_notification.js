// bg_user_watch_notification.js v1.3.0

// ============================================================
// グローバル状態
// ============================================================

let lastCheckTime = null;
let unreadNotifications = new Map(); // userId -> { type, count, latestDate }
let globalNotificationSettings = { worldUpdate: true, newWorld: true };

// 【v1.3.3追加】巡回の重複実行防止・緊急停止用フラグ
let isWatchListChecking = false;
let watchListCheckAborted = false;

// 【v1.4.0追加】巡回(「全件更新」「軽量チェック」共通)の進捗状態。
// ポップアップが閉じている間に実行中の巡回であっても、再度開いた時に
// 現在地を復元できるようにする。
// checkType: 'manual'(全件更新) | 'light'(軽量チェック・自動実行) | null(未実行)
let manualCheckProgressState = {
  running: false,
  checkType: null,
  current: 0,
  total: 0,
  displayName: ''
};

/**
 * 現在の巡回進捗状態を取得する(ポップアップ再オープン時の復元用)。
 */
function getManualCheckProgressState() {
  return { ...manualCheckProgressState };
}

/**
 * 実行中の巡回に中断を要求する(緊急停止ボタンから呼ばれる)
 */
function abortWatchListCheck() {
  if (isWatchListChecking) {
    watchListCheckAborted = true;
    logAction('WATCH_LIST_CHECK_ABORT_REQUESTED');
  }
}

// ============================================================
// 初期化
// ============================================================

async function initWatchNotificationService() {
  try {
    if (DEBUG_LOG) console.log('[WatchNotification] Initializing service...');

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

    // 起動時チェック(5秒遅延)
    // 【v1.5.0変更】ウォッチリスト自動巡回の設定値(-1=起動時のみ)を見て判定する。
    // 独立したトグルではなく、下の定期実行間隔セレクタ1つに統一した。
    const intervalMinutes = await getWatchListIntervalSetting();
    const startupCheckEnabled = intervalMinutes === -1;

    if (startupCheckEnabled) {
      if (DEBUG_LOG) console.log('[WatchNotification] Scheduling startup check in 5 seconds...');
      setTimeout(() => {
        if (DEBUG_LOG) console.log('[WatchNotification] Running startup check (full refresh) now...');
        // 【v1.5.0変更】起動時チェックも全件更新に統一(理由は定期実行と同じ)
        manualCheckUpdates();
      }, NOTIFICATION_SETTINGS.STARTUP_DELAY);
    } else if (DEBUG_LOG) {
      console.log('[WatchNotification] Startup check is disabled (interval setting =', intervalMinutes, '). Skipping.');
    }

    // 【v1.3.3追加】定期巡回用のchrome.alarmsをセットアップ
    await setupWatchListAlarm();

    if (DEBUG_LOG) console.log('[WatchNotification] Service initialized successfully');

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
 * 【v1.5.0追加】ウォッチリスト自動巡回の設定値を取得する共通ヘルパー。
 * 0=自動巡回しない / -1=起動時のみ / 60,180,720=定期実行の分間隔
 */
async function getWatchListIntervalSetting() {
  const result = await chrome.storage.sync.get(['settings']);
  const settings = result.settings || {};
  return settings.watchListCheckIntervalMinutes ??
    NOTIFICATION_SETTINGS.DEFAULT_CHECK_INTERVAL_MINUTES;
}

/**
 * 【v1.5.0変更】ウォッチリスト自動巡回の設定値は1つのセレクタに統一されている。
 *   0  = 自動巡回しない(起動時チェックも定期実行アラームも作らない)
 *  -1  = 起動時のみ(定期実行アラームは作らない。起動時チェックの可否は
 *        initWatchNotificationService側でこの値を見て判定する)
 *  60/180/720 = この分間隔でchrome.alarmsによる定期実行を行う
 * (定期実行が有効な間隔の場合、起動時チェックは行わない)
 * 設定変更時にも呼び出せるよう独立した関数にしている。
 */
async function setupWatchListAlarm() {
  try {
    const intervalMinutes = await getWatchListIntervalSetting();

    // 既存のアラームは一旦クリアしてから再設定する(間隔変更に対応するため)
    await chrome.alarms.clear(NOTIFICATION_SETTINGS.WATCH_LIST_ALARM_NAME);

    if (intervalMinutes <= 0) {
      // 0(自動巡回しない) または -1(起動時のみ) は定期実行アラームを作らない
      logAction('WATCH_LIST_ALARM_DISABLED', { intervalMinutes });
      return;
    }

    chrome.alarms.create(NOTIFICATION_SETTINGS.WATCH_LIST_ALARM_NAME, {
      periodInMinutes: intervalMinutes
    });
    logAction('WATCH_LIST_ALARM_SCHEDULED', { intervalMinutes });
  } catch (error) {
    logError('SETUP_WATCH_LIST_ALARM_ERROR', error);
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
 * 【v1.3.0 修正】ウォッチリストの更新をチェック(外部公開用エントリポイント)
 * 重複実行防止ガードを持つ。定期実行・起動時・ポップアップ起動時から呼ばれる。
 * @param {boolean} isStartup - 起動時チェックかどうか
 */
async function checkWatchListUpdates(isStartup = false) {
  // 重複実行防止: 既に巡回中(manualCheckUpdatesも含む)なら新規開始せずスキップ
  if (isWatchListChecking) {
    logAction('CHECK_WATCH_LIST_UPDATES_SKIPPED', 'Already checking');
    return {
      success: true,
      skipped: true,
      reason: ErrorReason.ALREADY_CHECKING
    };
  }

  isWatchListChecking = true;
  watchListCheckAborted = false;
  manualCheckProgressState = { running: true, checkType: 'light', current: 0, total: 0, displayName: '' };

  try {
    return await _performWatchListCheck(isStartup, false);
  } finally {
    isWatchListChecking = false;
    watchListCheckAborted = false;
    manualCheckProgressState = { running: false, checkType: null, current: 0, total: 0, displayName: '' };

    // 【v1.4.0追加】この巡回を開始したポップアップが既に閉じられ、
    // 別のポップアップが進捗を引き継いで表示している場合に備え、
    // 完了も放送しておく(受信側がいなくてもエラーは無視してよい)。
    chrome.runtime.sendMessage({ type: 'manualCheckComplete' }).catch(() => {});
  }
}

/**
 * ウォッチリストチェックの実処理(内部専用)。
 * 呼び出し元(checkWatchListUpdates または manualCheckUpdates)が
 * 既に isWatchListChecking フラグの管理・解放責任を持っている前提で、
 * ここではフラグの重複チェックを行わない。
 * @param {boolean} isStartup - 起動時チェックかどうか
 * @param {boolean} skipApiRefresh - 【v1.3.3追加】trueの場合、APIから最新6件を
 *   取り直さず、storageに保存済みのuser.worlds(既に他の処理で更新済みの前提)
 *   だけを使って判定する。manualCheckUpdates が refreshUserWorlds で全件更新した
 *   直後に、同じ内容を二重にAPI取得しないようにするためのモード。
 */
async function _performWatchListCheck(isStartup, skipApiRefresh) {
  try {
    if (DEBUG_LOG) console.log('[WatchNotification] Starting check...', { isStartup });

    if (DEBUG_LOG) {
      logAction('CHECK_WATCH_LIST_UPDATES', { isStartup });
    }

    // グローバル設定を再読み込み(変更されている可能性)
    await loadGlobalNotificationSettings();

    // ウォッチリスト読み込み
    const watchList = await loadWatchList();

    if (DEBUG_LOG) console.log('[WatchNotification] Watch list loaded:', watchList.length, 'users');

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

    // 【v1.4.0追加】この巡回(軽量チェック)の進捗をポップアップに表示できるよう、
    // 「全件更新」と同じ manualCheckProgressState/manualCheckProgress の
    // 仕組みに乗せる。checkType はここでは変更しない(呼び出し元が設定済み)。
    manualCheckProgressState.total = watchList.length;

    // 各ユーザーの最新6件を取得
    let wasAborted = false;
    let authRequired = false; // 【v1.3.3追加】未ログイン検知フラグ(自動巡回のため静かに打ち切る)
    let processedIndex = 0;
    for (const user of watchList) {
      processedIndex++;

      // 【v1.3.3追加】緊急停止が要求されたら、途中経過を保持して打ち切る
      if (watchListCheckAborted) {
        wasAborted = true;
        logAction('CHECK_WATCH_LIST_UPDATES_ABORTED', { processedSoFar: newNotifications.size });
        break;
      }

      manualCheckProgressState.current = processedIndex;
      manualCheckProgressState.displayName = user.displayName;
      chrome.runtime.sendMessage({
        type: 'manualCheckProgress',
        data: {
          checkType: manualCheckProgressState.checkType,
          current: processedIndex,
          total: watchList.length,
          userId: user.userId,
          displayName: user.displayName
        }
      }).catch(() => {
        // ウィンドウが閉じられている場合はエラーを無視
      });

      // 通知無効ユーザーはスキップ
      if (!user.notificationEnabled) continue;

      // 【v1.3.3】skipApiRefreshがtrueなら、既にstorageに反映済みの
      // user.worldsだけを見て判定する(APIの再取得を行わない)
      const recentResult = skipApiRefresh
        ? { success: false }
        : await fetchUserRecentWorlds(user.userId, 6);

      // 【v1.3.3追加】VRChatに未ログインの場合、これ以上APIを叩いても
      // 全員失敗するだけなので巡回を打ち切る。自動実行(定期・起動時)のため
      // 通知は出さず、ログにのみ記録する。
      if (!recentResult.success && recentResult.reason === ErrorReason.AUTH_REQUIRED) {
        logAction('CHECK_WATCH_LIST_STOPPED_AUTH_REQUIRED', { processedSoFar: newNotifications.size });
        authRequired = true;
        break;
      }

      if (!recentResult.success || !recentResult.worlds || recentResult.worlds.length === 0) {
        // API エラー・スキップ・ワールドなし → 既存データ(storage)で判定
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

            // 今日の更新判定(24時間以内) 【v1.3.3追加】skipApiRefresh時もtodayUpdatesを正しく集計する
            const lastUpdated = new Date(user.lastUpdatedAt || 0);
            const hoursSinceUpdate = (now - lastUpdated) / (1000 * 60 * 60);
            if (hoursSinceUpdate <= NOTIFICATION_SETTINGS.TODAY_HOURS) {
              todayUpdates.push({
                userId: user.userId,
                displayName: user.displayName,
                count: displayCount,
                type: unreadWorlds.newCount > 0 ? 'new' : 'updated'
              });
            }
          }
        }

        // レート制限対策(APIを叩いていないskipApiRefresh時は待機不要)
        if (!skipApiRefresh) {
          await sleep(1000);
        }
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

    // 未読情報を保存(中断された場合も、それまでに集計できた分は反映する)
    unreadNotifications = newNotifications;

    // バッジ更新
    await updateBadge(totalUnread);

    // ブラウザ通知(起動時のみ、かつ更新があれば、かつ中断されていなければ)
    if (isStartup && totalUnread > 0 && !wasAborted && !authRequired) {
      await showBrowserNotification(totalUnread, todayUpdates.length);
    }

    // 【v1.3.3修正】中断された場合・未ログインで打ち切った場合は
    // チェック時刻を更新しない(未確認のユーザーが残ったまま
    // 「確認済み」扱いになるのを防ぐ)
    if (!wasAborted && !authRequired) {
      await chrome.storage.local.set({
        lastNotificationCheck: now.toISOString()
      });
      lastCheckTime = now;
    }

    if (DEBUG_LOG) {
      logAction('CHECK_COMPLETE', {
        totalUnread,
        todayUpdates: todayUpdates.length,
        notifiedUsers: newNotifications.size,
        aborted: wasAborted,
        authRequired
      });
    }

    return {
      success: true,
      aborted: wasAborted,
      authRequired,
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
  // フラグ(isWatchListChecking/watchListCheckAborted)のリセットは
  // 呼び出し元(checkWatchListUpdates または manualCheckUpdates)の責務
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

    const lang = settings.language || 'ja';

    let message = getBgTranslation('notificationMessage', lang, { total: totalCount });
    if (todayCount > 0) {
      message += getBgTranslation('notificationMessageToday', lang, { today: todayCount });
    }

    await chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: getBgTranslation('notificationTitle', lang),
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
  // 【v1.3.3追加】軽量チェックや別の全件更新と同時実行しない
  if (isWatchListChecking) {
    logAction('MANUAL_CHECK_UPDATES_SKIPPED', 'Already checking');
    return {
      success: true,
      skipped: true,
      reason: ErrorReason.ALREADY_CHECKING
    };
  }

  isWatchListChecking = true;
  watchListCheckAborted = false;
  manualCheckProgressState = { running: true, checkType: 'manual', current: 0, total: 0, displayName: '' };

  try {
    // 言語設定を取得
    const result = await chrome.storage.sync.get(['settings']);
    const lang = result.settings?.language || 'ja';

    if (DEBUG_LOG) {
      logAction('MANUAL_CHECK_UPDATES_START');
    }

    const watchList = await loadWatchList();

    if (!watchList || watchList.length === 0) {
      return {
        success: true,
        hasUpdates: false,
        totalUnread: 0,
        message: getBgTranslation('watchListEmpty', lang)
      };
    }

    manualCheckProgressState.total = watchList.length;

    let refreshedCount = 0;
    let errorCount = 0;
    let wasAborted = false;
    let autoRemovedCount = 0;
    let authRequired = false; // 【v1.3.3追加】未ログインを検知したら即座にループを打ち切るためのフラグ

    // 各ユーザーの情報を更新
    for (let i = 0; i < watchList.length; i++) {
      // 【v1.3.3追加】緊急停止が要求されたら打ち切る
      if (watchListCheckAborted) {
        wasAborted = true;
        logAction('MANUAL_CHECK_UPDATES_ABORTED', { processedSoFar: refreshedCount });
        break;
      }

      const user = watchList[i];

      try {
        // 【v1.4.0追加】ポップアップが閉じていても後で復元できるよう、
        // 放送(sendMessage)と同時に現在地をグローバル状態にも保持する。
        manualCheckProgressState.current = i + 1;
        manualCheckProgressState.displayName = user.displayName;

        // 進捗通知を送信
        chrome.runtime.sendMessage({
          type: 'manualCheckProgress',
          data: {
            checkType: 'manual',
            current: i + 1,
            total: watchList.length,
            userId: user.userId,
            displayName: user.displayName
          }
        }).catch(() => {
          // ウィンドウが閉じられている場合はエラーを無視
        });

        // 【v1.3.3整理】refreshUserWorldsが軽量インポートユーザー(詳細未取得)にも
        // 対応するようになったため、isMissing分岐は不要になった。
        // ワールド0件の場合の実在確認もrefreshUserWorlds内で自動的に行われる。
        const refreshResult = await refreshUserWorlds(user.userId);

        // 【v1.3.3追加】VRChatに未ログインの場合は、それ以上API呼び出しを
        // 続けても全員失敗するだけなので、即座に巡回を打ち切る。
        if (!refreshResult.success && refreshResult.reason === ErrorReason.AUTH_REQUIRED) {
          logAction('MANUAL_CHECK_STOPPED_AUTH_REQUIRED', {
            processedSoFar: refreshedCount,
            userId: user.userId
          });
          authRequired = true;
          break;
        }

        // 【v1.3.3追加】ユーザーが実在しない(退会・BAN等)場合はウォッチリストから自動削除する
        if (!refreshResult.success && refreshResult.reason === ErrorReason.USER_NOT_FOUND) {
          logAction('MANUAL_CHECK_AUTO_REMOVE_NOT_FOUND', {
            userId: user.userId,
            displayName: user.displayName
          });
          await removeUserFromWatchList(user.userId);
          autoRemovedCount++;
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
        errors: errorCount,
        aborted: wasAborted,
        autoRemoved: autoRemovedCount,
        authRequired
      });
    }

    // 更新後、未読チェック実行(既にrefreshUserWorldsで最新化済みのため、
    // APIから再取得せずstorageのデータだけで集計する = skipApiRefresh: true)
    const checkResult = await _performWatchListCheck(false, true);

    return {
      ...checkResult,
      aborted: wasAborted || checkResult.aborted,
      authRequired: authRequired || checkResult.authRequired,
      refreshedCount,
      errorCount,
      autoRemovedCount
    };

  } catch (error) {
    logError('MANUAL_CHECK_UPDATES_ERROR', error);
    return {
      success: false,
      error: error.message
    };
  } finally {
    isWatchListChecking = false;
    watchListCheckAborted = false;
    manualCheckProgressState = { running: false, checkType: null, current: 0, total: 0, displayName: '' };

    // 【v1.4.0追加】この巡回を開始したポップアップが既に閉じられ、
    // 別のポップアップが進捗を引き継いで表示している場合に備え、
    // 完了も放送しておく(受信側がいなくてもエラーは無視してよい)。
    chrome.runtime.sendMessage({ type: 'manualCheckComplete' }).catch(() => {});
  }
}