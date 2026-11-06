/* 从切图 icon-main.png 生成 Windows 多尺寸 ico（PNG 内嵌格式，Vista+ 支持）。node tools/make-ico.js */
const { Jimp } = require('jimp');
const fs = require('fs');
const path = require('path');

(async () => {
  const src = await Jimp.read(path.join(__dirname, '..', 'src', 'public', 'kiko', 'icon-main.png'));
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const buffers = [];
  for (const s of sizes) {
    const im = src.clone().resize({ w: s, h: s });
    buffers.push({ size: s, data: await im.getBuffer('image/png') });
  }
  // ICONDIR(6) + ICONDIRENTRY(16)*n + PNG 数据
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
  const entries = Buffer.alloc(16 * sizes.length);
  let offset = 6 + entries.length;
  const chunks = [header, entries];
  buffers.forEach((b, i) => {
    const p = i * 16;
    entries[p] = b.size === 256 ? 0 : b.size;      // 宽高，0=256
    entries[p + 1] = b.size === 256 ? 0 : b.size;
    entries[p + 2] = 0; entries[p + 3] = 0;         // 颜色数/保留
    entries.writeUInt16LE(1, p + 4);                 // planes
    entries.writeUInt16LE(32, p + 6);                // bpp
    entries.writeUInt32LE(b.data.length, p + 8);
    entries.writeUInt32LE(offset, p + 12);
    offset += b.data.length;
    chunks.push(b.data);
  });
  const out = path.join(__dirname, '..', 'build');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'icon.ico'), Buffer.concat(chunks));
  console.log('icon.ico written', fs.statSync(path.join(out, 'icon.ico')).size, 'bytes');
})();
