[en](README.md)

# ComfyGrid

[![Ko-fi](https://img.shields.io/badge/Ko--fi-F16061?style=flat-square&logo=ko-fi&logoColor=white)](https://ko-fi.com/nihedon)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy_Me_A_Coffee-FFDD00?style=flat-square&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/nihedon)

**注）現在はベータ版です。予期せぬ不具合や仕様変更が発生する可能性があります。**

<img width="1300" height="900" alt="Image" src="https://github.com/user-attachments/assets/b638556c-d29e-4c77-b7d0-294917159eab" />

<img width="1300" height="900" alt="Image" src="https://github.com/user-attachments/assets/8c03f760-fcc0-46f1-8b49-f5da1a017349" />

このアプリは ComfyUI(Portable版) と連携し、ComfyUI のウィジェットをグリッドレイアウトで配置・操作できるようにしたアプリケーションです。
UI の構成は Stable Diffusion WebUI に寄せています。

## 主な機能

ComfyUI のノード操作を1画面に集約し、ノードの接続を意識させること無く画像を生成できるようにすることを目的としています。

- **ウィジェットの自由配置:** 必要なノードのウィジェットのみを抽出し、グリッド上に配置できます。
- **モデル選択の可視化:** サムネイル一覧からの選択や、ドロップダウンリストのホバーによるサムネイル表示に対応しています。
- **進捗の可視化:** ComfyUI で現在実行中のノードおよび進捗状況を UI 上に表示します。
- **ComfyUI タブでの直接操作:** タブを切り替えることで、内蔵された ComfyUI 本体を直接操作することが可能です。

また、Stable Diffusion WebUI用に作られたdanbooruタグ補完拡張機能 `sd-webui-prompt-pilot` のComfyGrid版 `comfygrid-prompt-pilot` を導入しています。
※移植版はタグサジェスト機能が無効化されています。

`sd-webui-prompt-pilot` [https://github.com/nihedon/sd-webui-prompt-pilot](https://github.com/nihedon/sd-webui-prompt-pilot)

`comfygrid-prompt-pilot` [https://github.com/nihedon/comfygrid-prompt-pilot](https://github.com/nihedon/comfygrid-prompt-pilot)

### ComfyUI 機能の連携

ComfyUI 上で行える以下の基本操作は、ComfyGrid 上からも直接変更・反映が可能です。

- ノード／グループのリネーム
- ノード／グループのモード変更（通常、ミュート、バイパス）
- グループの色変更

## 動作環境

- OS: Windows
- ブラウザ: Chromium 系ブラウザ（Google Chrome, Microsoft Edge 等）
- 前提条件: ComfyUI 0.24.x (Portable版) が正常に動作すること

## 技術構成

- リバースプロキシとして [Caddy](https://caddyserver.com/) を内部で使用しています。これにより、本アプリケーションと ComfyUI の通信を単一のポートに統合しています。

## 起動手順（スタンドアロン版）

1. [Releases ページ](../../releases) より、最新の `ComfyGrid-vX.X.X.zip` をダウンロード
2. ダウンロードした Zip ファイルを展開
3. 展開したフォルダ内にある `comfygrid.exe` を実行
4. ブラウザで `http://127.0.0.1:6210/comfygrid/` を開く

※起動時にComfyUI (Portable) のスクリプトパスやPython情報を指定するセットアップ画面が表示されます。

<img width="500" height="500" alt="Image" src="https://github.com/user-attachments/assets/a112c110-839f-417d-bb0e-83a76b05d882" />

## 起動オプション（コマンドライン引数）

`comfygrid.exe` (または `main.py`) 実行時に以下の引数を指定できます。

| 引数                 | 説明                                                               | デフォルト値 |
| -------------------- | ------------------------------------------------------------------ | ------------ |
| `--port`             | ブラウザからアクセスする通信ポート（Caddy）を指定します。          | `6210`       |
| `--server-port`      | バックエンドAPIの内部用ポートを指定します。                        | `8000`       |
| `--log-level`        | ログ出力のレベルを指定します（`INFO`, `DEBUG` など）。             | `INFO`       |
| `--extension-update` | 起動時に ComfyGrid 用の ComfyUI 拡張機能を自動アップデートします。 | (なし)       |
| `--comfyui-args`     | ComfyUI 本体に渡す起動引数を文字列で指定します。                   | `""`         |

## バグ報告・フィードバック

不具合の報告や要望については、GitHub の Issues にて受け付けています。

## 支援・寄付 (Support)

開発を応援していただける方は、以下のリンクよりサポートしていただけると励みになります。

- [Ko-fi (nihedon)](https://ko-fi.com/nihedon)
- [Buy Me a Coffee (nihedon)](https://buymeacoffee.com/nihedon)
