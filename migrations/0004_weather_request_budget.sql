-- Shared free-only request budget; contains no tasks, accounts, or location data.
CREATE TABLE IF NOT EXISTS weather_request_budget (
  period TEXT PRIMARY KEY NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0 AND used <= 10000)
);
