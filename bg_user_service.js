// bg_user_service.js v1.2.2 - ユーザー情報取得 + ウォッチリスト管理

// ============================================================
// 定数(bg_constants.jsから参照)
// ============================================================

const USER_FAVORITES_LIMIT = 400;
const USER_FAVORITES_PER_REQUEST = 100;
const REQUEST_DELAY = 1000;

// ============================================================
// ワールド情報取得(作者ID取得用)
// ============================================================

async function fetchWorldInfo(worldId) {
  try {
    if (DEBUG_LOG) {
      logAction('FETCH_WORLD_INFO', { worldId });
    }

    const response = await fetch(`${API_BASE}/worlds/${worldId}`, {
      method: 'GET',
      credentials: 'include'
    });

    if (response.status === 401) {
      return createAuthError();
    }

    if (response.status === 404) {
      return {
        success: false,
        reason: 'world_not_found',
        message: 'World not found',
        userMessage: 'ワールドが見つかりませんでした'
      };
    }

    if (!response.ok) {
      return createApiError(response.status, await response.text());
    }

    const world = await response.json();

    if (DEBUG_LOG) {
      logAction('WORLD_INFO_SUCCESS', {
        worldId: world.id,
        authorId: world.authorId
      });
    }

    return {
      success: true,
      world: {
        id: world.id,
        name: world.name,
        authorId: world.authorId,
        authorName: world.authorName
      }
    };

  } catch (error) {
    logError('FETCH_WORLD_INFO_ERROR', error);
    return createGenericError(error.message);
  }
}

// ============================================================
// ユーザー詳細情報取得
// ============================================================

async function fetchUserInfo(userIdOrName) {
  try {
    if (DEBUG_LOG) {
      logAction('FETCH_USER_INFO_DETAILED', { userIdOrName });
    }

    let url;
    if (userIdOrName.startsWith('usr_')) {
      url = `${API_BASE}/users/${userIdOrName}`;
    } else {
      url = `${API_BASE}/users?search=${encodeURIComponent(userIdOrName)}&n=1`;
    }

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include'
    });

    if (response.status === 401) {
      return createAuthError();
    }

    if (response.status === 404) {
      return {
        success: false,
        reason: 'user_not_found',
        message: 'User not found',
        userMessage: 'ユーザーが見つかりませんでした'
      };
    }

    if (!response.ok) {
      return createApiError(response.status, await response.text());
    }

    let user;

    if (!userIdOrName.startsWith('usr_')) {
      const users = await response.json();
      if (!users || users.length === 0) {
        return {
          success: false,
          reason: 'user_not_found',
          message: 'User not found',
          userMessage: 'ユーザーが見つかりませんでした'
        };
      }
      user = users[0];
    } else {
      user = await response.json();
    }

    const userInfo = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      bio: user.bio || '',
      profilePicUrl: user.userIcon || user.currentAvatarThumbnailImageUrl || user.profilePicOverride || '',
      tags: user.tags || [],
      status: user.status,
      statusDescription: user.statusDescription,
      currentAvatarImageUrl: user.currentAvatarImageUrl,
      currentAvatarThumbnailImageUrl: user.currentAvatarThumbnailImageUrl,
      isFriend: user.isFriend,
      location: user.location,
      worldId: user.worldId,
      instanceId: user.instanceId
    };

    if (DEBUG_LOG) {
      logAction('USER_INFO_SUCCESS', {
        userId: user.id,
        displayName: user.displayName
      });
    }

    return {
      success: true,
      user: userInfo
    };

  } catch (error) {
    logError('FETCH_USER_INFO_ERROR', error);
    return createGenericError(error.message);
  }
}

// ============================================================
// ワールド数取得
// ============================================================

