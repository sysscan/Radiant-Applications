require('dotenv').config();
const fs = require('fs');
const Bot = require('./handlers/Bot');

// Load configuration - prioritize .env, fallback to config.json
let config = {
  TOKEN: process.env.TOKEN,
  CLIENT_ID: process.env.CLIENT_ID,
  GUILD_ID: process.env.GUILD_ID,
  MOD_ROLE_ID: process.env.MOD_ROLE_ID,
  MOD_ROLE_2: process.env.MOD_ROLE_2,
  WEBHOOK_URL: process.env.WEBHOOK_URL,
  EMBED_MESSAGE_ID: process.env.EMBED_MESSAGE_ID,
  UPDATE_MESSAGE_ID: process.env.UPDATE_MESSAGE_ID,
  STATUS_CHANNEL_ID: process.env.STATUS_CHANNEL_ID,
  // Initialize statusSystem object here to avoid undefined errors
  statusSystem: {}
};

try {
  if (fs.existsSync('./config.json')) {
    const jsonConfig = require('./config.json');
    
    // Fill in missing values from config.json
    if (!config.TOKEN && jsonConfig.discord?.token) config.TOKEN = jsonConfig.discord.token;
    if (!config.CLIENT_ID && jsonConfig.discord?.clientId) config.CLIENT_ID = jsonConfig.discord.clientId;
    if (!config.GUILD_ID && jsonConfig.discord?.guildId) config.GUILD_ID = jsonConfig.discord.guildId;
    
    // Properly initialize the statusSystem object from config.json
    config.statusSystem = {
      webhookUrl: jsonConfig.statusSystem?.webhookUrl || config.WEBHOOK_URL,
      embedMessageId: jsonConfig.statusSystem?.embedMessageId || config.EMBED_MESSAGE_ID,
      updateMessageId: jsonConfig.statusSystem?.updateMessageId || config.UPDATE_MESSAGE_ID,
      statusChannelId: jsonConfig.statusSystem?.statusChannelId || config.STATUS_CHANNEL_ID,
      modRoleId: jsonConfig.statusSystem?.modRoleId || config.MOD_ROLE_ID,
      modRole2Id: jsonConfig.statusSystem?.modRole2Id || config.MOD_ROLE_2
    };
  } else {
    // Initialize statusSystem from environment variables
    config.statusSystem = {
      webhookUrl: config.WEBHOOK_URL,
      embedMessageId: config.EMBED_MESSAGE_ID,
      updateMessageId: config.UPDATE_MESSAGE_ID,
      statusChannelId: config.STATUS_CHANNEL_ID,
      modRoleId: config.MOD_ROLE_ID,
      modRole2Id: config.MOD_ROLE_2
    };
  }
} catch (error) {
  console.error(`Error loading config.json: ${error.message}`);
}

// Validate required configuration
if (!config.TOKEN) {
  console.error('ERROR: Bot token not found in config.json or .env. The bot cannot start.');
  process.exit(1);
}

// Create and initialize the bot
(async () => {
  try {
    const bot = new Bot(config);
    await bot.initialize();
    await bot.start();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
})();