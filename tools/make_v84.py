# v8.4：補齊餐廳英文介紹（dining.json 的 en 欄位）
import json,os
P=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','data','dining.json')
d=json.load(open(P,encoding='utf-8'))
EN=["Chicken-paitan soy ramen is the signature: rich but not heavy. Expect a line at lunch.",
"A daily grilled-fish set with a small side dish and miso soup; rice refills are free.",
"A long-established shop in the shopping district; the griddle is right at your seat and everything is cooked to order.",
"Soup curry packed with vegetables; choose your spice level from 0 to 5.",
"Hand-cut soba from house-made noodles, handy before or after concerts and events.",
"A udon shop open from 7 a.m. — grab a bowl before the early train.",
"Student-cafeteria style with generous portions and friendly prices; open to everyone.",
"Conveyor-belt sushi in the city centre, plates from ¥130, with weekday lunch specials.",
"Seafood rice bowls straight from the fishing port; the morning catch is the freshest, and they close when it sells out.",
"A canteen near the fishing port where fishermen stop for breakfast at dawn.",
"Thick-cut pork cutlets with free refills of cabbage and miso soup.",
"A Showa-style coffee house; the Napolitan spaghetti and pudding are the signatures.",
"Chicken skewers grilled over binchotan charcoal, paired with sake and shochu.",
"Domestic-beef hot pot served with house sesame sauce and ponzu.",
"A yakiniku restaurant in the shopping district with private rooms suited to families and groups.",
"Hand-made pasta and wood-fired pizza; lunch sets are around ¥3,000.",
"Counter seating where tempura is fried and served one piece at a time; seats are available after arena events too.",
"Kaiseki centred on hand-cut soba, with a relaxing courtyard view.",
"A counter-style sushi bar; the ten-piece nigiri lunch is around ¥4,000.",
"Grill seafood yourself over charcoal; the shellfish and fish are delivered the same day.",
"A Japanese restaurant by the shrine approach; the seafood gozen comes with a seasonal side dish.",
"A classic yoshoku restaurant whose signature hamburg steak is simmered in demi-glace for two days.",
"The teppan is right in front of you as the chef cooks steak and seafood on the spot.",
"Stir-fried shrimp in chili sauce and xiaolongbao are the popular pair; set menus are available.",
"An eight-seat counter serving fish delivered from the fishing port according to the season.",
"A kappo restaurant deep in the shopping district with a seasonal menu.",
"A French restaurant with a view of the arena at night; reservations are required for dinner.",
"A garden-surrounded ryotei whose private rooms can host business entertaining and family gatherings.",
"A steakhouse using Japanese black wagyu; choose your weight of aged beef.",
"A high-floor restaurant overlooking Central Park and Ryusei Tree; the night-view seats are in high demand.",
"Live-fish cuisine by the harbour, with ikizukuri prepared from the tank on the spot.",
"Crab dishes in front of the fishing port, from raw crab all the way to crab hot pot.",
"Kaiseki facing the coast; the dusk-hour seats are the most popular.",
"Built around seasonal ingredients, with tableware and presentation that are worth a look.",
"Charcoal-grilled kabayaki eel, which takes about 40 minutes, so reserve ahead.",
"A stand-alone Italian restaurant surrounded by greenery, with wine-pairing options."]
assert len(EN)==len(d['items'])==36
for r,e in zip(d['items'],EN): r['en']=e
json.dump(d,open(P,'w',encoding='utf-8'),ensure_ascii=False,indent=1)
print('ok')

