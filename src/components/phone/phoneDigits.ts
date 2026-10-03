import { getCountryCallingCode, getExampleNumber, parseDigits, parsePhoneNumberFromString, validatePhoneNumberLength, type CountryCode } from 'libphonenumber-js/max';
import examples from 'libphonenumber-js/examples.mobile.json';

export function phoneDigitLimits(country: CountryCode) {
  const example = getExampleNumber(country, examples);
  const typical = example?.nationalNumber.length || 9;
  const callingCode = getCountryCallingCode(country);
  const possible = Array.from({ length: 15 - callingCode.length }, (_, i) => i + 1)
    .filter(length => !validatePhoneNumberLength(`+${callingCode}${'7'.repeat(length)}`, country));
  return { typical, maximum: Math.max(typical, ...possible) };
}

export function nationalPhoneDigits(value: string, country: CountryCode) {
  const parsed = parsePhoneNumberFromString(value, country);
  if (value.trim().startsWith('+')) {
    // A pasted dial code is never mistaken for national digits.
    if (!parsed || parsed.countryCallingCode !== getCountryCallingCode(country)) return '';
    return parsed.nationalNumber.slice(0, phoneDigitLimits(country).maximum);
  }
  if (parsed?.isValid() && parsed.country === country) return parsed.nationalNumber;
  let digits = parseDigits(value);
  const example = getExampleNumber(country, examples);
  if (example) {
    const national = parseDigits(example.formatNational());
    const trunk = national.endsWith(example.nationalNumber) ? national.slice(0, -example.nationalNumber.length) : '';
    if (trunk && digits.startsWith(trunk)) digits = digits.slice(trunk.length);
  }
  return digits.slice(0, phoneDigitLimits(country).maximum);
}

export function phoneBoxCount(country: CountryCode, value: string) {
  const { typical, maximum } = phoneDigitLimits(country);
  const parsed = parsePhoneNumberFromString(value, country);
  if (parsed?.isValid() && parsed.country === country && ['MOBILE', 'FIXED_LINE_OR_MOBILE'].includes(parsed.getType() || '')) return parsed.nationalNumber.length;
  return Math.min(maximum, Math.max(typical, value.length));
}
