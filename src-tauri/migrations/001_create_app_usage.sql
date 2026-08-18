CREATE TABLE IF NOT EXISTS app_usage (
  id INTEGER PRIMARY KEY,
  device_type TEXT,
  app_name TEXT,
  url TEXT,
  duration_seconds INTEGER,
  timestamp DATETIME
);
