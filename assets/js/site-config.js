/* 入口網站設定（可自行修改）。 */
window.HK_CONFIG = {
  // 「企業管理登入」要開啟的 ATOS 網址。ATOS 在遊戲所在的電腦上執行；預設只有那台電腦（或同一區域網路）打得開。
  atosUrl: 'http://127.0.0.1:8888/hikarise/app/',
  // ATOS 運作狀態（「企業管理登入」頁）：ATOS（遊戲內）定期把狀態寫到這個倉庫的獨立分支，本站讀它判斷是否上線。
  atosStatus: { repo: 'chalisTCTW/mutsuserailways.np', branch: 'atos-status', path: 'status.json', onlineWithinSec: 180, pollSec: 60 },
  // 一直可用的既有連結（例：Tailscale）。偵測不到位址、或關閉了位址回報（heartbeat.ips=off）時，網頁仍會顯示這個按鈕。
  atosFixedUrls: [{ label: 'Tailscale（外出也能用）', url: 'http://100.98.63.88:8888/hikarise/app/', kind: 'phone' }],
  // 網站顯示用的時區（秒）。台灣＝8*3600、日本＝9*3600。
  tzOffsetSec: 8 * 3600,
  // 票價：起步票價與每跨一個分區的加算（円）
  fareBase: 290,
  fareStep: 200,
  // 1.1.0：高速鐵路（routeType＝HIGH_SPEED）獨立票價：每跨一個分區 hsFareStep 円、指定席特急券固定 hsSeatFee 円
  // （不打折、沒有立席特急券）；8 輛編組（hsCars），1・8 号車（車頭／車尾）各只有 hsEdgeCarSeats 席。
  hsFareStep: 800,
  hsSeatFee: 800,
  hsCars: 8,
  hsEdgeCarSeats: 8,
  // 1.1.0：票價查詢・車站時刻表・乘車轉乘查詢三個頁面的「高速鉄道」欄位識別色。
  hsColor: '#136880',
  // 1.2.4：車票（乗車券＋特急券）の票面。'A'＝硬券・指定券風、'B'＝識別色・Web 票卡（預設）、'C'＝券売機・感熱紙風。決定後は這一個字母改成想要的樣式即可。
  ticketStyle: 'A',
  // 1.2.4：高速鐵路↔一般鐵路必須轉乘時，「一般鐵路最短・高速鐵路最長」的路徑優先——只在到達時間相差這麼多秒以內的方案之間比較（預設 900＝15 分鐘）。
  hsPreferTolSec: 900,
  // 1.1.0：万瀨高速鉄道線「地圖外」的假想延伸——純粹是設定，不是遊戲內真正存在的站，
  // 不會進地圖、不會進拓樸、完全不影響真正車次的判斷與運作；只用在高速鉄道自己的票價／路線查詢欄位，
  // 讓玩家可以先查到之後會通到的站、方面與票價（前輩指定的資料）。
  hsExt: {
    real: ['新勝守', '新光瀨', '東平倉'],      // 目前地圖內的實際路線順序
    afterZh: '東平倉',                         // 地圖外延伸從這一站接續
    towardLabel: '東平倉・新岩沢',             // 往東平倉方向的列車，車站時刻表的「方面」固定顯示這個（反方向不套用）
    // 1.1.2：en 是英文版（lang=en）站名選單・票價查詢・查票頁會用到的羅馬拼音，跟地圖內車站一樣是「XX|EN-NAME」的大寫慣例
    // （參考東平倉＝TOHEKURA、新勝守＝SHIN-KATSUMORI）。這三站是前輩自訂的地圖外延伸站，不在遊戲匯出的資料裡，
    // 這裡先依讀音規律暫定拼音，不確定的地方（尤其「花宮天照」）前輩可以直接改這裡，改完重新整理網頁就會套用。
    stops: [
      { zh: '花宮天照', en: 'HANAMIYA-TENSHO', km: 48.6, min: 18 },                  // 與前一站（東平倉）同一收費區
      { zh: '豐守', en: 'TOYOMORI', km: 51.3, min: 20, zoneBoundary: true },         // 東平倉—豐守算一個收費區
      { zh: '新岩沢', en: 'SHIN-IWASAWA', km: 23.1, min: 12, zoneBoundary: true },   // 豐守—新岩沢算另一個收費區
    ],
  },
  // 遊戲內車站沒有設定「分區」時，可在這裡補（車站中文名稱: 分區編號）。例：{ 'みつせ': 1, '谷山': 2 }
  zoneOverride: {},
  // 車站編碼的顏色（依編碼開頭字母；用路線色）。沒列出的編碼用灰色。可自行修改。
  codeColors: { H: '#429769', M: '#6b7280', L: '#57125e', S: '#e74f84', KU: '#00a6e0', MTS: '#17202b' },
};
