# 🌐 VRChat Favorite Worlds Manager（日本語版）

---

## 🧩 概要

VRChatのお気に入りワールドを**直感的にとりあえずで簡易的に管理・整理**するためのChrome拡張機能です。  
簡易的な保存先として利用できるほか、**VRChat公式サイトのお気に入りワールド一覧をAPI経由で取得・同期**することも可能です。  
（※同期にはChrome上でVRChatにログインしている必要があります）

また、**JSON / CSV形式のインポート・エクスポート**に対応しており、簡易的なバックアップや**VRCXとの連携**も行えます。  
データは**Chromeのデバイス間同期ストレージ**に保存されるため、別PCでも同期可能ですが、代わりに**保存上限は約800件**までとなります。  
それ以上のデータを扱う場合は、エクスポート機能やVRCXなどの別の外部ツールをご利用ください。
https://github.com/vrcx-team/VRCX

---

## 🌟 主な機能（Features）

### 🗂 詳細なワールド管理
- 拡張機能内のフォルダによって、ワールドを直感的に分類・整理できます。  
- **プライベート化されたワールドも保存可能**（ただしVRChat公式サイトへの登録は仕様上不可）。  
- ワールドの移動は**ドラッグ＆ドロップ操作**に対応。

---

### 🔁 VRChat API連携と同期
- **VRChat公式サイトのお気に入りワールド一覧**を取得し、整理後に同期が可能。  
- 操作前には**JSONエクスポートによるバックアップ**を推奨します。  
- VRChat公式サイトと通信を行うため、同期中は公式サイトでのお気に入り操作を避けてください。

---

### 💾 データ操作（インポート / エクスポート）
- **JSON形式**：拡張機能専用フォーマット。全データまたはフォルダ単位でエクスポート可能（詳細情報を含む）。  
- **CSV形式**：`WorldID, Name`のみを出力するシンプル形式。**VRCXとの連携**にも対応。

---

### 🌐 VRChat公式サイトとの統合
- VRChat公式サイトの「お気に入りワールド一覧」や「ワールド個別ページ」に**補助ボタンを追加**。  
- 削除済み・プライベート化されたワールドの**ID情報を保持して可視化**。  
  → 「非公開化されたこのワールド、元々何だったっけ？」という疑問を解消します。

---

## 🚀 今後のアップデート予定
- **VRChatワールド関連の外部サイト**や**インスタンスページ**、英語版を追加予定。

---

## ⚙️ インストール方法
1. **[Chrome Web Store](#)**（公開予定）からインストール  
2. Chrome上でVRChatにログイン  
3. 拡張機能のアイコンからワールド整理を開始！

---

## 🧠 注意事項
- この拡張機能は**VRChat公式とは無関係**のサードパーティ製ツールです。  
- お気に入りの整理・バックアップなど、**個人利用目的**での使用を想定しています。  
- 同期時にアカウントを切り替えると、**現在ログイン中のアカウントのデータに置き換わります**のでご注意ください。

---

🌐 VRChat Favorite Worlds Manager

A Chrome extension for intuitively managing and organizing your favorite VRChat worlds.
You can use it as a lightweight personal storage, or sync your favorite worlds list via the official VRChat API (requires being logged in to VRChat in Chrome).

The extension also supports JSON / CSV import and export, allowing for easy backups and integration with VRCX.
All data is stored in Chrome’s synced storage, meaning it can be shared across devices —
however, there is a limit of around 800 worlds due to Chrome’s storage quota.
For larger collections, consider exporting your data or managing them with VRCX.

🌟 Features
🗂 Advanced World Management

Organize your favorite worlds into folders directly within the extension.

Private worlds can also be saved (though adding them to the official favorites list is not possible due to API restrictions).

Supports drag-and-drop operations for smooth folder management.

🔁 VRChat API Sync

Fetch your official VRChat favorite worlds list, organize it, and sync it back.

It is recommended to export your data as JSON for backup before syncing.

The extension communicates with VRChat’s official API — avoid modifying your favorites on the website while syncing.

💾 Data Operations (Import / Export)

JSON format: Full structured data for this extension — export all data or specific folders (includes detailed metadata).

CSV format: Simplified structure containing only WorldID, Name, compatible with VRCX.

🌐 Integration with Official VRChat Website

Adds utility buttons to the official “Favorite Worlds” and “World Details” pages.

Keeps track of deleted or private worlds, displaying their IDs clearly.
→ Never wonder again, “What was that private world I had saved?”

🚀 Upcoming Updates

Planned support for VRChat-related external websites and instance pages to expand compatibility.English version coming soon.

🧩 Developer’s Note

This extension was created with a simple goal:

To make organizing VRChat favorite worlds easier, more flexible, and more enjoyable.

Further improvements and new features are planned — stay tuned!
