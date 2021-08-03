import * as countryData from './data/countryData.js';
import countryBounds from './data/countryBounds.json';

export function getCountryMapData(countryCode) {
  const code = countryCode.toLowerCase();
  let data = {};

  if (countryCode && countryData[code]) {
    data = countryData[code];
    data.bounds = countryBounds[code];
  }

  return data;
}