async function fetchUserWorldCount(userId) {
  try {
    if (DEBUG_LOG) {
      logAction('FETCH_USER_WORLD_COUNT', { userId });
    }

    let totalCount = 0;
    let offset = 0;
    const PER_REQUEST = 100;

    while (true) {
      const url = `${API_BASE}/worlds?` +
        `userId=${userId}&` +
        `releaseStatus=public&` +
        `sort=updated&` +
        `order=descending&` +
        `n=${PER_REQUEST}&` +
        `offset=${offset}`;

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include'
      });

      if (response.status === 401) {
        return createAuthError();
      }

      if (response.status === 404) {
        if (DEBUG_LOG) {
          logAction('USER_WORLD_COUNT_NOT_FOUND', { userId });
        }
        break;
      }

      if (!response.ok) {
        return createApiError(response.status, await response.text());
      }

      const worlds = await response.json();

      if (!Array.isArray(worlds) || worlds.length === 0) {
        break;
      }

      totalCount += worlds.length;

      if (worlds.length < PER_REQUEST) {
        break;
      }

      offset += PER_REQUEST;

      if (offset >= 300) {
        if (DEBUG_LOG) {
          logAction('USER_WORLD_COUNT_LIMIT_REACHED', { userId, count: totalCount });
        }
        totalCount = `${totalCount}+`;
        break;
      }

      await sleep(REQUEST_DELAY);
    }

    if (DEBUG_LOG) {
      logAction('USER_WORLD_COUNT_SUCCESS', { userId, totalCount });
    }

    return {
      success: true,
      totalCount: totalCount
    };

  } catch (error) {
    logError('FETCH_USER_WORLD_COUNT_ERROR', error);
    return createGenericError(error.message);
  }
}

// ============================================================
// ユーザー作成ワールド取得
// ============================================================

async function fetchUserCreatedWorlds(userId, progressCallback = null) {
  try {
    if (DEBUG_LOG) {
      logAction('FETCH_USER_CREATED_WORLDS', { userId });
    }

    const allWorlds = [];
    let offset = 0;
    let hasMore = true;
    const PER_REQUEST = 100;

    if (progressCallback) {
      progressCallback({
        type: 'progress',
        message: '作成ワールドを取得中...',
        current: 0,
        total: 100
      });
    }

    while (hasMore) {
      const url = `${API_BASE}/worlds?` +
        `userId=${userId}&` +
        `releaseStatus=public&` +
        `sort=updated&` +
        `order=descending&` +
        `n=${PER_REQUEST}&` +
        `offset=${offset}`;

      if (DEBUG_LOG) {
        logAction('FETCH_CREATED_WORLDS_PAGE', { offset, limit: PER_REQUEST });
      }

      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include'
      });

      if (response.status === 401) {
        return createAuthError();
      }

      if (response.status === 404) {
        if (DEBUG_LOG) {
          logAction('CREATED_WORLDS_NOT_FOUND', { userId, offset });
        }
        hasMore = false;
        break;
      }

      if (!response.ok) {
        return createApiError(response.status, await response.text());
      }

      const worlds = await response.json();

      if (!Array.isArray(worlds) || worlds.length === 0) {
        hasMore = false;
        break;
      }

      for (const world of worlds) {
        allWorlds.push({
          worldId: world.id,
          worldName: world.name,
          description: world.description || '',
          thumbnailImageUrl: world.thumbnailImageUrl || world.imageUrl || '',
          visits: world.visits || 0,
          favorites: world.favorites || 0,
          capacity: world.capacity || 0,
          releaseStatus: world.releaseStatus || 'public',
          createdAt: world.created_at || '',
          publicationDate: world.publicationDate || world.labsPublicationDate || world.created_at || '',
          labsPublicationDate: world.labsPublicationDate || '',
          updatedAt: world.updated_at || ''
        });
      }

      if (progressCallback) {
        progressCallback({
          type: 'progress',
          message: `取得中: ${allWorlds.length}件`,
          current: allWorlds.length,
          total: allWorlds.length + 50
        });
      }

      offset += PER_REQUEST;

      if (worlds.length < PER_REQUEST) {
        hasMore = false;
      }

      if (hasMore) {
        await sleep(REQUEST_DELAY);
      }
    }

    if (DEBUG_LOG) {
      logAction('CREATED_WORLDS_FETCH_COMPLETE', {
        totalCount: allWorlds.length
      });
    }

    if (progressCallback) {
      progressCallback({
        type: 'complete',
        message: `取得完了: ${allWorlds.length}件`,
        current: allWorlds.length,
        total: allWorlds.length
      });
    }

    return {
      success: true,
      worlds: allWorlds,
      totalCount: allWorlds.length
    };

  } catch (error) {
    logError('FETCH_USER_CREATED_WORLDS_ERROR', error);

    if (progressCallback) {
      progressCallback({
        type: 'error',
        message: error.message
      });
    }

    return createGenericError(error.message);
  }
}

