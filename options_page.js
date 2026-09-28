// options_page.js v1.3.0

// ==================== バージョン情報 ====================
const EXTENSION_VERSION = chrome.runtime.getManifest().version;

// ==================== 翻訳データ ====================
const translations = {
  ja: {
    pageTitle: '⚙️ 設定',

    // 外観
    appearanceTitle: '🎨 外観',
    themeLabel: 'テーマ',
    themeDescription: '表示テーマを選択',
    themeDark: 'ダーク',
    themeLight: 'ライト',
    languageLabel: '言語 / Language',
    languageDescription: '表示言語を選択',

    // 【v1.3.3追加】ウォッチリスト自動チェック
    watchListIntervalLabel: 'ウォッチリスト自動チェック',
    watchListIntervalDescription: 'ウォッチリストの新着を自動確認するタイミング',
    watchListIntervalNever: '自動巡回しない',
    watchListIntervalStartupOnly: '起動時のみ',
    watchListIntervalOneHour: '1時間ごと',
    watchListIntervalThreeHours: '3時間ごと',
    watchListIntervalTwelveHours: '12時間ごと',

    // 機能
    featuresTitle: '⚡ 機能',
    autoResolveDuplicatesLabel: 'ワールドデータ重複の自動修復',
    autoResolveDuplicatesDescription: 'ファイルインポート時に発生したデータ重複を自動修復',
    vrcSiteIntegrationLabel: 'VRChat公式サイト内にボタン追加',
    vrcSiteIntegrationDescription: '公式サイト内のワールド情報に保存・お気に入り等のボタンを追加',
    vrcListIntegrationLabel: 'VRClist内にボタン追加',
    vrcListIntegrationDescription: 'vrclist.comのワールド詳細ページに保存・お気に入り等のボタンを追加',
    contextMenuLabel: 'コンテキストメニューの追加',
    contextMenuDescription: 'ワールドURLのリンクに対応',

    // 通知
    notificationTitle: '🔔 通知設定',
    desktopNotificationLabel: 'デスクトップ通知',
    desktopNotificationDescription: 'ウォッチリストに新着があった時にChromeの通知を表示',

    // データ管理
    dataTitle: '💾 データ管理',
    resetLabel: '設定リセット',
    resetDescription: 'オプション内の設定をデフォルトに戻す',
    resetBtnText: 'リセット',
    resetDataLabel: '保存データを全削除',
    resetDataDescription: '保存されているすべてのワールドおよびフォルダ、ウォッチリストを削除',
    resetDataBtnText: '全削除',

    // ステータス等
    footerInfo: `Version ${EXTENSION_VERSION}`,
    saveSuccess: '設定を保存しました',
    saveFailed: '設定の保存に失敗しました',
    resetConfirm: '本当にすべての設定をリセットしますか?',
    resetSuccess: '設定をリセットしました',
    resetDataConfirm: '本当にすべてのワールドとフォルダ、ウォッチリストのデータをリセットしますか?この操作は元に戻せません。(設定は残ります)',
    resetDataSuccess: 'すべてのデータをリセットしました',
    resetDataFailed: 'データの削除に失敗しました',
    contextMenuUpdateFailed: 'コンテキストメニューの更新に失敗しました(バックグラウンドが応答しません)'
  },
  en: {
    pageTitle: '⚙️ Settings',

    // Appearance
    appearanceTitle: '🎨 Appearance',
    themeLabel: 'Theme',
    themeDescription: 'Select display theme',
    themeDark: 'Dark',
    themeLight: 'Light',
    languageLabel: 'Language',
    languageDescription: 'Select display language',

    // Watch list auto-check interval
    watchListIntervalLabel: 'Watch List Auto-Check',
    watchListIntervalDescription: 'When to automatically check the watch list for updates',
    watchListIntervalNever: 'Never',
    watchListIntervalStartupOnly: 'On startup only',
    watchListIntervalOneHour: 'Every hour',
    watchListIntervalThreeHours: 'Every 3 hours',
    watchListIntervalTwelveHours: 'Every 12 hours',

    // Features
    featuresTitle: '⚡ Features',
    autoResolveDuplicatesLabel: 'Auto-Resolve Duplicate Worlds',
    autoResolveDuplicatesDescription: 'Automatically fix data duplicates after importing from a file',
    vrcSiteIntegrationLabel: 'VRChat Site Integration',
    vrcSiteIntegrationDescription: 'Add save, favorite, and other buttons to world info on the VRChat website',
    vrcListIntegrationLabel: 'VRClist Integration',
    vrcListIntegrationDescription: 'Add save, favorite, and other buttons to world pages on vrclist.com',
    contextMenuLabel: 'Context Menu Integration',
    contextMenuDescription: 'Enable right-click menu for VRChat World URLs',

    // Notifications
    notificationTitle: '🔔 Notifications',
    desktopNotificationLabel: 'Desktop Notifications',
    desktopNotificationDescription: 'Show a Chrome notification when your watch list has new updates',

    // Data Management
    dataTitle: '💾 Data Management',
    resetLabel: 'Reset Settings',
    resetDescription: 'Restore all options to their default values',
    resetBtnText: 'Reset',
    resetDataLabel: 'Wipe All Saved Data',
    resetDataDescription: 'Delete all saved world, folder, and watch list data',
    resetDataBtnText: 'Wipe All',

    // Footer & Status Messages
    footerInfo: `Version ${EXTENSION_VERSION}`,
    saveSuccess: 'Settings saved.',
    saveFailed: 'Failed to save settings.',
    resetConfirm: 'Are you sure you want to reset all settings?',
    resetSuccess: 'Settings reset.',
    resetDataConfirm: 'Are you sure you want to delete all world, folder, and watch list data? This cannot be undone. (Settings will remain)',
    resetDataSuccess: 'All data reset.',
    resetDataFailed: 'Failed to delete data.',
    contextMenuUpdateFailed: 'Context menu update failed (background not responding)'
  }
};

