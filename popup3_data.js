// popup3_data.js - インポート/エクスポート・巡回チェックUI・URL解析
// popup3_user_watch.js から機能分離(v1.4.0時点でのリファクタリング)

// インポート・エクスポート
// ============================================================

async function handleImport() {
  try {
    const file = await selectFile('.csv');
    if (!file) return;

    await importFromCSV(file);
  } catch (error) {
    console.error('Import failed:', error);
    showNotification(t('errorImportFailed'), 'error');
  }
}

async function handleExport() {
  try {
    const csv = generateWatchListCSV(watchList);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `watchlist_${timestamp}.csv`;
    downloadCSV(csv, filename);
    showNotification(t('exportSuccess'), 'success');
  } catch (error) {
    console.error('Export failed:', error);
    showNotification(t('errorExportFailed'), 'error');
  }
}

function selectFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = (e) => {
      const file = e.target.files[0];
      resolve(file || null);
    };
    input.click();
  });
}

function generateWatchListCSV(watchList) {
  let csv = '';

  watchList.forEach(user => {
    const worldCount = user.totalWorldCount || (user.worlds ? user.worlds.length : 0);
    csv += [
      user.userId,
      escapeCSV(user.displayName),
      worldCount
    ].join(',') + '\n';
  });

  return csv;
}

function escapeCSV(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function downloadCSV(csv, filename) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function importFromCSV(file) {
  try {
    const text = await file.text();
    const ids = extractIdsFromText(text);

    if (ids.length === 0) {
      showNotification(t('errorNoValidIds'), 'error');
      return;
    }

    showNotification(t('progressDetectedIds', { count: ids.length }), 'info');

    // 進捗表示を開始
    const progressEl = document.getElementById('importProgress');
    progressEl.textContent = t('progressResolvingIds', { current: 0, total: ids.length });
    progressEl.style.display = 'block';

    // 【v1.3.3変更】2フェーズ構成にする。
    // フェーズ1: 各IDをuserIdに解決するだけ(wrld_のみAPIが必要)。
    //   ストレージへの書き込みはまだ行わない。
    // フェーズ2: 解決できたuserIdをまとめて1回だけ保存する。
    // これにより chrome.storage.sync の書き込み回数上限
    // (MAX_WRITE_OPERATIONS_PER_MINUTE、120回/分)を回避する。
    const resolvedUserIds = [];
    let resolveErrorCount = 0;

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];

      try {
        let userId = null;

        if (id.startsWith('usr_')) {
          userId = id;
        } else if (id.startsWith('wrld_')) {
          const worldResponse = await chrome.runtime.sendMessage({
            type: 'getWorldInfo',
            worldId: id
          });

          if (!worldResponse.success) {
            resolveErrorCount++;
            continue;
          }

          userId = worldResponse.world.authorId;

          // wrld_変換はVRChat APIを実際に叩くため、レート制限対策で待機する
          await sleep(1000);
        }

        if (!userId) {
          resolveErrorCount++;
          continue;
        }

        resolvedUserIds.push(userId);

        progressEl.textContent = t('progressResolvingIds', { current: i + 1, total: ids.length });

      } catch (error) {
        console.error('Failed to resolve:', id, error);
        resolveErrorCount++;
      }
    }

    // フェーズ2: まとめて1回だけ保存
    progressEl.textContent = t('progressSavingToList');

    const bulkResponse = await chrome.runtime.sendMessage({
      type: 'addUserIdsBulk',
      userIds: resolvedUserIds
    });

    // 進捗表示を非表示
    progressEl.style.display = 'none';

    if (!bulkResponse || !bulkResponse.success) {
      showNotification(t('errorImportFailed'), 'error');
      return;
    }

    const successCount = bulkResponse.addedCount || 0;
    const skipCount = bulkResponse.skippedCount || 0;
    const errorCount = resolveErrorCount;

    // 最終的なリスト更新
    await loadWatchList();
    renderUserList();
    updateStats();

    // 最終結果を通知(1回のみ)
    let message;
    if (skipCount > 0 && errorCount > 0) {
      message = t('importWithError', { success: successCount, skip: skipCount, error: errorCount });
    } else if (skipCount > 0) {
      message = t('importWithSkip', { success: successCount, skip: skipCount });
    } else {
      message = t('importComplete', { success: successCount });
    }

    showNotification(message, successCount > 0 ? 'success' : 'info');

  } catch (error) {
    console.error('CSV import error:', error);

    // エラー時も進捗を非表示
    const progressEl = document.getElementById('importProgress');
    if (progressEl) {
      progressEl.style.display = 'none';
    }

    showNotification(t('errorImportFailed'), 'error');
  }
}

