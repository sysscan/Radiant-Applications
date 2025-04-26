# Discord Staff Application Bot

A Discord bot for handling staff applications through slash commands.

## Features

- Customizable application questions
- Application form using Discord modals
- Staff review system with approve/deny actions
- Application notifications

## Setup

1. Clone this repository
2. Install dependencies
   ```
   npm install
   ```
3. Update `src/config.json` with your Discord bot token, client ID, and guild ID

   ```json
   {
     "token": "YOUR_BOT_TOKEN_HERE",
     "clientId": "YOUR_CLIENT_ID_HERE",
     "guildId": "YOUR_GUILD_ID_HERE"
   }
   ```

4. Deploy slash commands
   ```
   npm run deploy
   ```
5. Start the bot
   ```
   npm start
   ```

## Usage

### Admin Commands

- `/setup channel:channel staff_role:role admin_role:role` - Configure the staff application system

### User Commands

- `/apply` - Apply for a staff position

## Development

Run the bot in development mode:

```
npm run dev
```

This uses Node.js watch mode for automatic reloading on file changes. 