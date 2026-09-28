// popup3_actions.js - お気に入り追加・ユーザー再取得・アクション・削除モーダル・統計・ユーティリティ
// popup3_user_watch.js から機能分離(v1.4.0時点でのリファクタリング)

// popup3_user_watch.js v1.2.2 後半

// ============================================================
// v1.2.2 ワールドをお気に入りに追加
// ============================================================

/**
 * ワールドをお気に入りフォルダに追加（デバッグ版）
 * @param {string} worldId - ワールドID
 */
async function handleAddWorldToFavorites(worldId) {
  try {
    if (isProcessing) {
      showNotification(t('errorProcessing'), 'error');
      return;
    }

    isProcessing = true;
    showNotification(t('progressFetchingFolders'), 'info');

    // console.log('[Debug] Starting handleAddWorldToFavorites');
    // console.log('[Debug] worldId:', worldId);
    // console.log('[Debug] PageHelpersShared available:', typeof PageHelpersShared !== 'undefined');

    // 1. フォルダ一覧取得
    // console.log('[Debug] Requesting folders...');
    const foldersResponse = await chrome.runtime.sendMessage({
      type: 'getFolders'
    });

    // console.log('[Debug] Folders response:', foldersResponse);

    // success プロパティがない場合でも、folders が存在すればOK
    if (!foldersResponse || (!foldersResponse.success && !foldersResponse.folders)) {
      console.error('[Debug] Folders error:', foldersResponse?.error || 'No response');
      showNotification(t('errorFoldersFailed') + ': ' + (foldersResponse?.error || 'No response'), 'error');
      isProcessing = false;
      return;
    }

    // console.log('[Debug] Folders count:', foldersResponse.folders?.length || 0);

    // 2. フォルダ一覧を整形（未分類を追加）
    const folders = [
      { id: 'none', name: t('folderNone'), class: 'none' },
      ...(foldersResponse.folders || []).map(f => ({ id: f.id, name: f.name, class: '' }))
    ];

    // console.log('[Debug] Formatted folders:', folders);

    // 3. ワールド情報を取得（ワールド名表示用）
    // console.log('[Debug] Requesting world details...');
    const worldInfoResponse = await chrome.runtime.sendMessage({
      type: 'getSingleWorldDetails',
      worldId: worldId
    });

    // console.log('[Debug] World info response:', worldInfoResponse);

    const worldName = worldInfoResponse && worldInfoResponse.success
      ? worldInfoResponse.world.name
      : 'このワールド';

    // console.log('[Debug] World name:', worldName);

    // 4. フォルダモーダル表示（page-helpers-shared.js使用）
    // console.log('[Debug] Showing folder select modal...');

    // PageHelpersShared が読み込まれていない場合は showNotification にフォールバック
    const notificationFunc = typeof PageHelpersShared !== 'undefined'
      ? PageHelpersShared.showNotification
      : showNotification;

    if (typeof PageHelpersShared === 'undefined') {
      console.error('[Debug] PageHelpersShared is not defined!');
      console.error('[Debug] Please check if page-helpers-shared.js is loaded in HTML');
      notificationFunc(t('errorPageHelpersNotLoaded'), 'error');
      isProcessing = false;
      return;
    }

    PageHelpersShared.showFolderSelectModal({
      title: t('folderSelectTitle'),
      description: t('folderSelectDescription', { world: worldName }),
      folders: folders,
      cancelLabel: t('cancel'),
      onConfirm: async (folderId) => {
        try {
          // console.log('[Debug] Folder selected:', folderId);
          showNotification(t('progressSavingWorld'), 'info');

          // 5. ワールドをフォルダに追加
          // console.log('[Debug] Sending addWorldToFolderFromWatch message...');
          const saveResponse = await chrome.runtime.sendMessage({
            type: 'addWorldToFolderFromWatch',
            worldId: worldId,
            folderId: folderId
          });

          // console.log('[Debug] Save response:', saveResponse);

          if (saveResponse && saveResponse.success) {
            const folderName = folderId === 'none' ? t('folderNone') :
              folders.find(f => f.id === folderId)?.name || folderId;

            // console.log('[Debug] Save successful, folder name:', folderName);

            PageHelpersShared.showNotification(
              t('addWorldSuccess', { world: worldName, folder: folderName }),
              'success'
            );
          } else {
            const errorMsg = saveResponse && saveResponse.reason
              ? resolveErrorMessage(saveResponse)
              : t('errorAddWorldFailed');
            console.error('[Debug] Save failed:', errorMsg);
            PageHelpersShared.showNotification(errorMsg, 'error');
          }
        } catch (error) {
          console.error('[Debug] Failed to save world:', error);
          PageHelpersShared.showNotification(t('errorGeneric') + ': ' + error.message, 'error');
        } finally {
          isProcessing = false;
        }
      },
      onCancel: () => {
        // console.log('[Debug] User cancelled');
        isProcessing = false;
      }
    });

  } catch (error) {
    console.error('[Debug] Add to favorites error:', error);
    console.error('[Debug] Error stack:', error.stack);
    PageHelpersShared.showNotification(t('errorGeneric') + ': ' + error.message, 'error');
    isProcessing = false;
  }
}

