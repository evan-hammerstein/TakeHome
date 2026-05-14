import type { Dataset } from './types'

export type OutlierSet = Map<string, Set<string>>

const Z_THRESHOLD = 2.5

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0
  }
  let sum = 0
  for (const v of values) {
    sum += v
  }
  return sum / values.length
}

function populationStddev(values: number[], m: number): number {
  const n = values.length
  if (n < 2) {
    return 0
  }
  let sumSq = 0
  for (const v of values) {
    const d = v - m
    sumSq += d * d
  }
  return Math.sqrt(sumSq / n)
}

export function computeOutliers(dataset: Dataset, outputs: string[]): OutlierSet {
  const result: OutlierSet = new Map()
  const experimentNames = Object.keys(dataset)

  for (const field of outputs) {
    const values: number[] = []
    for (const name of experimentNames) {
      values.push(dataset[name].outputs[field] ?? 0)
    }
    const m = mean(values)
    const s = populationStddev(values, m)
    if (s === 0) {
      continue
    }
    for (const name of experimentNames) {
      const expValue = dataset[name].outputs[field] ?? 0
      const z = Math.abs((expValue - m) / s)
      if (z > Z_THRESHOLD) {
        let setForExperiment = result.get(name)
        if (setForExperiment === undefined) {
          setForExperiment = new Set<string>()
          result.set(name, setForExperiment)
        }
        setForExperiment.add(field)
      }
    }
  }

  return result
}
