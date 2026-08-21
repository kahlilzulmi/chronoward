ALTER TABLE app_usage ADD COLUMN uuid TEXT;
ALTER TABLE app_usage ADD COLUMN google_sub TEXT;
ALTER TABLE app_usage ADD COLUMN device_id TEXT;

UPDATE app_usage
SET uuid = lower(hex(randomblob(16)))
WHERE uuid IS NULL OR uuid = '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_usage_uuid ON app_usage(uuid);
CREATE INDEX IF NOT EXISTS idx_app_usage_timestamp ON app_usage(timestamp);
CREATE INDEX IF NOT EXISTS idx_app_usage_device_time ON app_usage(device_type, timestamp);
