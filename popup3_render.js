// popup3_render.js - フィルター・ユーザーリスト描画・ワールド一覧描画
// popup3_user_watch.js から機能分離(v1.4.0時点でのリファクタリング)

// フィルター済みユーザー取得
// ============================================================

function getFilteredUsers() {
  return [...watchList];
}

// ============================================================
// ユーザーリスト描画
// ============================================================

function renderUserList() {
  const userListEl = document.getElementById('userList');
  const sortSelect = document.getElementById('sortSelect');

  // ソート設定を反映
  sortSelect.value = userSortOrder;

  let filtered = getFilteredUsers();

  filtered.sort((a, b) => {
    switch (userSortOrder) {
      case 'updated':
        return new Date(b.lastUpdatedAt) - new Date(a.lastUpdatedAt);
      case 'publication':
        return new Date(b.latestPublicationDate || 0) - new Date(a.latestPublicationDate || 0);
      case 'name':
        return a.displayName.localeCompare(b.displayName);
      case 'added':
        return new Date(b.addedAt) - new Date(a.addedAt);
      default:
        return 0;
    }
  });

  if (filtered.length === 0) {
    userListEl.innerHTML = `
      <div class="user-card empty-state">
        <div class="empty-state-icon">🔭</div>
        <div class="empty-state-text">
          ${t('noUsers')}
        </div>
      </div>
    `;
    updateSelectionActions();
    updateSelectAllCheckbox();
    updateSummaryBadges();
    return;
  }

  userListEl.innerHTML = filtered.map(user => {
    const unreadNotif = unreadNotifications.get(user.userId);
    const unreadCount = unreadNotif ? unreadNotif.count : 0;
    const isSelected = user.userId === selectedUserId;
    const isChecked = selectedUserIds.has(user.userId);
    const worldCount = user.totalWorldCount || (user.worlds ? user.worlds.length : 0);
    const missing = isMissingDetails(user);

    const notifyEnabled = user.notificationEnabled !== false;

    const lastUpdateDate = user.lastUpdatedAt ? getRelativeTime(user.lastUpdatedAt) : '-';

    // 新規日の計算(Labs対応)
    let lastNewDate = '-';
    if (user.latestPublicationDate &&
      user.latestPublicationDate !== 'none' &&
      user.latestPublicationDate !== 'null' &&
      !isNaN(new Date(user.latestPublicationDate).getTime())) {
      // 有効なpublicationDateがある場合
      lastNewDate = getRelativeTime(user.latestPublicationDate);
    } else if (user.worlds && user.worlds.length > 0) {
      // publicationDateが無効な場合、ワールドから探す
      const validPublicationDates = user.worlds
        .map(w => w.publicationDate)
        .filter(d => d && d !== 'none' && d !== 'null' && !isNaN(new Date(d).getTime()))
        .sort((a, b) => new Date(b) - new Date(a));

      if (validPublicationDates.length > 0) {
        // 有効なpublicationDateが見つかった
        lastNewDate = getRelativeTime(validPublicationDates[0]);
      } else {
        // 全てLabs中の場合、最新のupdatedAtを使用
        const validUpdatedDates = user.worlds
          .map(w => w.updatedAt)
          .filter(d => d && d !== 'none' && d !== 'null' && !isNaN(new Date(d).getTime()))
          .sort((a, b) => new Date(b) - new Date(a));

        if (validUpdatedDates.length > 0) {
          lastNewDate = getRelativeTime(validUpdatedDates[0]);
        }
      }
    }

    return `
      <div class="user-card ${isSelected ? 'selected' : ''}" data-user-id="${user.userId}">
        <div class="user-checkbox ${isChecked ? 'checked' : ''}" data-user-id="${user.userId}"></div>
        <img src="${user.profilePicUrl || 'icons/icon128.png'}" alt="${user.displayName}" class="user-avatar">
        <div class="user-info">
          <div class="user-name" style="${missing ? 'color: var(--text-tertiary);' : ''}">${escapeHtml(user.displayName)}</div>
          <div class="user-meta">
            ${missing ? `<span style="color: var(--error);">${t('userMissingInfo')}</span>` : `
              <span>${t('userWorksCount', { count: worldCount })}</span>
            `}
          </div>
        </div>
        ${!missing ? `
          <div class="user-date-badges">
            <span class="date-badge update-badge">${t('userUpdateLabel', { date: lastUpdateDate })}</span>
            <span class="date-badge new-badge">${t('userNewLabel', { date: lastNewDate })}</span>
          </div>
        ` : ''}
        <div class="user-actions">
          <button class="icon-btn ${notifyEnabled ? 'notify-on' : 'notify-off'}" 
                  data-action="toggle-notify" 
                  data-user-id="${user.userId}" 
                  title="${notifyEnabled ? t('userNotifyOn') : t('userNotifyOff')}">
            ${notifyEnabled ? '🔔' : '🔕'}
          </button>
        </div>
        ${unreadCount > 0 ? `<span class="badge">${unreadCount}</span>` : ''}
      </div>
    `;
  }).join('');

  userListEl.querySelectorAll('.user-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.user-checkbox')) {
        return;
      }
      if (!e.target.closest('.user-actions')) {
        const userId = card.dataset.userId;
        selectUser(userId);
      }
    });
  });

  userListEl.querySelectorAll('.user-checkbox').forEach(checkbox => {
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      const userId = checkbox.dataset.userId;
      toggleUserSelection(userId);
    });
  });

  userListEl.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const userId = btn.dataset.userId;

      if (action === 'toggle-notify') {
        await toggleNotification(userId);
      }
    });
  });

  updateSelectionActions();
  updateSelectAllCheckbox();
  updateSummaryBadges();
  applyNotificationStyles();
}

