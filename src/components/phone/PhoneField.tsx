'use client';
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';
import DigitField from './DigitField';
import Select from '../Select';
import { nationalPhoneDigits, phoneBoxCount, phoneDigitLimits } from './phoneDigits';
const names = new Intl.DisplayNames(['en'], { type: 'region' });
const countries = getCountries().map(code => ({ code, name: names.of(code) || code, dial: getCountryCallingCode(code) })).sort((a, b) => a.name.localeCompare(b.name));
const countryOptions = countries.map(item => ({ value: item.code, label: `${item.name} (+${item.dial})` }));
export function mobileNumber(value: string, country: CountryCode) {
  const phone = parsePhoneNumberFromString(value, country);
  if (!phone?.isValid() || phone.country !== country || !['MOBILE', 'FIXED_LINE_OR_MOBILE'].includes(phone.getType() || '') || (country === 'LK' && phone.getType() !== 'MOBILE')) throw new Error('Enter a valid mobile number for the selected country.');
  return phone.number;
}
export default function PhoneField({ country, number, onCountry, onNumber, autoComplete = 'tel-national' }: { country: CountryCode; number: string; onCountry: (value: CountryCode) => void; onNumber: (value: string) => void; autoComplete?: string }) {
  const limits = phoneDigitLimits(country);
  const value = nationalPhoneDigits(number, country);
  return <><div><span id="phone-country-label">Country and calling code</span><Select className="mt-1 w-full" ariaLabel="Country and calling code" value={country} options={countryOptions} onChange={value => { onCountry(value as CountryCode); onNumber(''); }} /></div>
    <DigitField id="mobile-number" label="Mobile number" autoComplete={autoComplete} value={value} length={phoneBoxCount(country, value)} maximum={limits.maximum} normalize={raw => nationalPhoneDigits(raw, country)} onChange={onNumber} />
    <p className="identity-note" style={{ margin: 0 }}>Enter the digits after +{getCountryCallingCode(country)}.</p></>;
}
