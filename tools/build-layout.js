#!/usr/bin/env node
/* 預先算好路線圖版面（試很多次，挑交叉最少的），存成 data/layout.json。
 * 用法：node tools/build-layout.js [快照檔 data/snapshot.json] [嘗試次數 80]
 * 網頁會優先使用 data/layout.json；沒有或有新車站時才即時自動計算。
 * 想手動調整某站位置：直接改 layout.json 裡該站的 [x, y]（格線單位，往右 x 變大、往下 y 變大）。 */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
require(path.join(root, 'assets/js/atos-model.js'));
const HK = require(path.join(root, 'assets/js/hk-core.js'));
const M = require(path.join(root, 'assets/js/hk-map.js'));
const snapFile = process.argv[2] || path.join(root, 'data/snapshot.json');
const tries = Number(process.argv[3]) || 80;
const H = HK.build(JSON.parse(fs.readFileSync(snapFile, 'utf8')));
const L = M.layout(H, { tries, stopAtZero: false });
const out = { generatedAt: new Date().toISOString(), crossings: L.crossings, bends: L.bends, stations: {} };
H.stations.forEach(st => { const p = L.pos.get(st.id); out.stations[st.zh] = [Math.round(p.x / M.GRID), Math.round(p.y / M.GRID)]; });
fs.writeFileSync(path.join(root, 'data/layout.json'), JSON.stringify(out, null, 1));
console.log('stations', H.stations.length, 'crossings', L.crossings, 'bends', L.bends, '→ data/layout.json');