// ============================================================
// v1.2.2 サマリーバッジ更新
// ============================================================

function updateSummaryBadges() {
  const updateBadge = document.getElementById('updateCountBadge');
  const newBadge = document.getElementById('newCountBadge');

  let updateCount = 0;
  let newCount = 0;

  unreadNotifications.forEach(notif => {
    if (notif.type === 'updated') updateCount += notif.count;
    if (notif.type === 'new') newCount += notif.count;
  });

  if (updateBadge) {
    updateBadge.textContent = t('updateCount', { count: updateCount });
    if (updateCount > 0) {
      updateBadge.classList.add('active');
      updateBadge.classList.remove('inactive');
    } else {
      updateBadge.classList.add('inactive');
      updateBadge.classList.remove('active');
    }
  }

  if (newBadge) {
    newBadge.textContent = t('newCount', { count: newCount });
    if (newCount > 0) {
      newBadge.classList.add('active');
      newBadge.classList.remove('inactive');
    } else {
      newBadge.classList.add('inactive');
      newBadge.classList.remove('active');
    }
  }
}

// ============================================================
// ユーザー選択
// ============================================================

async function selectUser(userId) {
  selectedUserId = userId;

  await markAsChecked(userId);
  await clearUserNotifications(userId);

  await updateUserWorldCount(userId);
  renderUserList();
  renderWorlds(userId);
}

// ============================================================
// 未読クリア
// ============================================================

async function clearUserNotifications(userId) {
  try {
    await chrome.runtime.sendMessage({
      type: 'clearUserNotifications',
      userId: userId
    });

    unreadNotifications.delete(userId);
  } catch (error) {
    console.error('Failed to clear user notifications:', error);
  }
}

