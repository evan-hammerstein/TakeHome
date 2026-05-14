import type { Dataset } from './types'

export type OptimizerCriterion = { field: string; mode: 'max' | 'min' }

export type RankedExperiment = { experiment: string; score: number }

export function rankExperiments(
  dataset: Dataset,
  experimentNames: string[],
  criteria: OptimizerCriterion[],
): RankedExperiment[] | null {
  const active = criteria.filter((c) => c.field !== '')
  if (active.length === 0) return null

  const byField = new Map<string, 'max' | 'min'>()
  for (const c of active) {
    byField.set(c.field, c.mode)
  }
  const unique: OptimizerCriterion[] = [...byField.entries()].map(([field, mode]) => ({
    field,
    mode,
  }))

  const scored: RankedExperiment[] = experimentNames.map((name) => {
    const row = dataset[name]
    let sum = 0
    for (const c of unique) {
      const v = row.outputs[c.field] ?? 0
      const vals = experimentNames.map((n) => dataset[n].outputs[c.field] ?? 0)
      const minV = Math.min(...vals)
      const maxV = Math.max(...vals)
      const t = maxV === minV ? 0.5 : (v - minV) / (maxV - minV)
      sum += c.mode === 'max' ? t : 1 - t
    }
    return { experiment: name, score: sum / unique.length }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored
}
