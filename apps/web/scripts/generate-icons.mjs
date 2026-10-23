import { readFile, writeFile } from 'node:fs/promises'

const webRoot = new URL('../', import.meta.url)
const stylesheet = await readFile(new URL('src/index.css', webRoot), 'utf8')
const colors = [...stylesheet.matchAll(/--brand-foreground:\s*(#[\da-f]{6});/gi)].map(
  (match) => match[1],
)

if (colors.length !== 2) throw new Error('Expected light and dark brand colors in src/index.css')

const [light, dark] = colors
const logo = await readFile(new URL('public/brand/logo.png', webRoot))
const image = `data:image/png;base64,${logo.toString('base64')}`
const variants = [
  ['favicon.svg', `svg{color:${light}}@media(prefers-color-scheme:dark){svg{color:${dark}}}`],
  ['favicon-light.svg', `svg{color:${light}}`],
  ['favicon-dark.svg', `svg{color:${dark}}`],
]

for (const [name, style] of variants) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="32" height="32"><style>${style}</style><mask id="brand" maskUnits="userSpaceOnUse" x="0" y="0" width="500" height="500" style="mask-type:alpha"><image href="${image}" width="500" height="500"/></mask><rect width="500" height="500" fill="currentColor" mask="url(#brand)"/></svg>\n`
  await writeFile(new URL(`public/brand/${name}`, webRoot), svg)
}
