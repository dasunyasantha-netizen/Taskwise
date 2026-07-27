export function normalizeSriLankanPhone(input: string): { canonical: string; local: string } {
  const digits = String(input || '').replace(/\D/g, '')
  let local = digits

  if (local.startsWith('0094')) local = local.slice(4)
  if (local.startsWith('94')) local = local.slice(2)
  if (local.startsWith('0')) local = local.slice(1)

  if (!/^7\d{8}$/.test(local)) {
    throw new Error('Invalid Sri Lankan mobile phone number')
  }

  return {
    canonical: `94${local}`,
    local: `0${local}`,
  }
}

export function normalizeEmail(input: string): string {
  return String(input || '').trim().toLowerCase()
}

export function makeLoginId(prefix: string | null | undefined, phone: string): string {
  const { local } = normalizeSriLankanPhone(phone)
  return prefix ? `${prefix.toUpperCase()}${local}` : local
}

/**
 * The prefix to apply when generating a company user's login ID.
 * Legacy companies that allow unprefixed login (Youth Council) never prefix —
 * new users get the bare phone number, matching existing Youth Council users.
 */
export function companyLoginPrefix(
  company: { prefix: string; allowUnprefixedLogin: boolean } | null | undefined,
): string | null {
  if (!company || company.allowUnprefixedLogin) return null
  return company.prefix
}

/**
 * Build the lookup keys for a login attempt.
 *
 * Standard Sri Lankan mobile numbers (optionally carrying a company prefix, e.g.
 * FF0712345678) are parsed and normalized. Anything else — notably legacy short
 * internal login codes such as "07208" used by existing Youth Council users — is
 * treated as a raw, unprefixed login ID so pre-existing accounts are never
 * locked out by the new prefixed-login format.
 */
export function resolveLoginLookup(input: string): {
  loginId: string
  lookupPhone: string
  selector: { prefix: string | null; localPhone: string }
} {
  try {
    const parsed = parseLoginId(input)
    const loginId = parsed.prefix ? `${parsed.prefix}${parsed.localPhone}` : parsed.localPhone
    return { loginId, lookupPhone: parsed.localPhone, selector: { prefix: parsed.prefix, localPhone: parsed.localPhone } }
  } catch {
    const raw = String(input || '').trim().replace(/\s+/g, '')
    return { loginId: raw, lookupPhone: raw, selector: { prefix: null, localPhone: raw } }
  }
}

export function parseLoginId(input: string): { prefix: string | null; localPhone: string; canonicalPhone: string } {
  const loginId = String(input || '').trim().toUpperCase().replace(/\s+/g, '')
  const match = loginId.match(/^([A-Z]{2,6})?(0?7\d{8}|94?7\d{8})$/)
  if (!match) throw new Error('Invalid login ID')
  const prefix = match[1] || null
  const normalized = normalizeSriLankanPhone(match[2])
  return { prefix, localPhone: normalized.local, canonicalPhone: normalized.canonical }
}
