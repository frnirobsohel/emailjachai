import { describe, it, expect } from 'vitest';
import { withTimeZoneQuery } from './timezone';

describe('withTimeZoneQuery', () => {
    it('appends tz to path', () => {
        const out = withTimeZoneQuery('/dashboard/stats', 'America/New_York');
        expect(out).toBe('/dashboard/stats?tz=America%2FNew_York');
    });

    it('uses & when query already present', () => {
        const out = withTimeZoneQuery('/dashboard/stats?x=1', 'UTC');
        expect(out).toBe('/dashboard/stats?x=1&tz=UTC');
    });
});