async function updateUserWorldCount(userId) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'fetchUserWorldCount',
      userId: userId
    });

    if (response.success) {
      const user = watchList.find(u => u.userId === userId);
      if (user) {
        user.totalWorldCount = response.totalCount;

        const local = await chrome.storage.local.get(['watchListDetails']);
        const detailsMap = local.watchListDetails || {};
        if (detailsMap[userId]) {
          detailsMap[userId].totalWorldCount = response.totalCount;
          await chrome.storage.local.set({ watchListDetails: detailsMap });
        }

        renderUserList();
      }
    }
  } catch (error) {
    console.error('Failed to update world count:', error);
  }
}

function toggleUserSelection(userId) {
  if (selectedUserIds.has(userId)) {
    selectedUserIds.delete(userId);
  } else {
    selectedUserIds.add(userId);
  }
  renderUserList();
}

function updateSelectionActions() {
  const selectionCount = document.getElementById('selectionCount');

  if (selectedUserIds.size > 0) {
    selectionCount.textContent = t('selectionCount', { count: selectedUserIds.size });
    selectionCount.style.display = 'block';
  } else {
    selectionCount.textContent = t('selectionCount', { count: 0 });
    selectionCount.style.display = 'none';
  }
}

// ============================================================
// グローバル通知トグル
// ============================================================

async function handleGlobalToggle(settingKey) {
  const currentState = globalNotificationSettings[settingKey];
  const newState = !currentState;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'updateGlobalNotificationSetting',
      setting: settingKey,
      enabled: newState
    });

    if (response.success) {
      globalNotificationSettings[settingKey] = newState;

      const settingName = t('notificationType_' + settingKey);
      const stateText = newState ? 'ON' : 'OFF';
      const notifKey = newState ? 'globalNotificationOn' : 'globalNotificationOff';
      showNotification(t(notifKey, { type: settingName }), 'success');
    }
  } catch (error) {
    console.error('Failed to update global notification:', error);
    showNotification(t('errorGeneric'), 'error');
  }

  // 状態変更後にUIを更新
  updateGlobalToggleUI();
}

// ============================================================
// 日付フォーマット
// ============================================================