// ============================================================
// ワールド詳細情報取得(バッチ処理)
// ============================================================

async function fetchWorldDetailsBatch(worldIds, progressCallback = null) {
  try {
    if (DEBUG_LOG) {
      logAction('FETCH_WORLD_DETAILS_BATCH', { count: worldIds.length });
    }

    const worldDetails = {};
    const BATCH_SIZE = 10;
    let processed = 0;

    for (let i = 0; i < worldIds.length; i += BATCH_SIZE) {
      const batch = worldIds.slice(i, i + BATCH_SIZE);

      const promises = batch.map(async (worldId) => {
        try {
          const response = await fetch(`${API_BASE}/worlds/${worldId}`, {
            method: 'GET',
            credentials: 'include'
          });

          if (!response.ok) {
            if (DEBUG_LOG) {
              logError('WORLD_FETCH_FAILED', { worldId, status: response.status });
            }
            return { worldId, details: null };
          }

          const world = await response.json();
          return {
            worldId,
            details: {
              id: world.id,
              name: world.name,
              authorId: world.authorId,
              authorName: world.authorName,
              description: world.description || '',
              capacity: world.capacity || 0,
              visits: world.visits || 0,
              favorites: world.favorites || 0,
              thumbnailImageUrl: world.thumbnailImageUrl || world.imageUrl || '',
              releaseStatus: world.releaseStatus || 'public',
              tags: world.tags || [],
              createdAt: world.created_at || '',
              publicationDate: world.publicationDate || '',
              updatedAt: world.updated_at || ''
            }
          };
        } catch (error) {
          logError('WORLD_FETCH_ERROR', error, { worldId });
          return { worldId, details: null };
        }
      });

      const results = await Promise.all(promises);

      for (const result of results) {
        if (result.details) {
          worldDetails[result.worldId] = result.details;
        }
      }

      processed += batch.length;

      if (progressCallback) {
        progressCallback({
          type: 'progress',
          message: `ワールド情報取得中: ${processed}/${worldIds.length}`,
          current: processed,
          total: worldIds.length
        });
      }

      if (i + BATCH_SIZE < worldIds.length) {
        await sleep(500);
      }
    }

    if (DEBUG_LOG) {
      logAction('WORLD_DETAILS_COMPLETE', {
        success: Object.keys(worldDetails).length,
        failed: worldIds.length - Object.keys(worldDetails).length
      });
    }

    return {
      success: true,
      worldDetails
    };

  } catch (error) {
    logError('FETCH_WORLD_DETAILS_BATCH_ERROR', error);
    return createGenericError(error.message);
  }
}

// ============================================================
// CSV生成(既存機能)
// ============================================================

function generateFavoritesCSV(favorites, worldDetails = {}, includeDetails = true) {
  if (DEBUG_LOG) {
    logAction('GENERATE_CSV', {
      count: favorites.length,
      includeDetails
    });
  }

  let csv = '';
  if (includeDetails) {
    csv = 'ワールドID,ワールド名,作者ID,作者名,説明,容量,訪問数,お気に入り数,サムネイルURL,公開状態,作成日,更新日\n';
  } else {
    csv = 'ワールドID,ワールド名\n';
  }

  for (const fav of favorites) {
    const worldId = fav.worldId || fav.id || fav.favoriteId;
    const worldName = escapeCSV(fav.worldName || fav.name || worldId);

    if (includeDetails && worldDetails[worldId]) {
      const detail = worldDetails[worldId];
      csv += [
        worldId,
        escapeCSV(detail.name),
        detail.authorId,
        escapeCSV(detail.authorName),
        escapeCSV(detail.description.substring(0, 100)),
        detail.capacity,
        detail.visits,
        detail.favorites,
        detail.thumbnailImageUrl,
        detail.releaseStatus,
        detail.createdAt,
        detail.updatedAt
      ].join(',') + '\n';
    } else {
      csv += `${worldId},${worldName}\n`;
    }
  }

  return csv;
}

