-- Copilot configuration and logs
CREATE TABLE IF NOT EXISTS fg_copilot_config (
  guildId       VARCHAR(20)   NOT NULL PRIMARY KEY,
  enabled       TINYINT(1)    NOT NULL DEFAULT 1,
  lastAnalyzedAt DATETIME     NULL,
  configSnapshot JSON         NULL,
  updatedAt     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fg_copilot_logs (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  guildId       VARCHAR(20)   NOT NULL,
  action        VARCHAR(32)   NOT NULL,
  details       TEXT          NOT NULL,
  success       TINYINT(1)    NOT NULL DEFAULT 1,
  error         TEXT          NULL,
  performedAt   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_guildId (guildId),
  INDEX idx_performedAt (performedAt)
);

CREATE TABLE IF NOT EXISTS fg_copilot_triggers (
  id            CHAR(36)      NOT NULL PRIMARY KEY DEFAULT (UUID()),
  guildId       VARCHAR(20)   NOT NULL,
  eventType     VARCHAR(32)   NOT NULL,
  eventData     JSON          NULL,
  triggeredAt   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed     TINYINT(1)    NOT NULL DEFAULT 0,
  processedAt   DATETIME      NULL,
  INDEX idx_guildId (guildId),
  INDEX idx_triggeredAt (triggeredAt),
  INDEX idx_processed (processed),
  INDEX idx_eventType (eventType)
);