import { describe, it, expect, beforeEach } from 'vitest';
import { useDashboardStore } from './dashboard-store';

describe('dashboard store', () => {
    beforeEach(() => {
        useDashboardStore.setState({
            stats: null,
            recentJobs: [],
            isLoadingStats: false,
            lastFetchedStats: null,
        });
    });

    it('setStats stores stats and timestamp', () => {
        useDashboardStore.getState().setStats({
            credits_remaining: '1,000',
            lifetime_verifications: '50',
            today_verifications: '5',
            total_jobs: 2,
            active_jobs: 1,
        });

        const state = useDashboardStore.getState();
        expect(state.stats?.credits_remaining).toBe('1,000');
        expect(state.lastFetchedStats).toBeTypeOf('number');
    });

    it('setRecentJobs caps list at 4', () => {
        const jobs = Array.from({ length: 6 }, (_, i) => ({
            job_id: `job-${i}`,
            status: 'completed',
            total_emails: i + 1,
        }));

        useDashboardStore.getState().setRecentJobs(jobs);
        expect(useDashboardStore.getState().recentJobs).toHaveLength(4);
        expect(useDashboardStore.getState().recentJobs[0].job_id).toBe('job-0');
    });

    it('upsertRecentJob inserts new job at front', () => {
        useDashboardStore.getState().setRecentJobs([
            { job_id: 'a', status: 'completed', total_emails: 1 },
            { job_id: 'b', status: 'completed', total_emails: 2 },
        ]);

        useDashboardStore.getState().upsertRecentJob({
            job_id: 'c',
            status: 'processing',
            total_emails: 10,
            filename: 'list.csv',
        });

        const jobs = useDashboardStore.getState().recentJobs;
        expect(jobs).toHaveLength(3);
        expect(jobs[0]).toMatchObject({ job_id: 'c', status: 'processing', filename: 'list.csv' });
    });

    it('upsertRecentJob updates existing job and moves it to front', () => {
        useDashboardStore.getState().setRecentJobs([
            { job_id: 'a', status: 'pending', total_emails: 100, processed_count: 0 },
            { job_id: 'b', status: 'completed', total_emails: 5 },
        ]);

        useDashboardStore.getState().upsertRecentJob({
            job_id: 'a',
            status: 'processing',
            total_emails: 100,
            processed_count: 40,
        });

        const jobs = useDashboardStore.getState().recentJobs;
        expect(jobs[0]).toMatchObject({
            job_id: 'a',
            status: 'processing',
            processed_count: 40,
        });
        expect(jobs).toHaveLength(2);
        expect(jobs.filter((j) => j.job_id === 'a')).toHaveLength(1);
    });

    it('upsertRecentJob ignores empty job_id', () => {
        useDashboardStore.getState().setRecentJobs([
            { job_id: 'a', status: 'completed', total_emails: 1 },
        ]);
        useDashboardStore.getState().upsertRecentJob({
            job_id: '',
            status: 'failed',
            total_emails: 1,
        });
        expect(useDashboardStore.getState().recentJobs).toHaveLength(1);
        expect(useDashboardStore.getState().recentJobs[0].status).toBe('completed');
    });
});
