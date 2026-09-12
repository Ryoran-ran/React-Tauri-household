# HIBI の配布・アップデート手順

配布先は **Ryoran-ran/React-Tauri-household** です。Windows x64 のインストーラーを GitHub Actions でビルドし、GitHub Releases に配布します。バージョンタグを push すると、署名付きインストーラーと更新情報を含む **下書きリリース** が作られます。最後に内容を確認して公開してください。

今回の実装では GitHub への push、Secrets の登録、リリース公開は実行していません。本番の署名鍵も未作成です。次の初期設定を一度行ってください。

## 1. 配布の前提を確認する

- この方式は、ログインなしでダウンロードできる **公開リポジトリの Releases** を使用します。非公開リポジトリの場合、このままでは利用できません。公開範囲を確認し、非公開のまま運用する場合は別の公開配布先が必要です。アプリに GitHub のトークンは埋め込みません。
- リポジトリの Actions が利用可能になっていることを確認してください。個人用トークンを新規作成する必要はありません。ビルドでは GitHub が発行する `GITHUB_TOKEN` を使います。
- `.local-secrets/`、`.local-backups/`、`test-results/`、`release/`、SQLite ファイルは Git 管理の対象外です。家計簿データをソースやリリースに追加しないでください。

以降のコマンドは、プロジェクトのフォルダーを PowerShell で開いて実行します。Node.js 22.12 以降と Git が必要です。この作業環境にあるポータブル Node.js を使う場合は、最初に次を実行できます。

```powershell
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $portableNode = Get-ChildItem .tools -Directory -Filter 'node-*-win-x64' | Sort-Object Name -Descending | Select-Object -First 1
    $env:PATH = "$($portableNode.FullName);$env:PATH"
}
npm.cmd ci
```

