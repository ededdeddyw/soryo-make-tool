# 収集日リマインド機能 設計メモ

最終更新：2026-06-20 ／ 作成：自走セッション

「ごみの収集日を忘れる」問題を解決し、同時に**アプリ化（特にApple審査）での“ネイティブである理由”**を作るための機能。本メモは方針・段階・技術・未決事項をまとめ、後続セッションが迷わず進められるようにする。

---

## 1. なぜやるか（目的）
- ユーザー価値：「出し忘れ」を防ぐ。処分ナビで「粗大ごみに出す」と判断した後の“次の一手”として自然。
- 戦略価値：Capacitorでアプリ化する際、Appleガイドライン4.2（ただのWebラッパーはリジェクト）対策になる。**ローカル通知＝ネイティブ機能**を持つことで「アプリである必然性」が生まれる。
- 思想との整合：本プロジェクトの方針は「推測値を載せない・出典明記」。**収集日データは自治体ごとにバラバラで陳腐化も早い**ため、**アプリ側で全国分を内蔵するのは（現時点では）やらない**。→ **ユーザー自身に自分の収集日を入力してもらう**方式を基本とする（＝データ正確性の責任を持てる範囲に限定）。

## 2. 段階（フェーズ）
作り切ってからアプリ、の順で進める（Web先行）。

### Phase 1 ―― Web / PWA で「カレンダー連携」（★今回実装）
- ユーザーが自分の収集日（ごみ種別×曜日 or 第N週）を入力。
- **`.ics`ファイル**を生成してダウンロード → iOS/Androidの標準カレンダーに取り込む → **OS標準のカレンダー通知が鳴る**。
- 加えて**Googleカレンダー追加リンク**も提供。
- 入力内容は**localStorage**に保存（端末内のみ・送信なし）。
- これだけで「ネイティブ通知に近い体験」がアプリ化前に手に入る。検証にも使える。
- 制約：Web/PWAの`.ics`は「一度カレンダーに入れる」操作が要る（プッシュではない）。十分実用的だが、能動的な通知ではない。

### Phase 2 ―― Capacitor でネイティブ・ローカル通知（アプリ化と同時）
- `@capacitor/local-notifications` で、入力済みスケジュールから**端末ローカル通知**を予約。
- サーバー不要（プッシュ配信基盤＝FCM/APNs不要）。ローカル通知なので**個人情報送信ゼロ**を維持できる。
- 通知例：「明日は🔥可燃ごみの日です」を前日20:00に。
- Phase 1のスケジュール入力UI・データ構造をそのまま流用（作り直さない）。

### Phase 3 ―― （任意・将来）主要自治体の収集日プリセット
- 「○○市○○地区を選ぶと曜日が自動入力」。ただし**地区単位でデータが膨大・改定頻繁**。コスト大なので需要が見えてから。
- やるなら出典・確認日を明記し、信頼度バッジ（既存のconf=high/medium/low方式）を流用。

## 3. データ構造（Phase1/2共通）
localStorageキー：`shobun-navi.reminders`（JSON配列）。1件＝1つのごみ種別の収集ルール。

```json
[
  {
    "id": "fire",
    "name": "可燃ごみ",
    "emoji": "🔥",
    "pattern": { "type": "weekly", "days": [2, 5] },
    "time": "08:00",
    "remindHoursBefore": 12
  },
  {
    "id": "oversize",
    "name": "粗大ごみ",
    "emoji": "🛋️",
    "pattern": { "type": "monthly", "weeks": [2], "day": 4 },
    "time": "08:00",
    "remindHoursBefore": 12
  }
]
```

- `pattern.type`:
  - `weekly`：`days`＝曜日配列（0=日,1=月,…,6=土）。毎週その曜日。
  - `monthly`：`weeks`＝第何週の配列（1〜5）、`day`＝曜日（0〜6）。例「第2木曜」。
- 日本の収集パターンの大半は「毎週（複数曜日）」＋「第N週の某曜日（資源・プラ・粗大）」で表現できる。隔週はPhase1では非対応（必要ならINTERVAL対応を追加）。

## 4. 次回収集日の計算（擬似コード）
```
matches(pattern, date):
  dow = date.getDay()
  if weekly:  return pattern.days.includes(dow)
  if monthly: return dow === pattern.day
                 && (floor((date.getDate()-1)/7)+1) in pattern.weeks   // 第N週
nextOccurrences(pattern, from, count):
  今日から1日ずつ進めて matches() を count 件集める（最大366日ループ）
```
第N週は「日付-1を7で割って+1」で算出（1日〜7日＝第1週…）。シンプルで正確。

