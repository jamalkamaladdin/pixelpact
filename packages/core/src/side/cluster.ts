import type { Box } from '../types.js'

/**
 * A rectangle worth drawing on the report image, with the number of grid cells
 * that made it. The count is what orders the boxes: the widest spread of
 * differing pixels is the first thing a person should look at.
 */
export interface DiffCluster extends Box {
  cells: number
}

/** How the pixel diff is turned into rectangles. */
export interface ClusterOptions {
  /** Side of one grid cell, in pixels. Default `40`. */
  cellSize?: number
  /** Share of a cell that has to differ before the cell counts. Default `0.1`. */
  minDensity?: number
  /** Cells a cluster needs before it is worth a box. Default `2`. */
  minCells?: number
  /** How many boxes are kept, largest first. Default `8`. */
  maxBoxes?: number
}

/**
 * Turn a pixelmatch output image into a one byte per pixel mask.
 *
 * pixelmatch paints a differing pixel red and every matching pixel as faded
 * grey, so a pixel is a difference exactly when it is strongly red and not
 * grey. Working from the mask instead of the RGBA buffer keeps the clustering
 * independent of how the diff image happens to be coloured.
 *
 * @param data - RGBA bytes, four per pixel, row by row
 *
 * @example
 * ```ts
 * const mask = diffMask(output.data, width, height)
 * const boxes = clusterMask(mask, width, height)
 * ```
 */
export function diffMask(
  data: Uint8Array | Uint8ClampedArray | Buffer,
  width: number,
  height: number,
): Uint8Array {
  const mask = new Uint8Array(Math.max(0, width * height))
  for (let i = 0; i < mask.length; i++) {
    const pixel = i << 2
    if (data[pixel] > 200 && data[pixel + 1] < 120) mask[i] = 1
  }
  return mask
}

/**
 * Group differing pixels into a handful of rectangles.
 *
 * The mask is reduced to a coarse grid, a cell counts when enough of it
 * differs, and connected cells are flooded into one rectangle. Two differences
 * on opposite sides of a section stay two boxes: one rectangle around both
 * would cover the whole section and point at nothing.
 *
 * @returns the boxes, largest first, clamped to the image
 *
 * @example
 * ```ts
 * const boxes = clusterMask(mask, 1440, 900, { maxBoxes: 4 })
 * ```
 */
export function clusterMask(
  mask: Uint8Array,
  width: number,
  height: number,
  options: ClusterOptions = {},
): DiffCluster[] {
  if (width <= 0 || height <= 0) return []
  const cellSize = Math.max(1, Math.floor(options.cellSize ?? 40))
  const minDensity = options.minDensity ?? 0.1
  const minCells = Math.max(1, Math.floor(options.minCells ?? 2))
  const maxBoxes = Math.max(1, Math.floor(options.maxBoxes ?? 8))

  const columns = Math.ceil(width / cellSize)
  const rows = Math.ceil(height / cellSize)
  const hits = new Int32Array(columns * rows)
  for (let y = 0; y < height; y++) {
    const band = Math.floor(y / cellSize) * columns
    const row = y * width
    for (let x = 0; x < width; x++) {
      if (mask[row + x]) hits[band + Math.floor(x / cellSize)]++
    }
  }

  const needed = cellSize * cellSize * minDensity
  const hot = new Uint8Array(columns * rows)
  for (let i = 0; i < hot.length; i++) hot[i] = hits[i] > needed ? 1 : 0

  const seen = new Uint8Array(columns * rows)
  const found: DiffCluster[] = []
  for (let start = 0; start < hot.length; start++) {
    if (!hot[start] || seen[start]) continue
    seen[start] = 1
    const queue = [start]
    let minX = columns
    let maxX = -1
    let minY = rows
    let maxY = -1

    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head]
      const cx = cell % columns
      const cy = Math.floor(cell / columns)
      if (cx < minX) minX = cx
      if (cx > maxX) maxX = cx
      if (cy < minY) minY = cy
      if (cy > maxY) maxY = cy

      const neighbours = [
        cx > 0 ? cell - 1 : -1,
        cx + 1 < columns ? cell + 1 : -1,
        cy > 0 ? cell - columns : -1,
        cy + 1 < rows ? cell + columns : -1,
      ]
      for (const next of neighbours) {
        if (next < 0 || seen[next] || !hot[next]) continue
        seen[next] = 1
        queue.push(next)
      }
    }

    if (queue.length < minCells) continue
    const x = minX * cellSize
    const y = minY * cellSize
    found.push({
      cells: queue.length,
      x,
      y,
      w: Math.min(width - x, (maxX - minX + 1) * cellSize),
      h: Math.min(height - y, (maxY - minY + 1) * cellSize),
    })
  }

  found.sort((a, b) => b.cells - a.cells || a.y - b.y || a.x - b.x)
  return found.slice(0, maxBoxes)
}
