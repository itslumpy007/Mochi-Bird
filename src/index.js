import 'dotenv/config';
import { createServer } from './server.js';
import { startBot }     from './bot.js';

const port      = Number(process.env.PORT || 3000);
const baseUrl   = (process.env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/$/, '');
const token     = process.env.DISCORD_TOKEN;
const clientId  = process.env.DISCORD_CLIENT_ID;
const guildId   = process.env.DISCORD_GUILD_ID;

let bot = null;

const app = createServer({
  async onScoreSubmitted(payload) {
    await bot?.notifyScore(payload);
  },
});

app.listen(port, () => console.log(`Web server listening on ${baseUrl}`));

if (token && clientId) {
  bot = await startBot({ token, clientId, guildId, baseUrl });
} else {
  console.warn('Discord bot disabled — set DISCORD_TOKEN and DISCORD_CLIENT_ID to enable it.');
}
