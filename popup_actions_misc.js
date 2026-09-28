// popup_actions_misc.js - コンテキストメニュー連携/ウォッチリスト/インポート・エクスポート
// popup_actions.js から機能分離(v1.4.0時点でのリファクタリング)

// コンテキストメニュー連携
// ============================================================

/**
 * コンテキストメニューから保留中のワールドを確認
 */
async function checkPendingWorldFromContext() {
  try {
    const result = await chrome.storage.local.get('pendingWorldIdFromContext');

    if (result.pendingWorldIdFromContext) {
      const worldId = result.pendingWorldIdFromContext;

      await chrome.storage.local.remove('pendingWorldIdFromContext');

      logAction('コンテキストメニューから保留中ワールド検出', { worldId });

      const details = await fetchWorldDetails(worldId);

      if (details) {
        pendingWorldData = details;

        openAddWorldModalWithInput(worldId);

        showNotification(t('fetchingWorldDetails') + ' → ' + details.name, 'success');
      } else {
        showNotification(t('worldDetailsFailed'), 'error');
      }
    }
  } catch (error) {
    logError('コンテキストメニュー保留ワールド確認失敗', error);
    showNotification(t('errorOccurred'), 'error');
  }
}

// ============================================================
// popup3: ユーザー公開お気に入り取得機能
// ============================================================
async function openUserFavoritesWindow() {
  try {
    await chrome.windows.create({
      url: chrome.runtime.getURL('popup3_user_watch.html'),
      type: 'popup',
      width: 850,
      height: 700
    });
  } catch (error) {
    console.error('Failed to open user favorites window:', error);
    showNotification(t('windowOpenFailed'), 'error');
  }
}

// ============================================================
// ウォッチリスト機能
// ============================================================

/**
 * 作者をウォッチリストに追加
 * @param {string} worldId - ワールドID
 */
async function handleAddAuthorToWatchList(worldId) {
  try {
    const world = allWorlds.find(w => w.id === worldId);

    if (!world) {
      showNotification(t('worldNotFound') || 'ワールドが見つかりません', 'error');
      return;
    }

    // authorIdが存在する場合はそのまま使用
    if (world.authorId) {
      if (DEBUG_LOG_ACTIONS) {
        logAction('ADD_AUTHOR_TO_WATCH_LIST', {
          worldId,
          authorId: world.authorId,
          authorName: world.authorName
        });
      }

      const response = await chrome.runtime.sendMessage({
        type: 'addToWatchList',
        userId: world.authorId
      });

      if (response && response.success) {
        showNotification(
          response.isNew
            ? t('addedToWatchList', { authorName: world.authorName })
            : t('alreadyInWatchList', { authorName: world.authorName }),
          'success'
        );

        // 300ms待機してから更新（background の通知状態が確実に更新されるまで）
        setTimeout(async () => {
          await updateUserWatchBadge(true); // 強制更新フラグを追加

          if (DEBUG_LOG_ACTIONS) {
            logAction('WATCH_BADGE_UPDATED_AFTER_ADD', { authorId: world.authorId });
          }
        }, 300);

      } else {
        showNotification(t('addToWatchListFailed') || '追加に失敗しました', 'error');
      }
      return;
    }

    // authorIdが無い場合はAPIから取得（通知は出さない）
    const worldInfoResponse = await chrome.runtime.sendMessage({
      type: 'getWorldInfo',
      worldId: worldId
    });

    if (!worldInfoResponse.success || !worldInfoResponse.world.authorId) {
      showNotification(t('authorInfoFetchFailed') || '作者情報の取得に失敗しました', 'error');
      return;
    }

    const authorId = worldInfoResponse.world.authorId;
    const authorName = worldInfoResponse.world.authorName || 'Unknown';

    if (DEBUG_LOG_ACTIONS) {
      logAction('ADD_AUTHOR_TO_WATCH_LIST_FETCHED', {
        worldId,
        authorId,
        authorName
      });
    }

    // ウォッチリストに追加
    const response = await chrome.runtime.sendMessage({
      type: 'addToWatchList',
      userId: authorId
    });

    if (response && response.success) {
      showNotification(
        response.isNew
          ? t('addedToWatchList', { authorName })
          : t('alreadyInWatchList', { authorName }),
        'success'
      );

      setTimeout(async () => {
        await updateUserWatchBadge(true);

        if (DEBUG_LOG_ACTIONS) {
          logAction('WATCH_BADGE_UPDATED_AFTER_ADD_FETCHED', { authorId });
        }
      }, 300);

    } else {
      showNotification(t('addToWatchListFailed') || '追加に失敗しました', 'error');
    }

  } catch (error) {
    logError('ウォッチリスト追加失敗', error);
    showNotification(t('errorOccurred') || 'エラーが発生しました', 'error');
  }
}