// ==================== 設定管理 ====================
const DEFAULT_SETTINGS = {
  theme: 'light',
  language: 'ja',
  enableVrcSiteIntegration: true,
  enableVrcListIntegration: true,
  enableContextMenu: true,
  autoResolveDuplicates: true,
  duplicateStrategy: 'keep_first',
  enableDesktopNotification: true,
  // 【v1.5.0変更】ウォッチリスト自動巡回はこの1項目に統一。
  // 0=自動巡回しない(デフォルト) / -1=起動時のみ / 60,180,720=定期実行の分間隔
  watchListCheckIntervalMinutes: 0
};

let currentSettings = { ...DEFAULT_SETTINGS };
let currentLang = 'ja';

// ==================== 初期化 ====================
async function init() {
  await loadSettings();
  applyTheme();
  applyLanguage();
  setupEventListeners();
}

// 設定の読み込み
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get('settings');
    if (result.settings) {
      currentSettings = { ...DEFAULT_SETTINGS, ...result.settings };
    }
    currentLang = currentSettings.language;

    // UIに反映
    document.getElementById('themeSelect').value = currentSettings.theme;
    document.getElementById('languageSelect').value = currentSettings.language;
    document.getElementById('watchListIntervalSelect').value =
      String(currentSettings.watchListCheckIntervalMinutes ?? 0);

    // ボタンテキストを翻訳
    document.getElementById('resetBtn').textContent = t('resetBtnText');
    document.getElementById('resetDataBtn').textContent = t('resetDataBtnText');

    // トグルスイッチの状態を反映
    const autoResolveToggle = document.getElementById('autoResolveDuplicatesToggle');
    const vrcToggle = document.getElementById('vrcSiteIntegrationToggle');
    const vrcListToggle = document.getElementById('vrcListIntegrationToggle');
    const contextToggle = document.getElementById('contextMenuToggle');
    const desktopNotificationToggle = document.getElementById('desktopNotificationToggle');

    if (currentSettings.autoResolveDuplicates !== false) {
      autoResolveToggle.classList.add('active');
    } else {
      autoResolveToggle.classList.remove('active');
    }

    if (currentSettings.enableVrcSiteIntegration !== false) {
      vrcToggle.classList.add('active');
    } else {
      vrcToggle.classList.remove('active');
    }

    if (currentSettings.enableVrcListIntegration !== false) {
      vrcListToggle.classList.add('active');
    } else {
      vrcListToggle.classList.remove('active');
    }

    if (currentSettings.enableContextMenu !== false) {
      contextToggle.classList.add('active');
    } else {
      contextToggle.classList.remove('active');
    }

    if (currentSettings.enableDesktopNotification !== false) {
      desktopNotificationToggle.classList.add('active');
    } else {
      desktopNotificationToggle.classList.remove('active');
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
    showNotification(t('saveFailed'), 'error');
  }
}

// 設定の保存
async function saveSettings() {
  try {
    await chrome.storage.sync.set({ settings: currentSettings });
    showNotification(t('saveSuccess'), 'success');
    // コンテキストメニューの更新は background.js の chrome.storage.onChanged
    // リスナーが自動的に行う(sendMessageでの二重呼び出しはID重複エラーの原因になるため廃止)
  } catch (error) {
    console.error('Failed to save settings:', error);
    showNotification(t('saveFailed'), 'error');
  }
}

