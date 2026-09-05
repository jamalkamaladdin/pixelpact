/**
 * Draws the pixelpact wordmark from a 5 by 8 bitmap font and writes it as SVG.
 *
 * The mark is literally pixels: every lit cell becomes a rect, and horizontal runs are
 * merged so the file stays small. Run it after changing the font or the palette:
 *
 *   node scripts/logo.mjs
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// biome-ignore format: each string is one bitmap row, wrapping them would hide the letterforms
const GLYPHS = {
  p: ['.......', '.......', '.......', '######.', '######.', '##..##.', '##..##.', '######.', '######.', '##.....', '##.....'],
  i: ['..##...', '..##...', '.......', '..##...', '..##...', '..##...', '..##...', '..##...', '..##...', '.......', '.......'],
  x: ['.......', '.......', '.......', '##...##', '.##.##.', '..###..', '..###..', '.##.##.', '##...##', '.......', '.......'],
  e: ['.......', '.......', '.......', '.#####.', '##...##', '#######', '##.....', '##...##', '.#####.', '.......', '.......'],
  l: ['.##....', '.##....', '.##....', '.##....', '.##....', '.##....', '.##....', '.##....', '.###...', '.......', '.......'],
  a: ['.......', '.......', '.......', '.#####.', '.....##', '.######', '##...##', '##...##', '.######', '.......', '.......'],
  c: ['.......', '.......', '.......', '.#####.', '##...##', '##.....', '##.....', '##...##', '.#####.', '.......', '.......'],
  t: ['.......', '.##....', '.##....', '######.', '.##....', '.##....', '.##....', '.##..##', '..####.', '.......', '.......'],
}

const WORD = 'pixelpact'
const ACCENT_FROM = 5 // the 'pact' half is drawn in the accent color
const CELL = 10
const GAP = 1
const PAD = 1
const GLYPH_W = 7
const GLYPH_H = 11

const THEMES = {
  light: { ink: '#171717', accent: '#0b7285' },
  dark: { ink: '#fafaf9', accent: '#38bdf8' },
}

/** Merges the lit cells of one row into `[startColumn, length]` runs. */
function runs(row) {
  const out = []
  let start = -1
  for (let x = 0; x <= row.length; x += 1) {
    const lit = row[x] === '#'
    if (lit && start === -1) start = x
    if (!lit && start !== -1) {
      out.push([start, x - start])
      start = -1
    }
  }
  return out
}

function render(theme) {
  const width = WORD.length * GLYPH_W + (WORD.length - 1) * GAP + PAD * 2
  const height = GLYPH_H + PAD * 2
  const rects = []

  WORD.split('').forEach((letter, index) => {
    const glyph = GLYPHS[letter]
    if (!glyph) throw new Error(`no glyph for "${letter}"`)
    const originX = PAD + index * (GLYPH_W + GAP)
    const fill = index >= ACCENT_FROM ? theme.accent : theme.ink
    glyph.forEach((row, rowIndex) => {
      for (const [start, length] of runs(row)) {
        const x = (originX + start) * CELL
        const y = (PAD + rowIndex) * CELL
        rects.push(
          `<rect x="${x}" y="${y}" width="${length * CELL}" height="${CELL}" fill="${fill}"/>`,
        )
      }
    })
  })

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width * CELL} ${height * CELL}"`,
    ` width="${width * CELL}" height="${height * CELL}" role="img" aria-label="pixelpact"`,
    ' shape-rendering="crispEdges">',
    rects.join(''),
    '</svg>',
    '',
  ].join('')
}

const outDir = fileURLToPath(new URL('../assets/', import.meta.url))
for (const [name, theme] of Object.entries(THEMES)) {
  const file = `${outDir}logo-${name}.svg`
  writeFileSync(file, render(theme))
  console.log(`wrote ${file}`)
}
