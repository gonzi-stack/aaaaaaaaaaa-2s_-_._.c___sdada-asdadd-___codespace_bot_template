import type {
    Guild,
    NonThreadGuildBasedChannel,
    CategoryChannel,
    TextChannel,
    Role,
    GuildMember,
    PermissionsBitField,
    ThreadChannel,
    ChannelType,
    Snowflake,
} from 'discord.js';

/* ------------------------------------------------------------------ */
/*  Tipos serializados                                                 */
/* ------------------------------------------------------------------ */

export interface SerializedGuild {
    readonly id: string;
    readonly name: string;
    readonly description: string | null;
    readonly icon: string | null;
    readonly iconURL: string | null;
    readonly banner: string | null;
    readonly bannerURL: string | null;
    readonly splash: string | null;
    readonly splashURL: string | null;
    readonly discoverySplash: string | null;
    readonly discoverySplashURL: string | null;
    readonly owner: SerializedOwner;
    readonly memberCount: number;
    readonly maximumMembers: number | null;
    readonly maximumPresences: number | null;
    readonly premiumTier: string;
    readonly premiumSubscriptionCount: number | null;
    readonly verificationLevel: string;
    readonly explicitContentFilter: string;
    readonly mfaLevel: string;
    readonly nsfwLevel: string;
    readonly vanityURLCode: string | null;
    readonly preferredLocale: string;
    readonly features: string[];
    readonly createdAt: string;
    readonly createdTimestamp: number;
    readonly systemChannelId: string | null;
    readonly rulesChannelId: string | null;
    readonly publicUpdatesChannelId: string | null;
    readonly afkChannelId: string | null;
    readonly afkTimeout: number;
    readonly widgetEnabled: boolean | null;
    readonly categories: SerializedCategory[];
    readonly uncategorizedChannels: SerializedChannel[];
    readonly roles: SerializedRole[];
    readonly emojis: SerializedEmoji[];
    readonly stickers: SerializedSticker[];
}

export interface SerializedOwner {
    readonly id: string;
    readonly username: string;
    readonly displayName: string;
    readonly avatar: string | null;
    readonly avatarURL: string | null;
}

export interface SerializedCategory {
    readonly id: string;
    readonly name: string;
    readonly position: number;
    readonly channels: SerializedChannel[];
}

export interface SerializedChannel {
    readonly id: string;
    readonly name: string;
    readonly type: string;
    readonly typeId: ChannelType;
    readonly position: number;
    readonly topic: string | null;
    readonly nsfw: boolean;
    readonly rateLimitPerUser: number | null;
    readonly bitrate: number | null;
    readonly userLimit: number | null;
    readonly rtcRegion: string | null;
    readonly videoQualityMode: string | null;
    readonly defaultAutoArchiveDuration: number | null;
    readonly defaultThreadRateLimitPerUser: number | null;
    readonly defaultForumLayout: string | null;
    readonly defaultSortOrder: string | null;
    readonly createdAt: string | null;
    readonly createdTimestamp: number | null;
    readonly permissionOverwrites: SerializedPermissionOverwrite[];
    readonly threads: SerializedThread[];
}

export interface SerializedThread {
    readonly id: string;
    readonly name: string;
    readonly archived: boolean;
    readonly locked: boolean;
    readonly autoArchiveDuration: number | null;
    readonly memberCount: number | null;
    readonly messageCount: number | null;
    readonly createdAt: string | null;
    readonly ownerId: string | null;
}

export interface SerializedPermissionOverwrite {
    readonly id: string;
    readonly type: 'role' | 'member';
    readonly allow: string[];
    readonly deny: string[];
}

export interface SerializedRole {
    readonly id: string;
    readonly name: string;
    readonly color: string;
    readonly hexColor: string;
    readonly hoist: boolean;
    readonly position: number;
    readonly managed: boolean;
    readonly mentionable: boolean;
    readonly icon: string | null;
    readonly iconURL: string | null;
    readonly unicodeEmoji: string | null;
    readonly permissions: string[];
    readonly createdAt: string;
    readonly createdTimestamp: number;
    readonly memberCount: number;
    readonly tags: SerializedRoleTags | null;
}

export interface SerializedRoleTags {
    readonly botId: string | null;
    readonly integrationId: string | null;
    readonly premiumSubscriberRole: boolean;
}

export interface SerializedEmoji {
    readonly id: string;
    readonly name: string | null;
    readonly animated: boolean;
    readonly url: string;
    readonly managed: boolean;
    readonly requiresColons: boolean;
    readonly available: boolean;
    readonly createdAt: string | null;
    readonly roles: string[];
}

export interface SerializedSticker {
    readonly id: string;
    readonly name: string;
    readonly description: string | null;
    readonly format: string;
    readonly available: boolean | null;
    readonly tags: string | null;
    readonly url: string;
}

/* ------------------------------------------------------------------ */
/*  Funciones de serialización                                         */
/* ------------------------------------------------------------------ */

/**
 * Serializa un Guild completo de Discord a un objeto JSON plano.
 * Incluye canales organizados por categoría, roles, emojis y stickers.
 */
