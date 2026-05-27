import 'dotenv/config';
import { createServer } from './server.js';
import { startBot } from './bot.js';

const port = Number(process.env.PORT || 3000);
const baseUrl = process.env.PUBLIC_BASE_URL || `http://localhost:${port}`;
const discordToken = process.env.DISCORD_TOKEN;
const discordClientId = process.env.DISCORD_CLIENT_ID;
const discordGuildId = process.env.DISCORD_GUILD_ID;
const activityMode = process.env.DISCORD_ACTIVITY_MODE === 'true';

if (!discordToken || !discordClientId) {
  console.warn('Discord bot is disabled because DISCORD_TOKEN or DISCORD_CLIENT_ID is missing.');
}

let botHandle = null;

const app = createServer({
  onScoreSubmitted: async (payload) => {
    if (botHandle) {
      await botHandle.notifyScore(payload);
    }
  }
});

app.listen(port, () => {
  console.log(`Web server listening on ${baseUrl}`);
});

if (discordToken && discordClientId) {
  botHandle = await startBot({
    token: discordToken,
    clientId: discordClientId,
    guildId: discordGuildId,
    baseUrl,
    activityMode
  });
}
