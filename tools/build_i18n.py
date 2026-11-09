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
