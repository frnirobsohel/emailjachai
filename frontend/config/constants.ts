export enum UserRole {
    ADMIN = 'admin',
    RESELLER = 'reseller',
    USER = 'user'
}

export enum JobStatus {
    PENDING = 'pending',
    PROCESSING = 'processing',
    COMPLETED = 'completed',
    FAILED = 'failed',
    CANCELLED = 'cancelled'
}

export enum PaymentStatus {
    PENDING = 'pending',
    COMPLETED = 'completed',
    EXPIRED = 'expired',
    CANCELLED = 'cancelled',
    FAILED = 'failed'
}
