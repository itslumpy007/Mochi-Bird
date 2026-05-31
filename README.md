# Mochi Bird

A standalone Flappy Bird-style Discord game you can deploy to Railway and launch from a Discord bot.

## What this repo is

This repository is the game-only version of Mochi Bird.

It includes:

- a browser-based Mochi Bird game
- Discord slash commands to launch a run
- score submission
- a local leaderboard
- cloud-backed player profiles for skins, settings, and stats
- cloud-backed daily quests and rewards
- achievement rewards that grant cans, titles, or cosmetics
- rotating seasonal themes and season rewards
- async friend challenges and race links
- server-side score plausibility checks
- once-per-day free revives with an expensive paid fallback
- collectable power-ups like magnet, shield, and can rush
- optional Discord Activity mode

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your Discord app values.

3. Register the slash commands:

```bash
npm run register
```

4. Start the app:

```bash
npm run dev
```

## Required environment variables

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_GUILD_ID`
- `PUBLIC_BASE_URL`

## Optional environment variables

- `DISCORD_ACTIVITY_MODE=true` to launch as a Discord Activity
- `MOCHI_DATA_DIR` to store scores on a Railway volume or persistent disk
- `SESSION_TTL_MINUTES` to adjust how long a game session stays valid

## Railway setup

If you deploy this repo to Railway:

1. Create a new Railway project from your GitHub repo.
2. Add the environment variables above.
3. Set `MOCHI_DATA_DIR` to your mounted volume path if you want leaderboard persistence across deploys.
4. Let Railway expose the service publicly over HTTPS.
5. Set `PUBLIC_BASE_URL` to that HTTPS URL.

## Discord setup

Create a Discord application and bot, then set:

- the bot token
- the application client ID
- a guild ID for faster slash command updates during testing

If `DISCORD_ACTIVITY_MODE=true`, `/mochi` responds with an Activity launch instead of a browser link.
Use `/challenge` to create a shareable race link that other players can claim and try to beat asynchronously.

## Files

- `src/index.js` starts the server and bot
- `src/server.js` serves the game and records scores
- `src/bot.js` handles slash commands
- `src/leaderboard.js` stores leaderboard data
- `src/state.js` manages sessions
- `public/game.js` is the game itself
