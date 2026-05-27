import 'dotenv/config';
import { registerCommands } from './bot.js';

const { DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error('Missing DISCORD_TOKEN or DISCORD_CLIENT_ID.');
  process.exit(1);
}

await registerCommands({
  token: DISCORD_TOKEN,
  clientId: DISCORD_CLIENT_ID,
  guildId: DISCORD_GUILD_ID
});

console.log('Slash commands registered.');

