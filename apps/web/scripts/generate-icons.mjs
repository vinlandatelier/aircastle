import { readFile, writeFile } from 'node:fs/promises'
import { deflateSync, inflateSync } from 'node:zlib'

const webRoot = new URL('../', import.meta.url)
const faviconSize = 64

/** Decodes an 8-bit, non-interlaced RGBA PNG into its width, height and pixel bytes. */
function decodeRgba(png) {
  let offset = 8
  let width = 0
  let height = 0
  const data = []
  while (offset < png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    const body = png.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0)
        throw new Error('Brand logos must be 8-bit, non-interlaced RGBA PNGs')
    }
    if (type === 'IDAT') data.push(body)
    offset += length + 12
  }
  const raw = inflateSync(Buffer.concat(data))
  const stride = width * 4
  const pixels = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0
      const corner = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0
      const estimate = left + up - corner
      const [a, b, c] = [left, up, corner].map((value) => Math.abs(estimate - value))
      const paeth = a <= b && a <= c ? left : b <= c ? up : corner
      const predictor = [0, left, up, (left + up) >> 1, paeth][filter]
      if (predictor === undefined) throw new Error(`Unknown PNG filter ${filter}`)
      pixels[y * stride + x] = (row[x] + predictor) & 0xff
    }
  }
  return { width, height, pixels }
}

/** Averages source pixels into a square image, weighting colour by alpha. */
function downscale({ width, height, pixels }, size) {
  const output = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const total = [0, 0, 0, 0]
      let count = 0
      for (
        let sy = Math.floor((y * height) / size);
        sy < Math.floor(((y + 1) * height) / size);
        sy++
      ) {
        for (
          let sx = Math.floor((x * width) / size);
          sx < Math.floor(((x + 1) * width) / size);
          sx++
        ) {
          const index = (sy * width + sx) * 4
          const alpha = pixels[index + 3]
          for (let channel = 0; channel < 3; channel++)
            total[channel] += pixels[index + channel] * alpha
          total[3] += alpha
          count++
        }
      }
      const index = (y * size + x) * 4
      for (let channel = 0; channel < 3; channel++)
        output[index + channel] = total[3] ? Math.round(total[channel] / total[3]) : 0
      output[index + 3] = Math.round(total[3] / count)
    }
  }
  return output
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function chunk(type, body) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(type, 4, 'ascii')
  let crc = 0xffffffff
  for (const byte of Buffer.concat([head.subarray(4), body]))
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 0)
  return Buffer.concat([head, body, tail])
}

function encodeRgba(pixels, size) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 6, 0, 0, 0], 8)
  const rows = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++)
    pixels.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const [light, dark] = await Promise.all(
  ['light', 'dark'].map(async (theme) => {
    const logo = decodeRgba(await readFile(new URL(`public/brand/logo-${theme}.png`, webRoot)))
    const icon = encodeRgba(downscale(logo, faviconSize), faviconSize)
    return `data:image/png;base64,${icon.toString('base64')}`
  }),
)
const image = (source, attributes = '') =>
  `<image ${attributes} href="${source}" width="${faviconSize}" height="${faviconSize}"/>`
const variants = [
  [
    'favicon.svg',
    `<style>.dark{display:none}@media(prefers-color-scheme:dark){.light{display:none}.dark{display:inline}}</style>${image(light, 'class="light"')}${image(dark, 'class="dark"')}`,
  ],
  ['favicon-light.svg', image(light)],
  ['favicon-dark.svg', image(dark)],
]

for (const [name, content] of variants) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${faviconSize} ${faviconSize}" width="32" height="32">${content}</svg>\n`
  await writeFile(new URL(`public/brand/${name}`, webRoot), svg)
}
