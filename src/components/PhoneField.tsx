import { useState } from 'react'
import {
  getCountries, getCountryCallingCode, getExampleNumber, parseDigits, parsePhoneNumberFromString,
  validatePhoneNumberLength, type CountryCode,
} from 'libphonenumber-js/max'
import examples from 'libphonenumber-js/examples.mobile.json'
import Select from './Select'

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' })
const countryOptions = getCountries()
  .map(code => ({ value: code, label: `${countryNames.of(code) || code} (+${getCountryCallingCode(code)})` }))
  .sort((a, b) => a.label.localeCompare(b.label))

/** Typical and longest national-number length for a country (Sri Lanka: 9 / 9). */
function digitLimits(country: CountryCode) {
  const typical = getExampleNumber(country, examples)?.nationalNumber.length || 9
  const dial = getCountryCallingCode(country)
  const possible = Array.from({ length: 15 - dial.length }, (_, i) => i + 1)
    .filter(length => !validatePhoneNumberLength(`+${dial}${'7'.repeat(length)}`, country))
  return { typical, maximum: Math.max(typical, ...possible) }
}

/** Any stored or typed form (+94…, 0094…, 07…, 7…) → national digits for the country. */
export function nationalDigits(value: string, country: CountryCode) {
  const raw = String(value || '').trim()
  const { maximum } = digitLimits(country)
  const parsed = parsePhoneNumberFromString(raw, country)
  if (raw.startsWith('+')) {
    const dial = getCountryCallingCode(country)
    if (parsed) return parsed.countryCallingCode === dial ? parsed.nationalNumber.slice(0, maximum) : ''
    // Too short to parse yet (e.g. "+947" while typing): keep the digits after
    // this country's code instead of dropping them.
    const all = parseDigits(raw)
    return all.startsWith(dial) ? all.slice(dial.length, dial.length + maximum) : ''
  }
  if (parsed?.isValid() && parsed.country === country) return parsed.nationalNumber
  let digits = parseDigits(raw)
  const example = getExampleNumber(country, examples)
  if (example) {
    const national = parseDigits(example.formatNational())
    const trunk = national.endsWith(example.nationalNumber) ? national.slice(0, -example.nationalNumber.length) : ''
    if (trunk && digits.startsWith(trunk)) digits = digits.slice(trunk.length)
  }
  return digits.slice(0, maximum)
}

/** True when two phone strings are the same number, whatever format each is stored in. */
export function samePhone(a: string | null | undefined, b: string | null | undefined, country: CountryCode = 'LK') {
  const x = parsePhoneNumberFromString(String(a || ''), country)?.number || String(a || '').trim()
  const y = parsePhoneNumberFromString(String(b || ''), country)?.number || String(b || '').trim()
  return x === y
}

/** Sri Lankan local form (07XXXXXXXX) used for TaskWise login IDs. */
export function localSriLankanPhone(value: string) {
  const digits = nationalDigits(value, 'LK')
  return digits ? `0${digits}` : ''
}

function detectCountry(value: string): CountryCode {
  return (value.trim().startsWith('+') && parsePhoneNumberFromString(value)?.country) || 'LK'
}

type Props = {
  /** E.164 (+94771234567); older local forms such as 0771234567 are read too. Emits E.164, or '' when empty. */
  value: string
  onChange: (value: string) => void
  /** Controlled country; omit to let the field manage it. */
  country?: CountryCode
  onCountryChange?: (country: CountryCode) => void
  /** Fix the country (e.g. Sri Lanka-only TaskWise logins) and hide the picker. */
  lockCountry?: CountryCode
  disabled?: boolean
  id?: string
  label?: string
}

/**
 * Country code + one box per digit, so people can see how many digits the number needs.
 * A transparent native input sits over the boxes, so typing, paste and autofill still work.
 */
export default function PhoneField({ value, onChange, country: controlled, onCountryChange, lockCountry, disabled = false, id, label = 'Phone number' }: Props) {
  const [own, setOwn] = useState<CountryCode>(() => lockCountry || detectCountry(value))
  const country = lockCountry || controlled || own
  const [focused, setFocused] = useState(false)
  const dial = getCountryCallingCode(country)
  const { typical, maximum } = digitLimits(country)
  const digits = nationalDigits(value, country)
  const boxes = Math.min(maximum, Math.max(typical, digits.length))
  const active = Math.min(digits.length, boxes - 1)

  const emit = (next: string, nextCountry = country) => {
    const clean = nationalDigits(next, nextCountry)
    onChange(clean ? `+${getCountryCallingCode(nextCountry)}${clean}` : '')
  }

  const pickCountry = (next: CountryCode) => {
    setOwn(next)
    onCountryChange?.(next)
    onChange('')
  }

  return (
    <div className={disabled ? 'opacity-60' : ''}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        {lockCountry ? (
          <span className="inline-flex items-center h-8 px-2.5 rounded-lg border border-tw-border bg-tw-surface-2 text-xs font-semibold text-tw-text">
            {countryNames.of(country)} +{dial}
          </span>
        ) : (
          <div className="w-52 max-w-[65%]">
            <Select ariaLabel="Country code" value={country} disabled={disabled}
              onChange={next => pickCountry(next as CountryCode)} options={countryOptions} />
          </div>
        )}
        <span className="text-[11px] font-semibold text-tw-text-secondary whitespace-nowrap">{digits.length}/{boxes} digits</span>
      </div>
      <div className="relative">
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          aria-label={`${label}, ${boxes} digits after +${dial}`}
          disabled={disabled}
          value={digits}
          onChange={e => emit(e.target.value)}
          onFocus={e => { setFocused(true); const end = e.currentTarget.value.length; e.currentTarget.setSelectionRange(end, end) }}
          onBlur={() => setFocused(false)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-text z-10 disabled:cursor-not-allowed"
          style={{ caretColor: 'transparent' }}
        />
        <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${boxes}, minmax(0, 1fr))` }} aria-hidden="true">
          {Array.from({ length: boxes }, (_, i) => (
            <span key={i}
              className={`h-11 flex items-center justify-center rounded-lg border text-base font-bold tabular-nums transition-colors ${
                focused && i === active
                  ? 'border-tw-primary ring-2 ring-tw-primary/20 bg-tw-surface text-tw-text'
                  : digits[i] ? 'border-tw-border bg-tw-surface text-tw-text' : 'border-tw-border bg-tw-surface-2'
              }`}>
              {digits[i] ?? <span className="text-tw-text-muted font-normal">·</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
