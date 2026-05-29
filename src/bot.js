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
  SlashCommandBuilder
} from 'discord.js';
import { buildPlayUrl, createSession } from './state.js';
import { getLeaderboard } from './leaderboard.js';

function formatLeaderboard(entries) {
  if (!entries.length) {
    return 'No scores yet. Be the first to set one.';
  }

  return entries
    .map((entry, index) => `${index + 1}. ${entry.userTag} - ${entry.bestScore}`)
    .join('\n');
}

export async function registerCommands({ token, clientId, guildId }) {
  const commands = [
    new SlashCommandBuilder()
      .setName('mochi')
      .setDescription('Start a Mochi Bird run in your browser.'),
    new SlashCommandBuilder()
      .setName('flappy')
      .setDescription('Start a Mochi Bird run in your browser.'),
    new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription('Show the Mochi Bird leaderboard.')
  ].map((command) => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(token);
  const route = guildId
    ? Routes.applicationGuildCommands(clientId, guildId)
    : Routes.applicationCommands(clientId);

  await rest.put(route, { body: commands });
}

export async function startBot({
  token,
  clientId,
  guildId,
  baseUrl,
  activityMode = false,
  onScoreSubmitted
}) {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Discord bot ready as ${readyClient.user.tag}`);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    try {
      if (interaction.commandName === 'mochi' || interaction.commandName === 'flappy') {
        if (activityMode) {
          const response = await fetch(
            `https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                type: 12
              })
            }
          );

          if (!response.ok) {
            throw new Error(`Failed to launch activity: ${response.status}`);
          }
          return;
        }

        const session = createSession({
          userId: interaction.user.id,
          userTag: interaction.user.tag,
          channelId: interaction.channelId,
          guildId: interaction.guildId,
          baseUrl
        });

        const playUrl = buildPlayUrl(baseUrl, session.id);
        const embed = new EmbedBuilder()
          .setTitle('Mochi Bird')
          .setDescription('Your run is ready. Tap the button to open the game in a browser.')
          .addFields(
            { name: 'Player', value: interaction.user.tag, inline: true },
            { name: 'Session', value: session.id.slice(0, 8), inline: true }
          )
          .setColor(0x25d0ab);

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Play')
            .setStyle(ButtonStyle.Link)
            .setURL(playUrl)
        );

        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          embeds: [embed],
          components: [row]
        });
        return;
      }

      if (interaction.commandName === 'leaderboard') {
        const entries = await getLeaderboard(10);
        await interaction.reply({
          flags: MessageFlags.Ephemeral,
          embeds: [
            new EmbedBuilder()
              .setTitle('Mochi Bird Leaderboard')
              .setDescription(formatLeaderboard(entries))
              .setColor(0xffc857)
          ]
        });
      }
    } catch (error) {
      console.error(`Interaction error [${interaction.commandName}]:`, error.message);
    }
  });

  await client.login(token);

  return {
    client,
    async notifyScore({ session, score, personalBest, leaderboard }) {
      if (!session?.channelId) {
        return;
      }

      try {
        const channel = await client.channels.fetch(session.channelId);
        if (!channel || !channel.isTextBased()) {
          return;
        }

        const best = personalBest?.bestScore ?? score;
        const rankText = leaderboard.length
          ? `Current top score: ${leaderboard[0].bestScore}`
          : 'No leaderboard entries yet.';

        await channel.send({
          content: `**${session.userTag}** scored **${score}** in Mochi Bird. Personal best: **${best}**. ${rankText}`
        });
      } catch (error) {
        console.warn('Failed to send score update to Discord:', error.message);
      }
    }
  };
}
