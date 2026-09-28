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
        reason: ErrorReason.WORLD_NOT_FOUND,
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
        authorName: world.authorName,
        releaseStatus: world.releaseStatus,
        thumbnailImageUrl: world.thumbnailImageUrl
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

/**
 * 【v1.5.0追加】VRChat公式API v1.21.0(2026-09-16)で新設された
 * GET /profile/{userId} (getPublicProfile) からアイコンURLを取得する。
 * userIcon/profilePicOverride等が/users/{id}のレスポンスから削除された
 * ことへの対応。取得に失敗しても致命的エラーにはせず空文字を返す
 * (呼び出し元のfetchUserInfo自体は成功として扱いたいため)。
 */
async function fetchPublicProfileIconUrl(userId) {
  try {
    const response = await fetch(`${API_BASE}/profile/${userId}`, {
      method: 'GET',
      credentials: 'include'
    });

    if (!response.ok) {
      if (DEBUG_LOG) {
        logAction('FETCH_PUBLIC_PROFILE_FAILED', { userId, status: response.status });
      }
      return '';
    }

    const profile = await response.json();
    const iconUrl = profile.iconUrl || profile.userIcon || profile.profileIconUrl || '';

    if (DEBUG_LOG) {
      logAction('FETCH_PUBLIC_PROFILE_SUCCESS', { userId, hasIcon: !!iconUrl });
    }

    return iconUrl;
  } catch (error) {
    // ネットワークエラー等: フォールバック取得なので静かに諦める
    if (DEBUG_LOG) {
      logAction('FETCH_PUBLIC_PROFILE_ERROR', { userId, error: error.message });
    }
    return '';
  }
}

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
        reason: ErrorReason.USER_NOT_FOUND,
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
          reason: ErrorReason.USER_NOT_FOUND,
          message: 'User not found',
          userMessage: 'ユーザーが見つかりませんでした'
        };
      }
      user = users[0];
    } else {
      user = await response.json();
    }

    let profilePicUrl = user.iconUrl || user.userIcon || user.currentAvatarThumbnailImageUrl ||
      user.profilePicOverride || user.currentAvatarImageUrl || '';

    // 【v1.5.0追加】上記のいずれからも取得できなかった場合、
    // VRChat公式API v1.21.0で新設された GET /profile/{userId}
    // (getPublicProfile)を追加で呼び、そちらから取得を試みる。
    // /users/{id}側の互換フィールドが今後完全に無くなった場合の保険。
    if (!profilePicUrl && user.id) {
      profilePicUrl = await fetchPublicProfileIconUrl(user.id);
    }

    const userInfo = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      bio: user.bio || '',
      profilePicUrl,
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
        messageKey: 'progress_fetchingCreatedWorlds',
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
          messageKey: 'progress_fetchingCount',
          messageParams: { count: allWorlds.length },
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
        messageKey: 'progress_fetchComplete',
        messageParams: { count: allWorlds.length },
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
        messageKey: 'progress_error',
        messageParams: { detail: error.message },
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
          messageKey: 'progress_fetchingWorldDetails',
          messageParams: { current: processed, total: worldIds.length },
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
    const [ids, local] = await Promise.all([
      loadWatchListIds(),
      chrome.storage.local.get(['watchListDetails'])
    ]);

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

/**
 * 【v1.3.3変更】ウォッチリストIDをチャンク分割して保存する。
 * chrome.storage.sync の1キー8KB上限(QUOTA_BYTES_PER_ITEM)を回避するため、
 * WATCH_LIST_CHUNK_SIZE件ごとに watchListIds_chunk0, chunk1... に分けて保存する。
 * チャンク数が減った場合(削除でキー数が減少)は、余った古いチャンクも削除する。
 */
