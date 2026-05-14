/**
 * JSON editor, parsed table, trendline scatter, outliers, and multi-output optimizer.
 */
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import sampleDatasetJson from './sampleDataset.json?raw'
import type { ColumnRef } from './columnCompare'
import { DatasetParseError, parseDataset, type ParseResult } from './parseDataset'
import { computeOutliers } from './outliers'
import { TrendlineModal } from './TrendlineModal'
import { OptimizerModal } from './OptimizerModal'
import { rankExperiments, type OptimizerCriterion } from './optimizerRank'
import './components.css'

// --- Helper Functions -----------------------------------------

/** True when both kind and field match — used to ignore picking the same column twice. */
function sameColumn(a: ColumnRef, b: ColumnRef): boolean {
  return a.kind === b.kind && a.field === b.field
}


/**
 * Builds `<th>` class names for pickable numeric columns: base column styling, optional
 * pick-mode cursor, optional “already selected” accent.
 */
function pickableHeaderClassNames(opts: {
  base: string[]
  pickColumnsMode: boolean
  selected: boolean
}): string {
  return [
    ...opts.base,
    opts.pickColumnsMode && 'column-header--pickable',
    opts.selected && 'column-header--picked',
  ]
    .filter(Boolean)
    .join(' ')
}

/** Hollow ring used beside output values and in the outlier legend (same SVG). */
function OutlierRingGlyph(props: {
  className?: string
  /** Omit `role` / `aria-label` when the surrounding text already explains the mark. */
  decorative?: boolean
  title?: string
  ariaLabel?: string
}) {
  const { className = 'outlier-icon', decorative, title, ariaLabel } = props
  const svg = (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <circle
        cx="6"
        cy="6"
        r="4.35"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.45"
      />
    </svg>
  )
  if (decorative) {
    return <span className={className}>{svg}</span>
  }
  return (
    <span className={className} role="img" aria-label={ariaLabel} title={title}>
      {svg}
    </span>
  )
}

// --- Row sort (table column headers) ----------------------------------------

type SortKey =
  | { kind: 'experiment' }
  | { kind: 'input'; field: string }
  | { kind: 'output'; field: string }

const DEFAULT_SORT_KEY: SortKey = { kind: 'experiment' }

type SortState = { key: SortKey; asc: boolean }

const DEFAULT_SORT_STATE: SortState = { key: DEFAULT_SORT_KEY, asc: true }

function sortKeysEqual(a: SortKey, b: SortKey): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'experiment' && b.kind === 'experiment') return true
  if (a.kind === 'input' && b.kind === 'input') return a.field === b.field
  if (a.kind === 'output' && b.kind === 'output') return a.field === b.field
  return false
}

