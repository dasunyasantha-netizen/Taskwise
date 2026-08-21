import assert from 'assert'
import { resolveTaskStatusWhere, DEFAULT_EXCLUDED_TASK_STATUSES } from '../helpers/taskFilters'

async function main() {
  // Default Tasks view: no explicit status, exclude APPROVED + CANCELLED → NOT IN.
  assert.deepEqual(
    resolveTaskStatusWhere(undefined, DEFAULT_EXCLUDED_TASK_STATUSES.join(',')),
    { notIn: ['APPROVED', 'CANCELLED'] },
    'default view should exclude approved + cancelled via NOT IN',
  )

  // Excluding only one status.
  assert.deepEqual(resolveTaskStatusWhere(undefined, 'CANCELLED'), { notIn: ['CANCELLED'] })
  assert.deepEqual(resolveTaskStatusWhere(undefined, 'APPROVED'), { notIn: ['APPROVED'] })

  // Explicit single status wins over any exclusion — user can still open approved/cancelled.
  assert.equal(resolveTaskStatusWhere('APPROVED', 'APPROVED,CANCELLED'), 'APPROVED')
  assert.equal(resolveTaskStatusWhere('CANCELLED', 'APPROVED,CANCELLED'), 'CANCELLED')
  assert.equal(resolveTaskStatusWhere('IN_PROGRESS', 'APPROVED,CANCELLED'), 'IN_PROGRESS')

  // No constraints at all → undefined (show everything).
  assert.equal(resolveTaskStatusWhere(undefined, undefined), undefined)
  assert.equal(resolveTaskStatusWhere('', ''), undefined)

  // Whitespace / empty segments are ignored.
  assert.deepEqual(resolveTaskStatusWhere(undefined, ' APPROVED , , CANCELLED '), { notIn: ['APPROVED', 'CANCELLED'] })
  assert.equal(resolveTaskStatusWhere(undefined, ' , '), undefined)

  console.log('task filter tests passed')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