# ── 店名のローマ字・名物料理の英訳・英語表記の住所 ──
d=json.load(open(P,encoding='utf-8'))
NAME=["Mendokoro Tanikaze","Teishokuya Kawasemi","Okonomiyaki Kurikichi","Curry Kobo Hinata","Sobadokoro Tomiyaan","Udon Kaido Chaya","Gakushoku Cafe Keyaki","Kaiten Sushi Mitsusemaru","Minato no Kaisendon Hamakichi","Katsumori Shokudo","Tonkatsu Heikuratei","Kissa Kurinoki","Sumibi Yakitori Torimasa","Shabu-shabu Uranoya","Yakiniku Kuribashien","Trattoria La Luce","Tempura Tomiya Yoshino","Soba Kaiseki Hanakura","Sushi Mitsuse-zushi","Hamayaki Najimamaru","Sando Saryo Amatori","Yoshoku Murasakiken","Teppanyaki Heikura Grill","Chuka Kuri Hanten","Sushi Taniyama Isana","Kappo Kuribashi Minamo","French Le Bois Tomiya","Ryotei Hanakuratei","Steak House Daigakumae Grill","Ryusei Dining Stella","Katsugyo Kaiseki Najimaro","Kani Ryori Katsumori Kani Goten","Kaiseki Amatorizaki Shiosai","Nihon Ryori Shiun","Unagi Heikura Unaji","Ristorante Minami-Kusato Verde"]
DISH=["Chicken-paitan soy ramen","Grilled-fish set meal","Pork-and-egg okonomiyaki","Vegetable-packed soup curry","Tempura zaru soba","Beef bukkake udon","Fried-chicken set meal","Fresh horse-mackerel nigiri","Morning-catch seafood rice bowl","Opened-horse-mackerel set meal","Pork loin cutlet set","Napolitan spaghetti and pudding","Binchotan yakitori omakase","Domestic-beef shabu-shabu","Premium kalbi","Hand-made pasta course","Assorted tempura","Soba kaiseki course","Omakase ten-piece nigiri","Assorted hamayaki grill","Seafood gozen","Demi-glace hamburg steak","Domestic-beef teppan steak","Shrimp in chili sauce and xiaolongbao","Omakase nigiri course","Seasonal vegetable omakase course","Chef's omakase dinner","Seasonal kaiseki","Japanese black wagyu sirloin","Stella course","Live-fish ikizukuri kaiseki","All-crab course","Shiosai kaiseki","Shiun course","Premium unaju (eel over rice)","Chef's course"]
WARD={'谷山区谷山町':'Taniyama-cho, Taniyama-ku','浦川区浦川':'Urakawa, Urakawa-ku','九里橋区九里橋':'Kuribashi, Kuribashi-ku','東松沢区東松沢':'Higashi-Matsuzawa, Higashi-Matsuzawa-ku','戸宮区戸宮町':'Tomiya-cho, Tomiya-ku','花倉区花倉街道':'Hanakura-kaido, Hanakura-ku','大学区学園通り':'Gakuen-dori, Daigaku-ku','中央区みつせ町':'Mitsuse-cho, Chuo-ku','名島区名島港町':'Najima-minato-cho, Najima-ku','勝守区勝守漁港前':'Katsumori-gyoko-mae, Katsumori-ku','平倉区東平倉':'Higashi-Heikura, Heikura-ku','南九里区南九里':'Minami-Kusato, Minami-Kusato-ku','紫市区紫市本町':'Murasaki-shi Honcho, Murasaki-shi-ku','天鳥崎区天鳥崎参道':'Amatorizaki-sando, Amatorizaki-ku'}
import re
def addr(a):
    m=re.match(r'^光瀨市(.+?)(\d[\d-]*)(.*)$',a); w=m.group(1); n=m.group(2); rest=m.group(3).strip()
    ex={'ビル1F':'Bldg. 1F','2F':'2F','3F':'3F','中央公園ビル最上階':'Chuo Koen Bldg., top floor'}.get(rest,rest)
    return f"{n} {WARD[w]}, Hikarise"+(f" ({ex})" if ex else '')
assert len(NAME)==len(DISH)==len(d['items'])==36
for r,n,s in zip(d['items'],NAME,DISH): r['nameEn']=n; r['dishEn']=s; r['addressEn']=addr(r['address'])
json.dump(d,open(P,'w',encoding='utf-8'),ensure_ascii=False,indent=1)
print(d['items'][29]['addressEn'], d['items'][2]['addressEn'])
