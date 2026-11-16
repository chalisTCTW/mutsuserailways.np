# v8.5：餐廳地址を行政区分（光瀨政令特別市の6区／十万浦郡／光瀨郡）に合わせて作り直す
import json,os,re
P=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','data','dining.json')
d=json.load(open(P,encoding='utf-8'))
# 車站 → (日文の住所頭, 英文の末尾)
M={
'谷山':('光瀨市谷山区谷山町','Taniyama-cho, Taniyama Ward, Hikarise City'),
'浦川':('光瀨市谷山区浦川','Urakawa, Taniyama Ward, Hikarise City'),
'九里橋三丁目':('光瀨市白藏山区九里橋','Kuribashi, Shirakurayama Ward, Hikarise City'),
'南九里':('光瀨市白藏山区南九里','Minami-Kusato, Shirakurayama Ward, Hikarise City'),
'戸宮':('光瀨市戸宮区戸宮町','Tomiya-cho, Tomiya Ward, Hikarise City'),
'大學前':('光瀨市戸宮区学園通り','Gakuen-dori, Tomiya Ward, Hikarise City'),
'花倉街道':('光瀨市花倉区花倉街道','Hanakura-kaido, Hanakura Ward, Hikarise City'),
'みつせ':('光瀨市栗田区みつせ町','Mitsuse-cho, Kurita Ward, Hikarise City'),
'東松沢':('十万浦郡松沢町東松沢','Higashi-Matsuzawa, Matsuzawa Town, Jumanmura District'),
'東平倉':('十万浦郡平倉市東平倉','Higashi-Heikura, Heikura City, Jumanmura District'),
'名島港':('光瀨郡名島市名島港町','Najima-minato-cho, Najima City, Hikarise District'),
'勝守':('光瀨郡勝守市勝守漁港前','Katsumori-gyoko-mae, Katsumori City, Hikarise District'),
'天鳥崎中央':('光瀨郡天鳥崎町天鳥崎参道','Amatorizaki-sando, Amatorizaki Town, Hikarise District'),
'紫市':('光瀨郡紫市紫市本町','Murasaki-shi Honcho, Murasaki City, Hikarise District'),
}
EX={'ビル1F':'Bldg. 1F','2F':'2F','3F':'3F','中央公園ビル最上階':'Chuo Koen Bldg., top floor'}
for r in d['items']:
    m=re.match(r'^光瀨市.+?(\d[\d-]*)(.*)$',r['address']); n=m.group(1); rest=m.group(2).strip()
    ja,en=M[r['station']]
    r['address']=ja+n+(('　'+rest) if rest else '')
    r['addressEn']=f"{n} {en}"+(f" ({EX[rest]})" if rest else '')
json.dump(d,open(P,'w',encoding='utf-8'),ensure_ascii=False,indent=1)
for r in d['items'][:36:5]: print(r['station'],r['address'],'|',r['addressEn'])
