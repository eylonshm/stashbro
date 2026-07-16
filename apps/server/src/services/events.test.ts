import { describe, it, expect, vi } from 'vitest'
import { subscribeChanges, emitChange } from './events.js'

describe('change event bus', () => {
  it('notifies only the matching user and stops after unsubscribe', () => {
    const a = vi.fn()
    const b = vi.fn()
    const unsubA = subscribeChanges('user-a', a)
    subscribeChanges('user-b', b)

    emitChange('user-a')
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).not.toHaveBeenCalled()

    unsubA()
    emitChange('user-a')
    expect(a).toHaveBeenCalledTimes(1) // no further calls after unsubscribe
  })

  it('a throwing listener does not block others', () => {
    const bad = vi.fn(() => { throw new Error('boom') })
    const good = vi.fn()
    subscribeChanges('user-c', bad)
    subscribeChanges('user-c', good)
    expect(() => emitChange('user-c')).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
  })
})