function generateCreatedWorldsCSV(worlds) {
  if (DEBUG_LOG) {
    logAction('GENERATE_CREATED_WORLDS_CSV', { count: worlds.length });
  }

  let csv = 'ワールドID,ワールド名,説明,訪問数,お気に入り数,容量,公開状態,サムネイルURL,作成日,更新日\n';

  for (const world of worlds) {
    csv += [
      world.worldId,
      escapeCSV(world.worldName),
      escapeCSV(world.description.substring(0, 100)),
      world.visits || 0,
      world.favorites || 0,
      world.capacity || 0,
      world.releaseStatus || 'public',
      world.thumbnailImageUrl || '',
      world.createdAt || '',
      world.updatedAt || ''
    ].join(',') + '\n';
  }

  return csv;
}

function escapeCSV(str) {
  if (str == null) return '';
  str = String(str);
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// ============================================================
// 【v1.2.2】ウォッチリスト用CSV機能
// ============================================================

function generateWatchListCSV(watchList) {
  if (DEBUG_LOG) {
    logAction('GENERATE_WATCH_LIST_CSV', { count: watchList.length });
  }

  let csv = 'ユーザーID,表示名,ユーザー名,作品数\n';

  for (const user of watchList) {
    csv += [
      user.userId,
      escapeCSV(user.displayName),
      escapeCSV(user.username),
      user.totalWorldCount || 0
    ].join(',') + '\n';
  }

  return csv;
}

function parseWatchListCSV(csvText) {
  if (DEBUG_LOG) {
    logAction('PARSE_WATCH_LIST_CSV', { length: csvText.length });
  }

  const userIds = [];
  const lines = csvText.split('\n');
  const userIdRegex = /usr_[a-f0-9-]+/i;

  for (const line of lines) {
    if (!line.trim()) continue;

    const match = line.match(userIdRegex);
    if (match) {
      const userId = match[0];
      if (!userIds.includes(userId)) {
        userIds.push(userId);
      }
    }
  }

  if (DEBUG_LOG) {
    logAction('PARSE_WATCH_LIST_CSV_COMPLETE', { count: userIds.length });
  }

  return userIds;
}

// ============================================================
// 【v1.2.2】Labs対応ヘルパー関数
// ============================================================

function isLabsWorld(world) {
  const pub = world.publicationDate;
  return !pub ||
    pub === 'none' ||
    pub === 'null' ||
    isNaN(new Date(pub).getTime());
}

function getValidPublicationDate(world) {
  if (!isLabsWorld(world)) {
    return world.publicationDate;
  }
  return world.updatedAt || world.createdAt || new Date().toISOString();
}

// ============================================================
// ウォッチリスト管理
// ============================================================

async function loadWatchList() {
  try {
    const [sync, local] = await Promise.all([
      chrome.storage.sync.get(['watchListIds']),
      chrome.storage.local.get(['watchListDetails'])
    ]);

    const ids = sync.watchListIds || [];
    const details = local.watchListDetails || {};

    const watchList = ids.map(({ userId, username }) => {
      const detail = details[userId] || {};

      return {
        userId,
        username,
        displayName: detail.displayName || username,
        profilePicUrl: detail.profilePicUrl || '',
        addedAt: detail.addedAt || new Date().toISOString(),
        lastCheckedAt: detail.lastCheckedAt || new Date().toISOString(),
        lastUpdatedAt: detail.lastUpdatedAt || new Date().toISOString(),
        latestPublicationDate: detail.latestPublicationDate || '',
        notificationEnabled: detail.notificationEnabled !== false,
        totalWorldCount: detail.totalWorldCount || 0,
        worlds: detail.worlds || []
      };
    });

    if (DEBUG_LOG) {
      logAction('LOAD_WATCH_LIST', { count: watchList.length });
    }

    return watchList;
  } catch (error) {
    logError('LOAD_WATCH_LIST_ERROR', error);
    return [];
  }
}

async function saveWatchListIds(ids) {
  try {
    await chrome.storage.sync.set({ watchListIds: ids });
    if (DEBUG_LOG) {
      logAction('SAVE_WATCH_LIST_IDS', { count: ids.length });
    }
  } catch (error) {
    logError('SAVE_WATCH_LIST_IDS_ERROR', error);
    throw error;
  }
}

async function saveUserDetails(userId, details) {
  try {
    const local = await chrome.storage.local.get(['watchListDetails']);
    const detailsMap = local.watchListDetails || {};
    detailsMap[userId] = details;
    await chrome.storage.local.set({ watchListDetails: detailsMap });

    if (DEBUG_LOG) {
      logAction('SAVE_USER_DETAILS', { userId });
    }
  } catch (error) {
    logError('SAVE_USER_DETAILS_ERROR', error);
    throw error;
  }
}

async function deleteUserDetails(userId) {
  try {
    const local = await chrome.storage.local.get(['watchListDetails']);
    const detailsMap = local.watchListDetails || {};
    delete detailsMap[userId];
    await chrome.storage.local.set({ watchListDetails: detailsMap });

    if (DEBUG_LOG) {
      logAction('DELETE_USER_DETAILS', { userId });
    }
  } catch (error) {
    logError('DELETE_USER_DETAILS_ERROR', error);
    throw error;
  }
}

// ============================================================
// ユーザー追加・削除
// ============================================================

async function addUserToWatchList(userId, progressCallback = null) {
  try {
    if (DEBUG_LOG) {
      logAction('ADD_USER_TO_WATCH_LIST', { userId });
    }

    const sync = await chrome.storage.sync.get(['watchListIds']);
    const existingIds = sync.watchListIds || [];

    const alreadyExists = existingIds.some(u => u.userId === userId);

    if (progressCallback) {
      progressCallback({
        type: 'progress',
        message: 'ユーザー情報を取得中...',
        current: 0,
        total: 100
      });
    }

    const userInfoResult = await fetchUserInfo(userId);
    if (!userInfoResult.success) {
      return userInfoResult;
    }

    const user = userInfoResult.user;

    if (progressCallback) {
      progressCallback({
        type: 'progress',
        message: 'ワールド一覧を取得中...',
        current: 50,
        total: 100
      });
    }

    const worldsResult = await fetchUserCreatedWorlds(userId, progressCallback);
    const worlds = worldsResult.success ? worldsResult.worlds : [];

    const now = new Date().toISOString();
    const lastUpdatedAt = worlds.length > 0 ? worlds[0].updatedAt : now;

    const sortedByPublication = [...worlds].sort((a, b) =>
      new Date(getValidPublicationDate(b)) - new Date(getValidPublicationDate(a))
    );
    const latestPublicationDate = sortedByPublication.length > 0 ?
      getValidPublicationDate(sortedByPublication[0]) : now;

    if (!alreadyExists) {
      existingIds.push({
        userId: user.id,
        username: user.username
      });
      await saveWatchListIds(existingIds);
    }

    const details = {
      displayName: user.displayName,
      profilePicUrl: user.profilePicUrl || '',
      addedAt: alreadyExists ? (await getExistingAddedAt(userId)) : now,
      lastCheckedAt: now,
      lastUpdatedAt: lastUpdatedAt,
      latestPublicationDate: latestPublicationDate,
      notificationEnabled: true,
      totalWorldCount: worlds.length,
      worlds: worlds.slice(0, 6).map(w => ({
        worldId: w.worldId,
        worldName: w.worldName,
        thumbnailUrl: w.thumbnailImageUrl || '',
        createdAt: w.createdAt || '',
        publicationDate: w.publicationDate || '',
        updatedAt: w.updatedAt || '',
        visits: w.visits || 0,
        favorites: w.favorites || 0
      }))
    };
    await saveUserDetails(userId, details);

    // 【追加】popup に通知状態更新を通知
    try {
      chrome.runtime.sendMessage({
        type: 'notificationUpdated'
      }).catch(() => {
        // popup が開いていない場合はエラーを無視
        if (DEBUG_LOG) {
          logAction('NOTIFICATION_UPDATE_MESSAGE_SENT_NO_RECEIVER');
        }
      });
    } catch (error) {
      // エラーを無視（popup が開いていない場合）
    }

    if (progressCallback) {
      progressCallback({
        type: 'complete',
        message: alreadyExists ? '情報を更新しました' : '追加完了',
        current: 100,
        total: 100
      });
    }

    if (DEBUG_LOG) {
      logAction('ADD_USER_SUCCESS', { userId, worldCount: worlds.length, alreadyExists });
    }

    return {
      success: true,
      user: {
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        worldCount: worlds.length
      },
      reason: alreadyExists ? 'already_exists' : 'added' // 【追加】理由を返す
    };

  } catch (error) {
    logError('ADD_USER_TO_WATCH_LIST_ERROR', error);

    if (progressCallback) {
      progressCallback({
        type: 'error',
        message: error.message
      });
    }

    return createGenericError(error.message);
  }
}

async function getExistingAddedAt(userId) {
  try {
    const local = await chrome.storage.local.get(['watchListDetails']);
    const detailsMap = local.watchListDetails || {};
    return detailsMap[userId]?.addedAt || new Date().toISOString();
  } catch (error) {
    return new Date().toISOString();
  }
}

async function removeUserFromWatchList(userId) {
  try {
    if (DEBUG_LOG) {
      logAction('REMOVE_USER_FROM_WATCH_LIST', { userId });
    }

    const sync = await chrome.storage.sync.get(['watchListIds']);
    const existingIds = sync.watchListIds || [];
    const filteredIds = existingIds.filter(u => u.userId !== userId);

    if (filteredIds.length === existingIds.length) {
      return {
        success: false,
        reason: 'not_found',
        message: 'User not found in watch list',
        userMessage: 'ユーザーが見つかりません'
      };
    }

    await saveWatchListIds(filteredIds);
    await deleteUserDetails(userId);

    if (DEBUG_LOG) {
      logAction('REMOVE_USER_SUCCESS', { userId });
    }

    return createSuccessResponse();

  } catch (error) {
    logError('REMOVE_USER_FROM_WATCH_LIST_ERROR', error);
    return createGenericError(error.message);
  }
}

async function refreshUserWorlds(userId, progressCallback = null) {
  try {
    if (DEBUG_LOG) {
      logAction('REFRESH_USER_WORLDS', { userId });
    }

    const local = await chrome.storage.local.get(['watchListDetails']);
    const detailsMap = local.watchListDetails || {};
    const existingDetails = detailsMap[userId];

    if (!existingDetails) {
      return {
        success: false,
        reason: 'not_found',
        message: 'User not found in watch list',
        userMessage: 'ユーザーが見つかりません'
      };
    }

    if (progressCallback) {
      progressCallback({
        type: 'progress',
        message: 'ワールド一覧を取得中...',
        current: 0,
        total: 100
      });
    }

    const worldsResult = await fetchUserCreatedWorlds(userId, progressCallback);

    if (!worldsResult.success) {
      return worldsResult;
    }

    const worlds = worldsResult.worlds;
    const now = new Date().toISOString();
    const lastUpdatedAt = worlds.length > 0 ? worlds[0].updatedAt : now;

    const sortedByPublication = [...worlds].sort((a, b) =>
      new Date(getValidPublicationDate(b)) - new Date(getValidPublicationDate(a))
    );
    const latestPublicationDate = sortedByPublication.length > 0 ?
      getValidPublicationDate(sortedByPublication[0]) : now;

    existingDetails.lastUpdatedAt = lastUpdatedAt;
    existingDetails.latestPublicationDate = latestPublicationDate;
    existingDetails.totalWorldCount = worlds.length;
    existingDetails.worlds = worlds.slice(0, 6).map(w => ({
      worldId: w.worldId,
      worldName: w.worldName,
      thumbnailUrl: w.thumbnailImageUrl || '',
      createdAt: w.createdAt || '',
      publicationDate: w.publicationDate || '',
      updatedAt: w.updatedAt || '',
      visits: w.visits || 0,
      favorites: w.favorites || 0
    }));

    await saveUserDetails(userId, existingDetails);

    if (DEBUG_LOG) {
      logAction('REFRESH_USER_SUCCESS', { userId, worldCount: worlds.length });
    }

    return {
      success: true,
      worldCount: worlds.length,
      lastUpdatedAt: lastUpdatedAt
    };

  } catch (error) {
    logError('REFRESH_USER_WORLDS_ERROR', error);

    if (progressCallback) {
      progressCallback({
        type: 'error',
        message: error.message
      });
    }

    return createGenericError(error.message);
  }
}

async function markUserAsChecked(userId) {
  try {
    if (DEBUG_LOG) {
      logAction('MARK_USER_AS_CHECKED', { userId });
    }

    const local = await chrome.storage.local.get(['watchListDetails']);
    const detailsMap = local.watchListDetails || {};
    const existingDetails = detailsMap[userId];

    if (!existingDetails) {
      return {
        success: false,
        reason: 'not_found',
        message: 'User not found in watch list',
        userMessage: 'ユーザーが見つかりません'
      };
    }

    existingDetails.lastCheckedAt = new Date().toISOString();
    await saveUserDetails(userId, existingDetails);

    if (DEBUG_LOG) {
      logAction('MARK_AS_CHECKED_SUCCESS', { userId });
    }

    return createSuccessResponse();

  } catch (error) {
    logError('MARK_USER_AS_CHECKED_ERROR', error);
    return createGenericError(error.message);
  }
}

async function toggleUserNotification(userId, enabled) {
  try {
    if (DEBUG_LOG) {
      logAction('TOGGLE_USER_NOTIFICATION', { userId, enabled });
    }

    const local = await chrome.storage.local.get(['watchListDetails']);
    const detailsMap = local.watchListDetails || {};
    const existingDetails = detailsMap[userId];

    if (!existingDetails) {
      return {
        success: false,
        reason: 'not_found',
        message: 'User not found in watch list',
        userMessage: 'ユーザーが見つかりません'
      };
    }

    existingDetails.notificationEnabled = enabled;
    await saveUserDetails(userId, existingDetails);

    if (DEBUG_LOG) {
      logAction('TOGGLE_NOTIFICATION_SUCCESS', { userId, enabled });
    }

    return createSuccessResponse();

  } catch (error) {
    logError('TOGGLE_USER_NOTIFICATION_ERROR', error);
    return createGenericError(error.message);
  }
}

async function updateGlobalNotificationSetting(setting, enabled) {
  try {
    if (DEBUG_LOG) {
      logAction('UPDATE_GLOBAL_NOTIFICATION_SETTING', { setting, enabled });
    }

    const sync = await chrome.storage.sync.get(['globalNotificationSettings']);
    const settings = sync.globalNotificationSettings || { worldUpdate: true, newWorld: true };

    settings[setting] = enabled;

    await chrome.storage.sync.set({ globalNotificationSettings: settings });

    if (DEBUG_LOG) {
      logAction('UPDATE_GLOBAL_NOTIFICATION_SETTING_SUCCESS', { setting, enabled });
    }

    return createSuccessResponse();

  } catch (error) {
    logError('UPDATE_GLOBAL_NOTIFICATION_SETTING_ERROR', error);
    return createGenericError(error.message);
  }
}

// ============================================================
// インポート/エクスポート
// ============================================================

async function exportWatchListData() {
  try {
    const sync = await chrome.storage.sync.get(['watchListIds']);

    const exportData = {
      meta: {
        version: '1.0.0',
        type: 'WATCH_LIST_BACKUP',
        timestamp: new Date().toISOString()
      },
      watchListIds: sync.watchListIds || []
    };

    if (DEBUG_LOG) {
      logAction('WATCH_LIST_EXPORT_SUCCESS', { count: exportData.watchListIds.length });
    }

    return createSuccessResponse({ data: exportData });

  } catch (error) {
    logError('WATCH_LIST_EXPORT_ERROR', error);
    return createGenericError(error.message);
  }
}

async function importWatchListData(watchListIds) {
  try {
    if (DEBUG_LOG) {
      logAction('WATCH_LIST_IMPORT_START', { count: watchListIds.length });
    }

    if (!Array.isArray(watchListIds)) {
      return {
        success: false,
        reason: 'invalid_data',
        message: 'Invalid watch list data',
        userMessage: '無効なデータ形式です'
      };
    }

    const sync = await chrome.storage.sync.get(['watchListIds']);
    const existingIds = sync.watchListIds || [];
    const existingUserIds = new Set(existingIds.map(u => u.userId));

    const newUsers = watchListIds.filter(u => !existingUserIds.has(u.userId));

    if (newUsers.length === 0) {
      if (DEBUG_LOG) {
        logAction('WATCH_LIST_IMPORT_ALL_EXIST', { count: watchListIds.length });
      }

      return {
        success: true,
        addedCount: 0,
        skippedCount: watchListIds.length,
        message: 'すべて既に登録済みです'
      };
    }

    const updatedList = [...existingIds, ...newUsers];
    await saveWatchListIds(updatedList);

    if (DEBUG_LOG) {
      logAction('WATCH_LIST_IMPORT_COMPLETE', {
        added: newUsers.length,
        skipped: watchListIds.length - newUsers.length
      });
    }

    return {
      success: true,
      addedCount: newUsers.length,
      skippedCount: watchListIds.length - newUsers.length
    };

  } catch (error) {
    logError('WATCH_LIST_IMPORT_ERROR', error);
    return createGenericError(error.message);
  }
}

/**
 * ウォッチリストの件数を取得
 * @returns {Promise<Object>} {success: true, count: number}
 */
async function getWatchListCount() {
  try {
    if (DEBUG_LOG) {
      logAction('GET_WATCH_LIST_COUNT');
    }

    const sync = await chrome.storage.sync.get(['watchListIds']);
    const count = (sync.watchListIds || []).length;

    if (DEBUG_LOG) {
      logAction('GET_WATCH_LIST_COUNT_SUCCESS', { count });
    }

    return {
      success: true,
      count: count
    };

  } catch (error) {
    logError('GET_WATCH_LIST_COUNT_ERROR', error);
    return {
      success: false,
      count: 0,
      error: error.message
    };
  }
}

// ============================================================
// 【v1.2.2 追加】ユーザーの最新ワールドを取得（軽量版）
// ============================================================

/**
 * ユーザーの最新N件のワールドを取得（軽量版）
 * @param {string} userId - ユーザーID
 * @param {number} limit - 取得件数（デフォルト: 6）
 * @returns {Promise<Object>} {success: true, worlds: [...]}
 */
async function fetchUserRecentWorlds(userId, limit = 6) {
  try {
    if (DEBUG_LOG) {
      logAction('FETCH_USER_RECENT_WORLDS', { userId, limit });
    }

    const url = `${API_BASE}/worlds?` +
      `userId=${userId}&` +
      `releaseStatus=public&` +
      `sort=updated&` +
      `order=descending&` +
      `n=${limit}`;

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include'
    });

    if (response.status === 401) {
      return createAuthError();
    }

    if (response.status === 404) {
      if (DEBUG_LOG) {
        logAction('USER_RECENT_WORLDS_NOT_FOUND', { userId });
      }
      return {
        success: true,
        worlds: []
      };
    }

    if (!response.ok) {
      return createApiError(response.status, await response.text());
    }

    const worlds = await response.json();

    if (!Array.isArray(worlds)) {
      return {
        success: true,
        worlds: []
      };
    }

    const formattedWorlds = worlds.map(world => ({
      worldId: world.id,
      worldName: world.name,
      description: world.description || '',
      thumbnailImageUrl: world.thumbnailImageUrl || world.imageUrl || '',
      thumbnailUrl: world.thumbnailImageUrl || world.imageUrl || '',
      visits: world.visits || 0,
      favorites: world.favorites || 0,
      capacity: world.capacity || 0,
      releaseStatus: world.releaseStatus || 'public',
      createdAt: world.created_at || '',
      publicationDate: world.publicationDate || world.labsPublicationDate || world.created_at || '',
      labsPublicationDate: world.labsPublicationDate || '',
      updatedAt: world.updated_at || ''
    }));

    if (DEBUG_LOG) {
      logAction('FETCH_USER_RECENT_WORLDS_SUCCESS', {
        userId,
        count: formattedWorlds.length
      });
    }

    return {
      success: true,
      worlds: formattedWorlds
    };

  } catch (error) {
    logError('FETCH_USER_RECENT_WORLDS_ERROR', error);
    return {
      success: false,
      worlds: [],
      error: error.message
    };
  }
}