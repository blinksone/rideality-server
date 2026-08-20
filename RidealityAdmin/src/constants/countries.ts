import worldCountries from 'world-countries';

export interface CountryOption {
  code: string;
  name: string;
  currency: string;
  phonePrefix: string;
  flag: string;
}

function phonePrefixFromIdd(idd: { root?: string; suffixes?: string[] }): string {
  if (!idd?.root) return '';
  if (!idd.suffixes?.length) return idd.root;
  if (idd.suffixes.length > 1 || idd.suffixes[0].length > 2) return idd.root;
  return `${idd.root}${idd.suffixes[0]}`;
}

export const COUNTRY_OPTIONS: CountryOption[] = worldCountries
  .filter((country) => country.independent && country.status === 'officially-assigned')
  .map((country) => {
    const currency = Object.keys(country.currencies ?? {})[0] ?? '';
    const phonePrefix = phonePrefixFromIdd(country.idd);
    return {
      code: country.cca2,
      name: country.name.common,
      currency,
      phonePrefix,
      flag: country.flag,
    };
  })
  .filter((country) => country.code && country.name && country.currency && country.phonePrefix)
  .sort((a, b) => a.name.localeCompare(b.name));

export function findCountryByCode(code: string): CountryOption | undefined {
  return COUNTRY_OPTIONS.find((country) => country.code === code.toUpperCase());
}