async function saveWatchListIds(ids) {
  try {
    // 既存のチャンク数を取得し、今回より多ければ余分を削除する対象にする
    const meta = await chrome.storage.sync.get([WATCH_LIST_CHUNK_COUNT_KEY]);
    const previousChunkCount = meta[WATCH_LIST_CHUNK_COUNT_KEY] || 0;

    const chunks = [];
    for (let i = 0; i < ids.length; i += WATCH_LIST_CHUNK_SIZE) {
      chunks.push(ids.slice(i, i + WATCH_LIST_CHUNK_SIZE));
    }

    const toSet = {};
    chunks.forEach((chunk, i) => {
      toSet[`${WATCH_LIST_CHUNK_KEY_PREFIX}${i}`] = chunk;
    });
    toSet[WATCH_LIST_CHUNK_COUNT_KEY] = chunks.length;

    // 旧形式(単一キー watchListIds)が残っていれば併せて空にし、二重管理を防ぐ
    toSet['watchListIds'] = [];

    // 書き込みは1回にまとめる(MAX_WRITE_OPERATIONS_PER_MINUTE対策)
    await chrome.storage.sync.set(toSet);

    // 今回のチャンク数より前回の方が多かった場合、余った古いチャンクを削除する
    if (previousChunkCount > chunks.length) {
      const keysToRemove = [];
      for (let i = chunks.length; i < previousChunkCount; i++) {
        keysToRemove.push(`${WATCH_LIST_CHUNK_KEY_PREFIX}${i}`);
      }
      await chrome.storage.sync.remove(keysToRemove);
    }

    if (DEBUG_LOG) {
      logAction('SAVE_WATCH_LIST_IDS', { count: ids.length, chunks: chunks.length });
    }
  } catch (error) {
    logError('SAVE_WATCH_LIST_IDS_ERROR', error);
    throw error;
  }
}

/**
 * 【v1.3.3追加】チャンク分割されたウォッチリストIDを読み込んで結合する。
 * 旧形式(単一キー watchListIds に配列がそのまま入っている状態)からの
 * 自動移行にも対応する。
 * @returns {Promise<Array<{userId: string, username: string}>>}
 */
