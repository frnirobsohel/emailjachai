export type UserRole = 'admin' | 'reseller' | 'user';

export interface User {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    avatar?: string;
    credits: number;
    created_at: string;
}

export interface Job {
    job_id: string;
    filename: string | null;
    status: 'pending' | 'preparing' | 'processing' | 'completed' | 'failed';
    total_emails: number;
    processed_count: number;
    deliverable: number;
    undeliverable: number;
    risky: number;
    created_at: string;
}

export interface Transaction {
    id: string;
    amount: number;
    credits: number;
    status: 'pending' | 'completed' | 'failed';
    gateway: string;
    created_at: string;
}

export interface ApiResponse<T = unknown> {
    status: 'success' | 'error';
    message: string;
    data?: T;
}
