import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSecurityStore } from '@/stores/security-store'

vi.mock('@/lib/api-client', () => ({
  ApiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('react-hot-toast', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

describe('security-store live counters', () => {
  beforeEach(() => {
    useSecurityStore.setState({
      logs: [],
      blocked: [],
      stats: {
        total_verified: 0,
        unique_ips: 0,
        fraud_prevented: 0,
        currently_blocked: 0,
      },
      dailyLimit: '10',
      isVerificationEnabled: true,
      hasInitialized: true,
    })
  })

  it('counts blocked and quota toward fraud_prevented once', () => {
    const store = useSecurityStore.getState()
    store.addLog({ id: 1, status: 'blocked', email: 'a@b.com', ip: '1.1.1.1' })
    store.addLog({ id: 2, status: 'quota', email: 'c@d.com', ip: '2.2.2.2' })
    store.addLog({ id: 3, status: 'valid', email: 'e@f.com', ip: '3.3.3.3' })

    const stats = useSecurityStore.getState().stats
    expect(stats.total_verified).toBe(3)
    expect(stats.fraud_prevented).toBe(2)
  })

  it('does not double-count duplicate log ids', () => {
    const store = useSecurityStore.getState()
    store.addLog({ id: 9, status: 'blocked', email: 'a@b.com', ip: '1.1.1.1' })
    store.addLog({ id: 9, status: 'blocked', email: 'a@b.com', ip: '1.1.1.1' })

    const stats = useSecurityStore.getState().stats
    expect(stats.total_verified).toBe(1)
    expect(stats.fraud_prevented).toBe(1)
    expect(useSecurityStore.getState().logs).toHaveLength(1)
  })

  it('increments currently_blocked once per new block entry', () => {
    const store = useSecurityStore.getState()
    store.addBlocked({ id: 1, type: 'ip', value: '1.1.1.1', reason: 'test' })
    store.addBlocked({ id: 1, type: 'ip', value: '1.1.1.1', reason: 'test' })

    expect(useSecurityStore.getState().stats.currently_blocked).toBe(1)
    expect(useSecurityStore.getState().blocked).toHaveLength(1)
  })
})