export async function serializeGuild(guild: Guild): Promise<SerializedGuild> {
    // Asegurar que tenemos todos los datos frescos
    await guild.channels.fetch();
    await guild.roles.fetch();

    const owner = await guild.fetchOwner();

    // Separar canales por categoría
    const categories = new Map<string, { category: CategoryChannel; channels: NonThreadGuildBasedChannel[] }>();
    const uncategorized: NonThreadGuildBasedChannel[] = [];

    const allChannels = guild.channels.cache
        .filter((ch): ch is NonThreadGuildBasedChannel => !ch.isThread())
        .sort((a, b) => a.position - b.position);

    for (const channel of allChannels.values()) {
        if (channel.type === 4) {
            // ChannelType.GuildCategory = 4
            categories.set(channel.id, {
                category: channel as CategoryChannel,
                channels: [],
            });
        }
    }

    for (const channel of allChannels.values()) {
        if (channel.type === 4) continue;

        const parentId = channel.parentId;
        if (parentId && categories.has(parentId)) {
            categories.get(parentId)!.channels.push(channel);
        } else {
            uncategorized.push(channel);
        }
    }

    // Serializar categorías con sus canales hijos
    const serializedCategories: SerializedCategory[] = [];
    for (const { category, channels } of categories.values()) {
        serializedCategories.push({
            id: category.id,
            name: category.name,
            position: category.position,
            channels: channels.map((ch) => serializeChannel(ch)),
        });
    }
    serializedCategories.sort((a, b) => a.position - b.position);

    // Serializar roles (excluir @everyone, ordenar por posición)
    const roles = guild.roles.cache
        .filter((r) => r.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map((r) => serializeRole(r));

    return {
        id: guild.id,
        name: guild.name,
        description: guild.description,
        icon: guild.icon,
        iconURL: guild.iconURL({ size: 1024 }) ?? null,
        banner: guild.banner,
        bannerURL: guild.bannerURL({ size: 1024 }) ?? null,
        splash: guild.splash,
        splashURL: guild.splashURL({ size: 1024 }) ?? null,
        discoverySplash: guild.discoverySplash,
        discoverySplashURL: guild.discoverySplashURL({ size: 1024 }) ?? null,
        owner: serializeOwner(owner),
        memberCount: guild.memberCount,
        maximumMembers: guild.maximumMembers,
        maximumPresences: guild.maximumPresences,
        premiumTier: premiumTierToString(guild.premiumTier),
        premiumSubscriptionCount: guild.premiumSubscriptionCount,
        verificationLevel: verificationLevelToString(guild.verificationLevel),
        explicitContentFilter: explicitContentFilterToString(guild.explicitContentFilter),
        mfaLevel: guild.mfaLevel === 1 ? 'Elevated' : 'None',
        nsfwLevel: nsfwLevelToString(guild.nsfwLevel),
        vanityURLCode: guild.vanityURLCode,
        preferredLocale: guild.preferredLocale,
        features: [...guild.features],
        createdAt: guild.createdAt.toISOString(),
        createdTimestamp: guild.createdTimestamp,
        systemChannelId: guild.systemChannelId,
        rulesChannelId: guild.rulesChannelId,
        publicUpdatesChannelId: guild.publicUpdatesChannelId,
        afkChannelId: guild.afkChannelId,
        afkTimeout: guild.afkTimeout,
        widgetEnabled: guild.widgetEnabled,
        categories: serializedCategories,
        uncategorizedChannels: uncategorized.map((ch) => serializeChannel(ch)),
        roles,
        emojis: guild.emojis.cache.map((e) => ({
            id: e.id,
            name: e.name,
            animated: e.animated ?? false,
            url: e.imageURL({ size: 128 }),
            managed: e.managed ?? false,
            requiresColons: e.requiresColons ?? true,
            available: e.available ?? true,
            createdAt: e.createdAt?.toISOString() ?? null,
            roles: e.roles.cache.map((r) => r.id),
        })),
        stickers: guild.stickers.cache.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description,
            format: s.format.toString(),
            available: s.available,
            tags: s.tags,
            url: s.url,
        })),
    };
}

/* ------------------------------------------------------------------ */
/*  Helpers internos                                                   */
/* ------------------------------------------------------------------ */

function serializeOwner(member: GuildMember): SerializedOwner {
    return {
        id: member.id,
        username: member.user.username,
        displayName: member.displayName,
        avatar: member.user.avatar,
        avatarURL: member.user.displayAvatarURL({ size: 1024 }) ?? null,
    };
}

