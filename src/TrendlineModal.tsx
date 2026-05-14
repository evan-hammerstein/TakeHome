/** Scatter + OLS trendline modal (Recharts). Regression line is SVG, not `<Line>`, for reliable first paint. */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Layer,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  useCartesianScale,
} from 'recharts'
import type { ParseResult } from './parseDataset'
import {
  buildScatterPoints,
  columnLabel,
  linearRegression,
  type ColumnRef,
  type ScatterPoint,
} from './columnCompare'

type Props = {
  onClose: () => void
  colA: ColumnRef
  colB: ColumnRef
  dataset: ParseResult['dataset']
  experimentNames: string[]
}

type TrendSegment = [{ x: number; y: number }, { x: number; y: number }]

type RegressionStats = {
  trend: TrendSegment
  equation: string
  r2: number | null
}

const EQ_DECIMALS = 4

function buildEquationString(m: number, b: number): string {
  const f = (n: number) => n.toFixed(EQ_DECIMALS)
  const mStr = f(m)
  if (b === 0) return `y = ${mStr}x`
  const bAbs = f(Math.abs(b))
  if (b > 0) return `y = ${mStr}x + ${bAbs}`
  return `y = ${mStr}x − ${bAbs}`
}

function rSquared(
  xs: number[],
  ys: number[],
  m: number,
  b: number,
): number | null {
  const n = xs.length
  if (n < 2 || ys.length !== n) return null
  let yMean = 0
  for (let i = 0; i < n; i++) yMean += ys[i]
  yMean /= n
  let ssTot = 0
  let ssRes = 0
  for (let i = 0; i < n; i++) {
    const pred = m * xs[i] + b
    const e = ys[i] - pred
    ssRes += e * e
    const d = ys[i] - yMean
    ssTot += d * d
  }
  if (ssTot <= 1e-15) return ssRes <= 1e-15 ? 1 : null
  const r2 = 1 - ssRes / ssTot
  if (!Number.isFinite(r2)) return null
  return Math.min(1, Math.max(0, r2))
}

function computeRegressionStats(scatter: ScatterPoint[]): RegressionStats | null {
  const xs = scatter.map((p) => p.x)
  const ys = scatter.map((p) => p.y)
  const fit = linearRegression(xs, ys)
  if (!fit) return null
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null
  const trend: TrendSegment = [
    { x: minX, y: fit.m * minX + fit.b },
    { x: maxX, y: fit.m * maxX + fit.b },
  ]
  return {
    trend,
    equation: buildEquationString(fit.m, fit.b),
    r2: rSquared(xs, ys, fit.m, fit.b),
  }
}

function computeAxisDomains(
  scatter: ScatterPoint[],
  trend: TrendSegment | null,
): { xDomain: [number, number]; yDomain: [number, number] } {
  const xs = scatter.map((p) => p.x)
  const ys = scatter.map((p) => p.y)
  const yExt = [...ys]
  if (trend) {
    yExt.push(trend[0].y, trend[1].y)
  }
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const yMin = Math.min(...yExt)
  const yMax = Math.max(...yExt)
  const xPad =
    xMax === xMin ? Math.max(Math.abs(xMin) * 0.08, 1e-6) : (xMax - xMin) * 0.06
  const yPad =
    yMax === yMin ? Math.max(Math.abs(yMin) * 0.08, 1e-6) : (yMax - yMin) * 0.06
  return {
    xDomain: [xMin - xPad, xMax + xPad],
    yDomain: [yMin - yPad, yMax + yPad],
  }
}

function formatAxisTick2Decimals(value: number | string): string {
  return Number(value).toFixed(2)
}

const axisTitleStyle = {
  fill: 'var(--text-muted)',
  fontSize: 11,
  fontWeight: 500,
} as const

function ScatterTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: { payload: { experiment: string; x: number; y: number } }[]
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{p.experiment}</div>
      <div>
        x: {formatAxisTick2Decimals(p.x)}
        <br />
        y: {formatAxisTick2Decimals(p.y)}
      </div>
    </div>
  )
}

function TrendlineOverlay({
  x1,
  y1,
  x2,
  y2,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
}) {
  const start = useCartesianScale({ x: x1, y: y1 })
  const end = useCartesianScale({ x: x2, y: y2 })
  if (!start || !end) return null
  return (
    <Layer className="trendline-overlay">
      <line
        className="trendline-segment"
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        pointerEvents="none"
      />
    </Layer>
  )
}

export function TrendlineModal({
  onClose,
  colA,
  colB,
  dataset,
  experimentNames,
}: Props) {
  const [swap, setSwap] = useState(false)

  useEffect(() => {
    setSwap(false)
  }, [colA, colB])

  const xCol = swap ? colB : colA
  const yCol = swap ? colA : colB

  const scatter = useMemo(
    () => buildScatterPoints(dataset, experimentNames, xCol, yCol),
    [dataset, experimentNames, xCol, yCol],
  )

  const regressionStats = useMemo(
    () => computeRegressionStats(scatter),
    [scatter],
  )
  const trend = regressionStats?.trend ?? null

  const { xDomain, yDomain } = useMemo(
    () => computeAxisDomains(scatter, trend),
    [scatter, trend],
  )

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    document.addEventListener('keydown', onKeyDown)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prev
    }
  }, [onKeyDown])

  return (
    <div
      className="trendline-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="trendline-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trendline-modal-title"
      >
        <header className="trendline-modal-header">
          <h2 id="trendline-modal-title">Column comparison</h2>
          <button
            type="button"
            className="trendline-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <p className="trendline-modal-meta">
          <span className="axis-pill x-axis">X: {columnLabel(xCol)}</span>
          <span className="axis-pill y-axis">Y: {columnLabel(yCol)}</span>
        </p>

        <div className="trendline-modal-toolbar">
          <button
            type="button"
            className="trendline-swap-btn"
            onClick={() => setSwap((s) => !s)}
          >
            Swap X / Y
          </button>
          {!regressionStats ? (
            <span className="trendline-no-fit">
              Trendline unavailable (need ≥2 points with varying X).
            </span>
          ) : null}
        </div>

        <div className="trendline-chart-panel">
          {regressionStats ? (
            <div className="trendline-chart-stats" aria-label="Linear regression">
              <div className="trendline-chart-stats-line">{regressionStats.equation}</div>
              <div className="trendline-chart-stats-r2">
                R² ={' '}
                {regressionStats.r2 === null
                  ? '—'
                  : regressionStats.r2.toFixed(4)}
              </div>
            </div>
          ) : null}
          <div className="trendline-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={scatter}
                margin={{ top: 12, right: 20, bottom: 44, left: 88 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  type="number"
                  dataKey="x"
                  domain={xDomain}
                  tickFormatter={formatAxisTick2Decimals}
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  stroke="var(--border)"
                  label={{
                    value: columnLabel(xCol),
                    position: 'insideBottom',
                    offset: -2,
                    ...axisTitleStyle,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  domain={yDomain}
                  width={76}
                  tickFormatter={formatAxisTick2Decimals}
                  tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                  stroke="var(--border)"
                  label={{
                    value: columnLabel(yCol),
                    angle: -90,
                    position: 'left',
                    offset: 10,
                    style: { textAnchor: 'middle' },
                    ...axisTitleStyle,
                  }}
                />
                <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                <Scatter
                  name="Runs"
                  data={scatter}
                  fill="var(--accent)"
                  fillOpacity={0.75}
                />
                {trend ? (
                  <TrendlineOverlay
                    x1={trend[0].x}
                    y1={trend[0].y}
                    x2={trend[1].x}
                    y2={trend[1].y}
                  />
                ) : null}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}
