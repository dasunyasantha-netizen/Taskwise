import { AsyncLocalStorage } from 'node:async_hooks'

// Per-request facts that must reach writes deep inside controllers, such as
// which named holder of a shared Chairman role is acting.
export const requestContext = new AsyncLocalStorage<{ holderName?: string }>()
