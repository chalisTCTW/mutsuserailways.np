光瀨都市鉄道 入口網站（靜態網站）
================================

【這是什麼】
純 HTML／CSS／JavaScript 的靜態網站，沒有後端，放到任何能放靜態檔案的地方就能用。
頁面：首頁（橫幅、選單、滾動廣告、時刻表查詢、運行情報、最新消息、路線圖）
      時刻表與班次/票價查詢（車站時刻表、乘車・轉乘查詢、票價查詢、路線圖）
      即時列車動態（拓樸路線圖＋依時刻表推算的列車位置）
      線上訂票、機場聯外交通（目前是「準備中」頁面）
      企業管理登入（選單右側，連到 ATOS）

【本機預覽】
不能直接雙擊 index.html（瀏覽器會擋讀取 JSON）。在這個資料夾開終端機：
    python -m http.server 8000
再開 http://localhost:8000/

【發布到 GitHub（最簡單的流程，只做一次）】
 1. 登入 github.com → 右上「＋」→ New repository。名稱隨意（例：hikarise-railways），選 Public，按 Create repository。
 2. 在新倉庫頁面按「uploading an existing file」，把這個資料夾「裡面的所有檔案與資料夾」（不是外面那層資料夾）拖進去，
    按 Commit changes。（資料夾很多時，可先把 zip 解壓縮再整批拖曳。）
 3. 倉庫 Settings → 左側 Pages → Source 選「Deploy from a branch」→ Branch 選 main、資料夾 / (root) → Save。
 4. 等 1～2 分鐘，網址是  https://你的帳號.github.io/倉庫名/  （Pages 頁面頂端會顯示）。
之後更新網站：直接在倉庫網頁上傳覆蓋檔案即可；時刻表資料則交給下面的「自動回傳」。
（想用自己的網域或 Cloudflare Pages 也行：連同一個 GitHub 倉庫即可。）

【時刻表資料：ATOS 自動回傳（0.16.0 起）】
資料檔是 data/snapshot.json（與 ATOS 網頁「下載路網快照」同一格式）。ATOS 0.16.0 會自動把它寫進倉庫：
 進世界約 3 分鐘後、之後每 12 小時、離開世界前各一次；路網沒變就不傳。
設定一次即可（在遊戲那台電腦的 config/hikarise_atos.properties 加上）：
    publish.repo=你的帳號/倉庫名
    publish.token=（下面取得的 token）
 取得 token：GitHub 右上頭像 → Settings → Developer settings → Personal access tokens → Fine-grained tokens →
 Generate new token → Repository access 選「Only select repositories」只勾這個倉庫 →
 Permissions → Repository permissions → Contents 選「Read and write」→ Generate，複製貼上。
 （token 等於這個倉庫的寫入密碼，不要貼到公開的地方；只給這一個倉庫權限是為了就算外流也傷不到別的。）
遊戲內指令：/atos publish reload（改完設定檔後讀取）、/atos publish now（立刻傳）、/atos publish（看狀態）。
資料更新後，GitHub Pages 約 1～2 分鐘內重新發布。

手動更新（沒有用自動回傳時）：ATOS 網頁頁尾下載路網快照 → 改名 snapshot.json → 覆蓋 data/snapshot.json 上傳。
路線圖版面：每次載入網頁時即時計算；若想固定版面並減少計算，可在本機執行  node tools/build-layout.js  產生 data/layout.json
（路網車站有增減時，舊的 layout.json 會自動作廢，不會卡住新路網）。
目前附的 snapshot.json 是 10/13 的舊存檔資料，只是範例；第一次自動回傳成功後就會被取代。

【設定】assets/js/site-config.js
 - atosUrl：「企業管理登入」要開啟的位址。ATOS 在遊戲那台電腦上跑，只有那台（或同區網）打得開。
 - tzOffsetSec：網站顯示的時區（台灣 8*3600、日本 9*3600）。
 - fareBase／fareStep：起步票價 290、每跨一個分區 +200。
 - zoneOverride：車站分區。票價依「遊戲內車站的分區欄位」計算；若遊戲內沒設，可在這裡寫
   { 'みつせ': 1, '谷山': 2 }。所有車站都沒有分區時，任何區間都是起步票價 290。

【最新消息】data/news.json（日期與內容目前是範本，請自行修改）。

【路線圖】
自動由路網產生，只用橫、直、45 度的線。若某站位置不滿意，改 data/layout.json 裡該站的 [x, y]。
路線一律用白與綠表現；識別圖上的六色塊沒有用在班次或路線上。

【素材】assets/img：logo-dark／logo-light（深底用／淺底用）、mark-dark／mark-light（只有鶴）。
識別圖副標已修正為 HIKARISE RAILWAYS；網站左上的識別圖是深色版直接放在橫幅照片上（沒有白底面板）。

【已知限制（誠實說明）】
 - 只用 10/13 的舊存檔資料與 Chromium 做過測試，沒有在其他瀏覽器、真實手機上實測。
 - 「即時列車動態」是依時刻表推算，不是遊戲內車輛的真實位置。
 - 路線圖為自動排版，站數變多或路網變複雜時，可能需要手動微調 layout.json。