// ============================================================
// 【v1.2.2 修正】ユーザー再取得
// 情報未取得の場合は addUserToWatchList で完全取得
// ============================================================

async function handleRefetchUser(userId) {
  try {
    if (isProcessing) {
      showNotification(t('errorProcessing'), 'error');
      return;
    }

    isProcessing = true;

    const user = watchList.find(u => u.userId === userId);
    if (!user) {
      showNotification(t('errorUserNotFound'), 'error');
      isProcessing = false;
      return;
    }

    // 情報未取得判定
    const isMissing = !user.profilePicUrl ||
      !user.worlds ||
      user.worlds.length === 0 ||
      !user.totalWorldCount;

    if (isMissing) {
      showNotification(t('progressRefetchingFull'), 'info');

      // 完全再取得
      const response = await chrome.runtime.sendMessage({
        type: 'addUserToWatchList',
        userId: userId
      });

      if (response.success) {
        expandedWorldsCache.delete(userId);
        await loadWatchList();
        renderUserList();
        if (selectedUserId === userId) {
          renderWorlds(userId);
        }
        showNotification(t('refetchFullSuccess'), 'success');
      } else {
        showNotification(t('errorRefetchFailed'), 'error');
      }
    } else {
      showNotification(t('progressRefetchingUser'), 'info');

      // 通常のワールド情報更新
      const response = await chrome.runtime.sendMessage({
        type: 'refreshUserWorlds',
        userId: userId
      });

      if (response.success) {
        expandedWorldsCache.delete(userId);
        await loadWatchList();
        renderUserList();
        if (selectedUserId === userId) {
          renderWorlds(userId);
        }
        showNotification(t('refetchSuccess'), 'success');
      } else {
        showNotification(t('errorRefetchFailed'), 'error');
      }
    }
  } catch (error) {
    console.error('Failed to refetch user:', error);
    showNotification(t('errorGeneric'), 'error');
  } finally {
    isProcessing = false;
  }
}

async function renderWorldsExpanded(userId) {
  try {
    const worldsContent = document.querySelector('.worlds-content');
    const scrollTop = worldsContent.scrollTop;

    showNotification(t('progressFetchingAllWorlds'), 'info');

    const response = await chrome.runtime.sendMessage({
      type: 'fetchUserCreatedWorlds',
      userId: userId
    });

    if (!response.success) {
      showNotification(t('errorExpandWorldsFailed'), 'error');
      return;
    }

    expandedWorldsCache.set(userId, response.worlds);
    renderWorlds(userId);

    await nextTick();
    const newWorldsContent = document.querySelector('.worlds-content');
    if (newWorldsContent) {
      newWorldsContent.scrollTop = scrollTop;
    }

    showNotification(t('expandWorldsSuccess', { count: response.worlds.length }), 'success');

  } catch (error) {
    console.error('Failed to expand worlds:', error);
    showNotification(t('errorGeneric'), 'error');
  }
}

function nextTick() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// ============================================================
// ユーザーアクション
// ============================================================

async function toggleNotification(userId) {
  const user = watchList.find(u => u.userId === userId);
  if (!user) return;

  const enabled = !(user.notificationEnabled !== false);

  const response = await chrome.runtime.sendMessage({
    type: 'toggleUserNotification',
    userId: userId,
    enabled: enabled
  });

  if (response.success) {
    await loadWatchList();
    renderUserList();
    updateStats();
    if (selectedUserId === userId) renderWorlds(userId);
  }
}

