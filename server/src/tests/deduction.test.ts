import assert from 'assert'
import { validatePointsToDeduct } from '../helpers/deduction'

async function main() {
  // No deduction: empty-ish inputs → points 0, no error (preserves existing behaviour).
  for (const empty of [undefined, null, '']) {
    assert.deepEqual(validatePointsToDeduct(empty, 100), { points: 0 })
  }
  assert.deepEqual(validatePointsToDeduct(0, 100), { points: 0 })
  assert.deepEqual(validatePointsToDeduct('0', 100), { points: 0 })

  // Valid positive deduction within balance.
  assert.deepEqual(validatePointsToDeduct(5, 100), { points: 5 })
  assert.deepEqual(validatePointsToDeduct('12', 12), { points: 12 }) // exactly the balance is allowed

  // Negative values rejected.
  assert.equal(validatePointsToDeduct(-1, 100).error, 'Points to deduct cannot be negative')
  assert.equal(validatePointsToDeduct('-3', 100).error, 'Points to deduct cannot be negative')
  assert.equal(validatePointsToDeduct(-1, 100).points, 0)

  // Fractions / non-numbers rejected.
  assert.equal(validatePointsToDeduct(2.5, 100).error, 'Points to deduct must be a whole number')
  assert.equal(validatePointsToDeduct('abc', 100).error, 'Points to deduct must be a whole number')

  // Exceeding available balance rejected.
  const over = validatePointsToDeduct(15, 10)
  assert.equal(over.points, 0)
  assert.match(over.error ?? '', /only has 10 available/)

  // A user with zero/negative balance cannot be deducted from.
  assert.ok(validatePointsToDeduct(1, 0).error)
  assert.ok(validatePointsToDeduct(1, -4).error)

  console.log('deduction validation tests passed')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
