/* 一次性图标生成：零依赖手写 PNG（node:zlib + CRC32）——180 主屏 / 512 maskable
   用法：node scripts/gen-icon.mjs   （改色/形状后重跑即可，产物直接提交） */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = buf => {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

/** 画布：橙底 #e8590c + 白色圆（奶滴母题）+ 中心橙点 */
function render(size) {
  const bg = [232, 89, 12], fg = [255, 255, 255]
  const cx = size / 2, cy = size / 2, R = size * 0.27, r = size * 0.089
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0   // filter: none
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx + 0.5, y - cy + 0.5)
      const [R1, G1, B1] = d <= r ? bg : d <= R ? fg : bg
      const o = y * (size * 4 + 1) + 1 + x * 4
      raw[o] = R1; raw[o + 1] = G1; raw[o + 2] = B1; raw[o + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

writeFileSync(new URL('../icons/icon-180.png', import.meta.url), render(180))
writeFileSync(new URL('../icons/icon-512.png', import.meta.url), render(512))
console.log('icons/icon-180.png + icon-512.png generated')
