/* 共通エンジンデータ（index.html ③ と soryo-tool.html で共有）
   メルカリ料金表＋梱包資材アフィリ設定。料金の更新やアフィリ設定はここ1か所でOK。
   出典：メルカリ公式コラム jp-news.mercari.com/contents/1882・2026年6月時点の目安。
   ※ 各HTMLより前に読み込むこと（<script src="engine.js"></script> を先に置く）。 */
const FEE_RATE=0.10, LOW_PROFIT=300;
const SMALL=[
  {name:'ゆうパケットポストmini', svc:'ゆうゆう', ship:160, mat:20, matLabel:'専用封筒20円', note:'専用封筒21×17cm・ポスト投函・2kg', limits:{long:21, mid:17, thick:3, w:2000}},
  {name:'ネコポス',            svc:'らくらく', ship:210, mat:0,  matLabel:'',          note:'角形A4(31.2×22.8)・厚さ3cm・1kg', limits:{long:31.2, mid:22.8, thick:3, w:1000}},
  {name:'ゆうパケットポスト',    svc:'ゆうゆう', ship:215, mat:5,  matLabel:'発送用シール5円', note:'ポスト投函・3辺60cm・厚さ3cm・2kg', limits:{long:34, thick:3, sum:60, w:2000}},
  {name:'ゆうパケット',         svc:'ゆうゆう', ship:230, mat:0,  matLabel:'',          note:'3辺60cm・長辺34cm・厚さ3cm・1kg', limits:{long:34, thick:3, sum:60, w:1000}},
  {name:'宅急便コンパクト',      svc:'らくらく', ship:450, mat:70, matLabel:'専用BOX70円', note:'専用BOX2種・厚さ5cmまで・重量制限なし', boxes:[{long:25, mid:20, thick:5},{long:34, mid:24.8, thick:2}]},
  {name:'ゆうパケットプラス',    svc:'ゆうゆう', ship:455, mat:65, matLabel:'専用箱65円', note:'専用箱24×17×7cm・厚さ7cm・2kg', limits:{long:24, mid:17, thick:7, w:2000}},
];
const TAKKYU=[{size:60,max:2000,price:750},{size:80,max:5000,price:850},{size:100,max:10000,price:1050},{size:120,max:15000,price:1200},{size:140,max:20000,price:1450},{size:160,max:25000,price:1700},{size:180,max:30000,price:2100},{size:200,max:30000,price:2500}];
const YUPACK=[{size:60,price:770},{size:80,price:870},{size:100,price:1070},{size:120,price:1200},{size:140,price:1450},{size:160,price:1700},{size:170,price:1900}];
const YUPACK_MAXW=25000;
/* 梱包資材アフィリ：Amazonアソシエイト等のタグを入れると全資材リンクに付与される */
const AFFILIATE = { amazonTag:'' };
