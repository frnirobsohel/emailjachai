-- Initial Schema for EmailJachai-Pro

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    credits BIGINT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    job_id VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255),
    filename VARCHAR(255),
    file_url VARCHAR(255),
    result_file_path VARCHAR(512),
    type VARCHAR(20) DEFAULT 'bulk',
    status VARCHAR(20) DEFAULT 'pending',
    total_emails INTEGER DEFAULT 0,
    processed_count INTEGER DEFAULT 0,
    deliverable INTEGER DEFAULT 0,
    risky INTEGER DEFAULT 0,
    undeliverable INTEGER DEFAULT 0,
    catch_all INTEGER DEFAULT 0,
    invalid_syntax INTEGER DEFAULT 0,
    role_accounts INTEGER DEFAULT 0,
    disposable INTEGER DEFAULT 0,
    verified_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);

CREATE TABLE IF NOT EXISTS job_results (
    id BIGSERIAL,
    job_internal_id INTEGER NOT NULL REFERENCES jobs(id),
    email VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    score INTEGER DEFAULT 0,
    reason VARCHAR(255),
    processing_time FLOAT DEFAULT 0,
    is_deliverable BOOLEAN DEFAULT false,
    is_catch_all BOOLEAN DEFAULT false,
    is_disposable BOOLEAN DEFAULT false,
    is_free BOOLEAN DEFAULT false,
    is_role BOOLEAN DEFAULT false,
    has_mx BOOLEAN DEFAULT false,
    smtp_connect BOOLEAN DEFAULT false,
    user_exists BOOLEAN DEFAULT false,
    is_syntax_valid BOOLEAN DEFAULT true,
    is_spam_trap BOOLEAN DEFAULT false,
    is_blacklisted BOOLEAN DEFAULT false,
    mailbox_full BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Initial partitions for 2026
CREATE TABLE IF NOT EXISTS job_results_y2026m01 PARTITION OF job_results FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE IF NOT EXISTS job_results_y2026m02 PARTITION OF job_results FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE IF NOT EXISTS job_results_y2026m03 PARTITION OF job_results FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE IF NOT EXISTS job_results_y2026m04 PARTITION OF job_results FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE IF NOT EXISTS job_results_y2026m05 PARTITION OF job_results FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE IF NOT EXISTS job_results_y2026m06 PARTITION OF job_results FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE IF NOT EXISTS job_results_y2026m07 PARTITION OF job_results FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE IF NOT EXISTS job_results_y2026m08 PARTITION OF job_results FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS job_results_y2026m09 PARTITION OF job_results FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS job_results_y2026m10 PARTITION OF job_results FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS job_results_y2026m11 PARTITION OF job_results FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS job_results_y2026m12 PARTITION OF job_results FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- Default partition to catch any dates outside the defined ranges (prevents insertion failure)
CREATE TABLE IF NOT EXISTS job_results_default PARTITION OF job_results DEFAULT;

CREATE INDEX IF NOT EXISTS idx_job_results_job_internal_id ON job_results(job_internal_id);
CREATE INDEX IF NOT EXISTS idx_job_results_email ON job_results(email);
CREATE INDEX IF NOT EXISTS idx_job_results_status ON job_results(status);
CREATE INDEX IF NOT EXISTS idx_job_results_created_at ON job_results(created_at);
CREATE INDEX IF NOT EXISTS idx_job_results_job_status ON job_results(job_internal_id, status);