// ============================================================
// インポート/エクスポート
// ============================================================

/**
 * インポート/エクスポートモーダルを開く
 * @param {string} mode - モード ('import' | 'export')
 */
function openImportExportModal(mode) {
  currentImportExportMode = mode;
  document.getElementById('importExportTitle').textContent =
    mode === 'import' ? t('importTitle') : t('exportTitle');
  openModal('importExportModal');
}

/**
 * インポート/エクスポートタイプの選択
 * @param {string} type - タイプ ('vrchat' | 'json' | 'vrcx')
 */
function handleImportExportTypeSelect(type) {
  closeModal('importExportModal');

  if (type === 'vrchat') {
    if (currentImportExportMode === 'import') {
      handleVRChatImport();
    } else {
      showNotification(t('exportSyncError'), 'info');
    }
    return;
  }

  if (currentImportExportMode === 'export') {
    openFolderSelectForExport(type);
  } else {
    if (type === 'json') {
      document.getElementById('importFile').accept = '.json';
      document.getElementById('importFile').dataset.type = 'json';
    } else if (type === 'vrcx') {
      document.getElementById('importFile').accept = '.csv,.txt';
      document.getElementById('importFile').dataset.type = 'vrcx';
    }
    openFolderSelectForImport(type);
  }
}

/**
 * VRChatからのインポート(FETCH)
 */
async function handleVRChatImport() {
  showNotification(t('fetchingVRCAll'), 'info');

  try {
    const response = await chrome.runtime.sendMessage({ type: 'fetchAllVRCFolders' });

    if (response.success) {
      showNotification(
        t('fetchVRCComplete', {
          addedCount: response.addedCount,
          totalFolders: response.totalFolders
        }),
        'success'
      );
      await loadData();
      renderFolderTabs();
      renderCurrentView();

      if (response.addedCount > 0) {
        showNotification(t('fetchingThumbnails'), 'info');
        setTimeout(() => {
          fetchAllDetails();
        }, 1000);
      }
    } else {
      showNotification(t('syncFetchFailed', { error: response.error }), 'error');
    }
  } catch (error) {
    logError('VRC全フォルダ取得失敗', error);
    showNotification(t('syncFetchFailed', { error: error.message }), 'error');
  }
}

/**
 * エクスポート対象フォルダ選択
 * @param {string} type - エクスポート形式 ('json' | 'vrcx')
 */
function openFolderSelectForExport(type) {
  const folderOptions = generateFolderOptions(true, true);

  showFolderSelectModal({
    title: t('exportTargetTitle'),
    description: t('exportSelectPrompt'),
    folders: folderOptions,
    onConfirm: async (folderId) => {
      await executeExport(type, folderId);
    },
    onCancel: () => {
      logAction('エクスポートキャンセル', { type });
    }
  });
}

/**
 * インポート先フォルダ選択
 * @param {string} type - インポート形式 ('json' | 'vrcx')
 */
function openFolderSelectForImport(type) {
  const folderOptions = generateFolderOptions(false, false);

  showFolderSelectModal({
    title: t('importTargetTitle'),
    description: t('importSelectPrompt'),
    folders: folderOptions,
    onConfirm: (folderId) => {
      document.getElementById('importFile').dataset.targetFolder = folderId;
      document.getElementById('importFile').click();
    },
    onCancel: () => {
      logAction('インポートキャンセル', { type });
    }
  });
}

/**
 * エクスポート実行
 * @param {string} type - エクスポート形式 ('json' | 'vrcx')
 * @param {string} folderId - エクスポート対象フォルダID
 */
