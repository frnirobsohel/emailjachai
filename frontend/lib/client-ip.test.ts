import { describe, expect, it } from 'vitest'
import { applyClientIpHeaders, getClientIp } from '@/lib/client-ip'

describe('getClientIp', () => {
    it('prefers Cloudflare connecting IP', () => {
        const headers = new Headers({
            'cf-connecting-ip': '203.0.113.10',
            'x-forwarded-for': '198.51.100.1, 10.0.0.2',
            'x-real-ip': '198.51.100.9',
        })
        expect(getClientIp(headers)).toBe('203.0.113.10')
    })

    it('uses left-most X-Forwarded-For hop', () => {
        const headers = new Headers({
            'x-forwarded-for': '203.0.113.55, 10.0.0.2, 172.16.0.4',
        })
        expect(getClientIp(headers)).toBe('203.0.113.55')
    })

    it('falls back to X-Real-IP', () => {
        const headers = new Headers({ 'x-real-ip': '198.51.100.20' })
        expect(getClientIp(headers)).toBe('198.51.100.20')
    })

    it('strips IPv4 host:port', () => {
        const headers = new Headers({ 'x-real-ip': '203.0.113.8:51234' })
        expect(getClientIp(headers)).toBe('203.0.113.8')
    })
})

describe('applyClientIpHeaders', () => {
    it('sets both forwarded headers for Gin', () => {
        const source = new Headers({ 'cf-connecting-ip': '203.0.113.77' })
        const target = new Headers()
        applyClientIpHeaders(target, source)
        expect(target.get('X-Forwarded-For')).toBe('203.0.113.77')
        expect(target.get('X-Real-IP')).toBe('203.0.113.77')
    })
})