async function markAsChecked(userId) {
  const response = await chrome.runtime.sendMessage({
    type: 'markUserAsChecked',
    userId: userId
  });

  if (response.success) {
    await loadWatchList();
    renderUserList();
    updateStats();
  }
}

// ============================================================
// 削除モーダル
// ============================================================

function showDeleteModal(userId, isMultiple) {
  deleteTarget = isMultiple ? 'multiple' : userId;
  const modal = document.getElementById('deleteModal');
  const modalBody = document.getElementById('deleteModalBody');

  if (isMultiple) {
    modalBody.textContent = t('deleteConfirmMultiple', { count: selectedUserIds.size });
  } else {
    const user = watchList.find(u => u.userId === userId);
    if (!user) {
      console.error('User not found:', userId);
      showNotification(t('errorUserNotFound'), 'error');
      return;
    }
    modalBody.textContent = t('deleteConfirmSingle', { name: user.displayName });
  }

  modal.classList.add('show');
}

function closeDeleteModal() {
  document.getElementById('deleteModal').classList.remove('show');
  deleteTarget = null;
}

async function confirmDelete() {
  const target = deleteTarget;

  if (!target) {
    showNotification(t('errorNoSelection'), 'error');
    return;
  }

  closeDeleteModal();

  if (target === 'multiple') {
    await deleteMultipleUsers();
  } else {
    await deleteSingleUser(target);
  }
}

