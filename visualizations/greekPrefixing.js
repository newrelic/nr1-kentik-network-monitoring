export function calculateStdDeviation(data) {
  const filteredData = data.filter(datum => datum !== undefined);
  const avg =
    filteredData.reduce((sum, row) => sum + row, 0) / filteredData.length;
  const diffs = filteredData.map(row => (row - avg) ** 2);
  const stdDev = Math.sqrt(
    diffs.reduce((sum, val) => sum + val, 0) / diffs.length
  );
  return { avg, stdDev };
}

export function nStdDeviations(data, n = 2) {
  const { avg, stdDev } = calculateStdDeviation(data);
  return avg + stdDev * n;
}

export const PREFIXES = [
  { value: 'P', magnitude: 10 ** 15 },
  { value: 'T', magnitude: 10 ** 12 },
  { value: 'G', magnitude: 10 ** 9 },
  { value: 'M', magnitude: 10 ** 6 },
  { value: 'K', magnitude: 10 ** 3 }
];

export function greekPrefix(data, scaleMax = 5) {
  const twoStdDeviations = nStdDeviations(data, 2);
  const prefix = PREFIXES.find(
    pf => twoStdDeviations / pf.magnitude > scaleMax
  );
  return prefix ? prefix.value : '';
}

export function adjustByGreekPrefix(value, prefix) {
  const prefixFound = PREFIXES.find(pf => pf.value === prefix);

  return prefixFound ? value / prefixFound.magnitude : value;
}

export function formatBytesGreek(value, suffix = 'B', scaleMax) {
  const prefix = greekPrefix(Array.isArray(value) ? value : [value], scaleMax);
  const total = Array.isArray(value)
    ? value.reduce((sum, row) => sum + parseFloat(row), 0)
    : parseFloat(value);
  return `${adjustByGreekPrefix(total, prefix).toFixed()} ${prefix}${suffix}`;
}
