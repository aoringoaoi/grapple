# Grapple MVP (Three.js + Rapier)

Three.js と Rapier で作った、ブラウザで遊べる 3D ワイヤーアクションの最小実装です。

## 構成

- `index.html` - import map と HUD を含むエントリ
- `style.css` - 画面全体キャンバス + HUD スタイル
- `main.js` - シーン生成、物理、移動、グラップル、カメラ追従

## 操作

- `WASD`: 移動（地上で強く、空中で弱く効く）
- `Space`: ジャンプ
- `左クリック長押し`: ビルへのグラップル接続
- `左クリックを離す`: グラップル解除
- `マウスホイール`: ロープ巻き取り / 繰り出し

## ローカル起動（ビルド不要）

`file://` 直開きはブラウザ設定で ES Modules/CORS に引っかかることがあるため、簡易サーバを推奨します。

```bash
python3 -m http.server 4173
```

ブラウザで `http://localhost:4173` を開いてください。

## GitHub Pages 公開手順

このプロジェクトは静的ファイルのみなので、そのまま Pages 配信できます。

1. GitHub へ push
2. リポジトリの **Settings → Pages** を開く
3. **Build and deployment** の **Source** を `Deploy from a branch` に設定
4. Branch を `main`（または配信したいブランチ） / Folder を `/ (root)` に設定して保存
5. 数分待つと `https://<user>.github.io/<repo>/` で公開

> もし `main` 以外のブランチで運用するなら、そのブランチを Pages 対象にしてください。

## 実装メモ

- 物理は Rapier の固定ステップ（60Hz）
- グラップルは「ロープ長を超えた分だけ」ばね + ダンパ力で引き戻す方式
- ロープは `THREE.Line` でアンカー点からプレイヤーまで可視化
- 三人称カメラは速度に応じて後退距離を可変し、`lerp` でスムーズ追従
