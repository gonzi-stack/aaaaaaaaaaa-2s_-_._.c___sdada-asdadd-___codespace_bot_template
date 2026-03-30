export const FG_TIER = {
    FREE: 'free',
    PRO: 'pro',
} as const;

export const FG_TOLERANCE = {
    GREEN: 'green',
    YELLOW: 'yellow',
    ORANGE: 'orange',
    RED: 'red',
} as const;

export const FG_RISK = {
    SCORE_MAX: 1000,
    DECAY_INTERVAL_HOURS: 24,
    DECAY_AMOUNT: 5,
    THRESHOLD_GREEN: 0,
    THRESHOLD_YELLOW: 100,
    THRESHOLD_ORANGE: 300,
    THRESHOLD_RED: 600,
    DELTA_WARN: 50,
    DELTA_MUTE: 75,
    DELTA_KICK: 100,
    DELTA_SPAM: 30,
    DELTA_MENTION_SPAM: 40,
    DELTA_AUTOMOD_HIT: 25,
} as const;

export const FG_ANTIRAID = {
    DEFAULT_JOIN_THRESHOLD: 10,
    DEFAULT_WINDOW_SECONDS: 10,
} as const;

export const FG_NUKEGUARD = {
    DEFAULT_DELETE_THRESHOLD: 5,
    DEFAULT_BAN_THRESHOLD: 3,
    DEFAULT_WINDOW_SECONDS: 10,
} as const;

export const FG_TRUST = {
    DEFAULT_VETERAN_DAYS: 30,
    DEFAULT_NEW_ACCOUNT_DAYS: 7,
} as const;

export const FG_DEADHAND = {
    DEFAULT_INACTIVITY_MINUTES: 30,
    CHECK_INTERVAL_MS: 300_000,
} as const;

export const FG_AUTOMOD_MAX_RULES = 6;

export const FG_CACHE_TTL = {
    GUILD: 300,
    RISK_SCORE: 60,
    BEHAVIOR: 120,
    TRUST: 300,
    COWORK_GROUP: 300,
    BLACKLIST: 120,
} as const;

export const FG_SPAM = {
    MESSAGE_THRESHOLD: 7,
    WINDOW_SECONDS: 5,
    MENTION_THRESHOLD: 5,
} as const;

export const FG_SLOWMODE_SECONDS = 30;

export const FG_MOD_ACTIONS = {
    WARN: 'warn',
    MUTE: 'mute',
    KICK: 'kick',
    BAN: 'ban',
    UNBAN: 'unban',
    UNMUTE: 'unmute',
    NOTE: 'note',
} as const;

export type FgTier = typeof FG_TIER[keyof typeof FG_TIER];
export type FgTolerance = typeof FG_TOLERANCE[keyof typeof FG_TOLERANCE];
export type FgModAction = typeof FG_MOD_ACTIONS[keyof typeof FG_MOD_ACTIONS];
