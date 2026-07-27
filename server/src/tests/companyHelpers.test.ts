import assert from 'assert'
import { normalizeSriLankanPhone, makeLoginId, parseLoginId } from '../helpers/phone'
import { generatePrefixCandidates, suggestAvailablePrefix, validateCompanyPrefix } from '../helpers/prefix'

async function main() {
  const phones = ['0712345678', '712345678', '94712345678', '+94712345678', '+94 71 234 5678', '071 234 5678']
  for (const p of phones) {
    const normalized = normalizeSriLankanPhone(p)
    assert.equal(normalized.canonical, '94712345678')
    assert.equal(normalized.local, '0712345678')
  }

  assert.equal(makeLoginId('FF', '+94 71 234 5678'), 'FF0712345678')
  assert.deepEqual(parseLoginId('ff0712345678'), { prefix: 'FF', localPhone: '0712345678', canonicalPhone: '94712345678' })
  assert.deepEqual(parseLoginId('0712345678'), { prefix: null, localPhone: '0712345678', canonicalPhone: '94712345678' })

  assert.equal(generatePrefixCandidates('Fair First')[0], 'FF')
  assert.equal(generatePrefixCandidates('Youth Council')[0], 'YC')
  assert.equal(generatePrefixCandidates('ABC Logistics')[0], 'AL')
  assert.equal(generatePrefixCandidates('Dialog')[0], 'DI')
  assert.equal(generatePrefixCandidates('Fair First Private Limited')[0], 'FF')

  assert.equal(validateCompanyPrefix('ff'), 'FF')
  assert.throws(() => validateCompanyPrefix('FF2'))
  assert.throws(() => validateCompanyPrefix('F-F'))
  assert.throws(() => validateCompanyPrefix('F'))

  const fairFallback = await suggestAvailablePrefix('Fair First', async p => p === 'FF')
  assert.notEqual(fairFallback, 'FF')
  assert.match(fairFallback, /^[A-Z]{3,6}$/)

  const abcFallback = await suggestAvailablePrefix('ABC Logistics', async p => p === 'AL')
  assert.equal(abcFallback, 'ABL')

  console.log('company helper tests passed')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
