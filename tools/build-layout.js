#!/usr/bin/env node
/* 預先算好路線圖版面（試很多次，挑交叉最少的），存成 data/layout.json。
 * 用法：node tools/build-layout.js [快照檔 data/snapshot.json] [嘗試次數 80]
 * 網頁會優先使用 data/layout.json 的 recipe（最佳參數，載入時只算一次）；沒有，或車站名單改變時才即時試算。
 * 想手動固定某站位置：在 layout.json 的 override 寫 { "車站中文名": [格x, 格y] }（格線單位，往右 x 變大、往下 y 變大），再重新執行本程式。 */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
require(path.join(root, 'assets/js/atos-model.js'));
const HK = require(path.join(root, 'assets/js/hk-core.js'));
const M = require(path.join(root, 'assets/js/hk-map.js'));
const snapFile = process.argv[2] || path.join(root, 'data/snapshot.json');
const tries = Number(process.argv[3]) || 80;
const H = HK.build(JSON.parse(fs.readFileSync(snapFile, 'utf8')));
const stationNames = H.stations.map(s => s.zh).sort();
let manual = {}; try { manual = JSON.parse(fs.readFileSync(path.join(root, 'data/layout.json'), 'utf8')).override || {}; } catch (e) { /* 沒有就算了 */ }
const L = M.layout(H, { tries, stopAtZero: false, override: manual });
const out = { version: 2, generatedAt: new Date().toISOString(), recipe: L.recipe, stationNames, override: manual,
  metrics: { crossings: L.crossings, bends: L.bends, touch: L.touch, near: L.near, offGrid: L.offGrid } };
fs.writeFileSync(path.join(root, 'data/layout.json'), JSON.stringify(out, null, 1));
console.log('stations', H.stations.length, JSON.stringify(out.metrics), '→ data/layout.json（recipe 只有參數，網頁載入時用它重算一次）');
