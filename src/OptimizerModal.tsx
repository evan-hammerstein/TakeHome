import {
  useCallback,
  useEffect,
  type Dispatch,
  type SetStateAction,
} from 'react'
import type { OptimizerCriterion, RankedExperiment } from './optimizerRank'

type Props = {
  outputFields: string[]
  criteria: OptimizerCriterion[]
  setCriteria: Dispatch<SetStateAction<OptimizerCriterion[]>>
  ranked: RankedExperiment[] | null
  onClose: () => void
}

export function OptimizerModal({
  outputFields,
  criteria,
  setCriteria,
  ranked,
  onClose,
}: Props) {
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

  const optionsForRow = (rowIndex: number) => {
    const taken = new Set(
      criteria
        .map((c, i) => (i !== rowIndex && c.field ? c.field : null))
        .filter(Boolean) as string[],
    )
    return outputFields.filter((f) => !taken.has(f))
  }

  const top3 = ranked?.slice(0, 3) ?? []

  return (
    <div
      className="optimizer-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="optimizer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="optimizer-modal-title"
        aria-describedby="optimizer-modal-caption"
      >
        <header className="optimizer-modal-header">
          <div className="optimizer-modal-heading">
            <h2 id="optimizer-modal-title">Multi-Output Optimization</h2>
            <p id="optimizer-modal-caption" className="optimizer-modal-caption">
              Select multiple criterion to optimize for based on average percentiles.
            </p>
          </div>
          <button
            type="button"
            className="optimizer-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="optimizer-modal-body">
          {criteria.map((c, i) => (
            <div key={i} className="optimizer-criterion-row">
              <select
                aria-label={`Output ${i + 1}`}
                value={c.field}
                onChange={(e) => {
                  const field = e.target.value
                  setCriteria((prev) =>
                    prev.map((row, j) => (j === i ? { ...row, field } : row)),
                  )
                }}
              >
                <option value="">Choose output…</option>
                {(c.field && !optionsForRow(i).includes(c.field)
                  ? [c.field, ...optionsForRow(i)]
                  : optionsForRow(i)
                ).map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
              <select
                aria-label={`Goal for output ${i + 1}`}
                value={c.mode}
                onChange={(e) => {
                  const mode = e.target.value as 'max' | 'min'
                  setCriteria((prev) =>
                    prev.map((row, j) => (j === i ? { ...row, mode } : row)),
                  )
                }}
              >
                <option value="max">Maximize</option>
                <option value="min">Minimize</option>
              </select>
              {criteria.length > 1 ? (
                <button
                  type="button"
                  className="optimizer-remove"
                  aria-label="Remove criterion"
                  onClick={() =>
                    setCriteria((prev) => prev.filter((_, j) => j !== i))
                  }
                >
                  ×
                </button>
              ) : null}
            </div>
          ))}

          <div className="optimizer-modal-actions">
            <button
              type="button"
              className="toolbar-btn"
              onClick={() =>
                setCriteria((prev) => [...prev, { field: '', mode: 'max' }])
              }
            >
              Add another
            </button>
            <button
              type="button"
              className="toolbar-btn"
              onClick={() => setCriteria([{ field: '', mode: 'max' }])}
            >
              Clear all
            </button>
          </div>

          {criteria.every((c) => c.field) && ranked ? (
            top3.length > 0 ? (
              <ol className="optimizer-top3">
                {top3.map((r, idx) => (
                  <li key={r.experiment}>
                    {idx + 1}. {r.experiment}{' '}
                    <span className="optimizer-top3-score">
                      ({r.score.toFixed(4)})
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="optimizer-empty-hint">No experiments to rank.</p>
            )
          ) : (
            <p className="optimizer-empty-hint">
              Pick at least one output above to see ranked experiments.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
