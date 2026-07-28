import { create } from 'zustand'
import { ApiClient } from '@/lib/api-client'
import { toast } from 'react-hot-toast'

interface SecurityLog {
  id?: number
  created_at?: string
  ip?: string
  cookie_id?: string
  browser?: string
  email?: string
  status?: string
}

interface BlockedEntry {
  id?: number
  blocked_at?: string
  type?: string
  value?: string
  reason?: string
}

interface SecurityPackage {
  id: number
  name?: string
  price?: string | number
  is_public?: boolean
}

interface SecurityStats {
  total_verified: number
  unique_ips: number
  fraud_prevented: number
  currently_blocked: number
  daily_limit?: string
  verifier_enabled?: boolean
}

interface SecurityDashboardStats extends SecurityStats {
  daily_limit?: string
  verifier_enabled?: boolean
}

interface SecurityHydrateData {
  stats?: SecurityDashboardStats
  logs?: SecurityLog[]
  blocked?: BlockedEntry[]
  packages?: SecurityPackage[]
}

export type { SecurityLog, BlockedEntry, SecurityPackage, SecurityHydrateData, SecurityStats }

interface SecurityState {
  logs: SecurityLog[]
  blocked: BlockedEntry[]
  packages: SecurityPackage[]
  stats: SecurityStats
  dailyLimit: string
  isVerificationEnabled: boolean
  hasInitialized: boolean
  
  // Actions
  hydrate: (data: SecurityHydrateData) => void
  initialize: (force?: boolean) => Promise<void>
  addLog: (log: SecurityLog) => void
  addBlocked: (block: BlockedEntry) => void
  removeBlocked: (id: number) => void
  updateStats: (stats: Partial<SecurityStats>) => void
  setDailyLimit: (limit: string) => void
  setVerificationEnabled: (enabled: boolean) => void
  togglePackage: (id: number) => Promise<void>
  unblockClient: (id: number) => Promise<void>
  handleSettingsUpdate: (newLimit?: string, newToggle?: boolean) => Promise<void>
}

export const useSecurityStore = create<SecurityState>((set, get) => ({
  logs: [],
  blocked: [],
  packages: [],
  stats: {
    total_verified: 0,
    unique_ips: 0,
    fraud_prevented: 0,
    currently_blocked: 0
  },
  dailyLimit: "10",
  isVerificationEnabled: true,
  hasInitialized: false,

  hydrate: (data) => {
    if (!data) return;
    set({
      ...(data.stats && { 
        stats: data.stats, 
        dailyLimit: data.stats.daily_limit || "10", 
        isVerificationEnabled: data.stats.verifier_enabled ?? true 
      }),
      ...(data.logs && { logs: data.logs }),
      ...(data.blocked && { blocked: data.blocked }),
      ...(data.packages && { packages: data.packages }),
      hasInitialized: true
    })
  },

  initialize: async (force = false) => {
    if (!force && get().hasInitialized) return;

    try {
      // Load stats & settings
      const dashRes = await ApiClient.get<SecurityDashboardStats>('/admin/public-verifier/dashboard')
      if (dashRes.status === 'success' && dashRes.data) {
        set({ 
          stats: dashRes.data,
          dailyLimit: dashRes.data.daily_limit || "10",
          isVerificationEnabled: dashRes.data.verifier_enabled ?? true
        })
      }

      // Load logs
      const logsRes = await ApiClient.get<SecurityLog[]>('/admin/public-verifier/verify-logs')
      if (logsRes.status === 'success') set({ logs: logsRes.data || [] })

      // Load blocklist
      const blockRes = await ApiClient.get<BlockedEntry[]>('/admin/public-verifier/blocklist')
      if (blockRes.status === 'success') set({ blocked: blockRes.data || [] })

      // Load packages
      const pkgRes = await ApiClient.get<SecurityPackage[]>('/admin/packages')
      if (pkgRes.status === 'success') set({ packages: pkgRes.data || [] })

      set({ hasInitialized: true })
    } catch (err) {
      console.error("Failed to load security dashboard data", err)
      toast.error("Failed to load data")
    }
  },

  addLog: (log) => set((state) => {
    const logKey = log?.id ?? `${log?.created_at || ''}:${log?.ip || ''}:${log?.email || ''}:${log?.status || ''}`
    const exists = state.logs.some((item) => {
      const itemKey = item?.id ?? `${item?.created_at || ''}:${item?.ip || ''}:${item?.email || ''}:${item?.status || ''}`
      return itemKey === logKey
    })

    if (exists) return {}

    return { logs: [log, ...state.logs].slice(0, 50) }
  }),

  addBlocked: (block) => set((state) => {
    const blockKey = block?.id ?? `${block?.type || ''}:${block?.value || ''}`
    const exists = state.blocked.some((item) => {
      const itemKey = item?.id ?? `${item?.type || ''}:${item?.value || ''}`
      return itemKey === blockKey
    })

    if (exists) return {}

    return { blocked: [block, ...state.blocked].slice(0, 50) }
  }),

  removeBlocked: (id) => set((state) => ({
    blocked: state.blocked.filter(b => b.id !== id)
  })),

  updateStats: (newStats) => set((state) => ({
    stats: { ...state.stats, ...newStats }
  })),

  setDailyLimit: (limit) => set({ dailyLimit: limit }),
  
  setVerificationEnabled: (enabled) => set({ isVerificationEnabled: enabled }),

  togglePackage: async (id) => {
    try {
      const res = await ApiClient.post<Record<string, unknown>>('/admin/packages/toggle-public', { package_id: id })
      if (res.status === 'success') {
        set((state) => ({
          packages: state.packages.map(p => p.id === id ? { ...p, is_public: !p.is_public } : p)
        }))
        toast.success("Package visibility updated")
      } else {
        toast.error(res.message || "Failed to update package visibility")
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update package visibility")
    }
  },

  handleSettingsUpdate: async (newLimit?: string, newToggle?: boolean) => {
    try {
      await ApiClient.post('/admin/public-verifier/settings', {
        daily_limit: newLimit,
        verifier_enabled: newToggle
      })
      toast.success("Settings updated")
    } catch {
      toast.error("Failed to update settings")
    }
  },

  unblockClient: async (id) => {
    try {
      const res = await ApiClient.post('/admin/public-verifier/unblock', { id })
      if (res.status === 'success') {
        toast.success("Unblocked successfully")
        get().removeBlocked(id)
        // Optionally update stats (-1 blocked)
        set(state => ({
          stats: { ...state.stats, currently_blocked: Math.max(0, state.stats.currently_blocked - 1) }
        }))
      }
    } catch {
      toast.error("Failed to unblock")
    }
  }
}))
