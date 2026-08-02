import { describe, expect, it } from 'vitest'
import { applyClientIpHeaders, getClientIp, isPrivateOrReservedIp } from '@/lib/client-ip'

describe('getClientIp', () => {
    it('prefers Cloudflare connecting IP', () => {
        const headers = new Headers({
            'cf-connecting-ip': '203.0.113.10',
            'x-forwarded-for': '198.51.100.1, 10.0.0.2',
            'x-real-ip': '198.51.100.9',
        })
        expect(getClientIp(headers)).toBe('203.0.113.10')
    })

    it('uses left-most public X-Forwarded-For hop', () => {
        const headers = new Headers({
            'x-forwarded-for': '203.0.113.55, 10.0.0.2, 172.16.0.4',
        })
        expect(getClientIp(headers)).toBe('203.0.113.55')
    })

    it('skips Docker bridge IP in X-Real-IP when XFF has public IP', () => {
        const headers = new Headers({
            'x-real-ip': '172.17.0.1',
            'x-forwarded-for': '103.166.59.159, 172.17.0.1',
        })
        expect(getClientIp(headers)).toBe('103.166.59.159')
    })

    it('skips private left-most XFF hop for first public IP', () => {
        const headers = new Headers({
            'x-forwarded-for': '172.17.0.1, 103.166.59.159',
        })
        expect(getClientIp(headers)).toBe('103.166.59.159')
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

    it('does not forward Docker private IP to the backend', () => {
        const source = new Headers({ 'x-real-ip': '172.17.0.1' })
        const target = new Headers()
        applyClientIpHeaders(target, source)
        expect(target.get('X-Forwarded-For')).toBeNull()
        expect(target.get('X-Real-IP')).toBeNull()
    })
})

describe('isPrivateOrReservedIp', () => {
    it('detects Docker bridge and RFC1918 ranges', () => {
        expect(isPrivateOrReservedIp('172.17.0.1')).toBe(true)
        expect(isPrivateOrReservedIp('10.0.0.5')).toBe(true)
        expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true)
        expect(isPrivateOrReservedIp('103.166.59.159')).toBe(false)
    })
})
