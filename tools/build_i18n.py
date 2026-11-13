import json,re,sys
import os
HERE=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,HERE)
from t1 import T1
from t2 import T2
from t3 import T3
from t4 import T4, EXTRA
S=list(json.load(open(os.path.join(HERE,'strings.json'),encoding='utf-8')).keys())
out={}
def norm(s): return re.sub(r'\s+',' ',s).strip()
def nph(k):
    n=0;i=0
    while i<len(k):
        if k.startswith('${',i):
            d=1;i+=2
            while i<len(k) and d:
                d+= (k[i]=='{') - (k[i]=='}'); i+=1
            n+=1
        else: i+=1
    return n
bad=0
for T in (T1,T2,T3,T4):
    for idx,ja,en in T:
        k=S[idx]; n=nph(k)
        for v in (ja,en):
            used=set(int(x) for x in re.findall(r'\{(\d+)\}',v))
            if used and max(used)>=max(n,1) and n==0:
                print('PLACEHOLDER?',idx,k[:40],v[:50]); bad+=1
            elif used and max(used)>=n and n>0:
                print('RANGE',idx,k[:40],n,v[:60]); bad+=1
        out[norm(k)]=[ja,en]
for k,ja,en in EXTRA: out[norm(k)]=[ja,en]
# 補充：程式裡巢狀拼接、無法由自動擷取得到的字串，以及營運狀況列用的字串
MORE={
"不需轉乘":["乗り換えなし","No transfer"],
"（翌日）":["（翌日）","(next day)"],
"營運狀況":["運行情報","Service status"],
"ATOS 運行情報":["ATOS 運行情報","ATOS service status"],
"全線平常運轉":["全線で平常運転です","Normal service on all lines"],
"部分路線發生延誤":["一部の路線で遅れが出ています","Delays on some lines"],
"有列車停車中":["停車中の列車があります","Some trains are stopped"],
"目前沒有運行中的列車":["現在、運行中の列車はありません","No trains are running right now"],
"目前沒有即時資料（ATOS 未連線）":["現在、リアルタイム情報はありません（ATOS未接続）","No real-time information right now (ATOS not connected)"],
"誤點 ${n} 班":["遅延 {0} 本","{0} delayed"],
"停車 ${n} 班":["停車 {0} 本","{0} stopped"],
"最長 ${m} 分":["最大 {0} 分","max {0} min"],
"更新 ${t}":["{0} 更新","Updated {0}"],
"詳細":["詳細","Details"],
"ATOS 系統運作中":["ATOSシステム稼働中","ATOS system running"],
"環状快速":["環状快速","Circular Rapid"],
"特急LINER":["特急LINER","Limited Express LINER"],
"乘車券以出發站～抵達站全程的最短路徑計算一次：${p}":["乗車券は出発駅から到着駅までの最短経路で1回計算します：{0}","The fare ticket is calculated once on the shortest route from origin to destination: {0}"],
"指定席 ${a}／位":["指定席 {0}／席","Reserved seat {0}/seat"],
"指定席 ${a}／位（空席不足）":["指定席 {0}／席（空席不足）","Reserved seat {0}/seat (not enough free seats)"],
"立席特急券 ${a}／位（座位なし）":["立席特急券 {0}／名（座席なし）","Standing express ticket {0}/person (no seat)"],
"計算所用的路徑：${p}":["計算に使った経路：{0}","Route used for calculation: {0}"],
"Tailscale（外出也能用）":["Tailscale（外出先でも利用可）","Tailscale (works away from home)"],
"• 狀態每 ${n} 秒自動更新；ATOS 每分鐘回報一次，超過 ${m} 分鐘沒有回報就視為未上線。":["• 状態は {0} 秒ごとに自動更新します。ATOSは毎分報告し、{1} 分間報告がなければオフラインとみなします。","• Status refreshes automatically every {0} s. ATOS reports every minute; if no report arrives for {1} min it is treated as offline."],
"日本語":["日本語","日本語"],
"中文":["中文","中文"],
# 1.1.0：万瀨高速鉄道線——票價查詢・車站時刻表・乘車轉乘查詢三個頁面新增的「高速鉄道」欄位與獨立票價查詢。
"高速鉄道":["高速鉄道","High-Speed Rail"],
"高速":["高速","High-speed"],
"只顯示高速鉄道的班次":["高速鉄道の列車のみ表示","Show high-speed rail trains only"],
"這個車站目前沒有高速鉄道的班次。":["この駅には現在、高速鉄道の列車はありません。","There are currently no high-speed rail trains at this station."],
"可以利用高速鐵路":["高速鉄道を利用する","Allow high-speed rail"],
"出發站（高速鉄道）":["出発駅（高速鉄道）","Origin station (high-speed rail)"],
"抵達站（高速鉄道）":["到着駅（高速鉄道）","Destination station (high-speed rail)"],
"計算高速鉄道票價":["高速鉄道の運賃を計算","Calculate high-speed rail fare"],
"這兩站之間查不到高速鉄道的票價。":["この2駅間の高速鉄道の運賃は見つかりません。","No high-speed rail fare could be found between these two stations."],
"跨越分區 ${a}　約 ${b} km":["またぐ区 {0}　約{1}km","Zones crossed {0}　about {1} km"],
"万瀨高速鉄道線　獨立票價查詢":["万瀨高速鉄道線　単独運賃検索","Mutsuse High-Speed Rail — Separate Fare Lookup"],
"万瀨高速鉄道線的票價不套用一般鐵路的分區運費制度：每跨越一個收費區加 ${a}，指定席特急券固定 ${b}（不打折、沒有立席特急券）。站名含地圖外的延伸路段（標示「*高速鉄道」），一樣可以在這裡查票價。":["万瀨高速鉄道線の運賃は一般の鉄道の分区制とは異なります：収費区を1つ越えるごとに {0} 加算、指定席特急券は {1} 固定（割引なし、立席特急券もありません）。駅名には地図外の延伸区間（「*高速鉄道」の表示）も含み、こちらで運賃を調べられます。","Mutsuse High-Speed Rail fares don't follow the ordinary zone-fare system: {0} is added for each fare zone crossed, and the reserved-seat express fee is a flat {1} (no discount, no standing-ticket option). The station list includes the extension beyond the current map (marked \"*High-Speed Rail\"), which you can look up here too."],
"指定席特急券（全車指定席，沒有立席特急券）":["指定席特急券（全車両指定席、立席特急券なし）","Reserved-seat express fee (all cars reserved, no standing-ticket option)"],
# 1.1.2：延伸段已經通車，站選單只用「*高速鉄道」標記，不再用「假想／未開業」這類字眼。
"可以利用高速鐵路（含延伸路段）":["高速鉄道を利用する（延伸区間を含む）","Allow high-speed rail (including the extension)"],
"万瀨高速鉄道線延伸段":["万瀨高速鉄道線　延伸区間","Mutsuse High-Speed Rail — Extension"],
"万瀨高速鉄道線的延伸段尚未設定銜接的車站，無法查詢。":["万瀨高速鉄道線の延伸区間は接続駅が未設定のため、検索できません。","The Mutsuse High-Speed Rail Line's extension has no connecting station set, so it can't be searched."],
"万瀨高速鉄道線的延伸段尚未設定銜接的車站，無法訂票。":["万瀨高速鉄道線の延伸区間は接続駅が未設定のため、予約できません。","The Mutsuse High-Speed Rail Line's extension has no connecting station set, so it can't be booked."],
"這兩站之間查不到可以合併計算的高速鉄道延伸段票價。":["この2駅間の高速鉄道延伸区間の運賃は見つかりません。","No combined high-speed rail extension fare could be found between these two stations."],
"這兩站之間查不到高速鉄道的班次。":["この2駅間の高速鉄道の列車は見つかりません。","No high-speed rail service could be found between these two stations."],
"本券為模擬發行，不會儲存。":["本券はシミュレーション発行で、保存されません。","This ticket is a simulated issue and is not saved."],
# 1.1.2：全站翻譯補完（前輩反映「整個網站許多地方的翻譯沒有完善」）——這批是實際走過 ja／en 兩種語言、
# 逐頁掃出畫面上還留著原文中文（或日文假名以外漢字）殘留的地方，依頁面分類列在下面。
# 調度狀態（運行情報）：site.js 是含「約每 N 班行駛 N 班」比例的長版，pages2.js／pages3.js 是不含比例的短版；
# 兩種版本各自都有 4 種狀態（日中／離峰／深夜／收車），離峰・深夜・收車都已有翻譯，獨缺「日中」這個最常見的狀態。
"目前採用日中時段班次，部分列車停駛（約每 3 班行駛 2 班）。":["現在、日中時間帯のダイヤで運転しており、一部の列車は運休です（約3本に2本が運転）。","The midday timetable is in effect and some trains are not running (about two in three runs)."],
"目前採用日中時段班次（部分列車停駛）。":["現在、日中時間帯のダイヤで運転しています（一部列車は運休）。","Midday timetable in effect (some trains are not running)."],
# 列車・路線的展示名稱：遊戲內匯出的資料本身沒有填英文名稱（net.routes 的 name 欄位 en 區段是空的），
# 這個網站一直以來是用這份字典手動補英文名稱（可比對既有的「特急あおさぎ」「特急こばな」「花川本線特別快速」），
# 這幾個目前還沒人補過。
"特急スーパーこばな":["特急スーパーこばな","Limited Express Super Kobana"],
"花川本線特別快速松歲線直通":["花川本線特別快速松歲線直通","Hanakawa Main Line Special Rapid — through service to the Matsutoshi Line"],
"花川本線松歲線直通":["花川本線松歲線直通","Hanakawa Main Line — through service to the Matsutoshi Line"],
# 訂票頁（booking.html）的兩段說明文字，之前完全沒有翻譯項目。
"特急為全車指定席（也有半價的立席特急券）；特快為 1・2 号車指定席、3 号車以後自由席；高速鐵路為全車指定席（沒有立席特急券，票價另計）。行程中只要有一段可以預約，就會列出完整行程（含轉乘）。":["特急は全車指定席（半額の立席特急券もあります）。特別快速は1・2号車が指定席、3号車以降は自由席です。高速鉄道は全車指定席（立席特急券はなく、運賃は別計算）です。行程の中に予約できる区間が1つでもあれば、乗り換えを含む全行程を表示します。","Limited Express is all reserved (half-price standing express tickets also available); on Special Rapid cars 1–2 are reserved and car 3 and beyond are non-reserved; high-speed rail is all reserved (no standing-ticket option, fare calculated separately). If any leg of the trip can be reserved, the whole itinerary including transfers is shown."],
"這個時間之後沒有含特急／特快／高速鐵路（可預約）的行程。可改用「時刻表與班次」查詢一般班次。":["この時刻以降、特急／特別快速／高速鉄道（予約可）を含む行程はありません。「時刻表と運行」で通常の運行を検索できます。","There are no itineraries after this time that include Limited Express / Special Rapid / high-speed rail (reservable). Use “Timetable and Service” to look up regular services instead."],
# 車輛介紹頁（routes.html）的照片說明。
"停在月台的新8000形1000番台特急あおさぎ":["停在月台的新8000形1000番台特急あおさぎ","The new 8000 series 1000 subseries Limited Express Aosagi, stopped at the platform"],
"行駛在山間的新8000形1000番台":["行駛在山間的新8000形1000番台","The new 8000 series 1000 subseries, running through the mountains"],
# 車站時刻表／路線頁的全日時刻表說明（第一段是路線方向，動態內容；第二段是固定說明文字）。
"${HK.dirLabel(H, sv)}。各站的發車時刻（終點站為到達時刻），一欄是一班車。":["{0}。各駅の発車時刻（終点駅は到着時刻）。1列は1本の列車です。","{0}. Departure times at each station (arrival time at the terminus); each column is one train."],
# 每頁共用頁首（tools/make_v90.py 產生）手機版漢堡選單按鈕的 aria-label；「主要選單」是巢狀 nav 本身的，這個是按鈕的，兩個不一樣。
"選單":["メニュー","Menu"],
# 1.2.4：車票（乗車券＋特急券）、訂票頁標題的新文字。
"乗車券 / TICKET":["乗車券 / TICKET","Fare Ticket / TICKET"],
"特急券 / EXPRESS TICKET":["特急券 / EXPRESS TICKET","Express Ticket / EXPRESS TICKET"],
"乗車券":["乗車券","Fare Ticket"],
"特急券":["特急券","Express Ticket"],
"以後":["以降","onward"],
"可利用高速鐵路":["高速鉄道の利用可","High-speed rail allowed"],
}
for k,v in MORE.items(): out[norm(k)]=v
for k in list(out):
    if '}${' in k or "? '" in k or '? `' in k or '=> ' in k: del out[k]
print(len(out),'entries; problems',bad)
tmpl=[k for k in out if '${' in k]; print(len(tmpl),'templates')
import re as _re
UNITS='分|本|駅|件|秒|日|回|名|時間|時|円|号車|番線|両|席|班|km|人|歳|%'
def jafix(v):
    v=_re.sub(r'(\}|\d) (?=(?:%s))'%UNITS,r'\1',v)
    v=_re.sub(r'約 (?=[\d{])','約',v)
    v=_re.sub(r'((?:最大|最長|遅延|停車|計|合計|第|全)) (?=[\d{])',r'\1',v)
    return v
for k in out: out[k][0]=jafix(out[k][0])
js='/* 自動產生：tools/build_i18n.py。key＝中文原文，[日文, 英文]；{0}{1}… 對應原文的 ${…} 依序的值。 */\nwindow.HK_I18N_DICT = '+json.dumps(out,ensure_ascii=False,indent=0)+';\n'
open(os.path.join(HERE,'..','assets','js','i18n-dict.js'),'w',encoding='utf-8').write(js)
