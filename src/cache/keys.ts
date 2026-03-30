/** Claves de caché centralizadas */
export const CacheKeys = {
    /** Prefijo de un servidor: guild:prefix:{guildId} */
    guildPrefix: (guildId: string) => `guild:prefix:${guildId}` as const,

    /** Configuración completa de un servidor: guild:settings:{guildId} */
    guildSettings: (guildId: string) => `guild:settings:${guildId}` as const,

    /** Cooldown de un comando por usuario: cooldown:{userId}:{commandName} */
    cooldown: (userId: string, commandName: string) => `cooldown:${userId}:${commandName}` as const,

    /** Hash de definiciones de slash commands */
    commandsHash: 'bot:commands:hash' as const,

    /** Perfil de usuario: user:profile:{userId} */
    userProfile: (userId: string) => `user:profile:${userId}` as const,

    /** Configuración por guild: cfg:{guildId} */
    guildConfig: (guildId: string) => `cfg:${guildId}` as const,

    fg: {
        guild: (guildId: string) => `fg:guild:${guildId}` as const,
        risk: (guildId: string, userId: string) => `fg:risk:${guildId}:${userId}` as const,
        behavior: (guildId: string, userId: string) => `fg:beh:${guildId}:${userId}` as const,
        coworkGroup: (guildId: string) => `fg:cwg:${guildId}` as const,
        blacklist: (groupId: string, userId: string) => `fg:bl:${groupId}:${userId}` as const,
        raidWindow: (guildId: string) => `fg:raid:${guildId}` as const,
        nukeWindow: (guildId: string, userId: string) => `fg:nuke:${guildId}:${userId}` as const,
        modActivity: (guildId: string) => `fg:modact:${guildId}` as const,
        spamWindow: (guildId: string, userId: string, channelId: string) => `fg:spam:${guildId}:${userId}:${channelId}` as const,
    },
} as const;

/** TTLs de caché en segundos */
export const CacheTTL = {
    /** Configuración por guild — 5 min */
    GUILD_CONFIG: 300,
} as const;
