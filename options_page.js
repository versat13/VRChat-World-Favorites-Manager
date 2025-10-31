// options_page.js v1.2.0

// ==================== 翻訳データ ====================
const translations = {
  ja: {
    pageTitle: '⚙️ 設定',
    pageDescription: 'VRChat World Favorites Manager の設定',
    appearanceTitle: '🎨 外観',
    themeLabel: 'テーマ',
    themeDescription: '表示テーマを選択',
    themeDark: 'ダーク',
    themeLight: 'ライト',
    languageLabel: '言語 / Language',
    languageDescription: '表示言語を選択',
    featuresTitle: '⚡ 機能',
    autoResolveDuplicatesLabel: 'ワールドデータ重複の自動修復',
    autoResolveDuplicatesDescription: 'エラーによるデータ重複を『再表示』ボタンで修復する',
    vrcSiteIntegrationLabel: 'VRChat公式サイト内にボタン追加',
    vrcSiteIntegrationDescription: '公式サイト内のワールド情報に削除ボタンなどを追加する',
    contextMenuLabel: 'コンテキストメニューの追加',
    contextMenuDescription: 'ワールドのURLリンクへの右クリックメニューを追加する',
    dataTitle: '💾 データ管理',
    resetLabel: '設定リセット',
    resetDescription: 'オプション内の設定をデフォルトに戻す',
    resetBtnText: '実行',
    resetDataLabel: '保存データを全削除',
    resetDataDescription: '保存されているすべてのワールドおよびフォルダを削除する',
    resetDataBtnText: '全削除',
    footerInfo: 'Version 1.2.0',
    saveSuccess: '設定を保存しました',
    saveFailed: '設定の保存に失敗しました',
    resetConfirm: '本当にすべての設定をリセットしますか？',
    resetSuccess: '設定をリセットしました',
    resetDataConfirm: '本当にすべてのワールドとフォルダのデータをリセットしますか？この操作は元に戻せません。（設定は残ります）',
    resetDataSuccess: 'すべてのデータをリセットしました',
    resetDataFailed: 'データの削除に失敗しました',
    contextMenuUpdateFailed: 'コンテキストメニューの更新に失敗しました（バックグラウンドが応答しません）'
  },
  en: {
    pageTitle: '⚙️ Settings',
    pageDescription: 'Settings for VRChat World Favorites Manager',
    appearanceTitle: '🎨 Appearance',
    themeLabel: 'Theme',
    themeDescription: 'Select display theme',
    themeDark: 'Dark',
    themeLight: 'Light',
    languageLabel: 'Language / 言語',
    languageDescription: 'Select display language',
    featuresTitle: '⚡ Features',
    autoResolveDuplicatesLabel: 'Auto-Fix Duplicate World Data',
    autoResolveDuplicatesDescription: 'Fix duplicate data caused by errors using the "Refresh" button',
    vrcSiteIntegrationLabel: 'Add Buttons to VRChat Site',
    vrcSiteIntegrationDescription: 'Add delete buttons and more to world info on the official site',
    contextMenuLabel: 'Add Context Menu',
    contextMenuDescription: 'Add right-click menu to world URL links',
    dataTitle: '💾 Data Management',
    resetLabel: 'Reset Settings',
    resetDescription: 'Reset options to default values',
    resetBtnText: 'Execute',
    resetDataLabel: 'Delete All Saved Data',
    resetDataDescription: 'Delete all saved worlds and folders',
    resetDataBtnText: 'Delete All',
    footerInfo: 'Version 1.2.0',
    saveSuccess: 'Settings saved successfully',
    saveFailed: 'Failed to save settings',
    resetConfirm: 'Are you sure you want to reset all settings?',
    resetSuccess: 'Settings reset successfully',
    resetDataConfirm: 'Are you sure you want to reset all world and folder data? This cannot be undone. (Settings will be kept)',
    resetDataSuccess: 'All data has been reset',
    resetDataFailed: 'Failed to delete data',
    contextMenuUpdateFailed: 'Failed to update context menu (background not responding)'
  }
};

// ==================== 設定管理 ====================
const DEFAULT_SETTINGS = {
  theme: 'dark',
  language: 'ja',
  enableVrcSiteIntegration: true,
  enableContextMenu: true,
  autoResolveDuplicates: true,
  duplicateStrategy: 'keep_first'
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
    
    // ボタンテキストを翻訳
    document.getElementById('resetBtn').textContent = t('resetBtnText');
    document.getElementById('resetDataBtn').textContent = t('resetDataBtnText');
    
    // トグルスイッチの状態を反映
    const autoResolveToggle = document.getElementById('autoResolveDuplicatesToggle');
    const vrcToggle = document.getElementById('vrcSiteIntegrationToggle');
    const contextToggle = document.getElementById('contextMenuToggle');
    
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
    
    if (currentSettings.enableContextMenu !== false) {
      contextToggle.classList.add('active');
    } else {
      contextToggle.classList.remove('active');
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
    
    // コンテキストメニューの更新をbackgroundに依頼
    try {
      const response = await chrome.runtime.sendMessage({ type: 'updateContextMenus' });
      if (!response || !response.success) {
        console.warn('Context menu update may have failed:', response);
      }
    } catch (e) {
      // バックグラウンドが応答しない場合は警告のみ（設定自体は保存済み）
      console.warn('Background not responding for context menu update:', e.message);
      showNotification(t('contextMenuUpdateFailed'), 'error');
    }
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

// 翻訳関数（動的なメッセージ用）
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

  // 重複自動修復トグル
  document.getElementById('autoResolveDuplicatesToggle').addEventListener('click', function() {
    this.classList.toggle('active');
    currentSettings.autoResolveDuplicates = this.classList.contains('active');
    saveSettings();
  });

  // VRCサイト連携トグル
  document.getElementById('vrcSiteIntegrationToggle').addEventListener('click', function() {
    this.classList.toggle('active');
    currentSettings.enableVrcSiteIntegration = this.classList.contains('active');
    saveSettings();
  });

  // コンテキストメニュートグル
  document.getElementById('contextMenuToggle').addEventListener('click', function() {
    this.classList.toggle('active');
    currentSettings.enableContextMenu = this.classList.contains('active');
    saveSettings();
  });

  // 設定リセットボタン
  document.getElementById('resetBtn').addEventListener('click', async () => {
    if (confirm(t('resetConfirm'))) {
      try {
        currentSettings = { ...DEFAULT_SETTINGS };
        await chrome.storage.sync.set({ settings: currentSettings });
        await loadSettings(); // UI再読み込み
        applyTheme();
        applyLanguage();
        
        // コンテキストメニューも更新
        try {
          await chrome.runtime.sendMessage({ type: 'updateContextMenus' });
        } catch (e) {
          console.warn('Background not responding for context menu update:', e.message);
        }
        
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
        // background.js にデータリセットを依頼
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