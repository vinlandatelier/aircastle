import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import process from 'node:process'

const webRoot = new URL('../', import.meta.url)
const [light, dark] = await Promise.all(
  ['light', 'dark'].map(async (theme) => {
    const logo = await readFile(new URL(`public/brand/logo-${theme}.png`, webRoot))
    return `data:image/png;base64,${logo.toString('base64')}`
  }),
)
const image = (source, attributes = '') =>
  `<image ${attributes} href="${source}" width="500" height="500"/>`
const variants = [
  [
    'favicon.svg',
    `<style>.dark{display:none}@media(prefers-color-scheme:dark){.light{display:none}.dark{display:inline}}</style>${image(light, 'class="light"')}${image(dark, 'class="dark"')}`,
  ],
  ['favicon-light.svg', image(light)],
  ['favicon-dark.svg', image(dark)],
]

for (const [name, content] of variants) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="32" height="32">${content}</svg>\n`
  await writeFile(
    new URL(
      `brand/${name}`,
      process.env.WEB_PUBLIC_DIR
        ? pathToFileURL(`${process.env.WEB_PUBLIC_DIR}/`)
        : new URL('public/', webRoot),
    ),
    svg,
  )
}
