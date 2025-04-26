# Discord Staff Application Bot

A Discord bot for handling staff applications through slash commands.

## Features

- Customizable application questions
- Application form using Discord modals
- Staff review system with approve/deny actions
- Application notifications
- Open/close applications functionality

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
- `/applications open` - Open staff applications to the public
- `/applications close` - Close staff applications to the public
- `/applications status` - Check if applications are currently open or closed

### User Commands

- `/apply` - Apply for a staff position (only works when applications are open)

## Development

Run the bot in development mode:

```
npm run dev
```

This uses Node.js watch mode for automatic reloading on file changes. 

## Contributing

To contribute to this project:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please make sure to update tests as appropriate. 