function extractIdsFromText(text) {
  const ids = new Set();

  // usr_xxx 形式のユーザーIDを抽出
  const userMatches = text.matchAll(/usr_[a-f0-9-]+/gi);
  for (const match of userMatches) {
    ids.add(match[0].toLowerCase());
  }

  // wrld_xxx 形式のワールドIDを抽出
  const worldMatches = text.matchAll(/wrld_[a-f0-9-]+/gi);
  for (const match of worldMatches) {
    ids.add(match[0].toLowerCase());
  }

  return Array.from(ids);
}

// ============================================================
// 【v1.3.3追加】巡回実行中のUI状態管理(共通ヘルパー)
// ============================================================

/**
 * 巡回中のUI状態を切り替える。
 * disableManualBtn: 全件更新ボタンを無効化するか(全件更新自身が走っている時のみtrue)
 * showAbortBtn: 緊急停止ボタンを表示するか(全件更新・軽量チェックどちらでもtrue)
 */
function setCheckingUiState(disableManualBtn, showAbortBtn = disableManualBtn) {
  const manualCheckBtn = document.getElementById('manualCheckBtn');
  const abortCheckBtn = document.getElementById('abortCheckBtn');
  const clearAllUnreadBtn = document.getElementById('clearAllUnreadBtn');

  if (manualCheckBtn) manualCheckBtn.disabled = disableManualBtn;
  if (abortCheckBtn) abortCheckBtn.style.display = showAbortBtn ? '' : 'none';
  if (clearAllUnreadBtn) clearAllUnreadBtn.style.display = showAbortBtn ? 'none' : '';
}

/**
 * 【v1.3.3追加】実行中の巡回(自動軽量チェック・全件更新のどちらでも)に
 * 緊急停止を要求する。
 */
async function handleAbortCheck() {
  try {
    await chrome.runtime.sendMessage({ type: 'abortWatchListCheck' });
    showNotification(t('checkAbortRequested'), 'info');
  } catch (error) {
    console.error('Failed to request abort:', error);
  }
}

// ============================================================
// 【v1.2.2 修正】手動チェック(全ユーザー更新)
// 連打防止・進捗表示改善
// ============================================================

/**
 * 巡回(「全件更新」「軽量チェック」共通)の進捗表示を更新する共通処理。
 * ボタンを押した本人のポップアップだけでなく、実行中に一度閉じて
 * 再度開いたポップアップからも同じ表示を出せるよう、
 * chrome.runtime.onMessage の常時リスナー(setupManualCheckProgressListener)
 * と、handleManualCheck 内の待機処理の両方から呼ばれる共通関数にしている。
 * @param {string} checkType - 'manual'(全件更新) | 'light'(軽量チェック)
 */
function updateManualCheckProgressDisplay(checkType, current, total, displayName) {
  const progressEl = document.getElementById('importProgress');
  if (!progressEl) return;

  const messageKey = checkType === 'light' ? 'progressLightCheckUpdating' : 'progressManualCheckUpdating';
  progressEl.textContent = t(messageKey, { current, total, name: displayName });
  progressEl.style.display = 'block';

  // 進捗が飛んできている=何らかの巡回が実行中ということなので、
  // checkTypeに応じて緊急停止ボタンの表示/全件更新ボタンの無効化を切り替える。
  // (manualCheckComplete受信時にsetCheckingUiState(false)へ戻される)
  setCheckingUiState(checkType === 'manual', true);

  // 再描画は非同期で行い、進捗表示の更新自体はブロックしない
  loadWatchList().then(() => {
    renderUserList();
  }).catch(() => {
    // 巡回中の一時的な読み込み失敗は無視してよい
  });
}

/**
 * ポップアップ起動時に、既に裏側で実行中の巡回(全件更新・軽量チェック
 * どちらも)があれば進捗表示を復元する。実行中でなければ何もしない。
 * 【v1.5.0変更】軽量チェック(自動巡回)実行中も緊急停止ボタンを表示する。
 * 「全件更新」ボタン自体は無効化しない(軽量チェック中でもユーザーが
 * すぐ全件更新を開始できるようにするため、isProcessingは立てない)。
 */