## 5. .ics 生成の要点
- 文字コードUTF-8、改行は CRLF（`\r\n`）、行は75オクテットで折り返し（日本語が長い場合）。まずは折返し省略でも主要クライアントは読める。
- **時刻はフローティング（TZID無し・Z無し）**で出力：`DTSTART:20260623T080000`。VTIMEZONEブロックを書かずに済み、端末ローカル時刻として解釈される（全国どこでも「現地8:00」でOK）。
- 繰り返しは `RRULE`：
  - 毎週：`RRULE:FREQ=WEEKLY;BYDAY=TU,FR`
  - 第N週：`RRULE:FREQ=MONTHLY;BYDAY=2TH`（第2木曜）。複数なら `BYDAY=1WE,3WE`。
  - 曜日コード：SU MO TU WE TH FR SA。
- `DTSTART` は「今日以降の最初の該当日」をアンカーにする。
- 通知：`VALARM` + `TRIGGER:-PT12H`（イベント8:00の12時間前＝前日20:00）。
- 各ごみ種別を**別VEVENT**にして1つの.icsにまとめる → 1回の取り込みで全部入る。

```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//shobun-navi//gomi-reminder//JP
CALSCALE:GREGORIAN
BEGIN:VEVENT
UID:fire-0@shobun-navi
DTSTAMP:20260620T000000Z
DTSTART:20260623T080000
DURATION:PT30M
RRULE:FREQ=WEEKLY;BYDAY=TU,FR
SUMMARY:🔥 可燃ごみ（収集日）
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:🔥 可燃ごみの収集日
TRIGGER:-PT12H
END:VALARM
END:VEVENT
END:VCALENDAR
```

## 6. Googleカレンダー追加リンク（補助）
1件ずつのリンクを生成：
```
https://calendar.google.com/calendar/render?action=TEMPLATE
  &text=🔥 可燃ごみ（収集日）
  &dates=YYYYMMDDT080000/YYYYMMDDT083000
  &recur=RRULE:FREQ=WEEKLY;BYDAY=TU,FR
```
（各値はURLエンコード。`dates`は初回該当日。）

## 7. プラットフォーム別の挙動
- **iOS Safari**：`.ics`をタップ→「カレンダーに追加」プロンプト。PWA（ホーム追加）内でもダウンロード→カレンダーアプリへ。VALARMの通知はカレンダーアプリ経由で鳴る。
- **Android Chrome**：`.ics`はGoogleカレンダーのインポート画面へ。
- **PC**：Outlook/Apple Calendar/Googleいずれも取り込み可。
- いずれも**サーバー不要・データ送信なし**。

## 8. UX 方針（Phase1画面）
- 既存デザイン（緑アクセント・カード・プリセットタップ）を踏襲。
- ごみ種別はプリセット（可燃🔥／不燃🪨／プラ♻️／資源(缶びんペット)🥫／古紙📦／粗大🛋️／その他✏️）をタップで追加。
- 各行：曜日ボタン（日〜土トグル）＋「毎週／第N週」切替＋時刻（既定8:00）。
- 「次の収集日」を各行に表示（例：6/23(火)）。
- ボタン：「📅 カレンダーに追加（.ics）」＝全件まとめDL ／ 各行「Googleカレンダー」。
- 「測らずタップ」と同じ思想で、入力を最小に。
- 自治体の正確な収集日は各自治体公式で確認、の注記（思想に合わせる）。

## 9. プライバシー
- 全てクライアント内（localStorage）。送信なし。.icsは端末内生成・端末内ダウンロード。
- これは現行フッター「データは送信されません」を維持できる。

## 10. 未決事項 / TODO
- [ ] 隔週（INTERVAL=2）対応の要否（地域による）。
- [ ] 「祝日は収集休み」への対応（自治体差大。Phase1では非対応＝注記で逃す）。
- [ ] Phase2でCapacitor `@capacitor/local-notifications` のスケジューリング上限・再予約タイミング設計（OS再起動後など）。
- [ ] Phase3のプリセットデータをやるかの需要判断。
- [ ] .ics の行折返し（75オクテット）厳密対応が必要なクライアントが出たら追加。

---
### 進め方サマリ
**Phase1（Web .ics・今回着手）→ 手応え確認 → Phase2（Capacitorでネイティブ通知、アプリ化と同時）**。Phase1の入力UI・データ構造・計算ロジックはPhase2でそのまま流用するため、ここを丁寧に作ることが将来の近道になる。
