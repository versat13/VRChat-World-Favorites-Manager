// page-helpers-shared.js v1.2.2
// 環境非依存の共通UI関数（Content Script / Extension Page 両方で使用可能）

(function (window) {
  'use strict';

  // ==================== テーマ検出 ====================

  /**
   * 現在のテーマを取得（light or dark）
   * @returns {string} 'light' または 'dark'
   */
  function getCurrentTheme() {
    // body に light-theme クラスがあるかチェック
    if (document.body.classList.contains('light-theme')) {
      return 'light';
    }
    return 'dark';
  }

  /**
   * テーマに応じた色を取得
   * @param {string} theme - 'light' または 'dark'
   * @returns {Object} 色の定義オブジェクト
   */
  function getThemeColors(theme) {
    if (theme === 'light') {
      return {
        // モーダル背景・枠線
        modalBg: '#ffffff',
        modalBorder: '#7ba886', // options_page.html の --accent-primary (light)
        modalShadow: 'rgba(123, 168, 134, 0.15)',

        // テキスト
        titleColor: '#7ba886',
        descColor: '#899a8d', // --text-secondary (light)

        // キャンセルボタン
        cancelBg: '#f5f5f5',
        cancelBorder: '#dfe5e0', // --border-normal (light)
        cancelText: '#6b7d6f', // --text-tertiary (light)
        cancelHoverBg: '#e8ede9',

        // オーバーレイ
        overlayBg: 'rgba(0, 0, 0, 0.5)',

        // フォルダオプション - 通常
        folderBaseBg: '#fbfcfb', // --bg-tertiary (light)
        folderBaseBorder: '#dfe5e0',
        folderBaseText: '#3a4a3e', // --text-primary (light)
        folderHoverBg: '#f5f9f6', // --bg-hover (light)
        folderSelectedBg: '#e8f5ea',
        folderSelectedShadow: 'rgba(123, 168, 134, 0.3)',

        // フォルダオプション - 未分類 (none)
        folderNoneBg: '#faf8f5',
        folderNoneBorder: '#e8d9c4',
        folderNoneText: '#8b7355',
        folderNoneSelectedBg: '#f5e6d3',

        // フォルダオプション - VRC
        folderVrcBg: '#e8f9fc',
        folderVrcBorder: '#b3e5f0',
        folderVrcText: '#1a7a8f',
        folderVrcSelectedBg: '#7ba886', // アクセントカラー
        folderVrcSelectedText: '#ffffff'
      };
    } else {
      return {
        // モーダル背景・枠線
        modalBg: '#1a1d24',
        modalBorder: '#1fd1ed', // options_page.html の --accent-primary (dark)
        modalShadow: 'rgba(31, 209, 237, 0.2)',

        // テキスト
        titleColor: '#1fd1ed',
        descColor: '#888', // --text-secondary (dark)

        // キャンセルボタン
        cancelBg: 'rgba(255, 255, 255, 0.1)',
        cancelBorder: '#333', // --border-normal (dark)
        cancelText: '#888',
        cancelHoverBg: 'rgba(255, 255, 255, 0.15)',

        // オーバーレイ
        overlayBg: 'rgba(0, 0, 0, 0.8)',

        // フォルダオプション - 通常
        folderBaseBg: '#0f1419', // --bg-secondary (dark)
        folderBaseBorder: '#333',
        folderBaseText: '#e0e0e0', // --text-primary (dark)
        folderHoverBg: '#141920', // --bg-hover (dark)
        folderSelectedBg: '#1a1f2e',
        folderSelectedShadow: 'rgba(31, 209, 237, 0.3)',

        // フォルダオプション - 未分類 (none)
        folderNoneBg: '#0f1419',
        folderNoneBorder: '#8b7355',
        folderNoneText: '#e0e0e0',
        folderNoneSelectedBg: '#2e2a1f',

        // フォルダオプション - VRC
        folderVrcBg: '#07191d',
        folderVrcBorder: '#103b48',
        folderVrcText: '#888',
        folderVrcSelectedBg: '#1fd1ed',
        folderVrcSelectedText: '#0a0e1a'
      };
    }
  }

  // ==================== フォルダモーダル ====================

  /**
   * フォルダ選択モーダルを表示
   * @param {Object} options - オプション
   * @param {string} options.title - モーダルタイトル
   * @param {string} options.description - 説明文
   * @param {Array} options.folders - フォルダ一覧 [{id, name, class}, ...]
   * @param {Function} options.onConfirm - 確定時のコールバック(folderId)
   * @param {Function} options.onCancel - キャンセル時のコールバック
   */
  function showFolderSelectModal(options) {
    const {
      title = '📁 フォルダを選択',
      description = 'フォルダを選択してください',
      folders = [],
      onConfirm = () => { },
      onCancel = () => { }
    } = options;

    const theme = getCurrentTheme();
    const colors = getThemeColors(theme);

    const overlay = createModalOverlay(theme);

    const modal = document.createElement('div');
    modal.style.cssText = `
      background: ${colors.modalBg};
      border: 2px solid ${colors.modalBorder};
      border-radius: 12px;
      padding: 24px;
      max-width: 400px;
      width: 90%;
      box-shadow: 0 8px 32px ${colors.modalShadow};
    `;

    modal.innerHTML = `
      <div style="color: ${colors.titleColor}; margin: 0 0 16px 0; font-size: 18px; font-weight: 600;">
        ${title}
      </div>
      <p style="color: ${colors.descColor}; margin: 0 0 16px 0; font-size: 14px;">
        ${description}
      </p>
      <div class="folder-selection" style="
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin: 12px 0;
        max-height: 300px;
        overflow-y: auto;
      "></div>
      <div style="display: flex; gap: 8px; margin-top: 16px;">
        <button class="folder-select-cancel" style="
          flex: 1;
          padding: 12px;
          background: ${colors.cancelBg};
          border: 1px solid ${colors.cancelBorder};
          border-radius: 8px;
          color: ${colors.cancelText};
          cursor: pointer;
          transition: all 0.2s;
        ">キャンセル</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const folderList = modal.querySelector('.folder-selection');
    folders.forEach((folder) => {
      const option = createFolderOption(
        folder.id,
        folder.name,
        false,
        folder.class || '',
        theme
      );
      folderList.appendChild(option);
    });

    let selectedOption = null;

    folderList.querySelectorAll('.folder-option').forEach(option => {
      option.addEventListener('click', () => {
        folderList.querySelectorAll('.folder-option').forEach(o => {
          o.classList.remove('selected');
          const extraClass = o.dataset.extraClass || '';
          resetFolderOptionStyle(o, extraClass, theme);
        });

        option.classList.add('selected');
        selectedOption = option;

        const extraClass = option.dataset.extraClass || '';
        applySelectedFolderStyle(option, extraClass, theme);
      });

      option.addEventListener('dblclick', () => {
        const folderId = option.dataset.folderId;
        overlay.remove();
        onConfirm(folderId);
      });
    });

    // VRCフォルダの場合はシングルクリックで確定
    if (title.includes('VRChat')) {
      folderList.querySelectorAll('.folder-option').forEach(option => {
        option.addEventListener('click', () => {
          const folderId = option.dataset.folderId;
          setTimeout(() => {
            overlay.remove();
            onConfirm(folderId);
          }, 200);
        });
      });
    }

    modal.querySelector('.folder-select-cancel').onmouseover = () => {
      const btn = modal.querySelector('.folder-select-cancel');
      btn.style.background = colors.cancelHoverBg;
    };
    modal.querySelector('.folder-select-cancel').onmouseout = () => {
      const btn = modal.querySelector('.folder-select-cancel');
      btn.style.background = colors.cancelBg;
    };
    modal.querySelector('.folder-select-cancel').onclick = () => {
      overlay.remove();
      onCancel();
    };

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.remove();
        onCancel();
      }
    };
  }

  /**
   * モーダルオーバーレイを作成
   * @param {string} theme - 'light' または 'dark'
   * @returns {HTMLElement}
   */
  function createModalOverlay(theme = 'dark') {
    const colors = getThemeColors(theme);
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: ${colors.overlayBg};
      z-index: 10001;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    return overlay;
  }

  /**
   * フォルダオプション要素を作成
   * @param {string} id - フォルダID
   * @param {string} name - フォルダ名
   * @param {boolean} selected - 選択状態
   * @param {string} extraClass - 追加クラス（'none', 'vrc'）
   * @param {string} theme - 'light' または 'dark'
   * @returns {HTMLElement}
   */
  function createFolderOption(id, name, selected = false, extraClass = '', theme = 'dark') {
    const option = document.createElement('div');
    option.className = `folder-option ${extraClass} ${selected ? 'selected' : ''}`;
    option.dataset.folderId = id;
    option.dataset.extraClass = extraClass;

    const colors = getThemeColors(theme);
    let baseBg, baseBorder, baseText, hoverBg, selectedBg, selectedShadow, selectedText;

    if (extraClass === 'none') {
      baseBg = colors.folderNoneBg;
      baseBorder = colors.folderNoneBorder;
      baseText = colors.folderNoneText;
      hoverBg = colors.folderHoverBg;
      selectedBg = colors.folderNoneSelectedBg;
      selectedShadow = colors.folderSelectedShadow;
      selectedText = baseText;
    } else if (extraClass === 'vrc') {
      baseBg = colors.folderVrcBg;
      baseBorder = colors.folderVrcBorder;
      baseText = colors.folderVrcText;
      hoverBg = colors.folderHoverBg;
      selectedBg = colors.folderVrcSelectedBg;
      selectedShadow = colors.folderSelectedShadow;
      selectedText = colors.folderVrcSelectedText;
    } else {
      baseBg = colors.folderBaseBg;
      baseBorder = colors.folderBaseBorder;
      baseText = colors.folderBaseText;
      hoverBg = colors.folderHoverBg;
      selectedBg = colors.folderSelectedBg;
      selectedShadow = colors.folderSelectedShadow;
      selectedText = baseText;
    }

    option.style.cssText = `
      padding: 10px;
      background: ${baseBg};
      border: 2px solid ${selected ? colors.modalBorder : baseBorder};
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 8px;
      color: ${selected ? selectedText : baseText};
    `;

    if (selected) {
      option.style.background = selectedBg;
      option.style.boxShadow = `0 0 12px ${selectedShadow}`;
    }

    option.innerHTML = `
      <span style="font-size: 18px;">📁</span>
      <span style="font-size: 12px; flex: 1;">${name}</span>
    `;

    option.onmouseover = () => {
      if (!option.classList.contains('selected')) {
        option.style.borderColor = colors.modalBorder;
        option.style.background = hoverBg;
        if (extraClass === 'vrc' && theme === 'light') {
          option.style.color = colors.folderVrcText;
        }
      }
    };

    option.onmouseout = () => {
      if (!option.classList.contains('selected')) {
        option.style.borderColor = baseBorder;
        option.style.background = baseBg;
        option.style.color = baseText;
        option.style.boxShadow = 'none';
      }
    };

    return option;
  }

  /**
   * フォルダオプションのスタイルをリセット
   * @param {HTMLElement} option
   * @param {string} extraClass
   * @param {string} theme - 'light' または 'dark'
   */
  function resetFolderOptionStyle(option, extraClass, theme = 'dark') {
    const colors = getThemeColors(theme);
    let baseBg, baseBorder, baseText;

    if (extraClass === 'none') {
      baseBg = colors.folderNoneBg;
      baseBorder = colors.folderNoneBorder;
      baseText = colors.folderNoneText;
    } else if (extraClass === 'vrc') {
      baseBg = colors.folderVrcBg;
      baseBorder = colors.folderVrcBorder;
      baseText = colors.folderVrcText;
    } else {
      baseBg = colors.folderBaseBg;
      baseBorder = colors.folderBaseBorder;
      baseText = colors.folderBaseText;
    }

    option.style.borderColor = baseBorder;
    option.style.background = baseBg;
    option.style.color = baseText;
    option.style.boxShadow = 'none';
  }

  /**
   * 選択時のスタイルを適用
   * @param {HTMLElement} option
   * @param {string} extraClass
   * @param {string} theme - 'light' または 'dark'
   */
  function applySelectedFolderStyle(option, extraClass, theme = 'dark') {
    const colors = getThemeColors(theme);
    let selectedBg, selectedShadow, selectedText;

    if (extraClass === 'none') {
      selectedBg = colors.folderNoneSelectedBg;
      selectedShadow = colors.folderSelectedShadow;
      selectedText = colors.folderNoneText;
    } else if (extraClass === 'vrc') {
      selectedBg = colors.folderVrcSelectedBg;
      selectedShadow = colors.folderSelectedShadow;
      selectedText = colors.folderVrcSelectedText;
    } else {
      selectedBg = colors.folderSelectedBg;
      selectedShadow = colors.folderSelectedShadow;
      selectedText = colors.folderBaseText;
    }

    option.style.borderColor = colors.modalBorder;
    option.style.background = selectedBg;
    option.style.color = selectedText;
    option.style.boxShadow = `0 0 12px ${selectedShadow}`;
  }

  // ==================== 通知表示 ====================

  /**
   * 通知メッセージを表示
   * @param {string} message - 表示メッセージ
   * @param {string} type - 通知タイプ ('success', 'error', 'warning', 'info')
   */
  function showNotification(message, type = 'info') {
    const existing = document.getElementById('vrc-resolver-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'vrc-resolver-notification';
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: 10002;
      background: ${type === 'success' ? 'rgba(103, 215, 129, 0.9)' :
        type === 'error' ? 'rgba(255, 87, 103, 0.9)' :
          type === 'warning' ? 'rgba(249, 227, 106, 0.9)' :
            'rgba(31, 209, 237, 0.9)'};
      color: white;
      padding: 16px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      font-size: 14px;
      font-weight: 600;
      white-space: pre-line;
      max-width: 300px;
      animation: slideIn 0.3s ease-out;
    `;

    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-in';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // ==================== アニメーションスタイル ====================

  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(400px);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes slideOut {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(400px);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);

  // ==================== グローバルエクスポート ====================

  window.PageHelpersShared = {
    showFolderSelectModal,
    createModalOverlay,
    createFolderOption,
    resetFolderOptionStyle,
    applySelectedFolderStyle,
    showNotification
  };

  // console.log('[PageHelpersShared] Loaded v1.2.2');

})(window);