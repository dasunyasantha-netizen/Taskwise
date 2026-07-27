const LEGAL_TERMS = new Set([
  'PRIVATE', 'PVT', 'LIMITED', 'LTD', 'PLC', 'INC', 'COMPANY',
])

export function meaningfulCompanyWords(name: string): string[] {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[^A-Za-z\s]/g, ' ')
    .split(/\s+/)
    .map(w => w.toUpperCase())
    .filter(w => w && !LEGAL_TERMS.has(w))
}

export function validateCompanyPrefix(prefix: string): string {
  const normalized = String(prefix || '').trim().toUpperCase()
  if (!/^[A-Z]{2,6}$/.test(normalized)) {
    throw new Error('Prefix must contain only 2 to 6 uppercase letters')
  }
  return normalized
}

function uniquePush(values: string[], value: string) {
  if (/^[A-Z]{2,6}$/.test(value) && !values.includes(value)) values.push(value)
}

export function generatePrefixCandidates(companyName: string): string[] {
  const words = meaningfulCompanyWords(companyName)
  const candidates: string[] = []
  if (words.length === 0) return candidates

  if (words.length === 1) {
    const word = words[0]
    for (let len = 2; len <= Math.min(6, word.length); len++) uniquePush(candidates, word.slice(0, len))
    return candidates
  }

  uniquePush(candidates, words.slice(0, 2).map(w => w[0]).join(''))
  uniquePush(candidates, words.map(w => w[0]).join('').slice(0, 6))

  for (let len = 3; len <= 6; len++) {
    const first = words[0]
    const second = words[1]
    if (len === 3) {
      uniquePush(candidates, `${first.slice(0, 2)}${second[0]}`)
      uniquePush(candidates, `${first[0]}${second.slice(0, 2)}`)
    } else {
      uniquePush(candidates, `${first.slice(0, Math.ceil(len / 2))}${second.slice(0, Math.floor(len / 2))}`)
    }
  }

  const joined = words.join('')
  for (let len = 2; len <= Math.min(6, joined.length); len++) uniquePush(candidates, joined.slice(0, len))

  return candidates
}

export async function suggestAvailablePrefix(
  companyName: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  for (const candidate of generatePrefixCandidates(companyName)) {
    if (!(await isTaken(candidate))) return candidate
  }
  throw new Error('No available letter-only prefix could be derived from the company name')
}
