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
    filename VARCHAR(255),
    type VARCHAR(20) DEFAULT 'bulk',
    status VARCHAR(20) DEFAULT 'pending',
    total_emails INTEGER DEFAULT 0,
    processed_count INTEGER DEFAULT 0,
    deliverable INTEGER DEFAULT 0,
    risky INTEGER DEFAULT 0,
    undeliverable INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_results (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES jobs(id),
    email VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    score INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