## 2. 更新用の署名鍵を作成する（初回のみ）

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-updater.ps1
```

このスクリプトは、パスワード付きの鍵を作成し、公開鍵と配布 URL を `src-tauri/tauri.conf.json` に設定します。鍵とパスワードの内容は画面に表示しません。

| ファイル | 扱い |
| --- | --- |
| `.local-secrets/updater.key` | 秘密鍵。後述の GitHub Secret に設定 |
| `.local-secrets/updater-password.txt` | 秘密鍵のパスワード。別の GitHub Secret に設定 |
| `.local-secrets/updater.key.pub` | 公開鍵。設定ファイルへ自動転記 |
| `src-tauri/tauri.conf.json` | 公開鍵だけを含むのでコミットする |

**`.local-secrets` のファイル一式を安全な場所にもバックアップしてください。** このフォルダー自体を Git や Releases に追加したり、チャットへ貼り付けたりしないでください。鍵とパスワードを失うと、既存ユーザー向けに同じ署名で更新を発行できなくなります。毎回作り直す必要はありません。再実行時は既存鍵を再利用し、設定済みの公開鍵と異なる鍵への変更は拒否します。

この署名は Tauri の更新ファイル検証用です。Windows の発行元表示を認証するコード署名とは別です。

## 3. GitHub に 2 つの Secrets を設定する（初回のみ）

[リポジトリの Actions Secrets 設定](https://github.com/Ryoran-ran/React-Tauri-household/settings/secrets/actions) を開きます。

`Settings → Secrets and variables → Actions → New repository secret` から次を登録してください。ファイル名やパスではなく、**ファイルの中身**を値として貼り付けます。

| Name | Secret に貼り付ける内容 |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | `.local-secrets/updater.key` の中身全体 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | `.local-secrets/updater-password.txt` の中身全体 |

メモ帳などでファイルを開いてコピーできます。`GITHUB_TOKEN` の手動登録は不要です。

## 4. コードを保存して最初のタグを push する

`docs/RELEASE_NOTES.md` が今回の変更内容になっていることを確認してください。この本文は配布ページとアプリの更新案内に使用されます。

```powershell
git status --short
git add .
node scripts/check-release.mjs
npm.cmd test
git diff --cached --stat
```

検証が成功し、意図したファイルだけがステージされていることを確認してから実行します。検証が失敗した場合は、表示された設定を修正してやり直してください。

```powershell
git commit -m "Add signed updates and Windows releases"
git push -u origin HEAD
git tag v0.10.0
git push origin v0.10.0
```

`HEAD` は現在の作業ブランチです。実装時のブランチは `fix/download-20260912` でした。普段 PR で main に取り込む運用なら、先に PR をマージし、更新した main 上でタグを作成してください。**タグを付けたコミットの内容が配布されます。** すでに同名のタグを公開している場合は上書きせず、新しいバージョンを使ってください。

## 5. 下書きリリースを確認して公開する

1. [Actions](https://github.com/Ryoran-ran/React-Tauri-household/actions) の **Release Windows** が成功するまで待ちます。初回は Rust のビルドに時間がかかります。
   ビルドしたインストーラーの署名が、アプリに設定した公開鍵と一致することも自動検証します。
2. [Releases](https://github.com/Ryoran-ran/React-Tauri-household/releases) にできた **HIBI v0.10.0 / Draft** を開きます。
3. Assets に以下があることを確認します。
   - `HIBI-setup.exe`：利用者向けの固定ファイル名。
   - バージョン名付きの `…_0.10.0_x64-setup.exe`：アプリ内更新が取得するインストーラー。
   - 対応する `.sig`：更新用署名。
   - `latest.json`：バージョン・更新案内・取得先・署名を含む更新情報。
4. インストーラーをダウンロードし、起動と既存データの表示を確認します。最初の手動更新前は旧アプリを終了し、`%APPDATA%\jp.hibi.kakeibo` フォルダーを別の場所にコピーしておくと復元できます。
5. 変更内容を確認し、プレリリースにせず **最新リリース（Latest）** として **Publish release** を押します。

Draft のままでは一般のダウンロードとアプリ内更新には出ません。Actions の途中失敗で Draft が残る場合も、全工程の成功を確認してから公開してください。

公開後のダウンロード先：

- [最新版の配布ページ](https://github.com/Ryoran-ran/React-Tauri-household/releases/latest)
- [Windows インストーラー HIBI-setup.exe](https://github.com/Ryoran-ran/React-Tauri-household/releases/latest/download/HIBI-setup.exe)

この URL は最初のリリース公開後に有効になります。専用のダウンロードサイトは不要です。

## 6. 最初の 1 回は手動でインストールする

v0.9.0 以前には更新機能がありません。また、今回ローカルで作成した v0.10.0 は公開鍵未設定の確認用ビルドです。

**初回は、上記の鍵設定後に GitHub Actions が生成した `HIBI-setup.exe` をインストールしてください。** 今後は「設定 → アップデート → 更新を確認 → 更新する」で新しい版へ更新できます。最新版と同じバージョンなら「現在のバージョンは最新です」と表示します。

アプリの識別子と SQLite の保存先は従来と同じです。既存アプリのアンインストールやデータ削除は不要です。複数の HIBI を起動している場合、更新に使う 1 つ以外は終了してください。

## 7. 次のバージョンを公開する

例として v0.10.1 を公開する場合です。公開済みのタグやファイルは置き換えず、バージョンを上げてください。署名鍵は同じものを使用します。

```powershell
node scripts/set-version.mjs 0.10.1
```

`package.json`、`package-lock.json`、Tauri 設定、Cargo のバージョンをまとめて更新します。次に `docs/RELEASE_NOTES.md` を今回の変更内容に書き直します。

```powershell
npm.cmd test
npm.cmd run build
cargo test --manifest-path src-tauri/Cargo.toml --locked --lib
git add .
node scripts/check-release.mjs
git diff --cached --stat
git commit -m "Release v0.10.1"
git push origin HEAD
git tag v0.10.1
git push origin v0.10.1
```

再び手順 5 で下書きを確認して公開します。変更後に実機で更新を検証するときは、設定済みの旧版から新しい版へ更新し、再起動後のバージョンと登録済みデータを確認してください。

配布ページの本文を後から編集しても、既に生成した `latest.json` の更新案内は変わりません。アプリにも表示する内容はタグ作成前に `docs/RELEASE_NOTES.md` に記入してください。

## バックアップとデータの扱い

- 更新確認はボタンを押したときだけ行います。起動時の自動更新や自動インストールはありません。
- 更新時は GitHub の更新情報とインストーラーを取得し、署名を検証します。収支・メモ・SQLite は送信しません。
- 署名確認後、SQLite のオンラインバックアップを `backups/before-update-日時.sqlite3` に保存し、整合性を検証してからインストーラーを起動します。保存先は通常 `%APPDATA%\jp.hibi.kakeibo\backups` です。WAL に残っている記録も含みます。
- 「今すぐバックアップ」はアプリを開いたまま使えます。アプリ内更新以外の手動インストール前にも利用できます。
- 通信・署名・バックアップに失敗した場合はインストールを開始しません。画面で原因を確認し、再試行できます。
- 更新中の入力は停止し、Windows のインストーラー起動時にアプリが終了します。更新後は再起動します。
- 復元するときは HIBI をすべて終了し、現在のデータフォルダー全体を別の場所に保存してください。そのうえで元のデータフォルダーを退避し、同じ保存先に新しいフォルダーを作り、バックアップを `kakeibo.sqlite3` という名前で配置します。古い `-wal` / `-shm` を新しい SQLite と混在させないでください。以前のバックアップを開くときは、その版以降のアプリを使用します。

## ビルド・設定エラーの場合

| 状況 | 対応 |
| --- | --- |
| 「更新の配布準備中」 | 鍵設定後に作成した GitHub Actions のインストーラーを入れ直す |
| 配布ページや `latest.json` が 404 | リポジトリの公開範囲、Draft の公開、Latest の指定を確認 |
| 公開鍵未設定で検証失敗 | セットアップを実行し、変更された Tauri 設定をコミットして新しいタグを作る |
| 署名用 Secret がない | 手順 3 の名前と値を確認。ファイルパスではなく内容を設定 |
| インストーラー署名と公開鍵が不一致 | GitHub Secret と Tauri 設定が同じ鍵の組であるか確認。失敗した下書きは公開しない |
| タグとバージョンの不一致 | `set-version.mjs` で揃えてから対応するタグを作成 |
| 既存鍵と異なる・鍵を紛失 | 元の鍵とパスワードをバックアップから復元。安易に再生成しない |
| Actions の一時的な通信失敗 | Actions の失敗した実行から Re-run jobs。公開済みリリースは再実行しない |

署名や公開手順の参考：[Tauri Updater](https://v2.tauri.app/plugin/updater/)、[公式 tauri-action](https://github.com/tauri-apps/tauri-action)。

## 実装の検証範囲

ローカルでは Rust のバックアップテスト、フロントエンドのテスト、Windows 実機の更新画面を検証します。実機テストは分離した SQLite とループバックの HTTP サーバーを使用し、テスト用の鍵で署名した無害なファイルを本物の Tauri updater で検証します。改ざん・通信エラー・バックアップ失敗・再試行も対象です。テスト用の接続先変更とインストール直前の停止処理はデバッグビルド限定で、製品ビルドには含まれません。

GitHub 上での署名ビルド・公開と、公開済み旧版から新版へのインストール・再起動は、初期設定とリリース公開後に確認してください。通常の `scripts/dev.ps1 -Task build` はローカル確認用です。更新用署名付きの正式配布にはこの Actions を使用します。