async function restoreManualCheckProgressIfRunning() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getManualCheckProgress' });
    const progress = response?.progress;
    if (!progress || !progress.running) return;

    if (progress.checkType === 'manual') {
      isProcessing = true;
    }
    // ボタン表示制御はupdateManualCheckProgressDisplay内のsetCheckingUiStateに一任する
    updateManualCheckProgressDisplay(progress.checkType, progress.current, progress.total, progress.displayName);
  } catch (error) {
    // ポップアップが既に閉じられている等は無視してよい
    console.warn('Failed to restore manual check progress:', error);
  }
}

/**
 * chrome.runtime.onMessage の常時リスナー。ポップアップが開いている間、
 * 巡回(全件更新・軽量チェック)がどのタイミングで開始されたか(自分で
 * 開始したか、既に実行中だったものを引き継いだか)に関わらず進捗を
 * 反映し続ける。完了時(manualCheckComplete)にはUI状態を元に戻す。
 */
function setupManualCheckProgressListener() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'manualCheckProgress') {
      const { checkType, current, total, displayName } = message.data;
      updateManualCheckProgressDisplay(checkType, current, total, displayName);
    } else if (message.type === 'manualCheckComplete') {
      isProcessing = false;
      setCheckingUiState(false);
      const progressEl = document.getElementById('importProgress');
      if (progressEl) progressEl.style.display = 'none';
    }
  });
}

async function handleManualCheck() {
  try {
    if (isProcessing) {
      showNotification(t('errorProcessing'), 'error');
      return;
    }

    isProcessing = true;
    setCheckingUiState(true);

    // 進捗表示を開始
    const progressEl = document.getElementById('importProgress');
    progressEl.textContent = t('progressManualCheckPrepare');
    progressEl.style.display = 'block';

    showNotification(t('progressManualCheckUpdating', { current: 0, total: watchList.length, name: '' }), 'info');

    // 【v1.4.0変更】進捗の受信は setupManualCheckProgressListener の
    // 常時リスナーに一本化した。ここでは応答(完了)を待つのみ。
    const response = await chrome.runtime.sendMessage({ type: 'manualCheckUpdates' });

    if (response && response.success && response.skipped) {
      // 【v1.4.0修正】既に軽量チェックが実行中だったためスキップされた場合、
      // 実際に裏で動いているのは軽量チェックの方なので、このポップアップを
      // 「全件更新中」のUI状態のままにしない。進捗表示自体は常時リスナーが
      // 軽量チェックの内容で更新し続けているので消さない。
      isProcessing = false;
      setCheckingUiState(false);
      showNotification(t('checkAlreadyRunning'), 'info');
      return;
    }

    // 進捗表示を非表示
    progressEl.style.display = 'none';

    if (response && response.success) {
      await loadUnreadNotifications();
      await loadWatchList();
      renderUserList();

      // 【v1.3.3追加】VRChat未ログインのため巡回を打ち切った場合は、
      // うるさいエラー表示ではなく「更新開始」と同じ場所に落ち着いた
      // トーンで表示する(トースト通知は使わない)。
      // 【v1.4.0修正】上記コメントの意図と異なり実際にはトースト通知
      // (showNotification、3秒で自動的に消える)を使ってしまっていたため、
      // ユーザーが見落とす前提で消えないバナー表示に変更した。
      if (response.authRequired) {
        showNotLoggedInBanner();
        return;
      }

      let message;
      if (response.totalUnread > 0) {
        message = t('manualCheckWithUnread', { count: response.refreshedCount || 0, unread: response.totalUnread });
      } else {
        message = t('manualCheckNoUnread', { count: response.refreshedCount || 0 });
      }

      if (response.errorCount > 0) {
        message += ` (${t('errorGeneric')}: ${response.errorCount})`;
      }

      if (response.aborted) {
        message += ` (${t('checkAbortedPartial')})`;
      }

      showNotification(message, 'success');
    } else {
      showNotification(t('errorManualCheckFailed'), 'error');
    }
  } catch (error) {
    console.error('Manual check failed:', error);
    showNotification(t('errorGeneric'), 'error');

    // エラー時も進捗を非表示
    const progressEl = document.getElementById('importProgress');
    if (progressEl) {
      progressEl.style.display = 'none';
    }
  } finally {
    isProcessing = false;
    setCheckingUiState(false);
  }
}