async function loadWatchListIds() {
  try {
    const meta = await chrome.storage.sync.get([WATCH_LIST_CHUNK_COUNT_KEY, 'watchListIds']);
    const chunkCount = meta[WATCH_LIST_CHUNK_COUNT_KEY] || 0;

    // 【後方互換】チャンク未使用の旧データがまだ残っている場合はそちらを使う
    if (chunkCount === 0 && Array.isArray(meta.watchListIds) && meta.watchListIds.length > 0) {
      if (DEBUG_LOG) {
        logAction('WATCH_LIST_IDS_LEGACY_FORMAT_DETECTED', { count: meta.watchListIds.length });
      }
      return meta.watchListIds;
    }

    if (chunkCount === 0) {
      return [];
    }

    const chunkKeys = [];
    for (let i = 0; i < chunkCount; i++) {
      chunkKeys.push(`${WATCH_LIST_CHUNK_KEY_PREFIX}${i}`);
    }

    const chunksData = await chrome.storage.sync.get(chunkKeys);
    let result = [];
    for (let i = 0; i < chunkCount; i++) {
      const chunk = chunksData[`${WATCH_LIST_CHUNK_KEY_PREFIX}${i}`] || [];
      result = result.concat(chunk);
    }

    return result;
  } catch (error) {
    logError('LOAD_WATCH_LIST_IDS_ERROR', error);
    return [];
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

/**
 * 【v1.5.0追加】複数ユーザー分のwatchListDetailsを一括削除する。
 * chrome.storage.localには厳しい書き込み回数制限はないが、
 * 人数分ループでget/setするのは非効率なため、1回のget/setにまとめる。
 */
async function deleteMultipleUserDetails(userIds) {
  try {
    const local = await chrome.storage.local.get(['watchListDetails']);
    const detailsMap = local.watchListDetails || {};
    userIds.forEach(userId => {
      delete detailsMap[userId];
    });
    await chrome.storage.local.set({ watchListDetails: detailsMap });

    if (DEBUG_LOG) {
      logAction('DELETE_MULTIPLE_USER_DETAILS', { count: userIds.length });
    }
  } catch (error) {
    logError('DELETE_MULTIPLE_USER_DETAILS_ERROR', error);
    throw error;
  }
}

// ============================================================
// ユーザー追加・削除
// ============================================================

/**
 * 【v1.3.3追加】軽量インポート用: APIを一切叩かず、複数IDをまとめて
 * ウォッチリストに登録する。
 *
 * 【重要】1件ずつ chrome.storage.sync.set() を呼ぶと、120回/分という
 * 書き込み回数の上限(MAX_WRITE_OPERATIONS_PER_MINUTE)にすぐ到達し、
 * 大量インポート時に後半が軒並み失敗する。そのため、複数IDをまとめて
 * 受け取り、書き込みを1回にまとめることで上限を回避する。
 *
 * 詳細情報(表示名・アイコン・ワールド一覧)は空のまま保存され、
 * 後で全件更新または新着チェックを実行した際に埋まる。
 * @param {string[]} userIds - 登録するユーザーIDの配列(usr_で始まる)
 * @returns {{success: boolean, addedCount: number, skippedCount: number}}
 */
async function addUserIdsBulk(userIds) {
  try {
    const existingIds = await loadWatchListIds();
    const existingUserIdSet = new Set(existingIds.map(u => u.userId));

    let addedCount = 0;
    let skippedCount = 0;

    for (const userId of userIds) {
      if (existingUserIdSet.has(userId)) {
        skippedCount++;
        continue;
      }
      existingIds.push({ userId, username: userId });
      existingUserIdSet.add(userId);
      addedCount++;
    }

    // 書き込みは1回だけ行う(MAX_WRITE_OPERATIONS_PER_MINUTE対策)
    if (addedCount > 0) {
      await saveWatchListIds(existingIds);
    }

    if (DEBUG_LOG) {
      logAction('ADD_USER_IDS_BULK', { addedCount, skippedCount, total: userIds.length });
    }

    return { success: true, addedCount, skippedCount };
  } catch (error) {
    logError('ADD_USER_IDS_BULK_ERROR', error, { count: userIds.length });
    return createGenericError(error.message);
  }
}

async function addUserToWatchList(userId, progressCallback = null) {
  try {
    if (DEBUG_LOG) {
      logAction('ADD_USER_TO_WATCH_LIST', { userId });
    }

    const existingIds = await loadWatchListIds();

    const alreadyExists = existingIds.some(u => u.userId === userId);

    if (progressCallback) {
      progressCallback({
        type: 'progress',
        messageKey: 'progress_fetchingUserInfo',
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
        messageKey: 'progress_fetchingWorldList',
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
        messageKey: alreadyExists ? 'progress_updated' : 'progress_added',
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
      reason: alreadyExists ? 'already_exists' : 'added',
      isNew: !alreadyExists // 【v1.2.2 修正】新規追加かどうかを明確に返す
    };

  } catch (error) {
    logError('ADD_USER_TO_WATCH_LIST_ERROR', error);

    if (progressCallback) {
      progressCallback({
        type: 'error',
        messageKey: 'progress_error',
        messageParams: { detail: error.message },
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

    const existingIds = await loadWatchListIds();
    const filteredIds = existingIds.filter(u => u.userId !== userId);

    if (filteredIds.length === existingIds.length) {
      return {
        success: false,
        reason: ErrorReason.NOT_FOUND,
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

/**
 * 【v1.5.0追加】複数ユーザーをウォッチリストから一括削除する。
 * removeUserFromWatchListを人数分ループ呼び出しすると、その都度
 * chrome.storage.sync.set(saveWatchListIds)が発生し、
 * MAX_WRITE_OPERATIONS_PER_MINUTE(1分あたり120回)にすぐ抵触してしまう。
 * ここではメモリ上で全員分を一括除外してから、保存はまとめて1回だけ行う。
 */
async function removeMultipleUsersFromWatchList(userIds) {
  try {
    if (DEBUG_LOG) {
      logAction('REMOVE_MULTIPLE_USERS_FROM_WATCH_LIST', { count: userIds.length });
    }

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return {
        success: false,
        reason: ErrorReason.INVALID_DATA,
        message: 'No user IDs provided',
        userMessage: '削除対象が指定されていません'
      };
    }

    const targetIdSet = new Set(userIds);
    const existingIds = await loadWatchListIds();
    const filteredIds = existingIds.filter(u => !targetIdSet.has(u.userId));
    const removedCount = existingIds.length - filteredIds.length;

    // storage.sync書き込みはこの1回のみ
    await saveWatchListIds(filteredIds);

    // storage.local(watchListDetails)側も同様にまとめて1回で更新する
    await deleteMultipleUserDetails(userIds);

    if (DEBUG_LOG) {
      logAction('REMOVE_MULTIPLE_USERS_SUCCESS', { requested: userIds.length, removed: removedCount });
    }

    return createSuccessResponse({ removedCount });

  } catch (error) {
    logError('REMOVE_MULTIPLE_USERS_FROM_WATCH_LIST_ERROR', error);
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
    let existingDetails = detailsMap[userId];

    // 【v1.3.3追加】軽量インポートでIDだけ登録されたユーザーは
    // watchListDetailsにレコードがまだ無いため、ここではプレースホルダーを
    // 用意するだけに留める(fetchUserInfoはまだ呼ばない)。
    const now = new Date().toISOString();
    if (!existingDetails) {
      existingDetails = {
        displayName: userId,
        profilePicUrl: '',
        addedAt: now,
        lastCheckedAt: now,
        lastUpdatedAt: now,
        latestPublicationDate: '',
        notificationEnabled: true,
        totalWorldCount: 0,
        worlds: []
      };
    }

    // 【v1.3.3修正】表示名・アイコンがまだプレースホルダーのまま(軽量インポート
    // 直後で未取得)の場合は、ワールド件数に関わらずfetchUserInfoで取得する。
    // 以前は「ワールドが0件の場合のみ」に限定していたため、ワールドを持つ
    // ユーザーの表示名・アイコンがいつまでも更新されないバグがあった。
    const needsUserInfo = existingDetails.displayName === userId || !existingDetails.profilePicUrl;

    if (progressCallback) {
      progressCallback({
        type: 'progress',
        messageKey: 'progress_fetchingWorldList',
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

    // 【v1.3.3修正】表示名・アイコンが未取得(needsUserInfo)、
    // またはワールドが1件も無い(実在確認が必要)場合にfetchUserInfoを呼ぶ。
    if (needsUserInfo || worlds.length === 0) {
      const userInfoResult = await fetchUserInfo(userId);
      if (!userInfoResult.success) {
        // user_not_found等: ユーザーが実在しない。呼び出し元が自動削除の判断をする。
        return userInfoResult;
      }
      // 表示名・アイコンを更新する。
      existingDetails.displayName = userInfoResult.user.displayName;
      existingDetails.profilePicUrl = userInfoResult.user.profilePicUrl || '';
    }

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
        messageKey: 'progress_error',
        messageParams: { detail: error.message },
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
        reason: ErrorReason.NOT_FOUND,
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
        reason: ErrorReason.NOT_FOUND,
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
    const watchListIds = await loadWatchListIds();

    const exportData = {
      meta: {
        version: '1.0.0',
        type: 'WATCH_LIST_BACKUP',
        timestamp: new Date().toISOString()
      },
      watchListIds: watchListIds
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
        reason: ErrorReason.INVALID_DATA,
        message: 'Invalid watch list data',
        userMessage: '無効なデータ形式です'
      };
    }

    const existingIds = await loadWatchListIds();
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

    const ids = await loadWatchListIds();
    const count = ids.length;

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