async function deleteSingleUser(userId) {
  if (!userId || userId === 'null' || userId === 'undefined') {
    showNotification(t('errorInvalidUserId'), 'error');
    console.error('Invalid userId:', userId);
    return;
  }

  const response = await chrome.runtime.sendMessage({
    type: 'removeUserFromWatchList',
    userId: userId
  });

  if (response.success) {
    await loadWatchList();

    if (selectedUserId === userId) {
      selectedUserId = null;
      document.getElementById('worldsArea').innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">👈</div>
          <div class="empty-state-text">
            ${t('selectUserPrompt')}
          </div>
        </div>
      `;
    }

    expandedWorldsCache.delete(userId);
    selectedUserIds.delete(userId);
    renderUserList();
    updateStats();
    showNotification(t('deleteUserSuccess'), 'success');
  } else {
    showNotification(response.userMessage || t('errorDeleteFailed'), 'error');
  }
}

async function deleteMultipleUsers() {
  const userIds = Array.from(selectedUserIds);

  if (userIds.length === 0) {
    showNotification(t('errorNoSelection'), 'info');
    return;
  }

  // 【v1.5.0変更】1人ずつchrome.runtime.sendMessageをループしていたため、
  // background側でその都度chrome.storage.sync.setが走り、
  // MAX_WRITE_OPERATIONS_PER_MINUTEを超過するエラーが発生していた。
  // 対象IDをまとめて1回のメッセージで送り、保存も1回で完結させる。
  const response = await chrome.runtime.sendMessage({
    type: 'removeMultipleUsersFromWatchList',
    userIds: userIds
  });

  let successCount = 0;
  if (response.success) {
    successCount = response.removedCount ?? userIds.length;
    userIds.forEach(userId => {
      expandedWorldsCache.delete(userId);
    });
  }

  await loadWatchList();
  selectedUserIds.clear();

  if (selectedUserId && userIds.includes(selectedUserId)) {
    selectedUserId = null;
    document.getElementById('worldsArea').innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👈</div>
        <div class="empty-state-text">
          ${t('selectUserPrompt')}
        </div>
      </div>
    `;
  }

  renderUserList();
  updateStats();
  showNotification(t('deleteMultipleSuccess', { count: successCount }), 'success');
}

// ============================================================
// 選択中のアクション
// ============================================================

function handleDeleteSelected() {
  if (selectedUserIds.size === 0) {
    showNotification(t('errorNoSelection'), 'info');
    return;
  }
  showDeleteModal(null, true);
}

// ============================================================
// 統計更新
// ============================================================

function updateStats() {
  // 統計表示は削除されました
}

// ============================================================
// ユーティリティ
// ============================================================

/**
 * 【v1.5.0修正】「情報未取得」の判定条件を見直した。
 * 従来はworlds.length===0やtotalWorldCountが0(falsy)であることも
 * 未取得の条件に含めていたため、実際に公開ワールドを1つも
 * 持たないクリエイター(正常に取得完了しているケース)まで
 * 誤って「情報未取得」と表示してしまっていた。
 * 本当に未取得(プレースホルダーのまま)かどうかは、
 * refreshUserWorlds側で表示名がuserIdのまま・プロフィール画像が
 * 空、という条件で判定するのが正しい(bg_user_service.jsの
 * needsUserInfo判定と同じ考え方)。
 */
function isMissingDetails(user) {
  return !user.profilePicUrl || user.displayName === user.userId;
}

function hasUnread(user) {
  return new Date(user.lastUpdatedAt) > new Date(user.lastCheckedAt);
}

function getUnreadCount(user) {
  if (!hasUnread(user)) return 0;

  const lastChecked = new Date(user.lastCheckedAt);
  return user.worlds.filter(w => new Date(w.updatedAt) > lastChecked).length;
}

function getRelativeTime(dateString) {
  if (!dateString || dateString === '' || dateString === 'none' || dateString === 'null' || dateString === 'undefined') {
    return t('dateNone');
  }

  const date = new Date(dateString);

  if (isNaN(date.getTime())) {
    return t('dateNone');
  }

  const now = new Date();
  const diff = now - date;

  const days = Math.floor(diff / 86400000);

  if (days === 0) return t('dateToday');
  if (days === 1) return t('dateYesterday');
  if (days < 0) return t('dateFuture');
  if (days < 1000) return t('dateDaysAgo', { days });
  return t('dateDaysAgo', { days });
}

function getDaysAgo(dateString) {
  if (!dateString || dateString === '-') return 999;
  const date = new Date(dateString);
  const now = new Date();
  const diff = now - date;
  return Math.floor(diff / 86400000);
}

function isWithinDays(dateString, days) {
  return getDaysAgo(dateString) <= days;
}

function formatNumber(num) {
  return num.toLocaleString(currentLanguage === 'ja' ? 'ja-JP' : 'en-US');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showNotification(message, type = 'info') {
  const notification = document.getElementById('notification');
  const notificationMessage = document.getElementById('notificationMessage');

  notification.className = `notification notification-${type} show`;
  notificationMessage.textContent = message;

  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

/**
 * 【v1.4.0追加】未ログイン時のバナー表示。
 * 通常のトースト通知(showNotification)は3秒で自動的に消えるため、
 * 「VRChatにログインし直して再度お試しください」という、ユーザーが
 * 行動を起こすべき重要なメッセージには不向きだった
 * (コメントには「トースト通知は使わない」とありながら実際には
 * showNotificationを使ってしまっていた食い違いを修正)。
 * このバナーはユーザーが閉じるか、「VRChatを開く」ボタンを押すまで
 * 自動的には消えない。
 */
function showNotLoggedInBanner() {
  const banner = document.getElementById('notLoggedInBanner');
  const textEl = document.getElementById('notLoggedInBannerText');
  const openBtn = document.getElementById('notLoggedInOpenBtn');
  const dismissBtn = document.getElementById('notLoggedInDismissBtn');
  if (!banner || !textEl || !openBtn || !dismissBtn) return;

  textEl.textContent = t('err_auth_required');
  openBtn.textContent = t('openVrchatLoginBtn');
  openBtn.disabled = false;
  banner.style.display = 'flex';

  openBtn.onclick = () => {
    try {
      chrome.tabs.create({ url: 'https://vrchat.com/home/login' });
    } catch (error) {
      console.warn('Failed to open VRChat login page:', error);
    }
    openBtn.disabled = true;
    openBtn.textContent = t('openVrchatLoginBtnDone');
  };

  dismissBtn.onclick = () => {
    banner.style.display = 'none';
  };
}

function resolveProgressMessage(progress) {
  if (progress.messageKey) {
    return t(progress.messageKey, progress.messageParams || {});
  }
  // messageKeyが無い古い形式のレスポンスへのフォールバック
  return progress.message || '';
}

function updateProgressBar(progress) {
  if (progress.type === 'progress') {
    showNotification(resolveProgressMessage(progress), 'info');
  } else if (progress.type === 'complete') {
    showNotification(resolveProgressMessage(progress), 'success');
  } else if (progress.type === 'error') {
    showNotification(resolveProgressMessage(progress), 'error');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}