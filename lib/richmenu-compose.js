// 圖文選單的格子跟著功能模組走：關掉的功能，圖上那一格直接拿掉，
// 後面的格子往前補，補完剩下的位置塗成背景色，點擊區也只留還在的格子。
// 圖片是 tools/make_richmenu.py 預先畫好的（2500×1686，2×4 格），這裡只做像素搬移，
// 不需要字型也不需要繪圖程式。格子的位置要和 make_richmenu.py 的算法一致。
const { PNG } = require('pngjs');

const W = 2500, H = 1686, BAR = 200, COLS = 4, ROWS = 2, GAP = 22;
const BG = [0xf1, 0xf6, 0xf3, 0xff];
const CELL_W = Math.floor((W - GAP * (COLS + 1)) / COLS);
const CELL_H = Math.floor((H - BAR - GAP * (ROWS + 1)) / ROWS);

// 第 k 格的方塊位置（含圓角外面的一點背景）
function cellRect(k) {
  const r = Math.floor(k / COLS), c = k % COLS;
  return { x: GAP + c * (CELL_W + GAP), y: BAR + GAP + r * (CELL_H + GAP), w: CELL_W + 1, h: CELL_H + 1 };
}

function copyRect(src, dst, from, to) {
  for (let row = 0; row < from.h; row++) {
    const s = ((from.y + row) * W + from.x) * 4;
    const d = ((to.y + row) * W + to.x) * 4;
    src.data.copy(dst.data, d, s, s + from.w * 4);
  }
}

function fillRect(dst, rect) {
  for (let row = 0; row < rect.h; row++) {
    for (let col = 0; col < rect.w; col++) {
      const d = ((rect.y + row) * W + rect.x + col) * 4;
      dst.data[d] = BG[0]; dst.data[d + 1] = BG[1]; dst.data[d + 2] = BG[2]; dst.data[d + 3] = BG[3];
    }
  }
}

// keep：留下來的格子編號（照順序）。回傳新的 PNG Buffer。
function composeTab(pngBuffer, keep) {
  const src = PNG.sync.read(pngBuffer);
  if (src.width !== W || src.height !== H) throw new Error(`圖文選單圖片尺寸不對：${src.width}×${src.height}`);
  const dst = new PNG({ width: W, height: H });
  src.data.copy(dst.data);
  const total = COLS * ROWS;
  for (let slot = 0; slot < total; slot++) {
    if (slot < keep.length) { if (keep[slot] !== slot) copyRect(src, dst, cellRect(keep[slot]), cellRect(slot)); }
    else fillRect(dst, cellRect(slot));
  }
  return PNG.sync.write(dst, { deflateLevel: 3 }); // 壓縮等級低一點，函式才不會跑太久
}

module.exports = { composeTab, cellRect, BG, W, H };
