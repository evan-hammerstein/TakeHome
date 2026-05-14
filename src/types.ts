/** Experiment rows keyed by name (same shape as `ParseResult['dataset']` from `parseDataset`). */
export type Dataset = Record<
  string,
  { inputs: Record<string, number>; outputs: Record<string, number> }
>