async function executeExport(type, folderId) {
  try {
    // 完全バックアップ
    if (folderId === 'all') {
      if (type === 'json') {
        showNotification(t('backupCreating'), 'info');
        const response = await chrome.runtime.sendMessage({ type: 'getWorldDetailsForExport' });

        if (response.success && response.data) {
          const dataStr = JSON.stringify(response.data, null, 2);
          const blob = new Blob([dataStr], { type: 'application/json' });
          downloadFile(blob, `vrchat-full-backup-${getDateString()}.json`);
          showNotification(t('exportCompleteFull'), 'success');
        } else {
          showNotification(
            t('exportFailed', { error: response.error || t('dataFetchError') }),
            'error'
          );
        }
        return;

      } else if (type === 'vrcx') {
        const csvData = allWorlds.map(w => `${escapeCsvField(w.id)},${escapeCsvField(w.name)}`).join('\n');
        const blob = new Blob([csvData], { type: 'text/csv' });
        downloadFile(blob, `vrchat-all-worlds-${getDateString()}.csv`);
        showNotification(t('exportWorldsComplete', { count: allWorlds.length }), 'success');
        return;
      }
    }

    // フォルダ別エクスポート
    let exportWorlds = allWorlds.filter(w => w.folderId === folderId);

    if (exportWorlds.length === 0) {
      showNotification(t('exportNoWorld'), 'warning');
      return;
    }

    if (type === 'json') {
      const dataStr = JSON.stringify(exportWorlds, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      downloadFile(blob, `vrchat-worlds-${folderId}-${getDateString()}.json`);
      showNotification(t('exportWorldsComplete', { count: exportWorlds.length }), 'success');
    } else if (type === 'vrcx') {
      const csvData = exportWorlds.map(w => `${escapeCsvField(w.id)},${escapeCsvField(w.name)}`).join('\n');
      const blob = new Blob([csvData], { type: 'text/csv' });
      downloadFile(blob, `vrchat-worlds-${folderId}-${getDateString()}.csv`);
      showNotification(t('exportWorldsComplete', { count: exportWorlds.length }), 'success');
    }
  } catch (error) {
    logError('エクスポート失敗', error);
    showNotification(t('exportFailed', { error: error.message }), 'error');
  }
}

/**
 * 【v1.4.0追加】CSVフィールドのエスケープ処理。
 * ワールド名にカンマ・ダブルクォート・改行が含まれる場合、単純な
 * カンマ結合ではCSVの列がずれたり行が壊れたりしていた既存バグの修正。
 * 標準的なCSVエスケープ(RFC 4180)に従い、必要な場合のみダブルクォートで
 * 囲み、内部のダブルクォートは2つ重ねてエスケープする。
 * @param {string} field - エスケープ対象の値
 * @returns {string}
 */
function escapeCsvField(field) {
  const str = String(field ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * 【v1.4.0追加】簡易CSVパーサー(RFC 4180準拠)。
 * ダブルクォートで囲まれたフィールド、フィールド内のカンマ・改行・
 * エスケープされたダブルクォート("")に対応する。
 * escapeCsvFieldで出力したCSVを正しく読み戻せるようにするための対。
 * @param {string} text - CSV全体のテキスト
 * @returns {string[][]} 行ごとのフィールド配列
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\n' || char === '\r') {
        // \r\n の場合は\rの直後の\nをスキップ
        if (char === '\r' && text[i + 1] === '\n') continue;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += char;
      }
    }
  }

  // 最終フィールド・行の取りこぼしを防ぐ
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter(r => r.some(f => f.trim() !== ''));
}

/**
 * ファイルダウンロード
 * @param {Blob} blob - ダウンロードするBlob
 * @param {string} filename - ファイル名
 */
function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * 日付文字列取得
 * @returns {string} YYYY-MM-DD形式の日付
 */
function getDateString() {
  return new Date().toISOString().split('T')[0];
}

/**
 * ファイルインポート処理
 * @param {Event} event - ファイル選択イベント
 */