function formatDate(dateString) {
  if (!dateString || dateString === '' || dateString === 'none' || dateString === 'null' || dateString === 'undefined') {
    return t('dateNone');
  }

  const date = new Date(dateString);

  if (isNaN(date.getTime())) {
    console.warn('Invalid date:', dateString);
    return t('dateNone');
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

// ============================================================
// ワールド一覧描画
// ============================================================

function renderWorlds(userId) {
  const worldsArea = document.getElementById('worldsArea');
  const user = watchList.find(u => u.userId === userId);

  if (!user) {
    worldsArea.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">👈</div>
        <div class="empty-state-text">
          ${t('selectUserPrompt')}
        </div>
      </div>
    `;
    return;
  }

  let worlds = expandedWorldsCache.has(userId)
    ? expandedWorldsCache.get(userId)
    : (user.worlds || []);

  const totalWorldCount = user.totalWorldCount || worlds.length;
  const displayLimit = 6;
  const isExpanded = expandedWorldsCache.has(userId);
  const hasMore = totalWorldCount > displayLimit && !isExpanded;

  if (worldSortOrder === 'publication') {
    worlds = [...worlds].sort((a, b) => {
      const dateA = new Date(a.publicationDate || a.createdAt || 0);
      const dateB = new Date(b.publicationDate || b.createdAt || 0);
      return dateB - dateA;
    });
  } else {
    worlds = [...worlds].sort((a, b) => {
      const dateA = new Date(a.updatedAt || 0);
      const dateB = new Date(b.updatedAt || 0);
      return dateB - dateA;
    });
  }

  const visibleWorlds = isExpanded ? worlds : worlds.slice(0, displayLimit);

  // 最新公開日の計算を修正(Labs対応)
  let latestPublicationDate = null;

  // publicationDateが有効な場合はそれを使用
  if (user.latestPublicationDate &&
    user.latestPublicationDate !== 'none' &&
    user.latestPublicationDate !== 'null' &&
    !isNaN(new Date(user.latestPublicationDate).getTime())) {
    latestPublicationDate = user.latestPublicationDate;
  } else {
    // publicationDateが無効な場合、ワールドから探す
    if (worlds.length > 0) {
      // まず有効なpublicationDateを探す
      const validPublicationDates = worlds
        .map(w => w.publicationDate)
        .filter(d => d && d !== 'none' && d !== 'null' && !isNaN(new Date(d).getTime()))
        .sort((a, b) => new Date(b) - new Date(a));

      if (validPublicationDates.length > 0) {
        latestPublicationDate = validPublicationDates[0];
      } else {
        // publicationDateが全て無効な場合(Labs中)、最新のupdatedAtを使用
        const validUpdatedDates = worlds
          .map(w => w.updatedAt)
          .filter(d => d && d !== 'none' && d !== 'null' && !isNaN(new Date(d).getTime()))
          .sort((a, b) => new Date(b) - new Date(a));

        if (validUpdatedDates.length > 0) {
          latestPublicationDate = validUpdatedDates[0];
        }
      }
    }
  }

  const lastUpdatedAt = user.lastUpdatedAt;

  worldsArea.innerHTML = `
    <div class="worlds-header">
      <div class="worlds-user-info">
        <img src="${user.profilePicUrl || 'icons/icon128.png'}" 
             alt="${user.displayName}" 
             class="worlds-user-avatar"
             data-user-id="${user.userId}">
        <div style="flex: 1; min-width: 0;">
          <div class="worlds-user-name" data-user-id="${user.userId}">${escapeHtml(user.displayName)}</div>
          <div class="worlds-user-id">${user.userId}</div>
          <div class="worlds-stats">
            <div class="worlds-stats-row">
              <span>${t('userStatsWorlds', { count: totalWorldCount })}</span>
            </div>
            <div class="worlds-stats-row">
              <span class="stat-update">${t('userStatsUpdate', { date: getRelativeTime(lastUpdatedAt) })}</span>
              ${latestPublicationDate ? `<span class="stat-new">${t('userStatsNew', { date: getRelativeTime(latestPublicationDate) })}</span>` : ''}
            </div>
          </div>
        </div>
      </div>
      <div class="worlds-header-actions">
        <button id="refetchBtn" class="refetch-btn" title="${t('worldRefetchButton')}">${t('worldRefetchButton')}</button>
        <div class="world-sort-controls">
          <select id="worldSortSelect">
            <option value="updated" ${worldSortOrder === 'updated' ? 'selected' : ''}>${t('worldSortUpdated')}</option>
            <option value="publication" ${worldSortOrder === 'publication' ? 'selected' : ''}>${t('worldSortPublication')}</option>
          </select>
        </div>
      </div>
    </div>
    <div class="worlds-content">
      ${worlds.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">🌍</div>
          <div class="empty-state-text">
            ${t('noWorldsForUser')}
          </div>
        </div>
      ` : `
        <div class="worlds-grid">
          ${visibleWorlds.map(world => {
    const updatedDate = world.updatedAt || '';
    const publicationDate = world.publicationDate || '';
    const createdDate = world.createdAt || '';

    // Labs判定: publicationDateが無効な場合
    const isLabs = !publicationDate ||
      publicationDate === 'none' ||
      publicationDate === 'null' ||
      isNaN(new Date(publicationDate).getTime());

    const isUpdatedRecent = isWithinDays(updatedDate, 7);
    const isPublicationRecent = !isLabs && isWithinDays(publicationDate, 7);
    const isCreatedRecent = isWithinDays(createdDate, 7);

    const isAnyWithin7Days = isUpdatedRecent || isPublicationRecent || isCreatedRecent;
    const isAnyWithin3Days = isWithinDays(updatedDate, 3) ||
      (!isLabs && isWithinDays(publicationDate, 3)) ||
      isWithinDays(createdDate, 3);

    let cardClass = 'world-card';
    if (isAnyWithin3Days) cardClass += ' world-card-highlight-3days';
    else if (isAnyWithin7Days) cardClass += ' world-card-highlight-7days';

    return `
            <div class="${cardClass}" data-world-id="${world.worldId}">
              <div style="position: relative;">
                <img src="${world.thumbnailUrl || world.thumbnailImageUrl || 'icons/icon128.png'}" alt="${world.worldName}" class="world-thumbnail">
                ${isLabs ? `<div class="world-labs-badge">${t('worldLabsBadge')}</div>` : ''}
                <div class="world-favorite-badge">${t('worldFavorites', { count: formatNumber(world.favorites || 0) })}</div>
              </div>
              <div class="world-info">
                <div class="world-name" title="${escapeHtml(world.worldName)}">${escapeHtml(world.worldName)}</div>
                <div class="world-meta">
                  <div class="world-meta-dates">
                    <div class="world-meta-row">
                      <span ${isUpdatedRecent ? 'style="font-weight: bold;"' : ''}>${t('worldUpdatedAt', { date: formatDate(updatedDate) })}</span>
                    </div>
                    <div class="world-meta-row">
                      <span ${isPublicationRecent ? 'style="font-weight: bold;"' : ''}>${isLabs ? t('worldPublicationLabs') : t('worldPublicationDate', { date: formatDate(publicationDate) })}</span>
                    </div>
                    <div class="world-meta-row">
                      <span ${isCreatedRecent ? 'style="font-weight: bold;"' : ''}>${t('worldCreatedAt', { date: formatDate(createdDate) })}</span>
                    </div>
                  </div>
                </div>
                <button class="world-add-btn" data-world-id="${world.worldId}" data-action="add-favorite">${t('worldAddButton')}</button>
              </div>
            </div>
          `;
  }).join('')}
          ${hasMore ? `
            <div class="expand-btn" data-user-id="${userId}">
              <div class="expand-btn-icon">📦</div>
              <div class="expand-btn-text">${t('worldExpandButton')}</div>
              <div class="expand-btn-count">${t('worldExpandCount', { count: totalWorldCount - displayLimit })}</div>
            </div>
          ` : ''}
        </div>
      `}
    </div>
  `;

  // ユーザーアイコン・名前クリックでユーザーページを開く
  const userAvatar = worldsArea.querySelector('.worlds-user-avatar');
  const userName = worldsArea.querySelector('.worlds-user-name');

  if (userAvatar) {
    userAvatar.addEventListener('click', () => {
      const userId = userAvatar.dataset.userId;
      chrome.tabs.create({
        url: `https://vrchat.com/home/user/${userId}`,
        active: false
      });
    });
  }

  if (userName) {
    userName.addEventListener('click', () => {
      const userId = userName.dataset.userId;
      chrome.tabs.create({
        url: `https://vrchat.com/home/user/${userId}`,
        active: false
      });
    });
  }

  // 再取得ボタン
  const refetchBtn = document.getElementById('refetchBtn');
  if (refetchBtn) {
    refetchBtn.addEventListener('click', () => {
      handleRefetchUser(userId);
    });
  }

  const sortSelect = document.getElementById('worldSortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      worldSortOrder = e.target.value;
      chrome.storage.local.set({ worldSortOrder });
      renderWorlds(userId);
    });
  }

  worldsArea.querySelectorAll('.world-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.world-add-btn')) {
        return;
      }
      const worldId = card.dataset.worldId;
      chrome.tabs.create({
        url: `https://vrchat.com/home/world/${worldId}`,
        active: false
      });
    });
  });

  // ワールド追加ボタン
  worldsArea.querySelectorAll('.world-add-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const worldId = btn.dataset.worldId;
      handleAddWorldToFavorites(worldId);
    });
  });

  const expandBtn = worldsArea.querySelector('.expand-btn');
  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      renderWorldsExpanded(userId);
    });
  }
  applyNotificationStyles();
}
