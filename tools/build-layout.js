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
// 與網頁 HK.netKey 相同的指紋
const nm = H.stations.map(st => st.zh + '@' + Math.round(st.x / 8) + ',' + Math.round(st.z / 8)).sort().join('|');
const ed = H.edges.map(e => (H.stName(e.a) < H.stName(e.b) ? H.stName(e.a) + '~' + H.stName(e.b) : H.stName(e.b) + '~' + H.stName(e.a))).sort().join('|');
let hh = 5381; { const str = nm + '#' + ed; for (let i = 0; i < str.length; i++) hh = ((hh << 5) + hh + str.charCodeAt(i)) | 0; }
const key = 'v3:' + H.stations.length + ':' + H.edges.length + ':' + (hh >>> 0).toString(36);
let manual = {}; try { manual = JSON.parse(fs.readFileSync(path.join(root, 'data/layout.json'), 'utf8')).override || {}; } catch (e) { /* 沒有就算了 */ }
const L = M.layout(H, { override: manual, refineMs: 20000 });
const out = { version: 3, key, generatedAt: new Date().toISOString(), recipe: L.recipe, stationNames, override: manual,
  metrics: { crossings: L.crossings, bends: L.bends, touch: L.touch, near: L.near, offGrid: L.offGrid } };
fs.writeFileSync(path.join(root, 'data/layout.json'), JSON.stringify(out, null, 1));
console.log('stations', H.stations.length, JSON.stringify(out.metrics), '→ data/layout.json（recipe 只有參數，網頁載入時用它重算一次）');
