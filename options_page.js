    // ==================== 翻訳データ ====================
    // この翻訳オブジェクトを別ファイル(i18n.js)に分離することも可能
    const translations = {
      ja: {
        pageTitle: '⚙️ VRChat World Favorites Manager 設定',
        pageDescription: '',
        appearanceTitle: '🎨 外観',
        themeLabel: 'テーマ',
        themeDescription: '表示テーマを選択',
        themeDark: 'ダーク',
        themeLight: 'ライト',
        languageLabel: '言語 / Language',
        languageDescription: '表示言語を選択',
        featuresTitle: '⚡ 機能',
        autoSyncLabel: '自動同期',
        autoSyncDescription: '起動時に自動的にVRChatと同期',
        notificationsLabel: '通知',
        notificationsDescription: '操作完了時に通知を表示',
        autoThumbnailLabel: 'サムネイル自動取得',
        autoThumbnailDescription: 'ワールド追加時に自動でサムネイルを取得',
        dataTitle: '💾 データ管理',
        backupLabel: 'バックアップ',
        backupDescription: '設定とデータをエクスポート',
        resetLabel: '設定リセット',
        resetDescription: 'すべての設定を初期値に戻す',
        resetBtn: 'リセット',
        footerInfo: 'Version 1.0.0',
        closeBtn: '閉じる',
        saveSuccess: '設定を保存しました',
        resetConfirm: '本当にすべての設定をリセットしますか？',
        resetSuccess: '設定をリセットしました',
        backupSuccess: 'バックアップをエクスポートしました'
      },
      en: {
        pageTitle: '⚙️ Settings for VRChat World Favorites Manager',
        pageDescription: '',
        appearanceTitle: '🎨 Appearance',
        themeLabel: 'Theme',
        themeDescription: 'Select display theme',
        themeDark: 'Dark',
        themeLight: 'Light',
        languageLabel: 'Language / 言語',
        languageDescription: 'Select display language',
        featuresTitle: '⚡ Features',
        autoSyncLabel: 'Auto Sync',
        autoSyncDescription: 'Automatically sync with VRChat on startup',
        notificationsLabel: 'Notifications',
        notificationsDescription: 'Show notifications on operation completion',
        autoThumbnailLabel: 'Auto Fetch Thumbnails',
        autoThumbnailDescription: 'Automatically fetch thumbnails when adding worlds',
        dataTitle: '💾 Data Management',
        backupLabel: 'Backup',
        backupDescription: 'Export settings and data',
        resetLabel: 'Reset Settings',
        resetDescription: 'Reset all settings to default',
        resetBtn: 'Reset',
        footerInfo: 'Version 1.0.0',
        closeBtn: 'Close',
        saveSuccess: 'Settings saved successfully',
        resetConfirm: 'Are you sure you want to reset all settings?',
        resetSuccess: 'Settings reset successfully',
        backupSuccess: 'Backup exported successfully'
      }
    };

    // ==================== 設定管理 ====================
    const DEFAULT_SETTINGS = {
      theme: 'dark',
      language: 'ja',
      autoSync: false,
      notifications: true,
      autoThumbnail: true
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
        // chrome.storage.syncはブラウザ拡張機能のAPIです。
        // 環境がない場合はエラーになる可能性がありますが、ここでは無視します。
        const result = await chrome.storage.sync.get('settings');
        if (result.settings) {
          currentSettings = { ...DEFAULT_SETTINGS, ...result.settings };
        }
        currentLang = currentSettings.language;
        
        // UIに反映
        document.getElementById('themeSelect').value = currentSettings.theme;
        document.getElementById('languageSelect').value = currentSettings.language;
        document.getElementById('autoSyncToggle').classList.toggle('active', currentSettings.autoSync);
        document.getElementById('notificationsToggle').classList.toggle('active', currentSettings.notifications);
        document.getElementById('autoThumbnailToggle').classList.toggle('active', currentSettings.autoThumbnail);
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    }

    // 設定の保存
    async function saveSettings() {
      try {
        await chrome.storage.sync.set({ settings: currentSettings });
        showNotification(t('saveSuccess'), 'success');
      } catch (error) {
        console.error('Failed to save settings:', error);
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
        saveSettings();
      });

      // トグルスイッチ
      document.getElementById('autoSyncToggle').addEventListener('click', function() {
        this.classList.toggle('active');
        currentSettings.autoSync = this.classList.contains('active');
        saveSettings();
      });

      document.getElementById('notificationsToggle').addEventListener('click', function() {
        this.classList.toggle('active');
        currentSettings.notifications = this.classList.contains('active');
        saveSettings();
      });

      document.getElementById('autoThumbnailToggle').addEventListener('click', function() {
        this.classList.toggle('active');
        currentSettings.autoThumbnail = this.classList.contains('active');
        saveSettings();
      });

      // リセットボタン
      document.getElementById('resetBtn').addEventListener('click', async () => {
        if (confirm(t('resetConfirm'))) {
          currentSettings = { ...DEFAULT_SETTINGS };
          await saveSettings();
          // リセットされた設定をUIに反映
          await loadSettings();
          applyTheme();
          applyLanguage();
          showNotification(t('resetSuccess'), 'success');
        }
      });

      // 閉じるボタン
      document.getElementById('closeBtn').addEventListener('click', () => {
        window.close();
      });
    }

    // ==================== 通知 ====================
    function showNotification(message, type = 'success') {
      const notification = document.getElementById('notification');
      notification.textContent = message;
      // 'success'クラスを付けることで、CSSのborder-color: var(--success); が適用される
      notification.className = `notification ${type} show`;
      
      setTimeout(() => {
        notification.classList.remove('show');
      }, 3000);
    }

    // ==================== 起動 ====================
    init();
