/**
 * parseDataset — JSON → validated experiment table model
 *
 * **Read top → bottom:** public types → error class → shape/number guards → one-row parser
 * → `parseDataset` orchestration (top-level JSON + column union).
 *
 * Ticket-style summary:
 * - Parse with `JSON.parse`; any syntax error becomes `DatasetParseError` so the UI
 *   can show one consistent error path (same as shape violations).
 * - Walk the top-level object with `Object.entries`; each value is an experiment row.
 * - Validate with small guards: `isPlainObject` rejects arrays/null/nested JSON types
 *   where we require a string-keyed map.
 * - `inputs` / `outputs` are required own properties (`hasOwnProperty`) so `"inputs": null`
 *   fails clearly; values are normalized via `parseNumericFieldMap` + `assertNonNegativeNumber`.
 * - Column headers (`inputFields`, `outputFields`) are built as the **union of keys**
 *   seen across all runs, then sorted with `localeCompare(..., { sensitivity: 'base' })`
 *   for stable, case-insensitive alphabetical order.
 *
 * Product decisions (documented for reviewers):
 * - Extra keys on an experiment object: ignored (only `inputs` / `outputs` read).
 * - Missing `inputs` or `outputs`: error (both required).
 * - Missing keys inside inputs/outputs for a given cell: UI treats as 0 (handled in App,
 *   not in this module’s output maps — maps only contain keys that were present in JSON).
 */

// --- Public types ----------------------------------------------------------

export interface ParseResult {
  dataset: Record<
    string,
    { inputs: Record<string, number>; outputs: Record<string, number> }
  >
  inputFields: string[]
  outputFields: string[]
}

/** Thrown for invalid JSON or failed validation. */
export class DatasetParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DatasetParseError'
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Coerces a JSON value to a finite, non-negative number; context string prefixes error messages. */
function assertNonNegativeNumber(value: unknown, ctx: string): number {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new DatasetParseError(
      `${ctx}: expected a finite number, got ${JSON.stringify(value)}`,
    )
  }
  if (value < 0) {
    throw new DatasetParseError(`${ctx}: expected a non-negative number, got ${value}`)
  }
  return value
}

/** Validates a flat map of string → number (each entry through `assertNonNegativeNumber`). */
function parseNumericFieldMap(
  obj: unknown,
  ctx: string,
): Record<string, number> {
  if (!isPlainObject(obj)) {
    throw new DatasetParseError(`${ctx}: expected a plain object`)
  }
  const out: Record<string, number> = {}
  for (const [key, val] of Object.entries(obj)) {
    out[key] = assertNonNegativeNumber(val, `${ctx}[${JSON.stringify(key)}]`)
  }
  return out
}

// --- Column ordering ---------------------------------------------------------
// --- One experiment (row) ---------------------------------------------------

/**
 * Validates and normalizes a single top-level entry: must be an object with required
 * `inputs` / `outputs` maps. Extra keys on the experiment object are ignored here.
 */
function parseExperimentRow(
  experimentName: string,
  experimentValue: unknown,
): { inputs: Record<string, number>; outputs: Record<string, number> } {
  const expCtx = `Experiment ${JSON.stringify(experimentName)}`

  if (!isPlainObject(experimentValue)) {
    throw new DatasetParseError(`${expCtx}: value must be a plain object`)
  }

  if (!Object.prototype.hasOwnProperty.call(experimentValue, 'inputs')) {
    throw new DatasetParseError(`${expCtx}: missing required property "inputs"`)
  }
  if (!Object.prototype.hasOwnProperty.call(experimentValue, 'outputs')) {
    throw new DatasetParseError(`${expCtx}: missing required property "outputs"`)
  }

  const inputs = parseNumericFieldMap(
    experimentValue.inputs,
    `${expCtx}.inputs`,
  )
  const outputs = parseNumericFieldMap(
    experimentValue.outputs,
    `${expCtx}.outputs`,
  )

  return { inputs, outputs }
}

const byFieldName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: 'base' })

export function parseDataset(jsonText: string): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    throw new DatasetParseError(`Invalid JSON: ${detail}`)
  }

  if (!isPlainObject(parsed)) {
    throw new DatasetParseError('Top-level JSON value must be an object')
  }

  const dataset: ParseResult['dataset'] = {}
  const inputKeys = new Set<string>()
  const outputKeys = new Set<string>()

  for (const [experimentName, experimentValue] of Object.entries(parsed)) {
    const { inputs, outputs } = parseExperimentRow(experimentName, experimentValue)
    dataset[experimentName] = { inputs, outputs }
    for (const k of Object.keys(inputs)) inputKeys.add(k)
    for (const k of Object.keys(outputs)) outputKeys.add(k)
  }

  return {
    dataset,
    inputFields: [...inputKeys].sort(byFieldName),
    outputFields: [...outputKeys].sort(byFieldName),
  }
}