async function handleFileImport(event) {
  const file = event.target.files[0];
  if (!file) return;

  const type = event.target.dataset.type;
  const targetFolder = event.target.dataset.targetFolder;

  logAction('ファイルインポート開始', {
    ファイル名: file.name,
    形式: type,
    対象フォルダ: targetFolder
  });

  try {
    const text = await file.text();
    let importWorlds = [];

    if (type === 'json') {
      const data = JSON.parse(text);

      // 完全バックアップの判定
      const isFullBackup = data.meta?.type === 'FULL_BACKUP' ||
        (data.worlds && data.folders !== undefined && data.vrcFolderData !== undefined);

      if (isFullBackup) {
        if (!data.worlds || !Array.isArray(data.worlds)) {
          showNotification(
            t('importFailedGeneral', { error: 'Invalid backup data: worlds array missing' }),
            'error'
          );
          event.target.value = '';
          return;
        }

        if (data.worlds.length === 0) {
          showNotification(t('importNoWorld'), 'warning');
          event.target.value = '';
          return;
        }

        if (!confirm(t('importConfirm'))) {
          event.target.value = '';
          return;
        }

        const importVersion = data.meta?.version || data.version || 'unknown';
        logAction('完全バックアップインポート開始', {
          バージョン: importVersion,
          ワールド数: data.worlds.length,
          フォルダあり: !!data.folders,
          VRCフォルダあり: !!data.vrcFolderData
        });

        showNotification(t('importRestoring'), 'info');

        const worldsToImport = data.worlds || [...(data.syncWorlds || []), ...(data.vrcWorlds || [])];

        const response = await chrome.runtime.sendMessage({
          type: 'batchImportWorlds',
          isFullBackup: true,
          worlds: worldsToImport,
          folders: data.folders,
          vrcFolderData: data.vrcFolderData
        });

        logAction('ファイルインポート応答(完全)', response);

        if (response.success || response.addedCount > 0) {
          showNotification(t('importRestored'), 'success');
          await loadData();
          renderFolderTabs();
          renderCurrentView();

          showNotification(t('fetchingThumbnails'), 'info');
          setTimeout(() => {
            fetchAllDetails('all');
          }, 1000);
        } else {
          showNotification(
            t('importFailedGeneral', { error: response.error || response.reason }),
            'error'
          );
        }

        event.target.value = '';
        return;
      }

      // 部分インポート
      if (!Array.isArray(data)) {
        showNotification(
          t('importFailedGeneral', { error: 'Invalid format: expected array of worlds' }),
          'error'
        );
        event.target.value = '';
        return;
      }

      importWorlds = data;

      const invalidWorlds = importWorlds.filter(w => !w.id);
      if (invalidWorlds.length > 0) {
        logError('無効なワールドデータ', `${invalidWorlds.length}件のワールドにIDがありません`);
        showNotification(
          t('importFailedGeneral', {
            error: `${invalidWorlds.length} worlds have invalid data (missing id)`
          }),
          'error'
        );
        event.target.value = '';
        return;
      }

    } else if (type === 'vrcx') {
      // 【v1.4.0修正】単純な split('\n') / split(',') では、ワールド名に
      // カンマ・改行・ダブルクォートが含まれるCSV(このアプリ自身が
      // escapeCsvFieldで出力したもの)を正しく読めなかった。
      // RFC 4180準拠の簡易パーサーに置き換える。エスケープされていない
      // 単純なCSV(VRCX等、他ツールが出力したものを含む)もそのまま読める。
      const rows = parseCsv(text);

      if (rows.length === 0) {
        showNotification(t('importNoWorld'), 'warning');
        event.target.value = '';
        return;
      }

      for (const fields of rows) {
        const idField = fields[0] || '';
        const worldIdMatch = idField.match(/wrld_[a-f0-9-]+/i) || (fields.join(',')).match(/wrld_[a-f0-9-]+/i);
        if (!worldIdMatch) continue;

        const worldId = worldIdMatch[0];
        const name = fields.length > 1 ? fields.slice(1).join(',').trim() : worldId;

        importWorlds.push({
          id: worldId,
          name: name || worldId,
          authorName: null,
          releaseStatus: null,
          thumbnailImageUrl: null
        });
      }

      logAction('VRCXインポート解析', {
        総行数: rows.length,
        有効ワールド: importWorlds.length
      });
    }

    if (importWorlds.length === 0) {
      showNotification(t('importNoWorld'), 'warning');
      event.target.value = '';
      return;
    }

    logAction('ファイルインポート解析完了', { 件数: importWorlds.length });
    showNotification(t('importingWorlds', { count: importWorlds.length }), 'info');

    const response = await chrome.runtime.sendMessage({
      type: 'batchImportWorlds',
      worlds: importWorlds,
      targetFolder: targetFolder,
      isFullBackup: false
    });

    logAction('ファイルインポート応答(部分)', response);

    if (response.success || response.addedCount > 0 || response.movedCount > 0) {
      showNotification(t('importComplete', response), 'success');

      await loadData();
      renderFolderTabs();
      renderCurrentView();

      if (response.addedCount > 0) {
        showNotification(t('fetchingThumbnails'), 'info');
        setTimeout(() => {
          fetchAllDetails(targetFolder);

          if (autoResolveDuplicates) {
            setTimeout(() => autoResolveDuplicatesIfNeeded(), 2000);
          }
        }, 1000);
      }
    } else {
      const errorMsg = response.reason === 'vrc_limit_exceeded'
        ? t('vrcLimitExceededImport')
        : response.reason === 'sync_limit_exceeded'
          ? t('syncLimitExceededImport')
          : response.reason === 'LIMIT_EXCEEDED_PARTIAL_FAILURE'
            ? t('limitExceededPartial')
            : t('importFailedGeneral', { error: resolveErrorMessage(response) });
      showNotification(errorMsg, 'error');
      logError('ファイルインポート失敗', response.message || response.reason);
    }

  } catch (error) {
    logError('インポート例外', error);
    showNotification(t('importProcessFailed'), 'error');
  }

  event.target.value = '';
}