function serializeChannel(channel: NonThreadGuildBasedChannel): SerializedChannel {
    const base: SerializedChannel = {
        id: channel.id,
        name: channel.name,
        type: channelTypeToString(channel.type),
        typeId: channel.type,
        position: channel.position,
        topic: getChannelProp<string | null>(channel, 'topic', null),
        nsfw: getChannelProp<boolean>(channel, 'nsfw', false),
        rateLimitPerUser: getChannelProp<number | null>(channel, 'rateLimitPerUser', null),
        bitrate: getChannelProp<number | null>(channel, 'bitrate', null),
        userLimit: getChannelProp<number | null>(channel, 'userLimit', null),
        rtcRegion: getChannelProp<string | null>(channel, 'rtcRegion', null),
        videoQualityMode: getChannelProp<number | null>(channel, 'videoQualityMode', null)?.toString() ?? null,
        defaultAutoArchiveDuration: getChannelProp<number | null>(channel, 'defaultAutoArchiveDuration', null),
        defaultThreadRateLimitPerUser: getChannelProp<number | null>(channel, 'defaultThreadRateLimitPerUser', null),
        defaultForumLayout: getChannelProp<number | null>(channel, 'defaultForumLayout', null)?.toString() ?? null,
        defaultSortOrder: getChannelProp<number | null>(channel, 'defaultSortOrder', null)?.toString() ?? null,
        createdAt: channel.createdAt?.toISOString() ?? null,
        createdTimestamp: channel.createdTimestamp ?? null,
        permissionOverwrites: serializePermissionOverwrites(channel),
        threads: serializeThreads(channel),
    };

    return base;
}

function serializePermissionOverwrites(channel: NonThreadGuildBasedChannel): SerializedPermissionOverwrite[] {
    if (!('permissionOverwrites' in channel)) return [];

    const overwrites = (channel as TextChannel).permissionOverwrites.cache;
    return overwrites.map((ow) => ({
        id: ow.id,
        type: ow.type === 0 ? 'role' : 'member',
        allow: permissionsToArray(ow.allow),
        deny: permissionsToArray(ow.deny),
    }));
}

function serializeThreads(channel: NonThreadGuildBasedChannel): SerializedThread[] {
    if (!('threads' in channel)) return [];

    const threads = (channel as TextChannel).threads.cache;
    return threads.map((t: ThreadChannel) => ({
        id: t.id,
        name: t.name,
        archived: t.archived ?? false,
        locked: t.locked ?? false,
        autoArchiveDuration: t.autoArchiveDuration ?? null,
        memberCount: t.memberCount ?? null,
        messageCount: t.messageCount ?? null,
        createdAt: t.createdAt?.toISOString() ?? null,
        ownerId: t.ownerId,
    }));
}

function serializeRole(role: Role): SerializedRole {
    return {
        id: role.id,
        name: role.name,
        color: role.color.toString(16).padStart(6, '0'),
        hexColor: role.hexColor,
        hoist: role.hoist,
        position: role.position,
        managed: role.managed,
        mentionable: role.mentionable,
        icon: role.icon,
        iconURL: role.iconURL({ size: 128 }) ?? null,
        unicodeEmoji: role.unicodeEmoji,
        permissions: permissionsToArray(role.permissions),
        createdAt: role.createdAt.toISOString(),
        createdTimestamp: role.createdTimestamp,
        memberCount: role.members.size,
        tags: role.tags ? {
            botId: (role.tags.botId as Snowflake | undefined) ?? null,
            integrationId: (role.tags.integrationId as Snowflake | undefined) ?? null,
            premiumSubscriberRole: role.tags.premiumSubscriberRole ?? false,
        } : null,
    };
}

function permissionsToArray(perms: Readonly<PermissionsBitField>): string[] {
    return perms.toArray();
}

/**
 * Accede de forma segura a una propiedad que puede no existir en todos los tipos de canal.
 */
function getChannelProp<T>(channel: NonThreadGuildBasedChannel, prop: string, fallback: T): T {
    return (prop in channel ? (channel as unknown as Record<string, unknown>)[prop] as T : fallback);
}

/* ------------------------------------------------------------------ */
/*  Mapeo de enums a strings legibles                                  */
/* ------------------------------------------------------------------ */

function channelTypeToString(type: ChannelType): string {
    const map: Record<number, string> = {
        0: 'GuildText',
        2: 'GuildVoice',
        4: 'GuildCategory',
        5: 'GuildAnnouncement',
        10: 'AnnouncementThread',
        11: 'PublicThread',
        12: 'PrivateThread',
        13: 'GuildStageVoice',
        14: 'GuildDirectory',
        15: 'GuildForum',
        16: 'GuildMedia',
    };
    return map[type] ?? `Unknown(${type})`;
}

function premiumTierToString(tier: number): string {
    const map: Record<number, string> = { 0: 'None', 1: 'Tier1', 2: 'Tier2', 3: 'Tier3' };
    return map[tier] ?? `Unknown(${tier})`;
}

function verificationLevelToString(level: number): string {
    const map: Record<number, string> = {
        0: 'None', 1: 'Low', 2: 'Medium', 3: 'High', 4: 'VeryHigh',
    };
    return map[level] ?? `Unknown(${level})`;
}

function explicitContentFilterToString(filter: number): string {
    const map: Record<number, string> = {
        0: 'Disabled', 1: 'MembersWithoutRoles', 2: 'AllMembers',
    };
    return map[filter] ?? `Unknown(${filter})`;
}

function nsfwLevelToString(level: number): string {
    const map: Record<number, string> = {
        0: 'Default', 1: 'Explicit', 2: 'Safe', 3: 'AgeRestricted',
    };
    return map[level] ?? `Unknown(${level})`;
}
