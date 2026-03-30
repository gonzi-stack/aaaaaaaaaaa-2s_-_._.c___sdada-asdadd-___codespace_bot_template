CREATE TABLE IF NOT EXISTS fg_guilds (
  guildId       VARCHAR(20)   NOT NULL PRIMARY KEY,
  tier          ENUM('free','pro') NOT NULL DEFAULT 'free',
  ownerId       VARCHAR(20)   NOT NULL,
  activatedAt   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiresAt     DATETIME      NULL,
  toleranceLevel ENUM('green','yellow','orange','red') NOT NULL DEFAULT 'yellow',
  updatedAt     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fg_risk_scores (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  guildId       VARCHAR(20)   NOT NULL,
  userId        VARCHAR(20)   NOT NULL,
  score         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  lastDecayAt   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_guild_user (guildId, userId),
  INDEX idx_guildId (guildId),
  INDEX idx_score (score)
);

CREATE TABLE IF NOT EXISTS fg_risk_events (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  guildId       VARCHAR(20)   NOT NULL,
  userId        VARCHAR(20)   NOT NULL,
  delta         SMALLINT      NOT NULL,
  reason        VARCHAR(128)  NOT NULL,
  triggeredBy   VARCHAR(20)   NULL,
  createdAt     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_guild_user (guildId, userId),
  INDEX idx_createdAt (createdAt)
);

CREATE TABLE IF NOT EXISTS fg_behavior_profiles (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  guildId       VARCHAR(20)   NOT NULL,
  userId        VARCHAR(20)   NOT NULL,
  warningCount  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  muteCount     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  kickCount     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  banCount      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  lastActionAt  DATETIME      NULL,
  firstSeenAt   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_guild_user (guildId, userId)
);

CREATE TABLE IF NOT EXISTS fg_mod_actions (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  guildId       VARCHAR(20)   NOT NULL,
  targetId      VARCHAR(20)   NOT NULL,
  moderatorId   VARCHAR(20)   NOT NULL,
  action        ENUM('warn','mute','kick','ban','unban','unmute','note') NOT NULL,
  reason        TEXT          NOT NULL,
  duration      INT UNSIGNED  NULL,
  expiresAt     DATETIME      NULL,
  createdAt     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_guild_target (guildId, targetId),
  INDEX idx_moderator (moderatorId),
  INDEX idx_createdAt (createdAt)
);

CREATE TABLE IF NOT EXISTS fg_automod_rules (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  guildId       VARCHAR(20)   NOT NULL,
  discordRuleId VARCHAR(20)   NOT NULL,
  ruleType      VARCHAR(32)   NOT NULL,
  createdAt     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_guildId (guildId)
);

CREATE TABLE IF NOT EXISTS fg_antiraid_config (
  guildId       VARCHAR(20)   NOT NULL PRIMARY KEY,
  enabled       TINYINT(1)    NOT NULL DEFAULT 1,
  joinThreshold SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  windowSeconds SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  action        ENUM('alert','lockdown','kick','ban') NOT NULL DEFAULT 'lockdown',
  updatedAt     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fg_antiraid_events (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  guildId       VARCHAR(20)   NOT NULL,
  triggeredAt   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  joinCount     SMALLINT UNSIGNED NOT NULL,
  actionTaken   VARCHAR(32)   NOT NULL,
  resolved      TINYINT(1)    NOT NULL DEFAULT 0,
  INDEX idx_guildId (guildId)
);

CREATE TABLE IF NOT EXISTS fg_nukeguard_config (
  guildId       VARCHAR(20)   NOT NULL PRIMARY KEY,
  enabled       TINYINT(1)    NOT NULL DEFAULT 1,
  deleteThreshold SMALLINT UNSIGNED NOT NULL DEFAULT 5,
  banThreshold  SMALLINT UNSIGNED NOT NULL DEFAULT 3,
  windowSeconds SMALLINT UNSIGNED NOT NULL DEFAULT 10,
  action        ENUM('alert','revoke','ban') NOT NULL DEFAULT 'revoke',
  updatedAt     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fg_trust_config (
  guildId         VARCHAR(20)   NOT NULL PRIMARY KEY,
  enabled         TINYINT(1)    NOT NULL DEFAULT 1,
  veteranDays     SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  veteranRoleId   VARCHAR(20)   NULL,
  newAccountDays  SMALLINT UNSIGNED NOT NULL DEFAULT 7,
  restrictedRoleId VARCHAR(20)  NULL,
  updatedAt       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fg_auditlog_config (
  guildId       VARCHAR(20)   NOT NULL PRIMARY KEY,
  enabled       TINYINT(1)    NOT NULL DEFAULT 1,
  channelId     VARCHAR(20)   NOT NULL,
  webhookId     VARCHAR(20)   NULL,
  webhookToken  VARCHAR(255)  NULL,
  updatedAt     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fg_cowork_groups (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  name          VARCHAR(64)   NOT NULL,
  ownerId       VARCHAR(20)   NOT NULL,
  createdAt     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fg_cowork_members (
  groupId       CHAR(36)      NOT NULL,
  guildId       VARCHAR(20)   NOT NULL,
  joinedAt      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (groupId, guildId),
  FOREIGN KEY (groupId) REFERENCES fg_cowork_groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fg_blacklist (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  groupId       CHAR(36)      NOT NULL,
  userId        VARCHAR(20)   NOT NULL,
  reason        TEXT          NOT NULL,
  addedBy       VARCHAR(20)   NOT NULL,
  addedFromGuild VARCHAR(20)  NOT NULL,
  createdAt     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_group_user (groupId, userId),
  FOREIGN KEY (groupId) REFERENCES fg_cowork_groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fg_cowork_alerts (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  groupId       CHAR(36)      NOT NULL,
  sourceGuildId VARCHAR(20)   NOT NULL,
  userId        VARCHAR(20)   NOT NULL,
  alertType     VARCHAR(32)   NOT NULL,
  details       TEXT          NOT NULL,
  resolved      TINYINT(1)    NOT NULL DEFAULT 0,
  createdAt     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_group (groupId),
  INDEX idx_createdAt (createdAt)
);

CREATE TABLE IF NOT EXISTS fg_cases (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  groupId       CHAR(36)      NOT NULL,
  guildId       VARCHAR(20)   NOT NULL,
  targetId      VARCHAR(20)   NOT NULL,
  ownerId       VARCHAR(20)   NOT NULL,
  status        ENUM('open','voting','escalated','closed') NOT NULL DEFAULT 'open',
  resolution    VARCHAR(32)   NULL,
  createdAt     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_group (groupId),
  INDEX idx_target (targetId)
);

CREATE TABLE IF NOT EXISTS fg_case_votes (
  caseId        CHAR(36)      NOT NULL,
  moderatorId   VARCHAR(20)   NOT NULL,
  guildId       VARCHAR(20)   NOT NULL,
  vote          ENUM('ban','kick','warn','dismiss') NOT NULL,
  votedAt       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (caseId, moderatorId),
  FOREIGN KEY (caseId) REFERENCES fg_cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fg_deadhand_config (
  guildId           VARCHAR(20)   NOT NULL PRIMARY KEY,
  enabled           TINYINT(1)    NOT NULL DEFAULT 1,
  inactivityMinutes SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  autoLockdown      TINYINT(1)    NOT NULL DEFAULT 1,
  autoSlowmode      TINYINT(1)    NOT NULL DEFAULT 1,
  autoBanCritical   TINYINT(1)    NOT NULL DEFAULT 0,
  notifyChannelId   VARCHAR(20)   NULL,
  updatedAt         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fg_heatmap_points (
  id            CHAR(36)      NOT NULL PRIMARY KEY,
  guildId       VARCHAR(20)   NOT NULL,
  userId        VARCHAR(20)   NOT NULL,
  channelId     VARCHAR(20)   NOT NULL,
  interactedWith VARCHAR(20)  NULL,
  riskDelta     SMALLINT      NOT NULL DEFAULT 0,
  recordedAt    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_guild_user (guildId, userId),
  INDEX idx_recordedAt (recordedAt)
);

CREATE TABLE IF NOT EXISTS fg_adaptive_config (
  guildId       VARCHAR(20)   NOT NULL PRIMARY KEY,
  enabled       TINYINT(1)    NOT NULL DEFAULT 1,
  mode          ENUM('suggest','auto') NOT NULL DEFAULT 'suggest',
  updatedAt     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
