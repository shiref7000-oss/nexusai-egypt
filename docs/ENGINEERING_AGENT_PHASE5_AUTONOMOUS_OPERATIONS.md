-- 028_engineering_agent_autonomous_ops.sql

-- Table for Root Cause Analysis (RCA) findings
CREATE TABLE IF NOT EXISTS engineering_agent_rca (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
    root_cause TEXT NOT NULL,
    evidence JSONB NOT NULL,
    impacted_files TEXT[] NOT NULL,
    confidence_score DECIMAL(5, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table for Auto-Fix attempts
CREATE TABLE IF NOT EXISTS engineering_agent_auto_fix_attempts (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
    rca_id INTEGER REFERENCES engineering_agent_rca(id) ON DELETE SET NULL,
    attempt_number INTEGER NOT NULL,
    fix_description TEXT NOT NULL,
    patch_applied TEXT NOT NULL,
    build_status BOOLEAN,
    verification_status BOOLEAN,
    browser_validation_status BOOLEAN,
    status TEXT NOT NULL, -- e.g., 'SUCCESS', 'FAILED', 'RETRYING'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table for Regression Check results
CREATE TABLE IF NOT EXISTS engineering_agent_regression_checks (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
    check_name TEXT NOT NULL,
    status BOOLEAN NOT NULL,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table for Production Monitoring events
CREATE TABLE IF NOT EXISTS engineering_agent_monitoring_events (
    id SERIAL PRIMARY KEY,
    event_type TEXT NOT NULL, -- e.g., 'PM2_PROCESS_STOPPED', 'API_UNAVAILABLE', 'HEALTH_CHECK_FAILED'
    resource_id TEXT,
    status TEXT NOT NULL, -- e.g., 'ALERT', 'RECOVERY', 'INFO'
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table for Self-Healing Actions
CREATE TABLE IF NOT EXISTS engineering_agent_self_healing_actions (
    id SERIAL PRIMARY KEY,
    monitoring_event_id INTEGER REFERENCES engineering_agent_monitoring_events(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL, -- e.g., 'RESTART_PM2', 'ROLLBACK_DEPLOYMENT', 'RESTORE_BACKUP'
    target TEXT NOT NULL,
    status TEXT NOT NULL, -- e.g., 'INITIATED', 'SUCCESS', 'FAILED'
    logs TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table for AI Code Review results
CREATE TABLE IF NOT EXISTS engineering_agent_code_reviews (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
    score DECIMAL(5, 2),
    warnings JSONB,
    recommendations JSONB,
    blocked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table for Cost & Infrastructure Analysis
CREATE TABLE IF NOT EXISTS engineering_agent_cost_analysis (
    id SERIAL PRIMARY KEY,
    report_date DATE NOT NULL UNIQUE,
    llm_usage_cost DECIMAL(10, 4),
    token_consumption INTEGER,
    vps_resources_cost DECIMAL(10, 4),
    database_size_gb DECIMAL(10, 2),
    storage_growth_gb_per_month DECIMAL(10, 2),
    deployment_frequency INTEGER,
    optimization_recommendations JSONB,
    estimated_monthly_impact DECIMAL(10, 4),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Table for Task Decomposition
CREATE TABLE IF NOT EXISTS engineering_agent_subtasks (
    id SERIAL PRIMARY KEY,
    parent_task_id INTEGER NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
    subtask_description TEXT NOT NULL,
    status TEXT NOT NULL, -- e.g., 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'
    assigned_to TEXT, -- e.g., 'ENGINEERING_AGENT', 'HUMAN'
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add new columns to agent_tasks for autonomous operations lifecycle
ALTER TABLE agent_tasks
ADD COLUMN current_phase TEXT DEFAULT 'INITIALIZED',
ADD COLUMN last_verification_status BOOLEAN,
ADD COLUMN last_verification_details JSONB,
ADD COLUMN rca_id INTEGER REFERENCES engineering_agent_rca(id) ON DELETE SET NULL,
ADD COLUMN auto_fix_attempts_count INTEGER DEFAULT 0,
ADD COLUMN max_fix_attempts INTEGER DEFAULT 3,
ADD COLUMN max_verification_attempts INTEGER DEFAULT 3,
ADD COLUMN deployment_blocked BOOLEAN DEFAULT FALSE,
ADD COLUMN completion_rules_status JSONB; -- Stores pass/fail status for each completion rule