// ==================== テーマ適用 ====================
function applyTheme() {
  if (currentSettings.theme === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }
}

// ==================== 言語適用 ====================
function applyLanguage() {
  // 全ての翻訳対象要素を更新
  Object.keys(translations[currentLang]).forEach(key => {
    const element = document.getElementById(key);
    if (element) {
      // セレクトのオプションは特別処理
      if (element.tagName === 'OPTION') {
        element.textContent = translations[currentLang][key];
      } else {
        element.textContent = translations[currentLang][key];
      }
    }
  });

  // HTML言語属性も更新
  document.documentElement.lang = currentLang;
}

// 翻訳関数(動的なメッセージ用)
function t(key) {
  return translations[currentLang][key] || key;
}

// ==================== イベントリスナー ====================
function setupEventListeners() {
  // テーマ変更
  document.getElementById('themeSelect').addEventListener('change', (e) => {
    currentSettings.theme = e.target.value;
    applyTheme();
    saveSettings();
  });

  // 言語変更
  document.getElementById('languageSelect').addEventListener('change', (e) => {
    currentSettings.language = e.target.value;
    currentLang = e.target.value;
    applyLanguage();
    // ボタンテキストも更新
    document.getElementById('resetBtn').textContent = t('resetBtnText');
    document.getElementById('resetDataBtn').textContent = t('resetDataBtnText');
    saveSettings();
  });

  // 【v1.3.3追加】ウォッチリスト自動チェック変更
  // (実際のchrome.alarms再設定はbackground.jsのstorage.onChangedが行う)
  document.getElementById('watchListIntervalSelect').addEventListener('change', (e) => {
    currentSettings.watchListCheckIntervalMinutes = parseInt(e.target.value, 10);
    saveSettings();
  });

  // 重複自動修復トグル
  document.getElementById('autoResolveDuplicatesToggle').addEventListener('click', function () {
    this.classList.toggle('active');
    currentSettings.autoResolveDuplicates = this.classList.contains('active');
    saveSettings();
  });

  // VRCサイト連携トグル
  document.getElementById('vrcSiteIntegrationToggle').addEventListener('click', function () {
    this.classList.toggle('active');
    currentSettings.enableVrcSiteIntegration = this.classList.contains('active');
    saveSettings();
  });

  // VRClist連携トグル
  document.getElementById('vrcListIntegrationToggle').addEventListener('click', function () {
    this.classList.toggle('active');
    currentSettings.enableVrcListIntegration = this.classList.contains('active');
    saveSettings();
  });

  // コンテキストメニュートグル
  document.getElementById('contextMenuToggle').addEventListener('click', function () {
    this.classList.toggle('active');
    currentSettings.enableContextMenu = this.classList.contains('active');
    saveSettings();
  });

  // デスクトップ通知トグル
  document.getElementById('desktopNotificationToggle').addEventListener('click', function () {
    this.classList.toggle('active');
    currentSettings.enableDesktopNotification = this.classList.contains('active');
    saveSettings();
  });

  // 設定リセットボタン
  document.getElementById('resetBtn').addEventListener('click', async () => {
    if (confirm(t('resetConfirm'))) {
      try {
        currentSettings = { ...DEFAULT_SETTINGS };
        await chrome.storage.sync.set({ settings: currentSettings });
        await loadSettings();
        applyTheme();
        applyLanguage();
        // コンテキストメニューの更新は background.js の chrome.storage.onChanged
        // リスナーが自動的に行う

        showNotification(t('resetSuccess'), 'success');
      } catch (error) {
        console.error('Failed to reset settings:', error);
        showNotification(t('saveFailed'), 'error');
      }
    }
  });

  // データリセットボタン
  document.getElementById('resetDataBtn').addEventListener('click', async () => {
    if (confirm(t('resetDataConfirm'))) {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'resetAllData' });

        if (response && response.success) {
          showNotification(t('resetDataSuccess'), 'success');
        } else {
          const errorMsg = response?.error || t('resetDataFailed');
          console.error('Reset data failed:', response);
          showNotification(errorMsg, 'error');
        }
      } catch (error) {
        console.error('Failed to reset data:', error);
        showNotification(`${t('resetDataFailed')}: ${error.message}`, 'error');
      }
    }
  });
}

// ==================== 通知 ====================
function showNotification(message, type = 'success') {
  const notification = document.getElementById('notification');
  notification.textContent = message;
  notification.className = `notification ${type} show`;

  setTimeout(() => {
    notification.classList.remove('show');
  }, 3000);
}

// ==================== 起動 ====================
init();