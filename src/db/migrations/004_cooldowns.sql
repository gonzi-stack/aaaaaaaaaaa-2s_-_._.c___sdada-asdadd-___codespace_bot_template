CREATE TABLE IF NOT EXISTS user_cooldowns (
    userId VARCHAR(20) NOT NULL,
    command VARCHAR(50) NOT NULL,
    expiresAt BIGINT NOT NULL,
    PRIMARY KEY (userId, command),
    INDEX idx_cooldowns_expiresAt (expiresAt)
);
