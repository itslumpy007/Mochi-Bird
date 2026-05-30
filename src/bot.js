import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';
import { buildPlayUrl, buildActivityUrl, createSession, createSessionToken } from './state.js';
import { getLeaderboard }              from './leaderboard.js';

// ── Command definitions ────────────────────────────────────────────────────────
const COMMANDS = [
  new SlashCommandBuilder()
    .setName('mochi')
    .setDescription('Start a Mochi Bird run and get your personal play link.'),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the Mochi Bird top scores.'),
].map(c => c.toJSON());

export async function registerCommands({ token, clientId, guildId }) {
  const rest  = new REST({ version: '10' }).setToken(token);
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);
  await rest.put(route, { body: COMMANDS });
}

// ── Bot ────────────────────────────────────────────────────────────────────────
export async function startBot({ token, clientId, guildId, baseUrl }) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, rc => console.log(`Discord bot ready as ${rc.user.tag}`));

  client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    try {
      // ── /mochi ──────────────────────────────────────────────────────────────
      if (interaction.commandName === 'mochi') {
        console.log(`[bot] /mochi command received from ${interaction.user.tag}`);
        const session = createSession({
          userId:     interaction.user.id,
          userTag:    interaction.user.tag,
          avatarHash: interaction.user.avatar ?? null,
          channelId:  interaction.channelId,
          guildId:    interaction.guildId ?? '',
          baseUrl,
        });

        // Use direct play URL - launches in browser (not Activity popup)
        // This approach works reliably and records scores properly
        const playUrl = buildPlayUrl(baseUrl, session.id);
        const activityUrl = playUrl;

        const embed = new EmbedBuilder()
          .setTitle('Mochi Bird 🐦')
          .setDescription('Your run is ready! Tap the button below to open the Activity.')
          .addFields(
            { name: 'Player',  value: interaction.user.tag, inline: true },
            { name: 'Session', value: session.id.slice(0, 8) + '…', inline: true },
          )
          .setColor(0x25d0ab);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Play Mochi Bird')
            .setStyle(ButtonStyle.Link)
            .setURL(activityUrl),
        );

        await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed], components: [row] });
        return;
      }

      // ── /leaderboard ─────────────────────────────────────────────────────────
      if (interaction.commandName === 'leaderboard') {
        const entries = await getLeaderboard(10);

        const desc = entries.length
          ? entries.map((e, i) => `**${i + 1}.** ${e.userTag} — **${e.bestScore}**`).join('\n')
          : 'No scores yet. Be the first!';

        await interaction.reply({
          flags:  MessageFlags.Ephemeral,
          embeds: [
            new EmbedBuilder()
              .setTitle('🏆 Mochi Bird Leaderboard')
              .setDescription(desc)
              .setColor(0xffc857),
          ],
        });
      }
    } catch (err) {
      console.error(`[bot] interaction error (/${interaction.commandName}):`, err.message);
      // Try to send an error reply if the interaction is still valid
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          flags:   MessageFlags.Ephemeral,
          content: 'Something went wrong. Please try again.',
        }).catch(() => {});
      }
    }
  });

  await client.login(token);

  // ── Score notification helper ──────────────────────────────────────────────
  return {
    async notifyScore({ session, score, personalBest, leaderboard }) {
      if (!session?.userId) return;
      try {
        // Send DM to the player only (not public in channel)
        const user = await client.users.fetch(session.userId);
        if (!user) return;

        const best     = personalBest?.bestScore ?? score;
        const topScore = leaderboard[0]?.bestScore;
        const rankLine = topScore != null ? `Top score: **${topScore}**` : '';

        await user.send({
          content: `🐦 You scored **${score}** in Mochi Bird! Personal best: **${best}**. ${rankLine}`.trim(),
        });
      } catch (err) {
        console.warn('[bot] notifyScore failed:', err.message);
      }
    },
  };
}
