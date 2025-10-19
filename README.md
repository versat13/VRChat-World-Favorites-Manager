🌐 VRChat Favorite Worlds Manager

VRChatのお気に入りワールドを直感的に管理・整理するためのChrome拡張機能です。
簡易的な保存先として利用できるほか、VRChat公式サイトのお気に入りワールド一覧をAPI経由で取得・同期することも可能です（※Chromeでのログインが必要）。

また、JSON / CSV形式のインポート・エクスポートに対応しており、簡易的なバックアップやVRCXとの連携も可能です。
データはChromeのデバイス間同期ストレージに保存されるため、別のPCでも同期されますが、代わりに保存上限は約800件までとなります。
上限を超える場合は、エクスポート機能やVRCX等の更なる外部ツールをご利用ください。

🌟 主な機能（Features）
🗂 詳細なワールド管理機能

拡張機能内でフォルダを作成し、ワールドを直感的に分類・整理できます。

プライベート化されたワールドも保存可能（ただしVRChat公式サイト側への登録は仕様上不可）。

フォルダ間の移動はドラッグ＆ドロップ操作に対応。

🔁 VRChat API連携と同期

VRChat公式サイトのお気に入りリストを取得し、整理後に同期可能。

操作前にはJSONエクスポートでバックアップしておくことを推奨します。

VRChat公式サイトと通信を行うため、同期中はサイト上でのお気に入り操作を控えてください。

💾 データ操作（Import / Export）

JSON形式：拡張機能専用のデータ構造。全データまたはフォルダ単位でのエクスポートに対応（詳細情報含む）。

CSV形式：WorldID, Name のみを出力するシンプル形式。VRCXとの連携にも対応。

🌐 VRChat公式との統合

公式サイトの「お気に入りワールド一覧」や「ワールド個別ページ」に補助ボタンを追加。

削除済み・プライベート化されたワールドもID情報を保持して可視化。
→ 「非公開化されたこのワールド、元々何だったっけ？」という悩みを解消します。

🚀 今後のアップデート予定

VRChatワールド関連の外部サイトやインスタンスページへの対応を予定しています。

🧩 開発メモ

この拡張機能は「VRChatのお気に入りワールドを手軽に整理したい」という簡易的な利用を想定しています。

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

Planned support for VRChat-related external websites and instance pages to expand compatibility.

🧩 Developer’s Note

This extension was created with a simple goal:

To make organizing VRChat favorite worlds easier, more flexible, and more enjoyable.

Further improvements and new features are planned — stay tuned!
