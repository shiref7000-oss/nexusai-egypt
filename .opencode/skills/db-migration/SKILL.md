---
name: db-migration
description: Use when creating, modifying, or reviewing database tables. Ensures migrations follow the project numbering convention, use IF NOT EXISTS, and include proper indexes.
---

# Database Migration Skill

Create or review database migrations following NexusAI conventions.

## Migration Conventions

- **Naming:** `NNN_descriptive_name.sql` (3-digit zero-padded)
- **Location:** `backend/express/src/db/migrations/`
- **Style:** Raw SQL, forward-only, CREATE TABLE IF NOT EXISTS
- **Idempotent:** Every statement uses IF NOT EXISTS / IF EXISTS
- **Indexes:** Created in the same migration file

## Template

```sql
-- NNN_descriptive_name.sql

CREATE TABLE IF NOT EXISTS table_name (
    id SERIAL PRIMARY KEY,
    column_name TYPE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_name ON table_name(column);
CREATE INDEX IF NOT EXISTS idx_name2 ON table_name(column2);
```

## Rules

- Always use `IF NOT EXISTS` / `IF EXISTS`.
- Foreign keys: `REFERENCES other_table(id) ON DELETE CASCADE`
- JSON columns: `JSONB DEFAULT '{}'`
- Timestamps: `TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP`
- No down migrations — forward-only.
- Check the latest migration number before creating a new one.