// ============================================================
// 未読クリア
// ============================================================

async function handleClearAllUnread() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'clearAllNotifications' });

    if (response && response.success) {
      unreadNotifications.clear();
      await loadWatchList();
      renderUserList();
      showNotification(t('clearAllUnreadSuccess'), 'success');
    } else {
      showNotification(t('errorClearUnreadFailed'), 'error');
    }
  } catch (error) {
    console.error('Clear all unread failed:', error);
    showNotification(t('errorGeneric'), 'error');
  }
}

// ============================================================
// 全選択
// ============================================================

function toggleSelectAll() {
  const filtered = getFilteredUsers();

  if (selectedUserIds.size === filtered.length && filtered.length > 0) {
    selectedUserIds.clear();
  } else {
    filtered.forEach(user => selectedUserIds.add(user.userId));
  }

  renderUserList();
}

function updateSelectAllCheckbox() {
  const checkbox = document.getElementById('selectAllCheckbox');
  const filtered = getFilteredUsers();

  if (filtered.length === 0) {
    checkbox.classList.remove('checked');
    return;
  }

  const allSelected = filtered.every(user => selectedUserIds.has(user.userId));

  if (allSelected) {
    checkbox.classList.add('checked');
  } else {
    checkbox.classList.remove('checked');
  }
}

// ============================================================
// URL解析とユーザー追加
// ============================================================

async function handleAddUser() {
  const urlInput = document.getElementById('urlInput');
  const url = urlInput.value.trim();

  if (!url) {
    showNotification(t('errorInputUrl'), 'error');
    return;
  }

  if (isProcessing) {
    showNotification(t('errorProcessing'), 'error');
    return;
  }

  isProcessing = true;

  try {
    const parsed = parseVRChatUrl(url);

    if (!parsed) {
      showNotification(t('errorInvalidUrl'), 'error');
      isProcessing = false;
      return;
    }

    let userId;

    if (parsed.type === 'user') {
      userId = parsed.userId;
    } else if (parsed.type === 'world') {
      showNotification(t('progressFetchingWorld'), 'info');
      const worldResponse = await chrome.runtime.sendMessage({
        type: 'getWorldInfo',
        worldId: parsed.worldId
      });

      if (!worldResponse.success) {
        showNotification(t('errorWorldNotFound'), 'error');
        isProcessing = false;
        return;
      }

      userId = worldResponse.world.authorId;
    }

    if (watchList.some(u => u.userId === userId)) {
      showNotification(t('errorAlreadyAdded'), 'error');
      isProcessing = false;
      return;
    }

    showNotification(t('progressFetchingUser'), 'info');
    const addResponse = await chrome.runtime.sendMessage({
      type: 'addUserToWatchList',
      userId: userId
    });

    if (!addResponse.success) {
      showNotification(addResponse.userMessage || t('errorAddUserFailed'), 'error');
      isProcessing = false;
      return;
    }

    await loadWatchList();
    renderUserList();
    updateStats();

    urlInput.value = '';
    showNotification(t('addUserSuccess', { name: addResponse.user.displayName }), 'success');

  } catch (error) {
    console.error('Add user error:', error);
    showNotification(t('errorGeneric'), 'error');
  } finally {
    isProcessing = false;
  }
}

function parseVRChatUrl(url) {
  if (url.match(/^usr_[a-f0-9-]+$/i)) {
    return { type: 'user', userId: url };
  }

  if (url.match(/^wrld_[a-f0-9-]+$/i)) {
    return { type: 'world', worldId: url };
  }

  const userMatch = url.match(/vrchat\.com\/home\/user\/(usr_[a-f0-9-]+)/i);
  if (userMatch) return { type: 'user', userId: userMatch[1] };

  const worldMatch = url.match(/vrchat\.com\/home\/world\/(wrld_[a-f0-9-]+)/i);
  if (worldMatch) return { type: 'world', worldId: worldMatch[1] };

  const launchMatch = url.match(/vrchat\.com\/home\/launch.*[?&]worldId=(wrld_[a-f0-9-]+)/i);
  if (launchMatch) return { type: 'world', worldId: launchMatch[1] };

  return null;
}

// ============================================================
