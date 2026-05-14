/**
 * columnCompare — shared types + math/helpers for “pick two columns → scatter plot”
 *
 * **Read top → bottom:** types → single-cell read → labels → pure regression → scatter builder.
 *
 * Used by `App` (column identity when picking headers) and `TrendlineModal`
 * (building points + regression). Keeps Recharts-specific code out of this file so
 * we can unit-test `linearRegression` / `readCell` in isolation if we add tests later.
 */
import type { ParseResult } from './parseDataset'

// --- Types ------------------------------------------------------------------

/** Identifies one table column: either an input ingredient or an output measurement. */
export type ColumnRef = { kind: 'input' | 'output'; field: string }

/** One row of chart data: experiment id (for tooltip) + numeric (x, y) after axis assignment. */
export type ScatterPoint = {
  experiment: string
  x: number
  y: number
}

// --- Dataset reads -----------------------------------------------------------

/**
 * Reads a single numeric cell for one experiment and column ref.
 * Uses nullish coalescing (`?? 0`) so missing keys match the table’s “absent = 0” behavior.
 */
export function readCell(
  dataset: ParseResult['dataset'],
  experiment: string,
  col: ColumnRef,
): number {
  const row = dataset[experiment]
  const map = col.kind === 'input' ? row.inputs : row.outputs
  return map[col.field] ?? 0
}

/** Human-readable axis label in the compare modal (distinguishes input vs output with same name). */
export function columnLabel(col: ColumnRef): string {
  return col.kind === 'input' ? `${col.field} (input)` : `${col.field} (output)`
}

// --- Pure math ---------------------------------------------------------------

/**
 * Ordinary least squares (OLS) through points (xᵢ, yᵢ): solves for slope `m` and intercept `b`
 * in y ≈ m·x + b using the standard closed form (sums n, Σx, Σy, Σxy, Σx²).
 *
 * Returns `null` when fewer than two points, length mismatch, or Σx is degenerate
 * (all x equal → denominator ~ 0) so callers can skip drawing a trendline.
 */
export function linearRegression(
  xs: number[],
  ys: number[],
): { m: number; b: number } | null {
  const n = xs.length
  if (n < 2 || ys.length !== n) return null
  let sx = 0
  let sy = 0
  let sxy = 0
  let sxx = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]
    sy += ys[i]
    sxy += xs[i] * ys[i]
    sxx += xs[i] * xs[i]
  }
  const den = n * sxx - sx * sx
  if (Math.abs(den) < 1e-12) return null
  const m = (n * sxy - sx * sy) / den
  const b = (sy - m * sx) / n
  return { m, b }
}

// --- Chart data assembly -----------------------------------------------------

/**
 * Builds the scatter series: one point per experiment name (sorted list comes from App),
 * mapping `xCol` → `x` and `yCol` → `y` via `readCell`.
 */
export function buildScatterPoints(
  dataset: ParseResult['dataset'],
  experimentNames: string[],
  xCol: ColumnRef,
  yCol: ColumnRef,
): ScatterPoint[] {
  return experimentNames.map((experiment) => {
    const row = dataset[experiment]
    const xMap = xCol.kind === 'input' ? row.inputs : row.outputs
    const yMap = yCol.kind === 'input' ? row.inputs : row.outputs
    return {
      experiment,
      x: xMap[xCol.field] ?? 0,
      y: yMap[yCol.field] ?? 0,
    }
  })
}
