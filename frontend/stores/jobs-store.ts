import { create } from 'zustand';
import type { Job } from '@/features/jobs/components/jobs-client';

export interface JobDetails extends Job {
    valid?: number;
    deliverable?: number;
    invalid?: number;
    undeliverable?: number;
    unknown?: number;
    risky?: number;
    catch_all?: number;
    disposable?: number;
}

export interface JobStore {
    jobs: Job[];
    total: number;
    currentJobDetails: JobDetails | null;
    
    setJobs: (jobs: Job[], total: number) => void;
    setCurrentJobDetails: (job: JobDetails) => void;
    updateJob: (jobData: Partial<Job> & { job_id: string }) => void;
    removeJob: (jobId: string) => void;
}

export const useJobsStore = create<JobStore>((set) => ({
    jobs: [],
    total: 0,
    currentJobDetails: null,

    setJobs: (jobs, total) => set({ jobs, total }),

    setCurrentJobDetails: (job) => set({ currentJobDetails: job }),

    updateJob: (jobData) => set((state) => {
        const existingJob = state.jobs.find(j => j.job_id === jobData.job_id);
        const updatedJobs = existingJob
            ? state.jobs.map(j => j.job_id === jobData.job_id ? { ...j, ...jobData } : j)
            : [{ ...jobData } as Job, ...state.jobs].slice(0, Math.max(state.jobs.length, 20));

        // Update in details view if matching
        let updatedDetails = state.currentJobDetails;
        if (updatedDetails && updatedDetails.job_id === jobData.job_id) {
            updatedDetails = { ...updatedDetails, ...jobData };
        }

        return { 
            jobs: updatedJobs, 
            total: existingJob ? state.total : state.total + 1,
            currentJobDetails: updatedDetails 
        };
    }),

    removeJob: (jobId) => set((state) => ({
        jobs: state.jobs.filter((job) => job.job_id !== jobId),
        total: Math.max(0, state.total - 1),
        currentJobDetails:
            state.currentJobDetails?.job_id === jobId ? null : state.currentJobDetails,
    })),
}));