function compareExperimentsForSort(
  dataset: ParseResult['dataset'],
  a: string,
  b: string,
  sortKey: SortKey,
  sortAsc: boolean,
): number {
  const dir = sortAsc ? 1 : -1
  if (sortKey.kind === 'experiment') {
    return dir * a.localeCompare(b, undefined, { sensitivity: 'base' })
  }
  if (sortKey.kind === 'input') {
    const va = dataset[a].inputs[sortKey.field] ?? 0
    const vb = dataset[b].inputs[sortKey.field] ?? 0
    if (va !== vb) return dir * (va - vb)
  } else {
    const va = dataset[a].outputs[sortKey.field] ?? 0
    const vb = dataset[b].outputs[sortKey.field] ?? 0
    if (va !== vb) return dir * (va - vb)
  }
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

/** Tiny sort toggle: `stopPropagation` so it doesn’t fire column-pick on the `<th>`. */
function SortToggleButton(props: {
  active: boolean
  sortAsc: boolean
  onSort: () => void
}) {
  const { active, sortAsc, onSort } = props
  return (
    <button
      type="button"
      className="th-sort-btn"
      title={
        active
          ? sortAsc
            ? 'Sorted ascending (click for descending)'
            : 'Sorted descending (click for ascending)'
          : 'Sort by this column'
      }
      aria-label={
        active
          ? sortAsc
            ? 'Sorted ascending, click to reverse'
            : 'Sorted descending, click to reverse'
          : 'Sort by this column'
      }
      onClick={(e) => {
        e.stopPropagation()
        onSort()
      }}
    >
      {active ? (sortAsc ? '↑' : '↓') : '⇅'}
    </button>
  )
}

// --- Root component ---------------------------------------------------------

export default function App() {
  // --- Editor ---------------------------------------------------------------
  const [jsonText, setJsonText] = useState(sampleDatasetJson)
  const [jsonPanelCollapsed, setJsonPanelCollapsed] = useState(false)

  // --- Column-compare flow --------------------------------------------------
  const [pickColumnsMode, setPickColumnsMode] = useState(false)
  const [firstPickedColumn, setFirstPickedColumn] = useState<ColumnRef | null>(
    null,
  )
  const [compareColumns, setCompareColumns] = useState<{
    a: ColumnRef
    b: ColumnRef
  } | null>(null)

  const [optimizerOpen, setOptimizerOpen] = useState(false)
  const [optimizerCriteria, setOptimizerCriteria] = useState<OptimizerCriterion[]>(
    [],
  )

  const [sort, setSort] = useState<SortState>(DEFAULT_SORT_STATE)

  /**
   * Discriminated union `{ ok, value } | { ok, message }` — try/catch around `parseDataset`
   * so invalid JSON or validation errors never unmount the editor.
   */
  const parsed = useMemo(() => {
    try {
      return { ok: true as const, value: parseDataset(jsonText) }
    } catch (err) {
      const message =
        err instanceof DatasetParseError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err)
      return { ok: false as const, message }
    }
  }, [jsonText])

  /** If the JSON shape changes and the active sort column disappears, fall back to experiment order. */
  useEffect(() => {
    if (!parsed.ok) return
    const { inputFields, outputFields } = parsed.value
    if (sort.key.kind === 'input' && !inputFields.includes(sort.key.field)) {
      setSort(DEFAULT_SORT_STATE)
    }
    if (sort.key.kind === 'output' && !outputFields.includes(sort.key.field)) {
      setSort(DEFAULT_SORT_STATE)
    }
  }, [parsed, sort.key])

  const outputFieldsVersion = useMemo(
    () => (parsed.ok ? parsed.value.outputFields.join('\0') : ''),
    [parsed],
  )

  useEffect(() => {
    if (!parsed.ok) {
      setOptimizerOpen(false)
      setOptimizerCriteria([])
      return
    }
    setOptimizerCriteria([{ field: '', mode: 'max' }])
  }, [parsed.ok, outputFieldsVersion])

  /** Row order for the table and chart (same array passed to `TrendlineModal`). */
  const experimentNames = useMemo(() => {
    if (!parsed.ok) return []
    const keys = Object.keys(parsed.value.dataset)
    const { dataset } = parsed.value
    return [...keys].sort((a, b) =>
      compareExperimentsForSort(dataset, a, b, sort.key, sort.asc),
    )
  }, [parsed, sort])

  const optimizerRanked = useMemo(() => {
    if (!parsed.ok) return null
    return rankExperiments(
      parsed.value.dataset,
      experimentNames,
      optimizerCriteria,
    )
  }, [parsed, experimentNames, optimizerCriteria])

  const outputOutliers = useMemo(() => {
    if (!parsed.ok) return new Map<string, Set<string>>()
    return computeOutliers(parsed.value.dataset, parsed.value.outputFields)
  }, [parsed])

  const handleSort = useCallback((key: SortKey) => {
    setSort((prev) => {
      if (sortKeysEqual(prev.key, key)) {
        return { key: prev.key, asc: !prev.asc }
      }
      return { key, asc: true }
    })
  }, [])

  const exitPickMode = useCallback(() => {
    setPickColumnsMode(false)
    setFirstPickedColumn(null)
  }, [])

  /** Clears any open compare state so a new pick session starts clean. */
  const startPickMode = useCallback(() => {
    setCompareColumns(null)
    setPickColumnsMode(true)
    setFirstPickedColumn(null)
  }, [])

  /**
   * Two-step column pick: first selection stored; second completes pair and opens modal.
   * `useCallback` deps include `firstPickedColumn` so the handler always closes over latest pick.
   */
  const onHeaderColumnClick = useCallback(
    (col: ColumnRef) => {
      if (!pickColumnsMode) return
      if (firstPickedColumn === null) {
        setFirstPickedColumn(col)
        return
      }
      if (sameColumn(firstPickedColumn, col)) return
      setCompareColumns({ a: firstPickedColumn, b: col })
      exitPickMode()
    },
    [pickColumnsMode, firstPickedColumn, exitPickMode],
  )

  /** Keyboard parity with click for header “buttons” while pick mode is active. */
  const headerKeyHandler = useCallback(
    (e: KeyboardEvent, col: ColumnRef) => {
      if (!pickColumnsMode) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onHeaderColumnClick(col)
      }
    },
    [pickColumnsMode, onHeaderColumnClick],
  )

  // --- Render ---------------------------------------------------------------
  return (
    <div className="app">
      <header className="app-header">
        <h1>Experiment dataset</h1>
        <p className="lede">
          Paste JSON below and edit as necessary.
        </p>
      </header>

      <div
        className={
          jsonPanelCollapsed
            ? 'editor-panel editor-panel--json-collapsed'
            : 'editor-panel'
        }
      >
        <button
          type="button"
          className="json-panel-roll-btn"
          onClick={() => setJsonPanelCollapsed((c) => !c)}
          aria-expanded={!jsonPanelCollapsed}
          aria-controls="dataset-json"
          title={
            jsonPanelCollapsed ? 'Show JSON editor' : 'Hide JSON editor'
          }
        >
          <span className="json-panel-roll-icon" aria-hidden>
            ^
          </span>
        </button>
        <label className="label" htmlFor="dataset-json">
          Dataset JSON
        </label>
        <textarea
          id="dataset-json"
          className="json-input"
          spellCheck={false}
          value={jsonText}
          onChange={(e) => setJsonText(e.target.value)}
          rows={12}
          hidden={jsonPanelCollapsed}
        />
        {!parsed.ok ? (
          <p className="parse-error" role="alert">
            {parsed.message}
          </p>
        ) : null}
      </div>

      {parsed.ok ? (
        <section className="table-section" aria-label="Parsed experiments">
          <div className="table-toolbar">
            {pickColumnsMode ? (
              <>
                <p className="pick-hint" role="status">
                  {firstPickedColumn === null
                    ? 'Click a numeric column header for the first axis (X before swap).'
                    : `First: ${firstPickedColumn.field}. Now click a different column header.`}
                </p>
                <button type="button" className="toolbar-btn" onClick={exitPickMode}>
                  Cancel
                </button>
              </>
            ) : (
              <div className="table-toolbar-actions">
                <button
                  type="button"
                  className="toolbar-btn primary"
                  onClick={startPickMode}
                >
                  Plot two columns…
                </button>
                <button
                  type="button"
                  className="toolbar-btn"
                  disabled={parsed.value.outputFields.length === 0}
                  onClick={() => {
                    setOptimizerOpen(true)
                    setOptimizerCriteria((prev) =>
                      prev.length ? prev : [{ field: '', mode: 'max' }],
                    )
                  }}
                >
                  Multi-Output Optimization
                </button>
              </div>
            )}
          </div>

          <p className="outlier-legend">
            Suggested Outliers are Denoted by{' '}
            <OutlierRingGlyph decorative className="outlier-icon outlier-legend-glyph" />
          </p>

          <div
            className={
              pickColumnsMode ? 'table-shell table-shell--pick-mode' : 'table-shell'
            }
          >
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col" className="sticky-left">
                      <span className="th-label-row">
                        <span className="th-col-name">Experiment</span>
                        <SortToggleButton
                          active={sortKeysEqual(sort.key, { kind: 'experiment' })}
                          sortAsc={sort.asc}
                          onSort={() => handleSort({ kind: 'experiment' })}
                        />
                      </span>
                    </th>
                    {parsed.value.inputFields.map((name) => {
                      const col: ColumnRef = { kind: 'input', field: name }
                      const selected = !!(
                        firstPickedColumn && sameColumn(firstPickedColumn, col)
                      )
                      return (
                        <th
                          key={`in:${name}`}
                          scope="col"
                          className={pickableHeaderClassNames({
                            base: ['num'],
                            pickColumnsMode,
                            selected,
                          })}
                          onClick={
                            pickColumnsMode
                              ? () => onHeaderColumnClick(col)
                              : undefined
                          }
                          onKeyDown={
                            pickColumnsMode
                              ? (e) => headerKeyHandler(e, col)
                              : undefined
                          }
                          tabIndex={pickColumnsMode ? 0 : undefined}
                          role={pickColumnsMode ? 'button' : undefined}
                          aria-pressed={selected ? true : undefined}
                        >
                          <span className="th-label-row th-label-row--end">
                            <span className="th-col-name">{name}</span>
                            <SortToggleButton
                              active={sortKeysEqual(sort.key, {
                                kind: 'input',
                                field: name,
                              })}
                              sortAsc={sort.asc}
                              onSort={() =>
                                handleSort({ kind: 'input', field: name })
                              }
                            />
                          </span>
                        </th>
                      )
                    })}
                    {parsed.value.outputFields.map((name) => {
                      const col: ColumnRef = { kind: 'output', field: name }
                      const selected = !!(
                        firstPickedColumn && sameColumn(firstPickedColumn, col)
                      )
                      return (
                        <th
                          key={`out:${name}`}
                          scope="col"
                          className={pickableHeaderClassNames({
                            base: ['num', 'output'],
                            pickColumnsMode,
                            selected,
                          })}
                          onClick={
                            pickColumnsMode
                              ? () => onHeaderColumnClick(col)
                              : undefined
                          }
                          onKeyDown={
                            pickColumnsMode
                              ? (e) => headerKeyHandler(e, col)
                              : undefined
                          }
                          tabIndex={pickColumnsMode ? 0 : undefined}
                          role={pickColumnsMode ? 'button' : undefined}
                          aria-pressed={selected ? true : undefined}
                        >
                          <span className="th-label-row th-label-row--end">
                            <span className="th-col-name">{name}</span>
                            <SortToggleButton
                              active={sortKeysEqual(sort.key, {
                                kind: 'output',
                                field: name,
                              })}
                              sortAsc={sort.asc}
                              onSort={() =>
                                handleSort({ kind: 'output', field: name })
                              }
                            />
                          </span>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {experimentNames.map((experiment) => {
                    const row = parsed.value.dataset[experiment]
                    return (
                      <tr key={experiment}>
                        <th scope="row" className="sticky-left experiment">
                          {experiment}
                        </th>
                        {parsed.value.inputFields.map((field) => (
                          <td key={field} className="num">
                            {row.inputs[field] ?? 0}
                          </td>
                        ))}
                        {parsed.value.outputFields.map((field) => {
                          const isOutlier =
                            outputOutliers.get(experiment)?.has(field) ?? false
                          return (
                            <td key={field} className="num output">
                              <span className="output-num-wrap">
                                {isOutlier ? (
                                  <OutlierRingGlyph
                                    ariaLabel="Z-score outlier for this output column"
                                    title="Output outlier: |z| > 2.5 vs this column (population σ)"
                                  />
                                ) : null}
                                {row.outputs[field] ?? 0}
                              </span>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {parsed.ok && compareColumns ? (
        <TrendlineModal
          onClose={() => setCompareColumns(null)}
          colA={compareColumns.a}
          colB={compareColumns.b}
          dataset={parsed.value.dataset}
          experimentNames={experimentNames}
        />
      ) : null}

      {parsed.ok && optimizerOpen ? (
        <OptimizerModal
          outputFields={parsed.value.outputFields}
          criteria={optimizerCriteria}
          setCriteria={setOptimizerCriteria}
          ranked={optimizerRanked}
          onClose={() => setOptimizerOpen(false)}
        />
      ) : null}
    </div>
  )
}
