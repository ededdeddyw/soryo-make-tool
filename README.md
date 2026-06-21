# 送料負け判定ツール / 処分ナビ（MVP）

フリマ出品前に「売る価値があるか（送料負けしないか）」を判定し、さらに「売る・譲る・捨てる」をアキネーター式の質問で案内するローカルWebツール。メルカリ送料計算＋自治体ごみルール付き。単一HTML・ビルド不要・オフライン可・データ送信なし。

## ファイル
- **index.html** … 処分ナビ（①質問で判定 ②自治体ごみルール ③メルカリ送料計算）。メインの入口。
- **soryo-tool.html** … 送料負け判定ツール単体（③だけの集中版）。index と相互リンク。
- **reminder.html** … ごみ収集日リマインド。**東京23区は区・地区（丁目）を選ぶと公式データから収集日を自動入力**（現在は品川区・港区を内蔵、他区は順次／未対応は公式リンク誘導）。手動入力も可。通知付き`.ics`生成＋Googleカレンダー追加。設定は端末内（localStorage）保存・送信なし。
- **data/gomi/＜区コード＞.json** … 区ごとの収集日データ（13109＝品川区、13103＝港区。公式データから生成）。reminder.html が選択時に読み込む。
- **scripts/build-gomi.js** … 品川区JSONの生成（公式オープンデータCSVを取得・解析）。`node scripts/build-gomi.js` で再生成。
- **scripts/build-gomi-minato.mjs** ＋ **lib-minato-pdf.mjs** ＋ **minato-map.json** … 港区JSONの生成。港区はCSVが無くPDFカレンダー（令和8年度版・15スケジュール）のため、pdfjsで座標解析し収集曜日を抽出。`npm i pdfjs-dist` 後に `node scripts/build-gomi-minato.mjs`。出力JSONはコミット済みでサイト実行時は不要。
- **manifest.json / sw.js / icon-*.png / icon.svg** … PWA関連（ホーム追加・オフライン・アイコン）。
- **docs/reminder-design.md** … 収集日リマインドの設計メモ（Phase1=Web .ics〔実装済〕→Phase2=Capacitorネイティブ通知）。

## 使い方（非エンジニア向け）
- `index.html` をダブルクリック → ブラウザ（Chrome等）で開く。更新は F5。
- ネット不要・個人情報なし。

## 重要な仕様・データ
- **メルカリ料金**：2026年6月時点の目安（出典：メルカリ公式コラム jp-news.mercari.com/contents/1882）。販売手数料10%。料金は各HTMLの `SMALL`/`TAKKYU`/`YUPACK` 定数を書き換えれば更新可能。
- **発送方法**：ゆうパケットポストmini／ネコポス／ゆうパケットポスト／ゆうパケット／宅急便コンパクト／ゆうパケットプラス＋宅急便・ゆうパック。厚さ・3辺合計・重量・専用箱の規格チェックで「使える方法」を自動判定し最安を採用。理由（長辺◯cm超 等）も表示。
- **自治体ごみルール**：東京23区＋政令指定都市20市（札幌・仙台・さいたま・千葉・横浜・川崎・相模原・新潟・静岡・浜松・名古屋・京都・大阪・堺・神戸・岡山・広島・北九州・福岡・熊本）を内蔵。各市公式で確認（2026年6月）。それ以外は公式ページ検索リンクで全国カバー。信頼度バッジ conf=high/medium/low（静岡=low：公式に数値記載なし／新潟・京都・神戸=medium）。
- **思想**：推測値を載せない・出典と更新日を明記・推定と確認済みを区別。

## これまでの意思決定
- 元の単体ツール（soryo-tool.html）は残し、処分ナビ（index.html）を追加。
- 自治体の作り込みは「20市＋全国公式リンク」で確定（全1,741自治体はコスト大・陳腐化リスクで見送り）。
- UX：サイズは測らず「目安プリセット」タップで入力。結果に「いちばん安い送り方」を大きく表示。質問は具体例つき・タップ領域を拡大。

## 公開URL（GitHub Pages・公開済み）
- 処分ナビ（メイン）: https://ededdeddyw.github.io/soryo-make-tool/
- 送料負け判定ツール（単体）: https://ededdeddyw.github.io/soryo-make-tool/soryo-tool.html
- リポジトリ: https://github.com/ededdeddyw/soryo-make-tool
- 更新方法：ファイルを編集 → `git add -A && git commit && git push` → 数十秒でサイトへ自動反映。
- 公開向けに各HTMLへ `meta description`／OGタグ（リンク共有時のプレビュー）／favicon／theme-color を追加済み。

## PWA対応（ホーム追加・オフライン）
- `manifest.json`＋`sw.js`（Service Worker）＋アイコン（`icon-192/512.png`・`icon-180.png`＝iOS用・`icon.svg`）を追加済み。
- スマホで公開URLを開き「ホーム画面に追加」すると、全画面・オフラインで起動するアプリ風に。アイコンはブランドのキューブ（緑地に白）。
- アイコンは依存ゼロのNodeスクリプトで自前生成（lucide box をラスタライズ）。Service WorkerはHTTPS/localhostでのみ有効（file://直開きでは無効だが、その場合もツール自体は動く）。
- 更新を確実に反映するには、ファイル変更時に `sw.js` の `CACHE` を `v1→v2…` と上げる。

## ネイティブ化ロードマップ（将来）
- 方針：Web→**PWA**（実装済み）→**Capacitorでストア配信**（今の単一HTML資産を再利用、フル再開発は不要）。
- Apple審査の注意：ただのWebラッパーは「ガイドライン4.2」でリジェクトされやすい。差別化＆審査対策として「ごみ収集日のローカル通知（ネイティブ通知）」の追加が有効。
- 収集日リマインドは **Phase1（Web版・.icsでカレンダー登録）を実装済み**（reminder.html）。Phase2でこの入力UI/データ構造をそのまま流用し、Capacitor `@capacitor/local-notifications` でネイティブ通知化する。詳細は **docs/reminder-design.md**。
- 費用目安：Apple Developer 年$99／Google Play 一回$25。

## 収益導線（アフィリエイト準備済み）
- 外部リンクは index.html の `LINKS` 定数（script冒頭）に集約済み。jmty／kaitori／recycle_shop／gyosha のURLを各ASP（A8.net・もしも 等）の広告URLに差し替えるだけで画面の該当リンク全てに反映。
- 空文字 '' のままなら「Googleで探す」検索リンクを自動生成（現状の既定）。架空の提携リンクは未設定（実IDの登録が必要）。

## 次の候補
- 上記 `LINKS` に実際のアフィリエイト広告URLを登録（ASP審査・提携が前提）。
- 都市追加：中核市など（1市あたり約2.4万トークンの調査コスト）。
- カスタムドメイン化や Netlify への移行（必要なら）。

---
このREADMEは、新しいClaude Codeセッションでこのフォルダを開いたときに状況を引き継ぐためのメモです。
