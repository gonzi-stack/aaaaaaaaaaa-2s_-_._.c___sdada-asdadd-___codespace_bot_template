-- Migración 001: Tablas base (MariaDB/MySQL)

CREATE TABLE IF NOT EXISTS guild_settings (
    guild_id   VARCHAR(20) PRIMARY KEY,
    prefix     VARCHAR(10) NOT NULL DEFAULT '!',
    language   VARCHAR(5)  NOT NULL DEFAULT 'es',
    features   JSON        NOT NULL,
    created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id              VARCHAR(20)  PRIMARY KEY,
    username             VARCHAR(100) NOT NULL,
    global_commands_used INT          NOT NULL DEFAULT 0,
    created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_guild_settings_prefix ON guild_settings(prefix);

CREATE INDEX idx_user_profiles_username ON user_profiles(username);

CREATE TABLE IF NOT EXISTS bot_meta (
    `key`      VARCHAR(100) PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)
