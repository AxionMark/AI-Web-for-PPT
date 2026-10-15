// 生成 Windows 应用图标：build/icon.ico（多尺寸）与 build/icon.png（256px 预览）。
// 纯 Node 实现，不依赖第三方绘图库：手写 PNG 编码 + 距离场抗锯齿。
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'build');
const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256];

// 品牌配色：珊瑚红磁贴 + 奶油白条形标记
const TILE_TOP = [0xf8, 0x83, 0x5f];
const TILE_BOTTOM = [0xe3, 0x5c, 0x3a];
const MARK = [0xff, 0xf8, 0xed];

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[n] = value;
  }
  return table;
})();

function crc32(buffer) {
  let value = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    value = CRC_TABLE[(value ^ buffer[index]) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // 位深
  header[9] = 6; // 颜色类型：RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

// 圆角矩形距离场，返回 0-1 的覆盖率，用于边缘抗锯齿。
function roundedRectCoverage(x, y, centerX, centerY, halfWidth, halfHeight, radius) {
  const dx = Math.abs(x - centerX) - (halfWidth - radius);
  const dy = Math.abs(y - centerY) - (halfHeight - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  const distance = outside + Math.min(Math.max(dx, dy), 0) - radius;
  return Math.min(Math.max(0.5 - distance, 0), 1);
}

function mix(from, to, amount) {
  return from + (to - from) * amount;
}

function renderIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const markBox = size * 0.7;
  const barWidth = markBox * 0.17;
  const gap = markBox * 0.1;
  const heights = [0.34, 0.6, 0.42].map((ratio) => markBox * ratio);
  const totalWidth = barWidth * 3 + gap * 2;
  const firstBarX = (size - totalWidth) / 2 + barWidth / 2;
  const centerY = size / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sampleX = x + 0.5;
      const sampleY = y + 0.5;
      const tile = roundedRectCoverage(sampleX, sampleY, size / 2, size / 2, size / 2, size / 2, size * 0.22);
      let red = 0;
      let green = 0;
      let blue = 0;

      if (tile > 0) {
        const gradient = sampleY / size;
        red = mix(TILE_TOP[0], TILE_BOTTOM[0], gradient);
        green = mix(TILE_TOP[1], TILE_BOTTOM[1], gradient);
        blue = mix(TILE_TOP[2], TILE_BOTTOM[2], gradient);
        for (let index = 0; index < heights.length; index += 1) {
          const barX = firstBarX + index * (barWidth + gap);
          const bar = roundedRectCoverage(sampleX, sampleY, barX, centerY, barWidth / 2, heights[index] / 2, barWidth / 2) * tile;
          if (bar > 0) {
            red = mix(red, MARK[0], bar);
            green = mix(green, MARK[1], bar);
            blue = mix(blue, MARK[2], bar);
          }
        }
      }

      const offset = (y * size + x) * 4;
      pixels[offset] = Math.round(red);
      pixels[offset + 1] = Math.round(green);
      pixels[offset + 2] = Math.round(blue);
      pixels[offset + 3] = Math.round(tile * 255);
    }
  }

  return pixels;
}

// ICO 内部使用 32 位 BMP（DIB）条目，兼容 GDI+ 等老式解码器。
function bitmapEntry(size, pixels) {
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0); // biSize
  header.writeInt32LE(size, 4); // biWidth
  header.writeInt32LE(size * 2, 8); // biHeight：XOR 图 + AND 遮罩
  header.writeUInt16LE(1, 12); // biPlanes
  header.writeUInt16LE(32, 14); // biBitCount
  header.writeUInt32LE(size * size * 4, 20); // biSizeImage

  const xor = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const sourceRow = (size - 1 - y) * size * 4; // DIB 自下而上存储
    for (let x = 0; x < size; x += 1) {
      const from = sourceRow + x * 4;
      const to = (y * size + x) * 4;
      xor[to] = pixels[from + 2];
      xor[to + 1] = pixels[from + 1];
      xor[to + 2] = pixels[from];
      xor[to + 3] = pixels[from + 3];
    }
  }

  // 1bpp AND 遮罩，32 位图按 alpha 通道合成，这里保持全 0。
  const and = Buffer.alloc(Math.ceil(size / 32) * 4 * size);
  return Buffer.concat([header, xor, and]);
}

function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const directory = Buffer.alloc(entries.length * 16);
  let offset = 6 + entries.length * 16;

  entries.forEach((entry, index) => {
    const base = index * 16;
    const dimension = entry.size >= 256 ? 0 : entry.size;
    directory[base] = dimension;
    directory[base + 1] = dimension;
    directory.writeUInt16LE(1, base + 4);
    directory.writeUInt16LE(32, base + 6);
    directory.writeUInt32LE(entry.data.length, base + 8);
    directory.writeUInt32LE(offset, base + 12);
    offset += entry.data.length;
  });

  return Buffer.concat([header, directory, ...entries.map((entry) => entry.data)]);
}

const entries = ICON_SIZES.map((size) => {
  const pixels = renderIcon(size);
  return { size, data: bitmapEntry(size, pixels), preview: encodePng(size, pixels) };
});
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'icon.ico'), buildIco(entries));
writeFileSync(join(outDir, 'icon.png'), entries[entries.length - 1].preview);
console.log(`已生成 ${join(outDir, 'icon.ico')}（${ICON_SIZES.join(' / ')}）与 icon.png`);
