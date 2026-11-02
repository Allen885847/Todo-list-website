-- Anonymous hosted-AI counters only. No task records, message contents, or raw IPs.
CREATE TABLE IF NOT EXISTS local_ai_usage (
  day TEXT NOT NULL,
  scope TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, scope)
);
