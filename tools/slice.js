/* KIKO 切图工具：从 kiko.png 图版裁出各姿态。node tools/slice.js 运行；坐标可在 boxes 里迭代调整 */
const { Jimp } = require('jimp');
const fs = require('fs');
const path = require('path');

const boxes = {
  'icon-main':  { x: 877,  y: 56,  w: 141, h: 140 },  // 蓝底熊头应用图标（像素扫描校准过边界，待办18）
  'avatar':     { x: 55,   y: 52,  w: 170, h: 170 },  // 左上招手大头（品牌头像）
  'idle':       { x: 592,  y: 312, w: 185, h: 235 },  // 待机（捧杯）
  'working':    { x: 803,  y: 298, w: 220, h: 220 },  // 工作中（笔记本）
  'done':       { x: 1030, y: 272, w: 245, h: 252 },  // 完成任务（举手+惊叹）
  'thinking':   { x: 1270, y: 268, w: 215, h: 252 },  // 思考中（含问号）
  'sleeping':   { x: 30,   y: 790, w: 310, h: 162 },  // 休息中（趴睡+zzZ，避开标签）
  'bubble':     { x: 405,  y: 752, w: 402, h: 192 },  // 提示气泡（趴熊+气泡，避开标签）
  'mascot':     { x: 40,   y: 232, w: 512, h: 572 },  // 主形象（拿平板招手）
};

/* 待办34：应用图标四角原为图版浅紫背景，系统托盘深色底上呈白角。
   从四角洪泛，把"与角底色相近"的连通像素填成图标自身的蓝底（在圆角边界自然停止）。 */
function fillCorners(im) {
  const { width: w, height: h, data } = im.bitmap;
  const px = (x, y) => { const i = (y * w + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
  const corner = px(1, 1);
  // 蓝底取样：边缘偏内多点，取"最蓝"的 3 点按通道平均
  const cands = [];
  for (const [x, y] of [[8, h >> 1], [w - 9, h >> 1], [w >> 1, 8], [w >> 1, h - 9], [10, h * 0.3 | 0], [w * 0.3 | 0, 10], [w - 11, h * 0.7 | 0], [w * 0.7 | 0, h - 11]])
    cands.push(px(x, y));
  const blues = cands.sort((a, b) => (b[2] - b[0]) - (a[2] - a[0])).slice(0, 3);
  const blue = [0, 1, 2].map(ch => Math.round(blues.reduce((s, p) => s + p[ch], 0) / 3));
  const near = (x, y) => { const p = px(x, y); return Math.hypot(p[0] - corner[0], p[1] - corner[1], p[2] - corner[2]) < 34; };
  const seen = new Uint8Array(w * h);
  const st = [0, 0, w - 1, 0, 0, h - 1, w - 1, h - 1];
  let n = 0;
  while (st.length) {
    const y = st.pop(), x = st.pop(), k = y * w + x;
    if (x < 0 || y < 0 || x >= w || y >= h || seen[k] || !near(x, y)) continue;
    seen[k] = 1; n++;
    const i = k * 4;
    data[i] = blue[0]; data[i + 1] = blue[1]; data[i + 2] = blue[2]; data[i + 3] = 255;
    st.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  console.log('corners filled', n, 'px with blue', blue.join(','));
}

(async () => {
  const src = path.join(__dirname, '..', 'kiko.png');
  const outDir = path.join(__dirname, '..', 'src', 'public', 'kiko');
  fs.mkdirSync(outDir, { recursive: true });
  const img = await Jimp.read(src);
  for (const [name, b] of Object.entries(boxes)) {
    const crop = img.clone().crop({ x: b.x, y: b.y, w: b.w, h: b.h });
    if (name === 'icon-main') fillCorners(crop);
    await crop.write(path.join(outDir, name + '.png'));
    console.log('sliced', name, crop.width + 'x' + crop.height);
  }
  // 预览网格：把每个姿态缩略排一张图，方便一次性肉眼校验切框
  const thumb = 150, cols = 4, rows = Math.ceil(Object.keys(boxes).length / cols);
  const grid = new Jimp({ width: cols * (thumb + 10) + 10, height: rows * (thumb + 30) + 10, color: 0x223344ff });
  let i = 0;
  for (const [name] of Object.entries(boxes)) {
    const b = boxes[name];
    const t = img.clone().crop({ x: b.x, y: b.y, w: b.w, h: b.h }).resize({ w: thumb, h: thumb });
    grid.composite(t, 10 + (i % cols) * (thumb + 10), 30 + Math.floor(i / cols) * (thumb + 30));
    i++;
  }
  await grid.write(path.join(__dirname, '_preview_grid.png'));
  console.log('preview grid written');
})();
