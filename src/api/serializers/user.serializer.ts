import type { User } from 'discord.js';

/* ------------------------------------------------------------------ */
/*  Tipos serializados                                                 */
/* ------------------------------------------------------------------ */

export interface SerializedUser {
    readonly id: string;
    readonly username: string;
    readonly globalName: string | null;
    readonly discriminator: string;
    readonly avatar: string | null;
    readonly avatarURL: string | null;
    readonly avatarDecoration: string | null;
    readonly banner: string | null;
    readonly bannerURL: string | null;
    readonly accentColor: number | null;
    readonly accentColorHex: string | null;
    readonly bot: boolean;
    readonly system: boolean;
    readonly flags: string[];
    readonly createdAt: string;
    readonly createdTimestamp: number;
    readonly defaultAvatarURL: string;
    readonly displayAvatarURL: string;
}

/* ------------------------------------------------------------------ */
/*  Función de serialización                                           */
/* ------------------------------------------------------------------ */

/**
 * Serializa un User de Discord a un objeto JSON plano.
 *
 * IMPORTANTE: Usa `client.users.fetch()` que obtiene el usuario
 * directamente de la API de Discord, por lo que NO requiere que
 * el usuario esté en un servidor compartido con el bot.
 */
export function serializeUser(user: User): SerializedUser {
    const flagsList = user.flags?.toArray() ?? [];

    return {
        id: user.id,
        username: user.username,
        globalName: user.globalName,
        discriminator: user.discriminator,
        avatar: user.avatar,
        avatarURL: user.avatarURL({ size: 1024 }) ?? null,
        avatarDecoration: user.avatarDecoration ?? null,
        banner: user.banner ?? null,
        bannerURL: user.bannerURL({ size: 1024 }) ?? null,
        accentColor: user.accentColor ?? null,
        accentColorHex: user.hexAccentColor ?? null,
        bot: user.bot,
        system: user.system ?? false,
        flags: flagsList,
        createdAt: user.createdAt.toISOString(),
        createdTimestamp: user.createdTimestamp,
        defaultAvatarURL: user.defaultAvatarURL,
        displayAvatarURL: user.displayAvatarURL({ size: 1024 }),
    };
}
