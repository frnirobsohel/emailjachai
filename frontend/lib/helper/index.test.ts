import { describe, it, expect } from 'vitest';
import { formatNumber } from './index';

describe('formatNumber', () => {
    it('formats with en-US commas', () => {
        expect(formatNumber(1000)).toBe('1,000');
        expect(formatNumber(1000000)).toBe('1,000,000');
        expect(formatNumber(42)).toBe('42');
    });

    it('truncates decimals', () => {
        expect(formatNumber(12.9)).toBe('12');
    });
});
