require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { Client } = require('discord.js');
const CommandRegistry = require('./handlers/CommandRegistry');
const { PERMISSION_LEVELS } = require('./constants');

// Load configuration - prioritize .env, fallback to config.json
let config = {
  TOKEN: process.env.TOKEN,
  CLIENT_ID: process.env.CLIENT_ID,
  GUILD_ID: process.env.GUILD_ID
};

// If config.json exists and any values are missing from .env, use values from config.json
try {
  if (fs.existsSync('./config.json')) {
    const jsonConfig = require('./config.json');
    
    // Fill in missing values from config.json
    if (!config.TOKEN && jsonConfig.discord?.token) config.TOKEN = jsonConfig.discord.token;
    if (!config.CLIENT_ID && jsonConfig.discord?.clientId) config.CLIENT_ID = jsonConfig.discord.clientId;
    if (!config.GUILD_ID && jsonConfig.discord?.guildId) config.GUILD_ID = jsonConfig.discord.guildId;
  }
} catch (error) {
  console.error('\x1b[31m%s\x1b[0m', `Error loading config.json: ${error.message}`);
}

// Validate required configuration
if (!config.TOKEN) {
  console.error('\x1b[31m%s\x1b[0m', 'ERROR: Bot token not found in .env or config.json. Cannot deploy commands.');
  process.exit(1);
}

if (!config.CLIENT_ID) {
  console.error('\x1b[31m%s\x1b[0m', 'ERROR: Client ID not found in .env or config.json. Cannot deploy commands.');
  process.exit(1);
}

if (!config.GUILD_ID) {
  console.error('\x1b[31m%s\x1b[0m', 'ERROR: Guild ID not found in .env or config.json. Cannot deploy commands.');
  process.exit(1);
}

// Create a temporary client for the command registry
const tempClient = new Client({ intents: [] });

// Initialize command registry
const commandRegistry = new CommandRegistry(tempClient);

// Path to commands directory
const commandsPath = path.join(__dirname, 'commands');

(async () => {
  try {
    // Load all commands
    const commandCount = await commandRegistry.loadCommands(commandsPath);
    
    // Get all commands for deployment, filtering by permissionLevel
    // Deploy commands that are for ADMIN and below (change this as needed)
    const commands = Array.from(commandRegistry.commands.values())
      .filter(cmd => (cmd.permissionLevel ?? PERMISSION_LEVELS.USER) <= PERMISSION_LEVELS.ADMIN)
      .map(cmd => cmd.data.toJSON());
    
    // Initialize REST API client
    const rest = new REST({ version: '10' }).setToken(config.TOKEN);
    
    try {
      const response = await rest.put(
        Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID),
        { body: commands }
      );
    } catch (error) {
      console.error('\x1b[31m%s\x1b[0m', 'Error reloading application (/) commands:');
      console.error(error);
    }
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', 'Error loading commands:');
    console.error(error);
  }
})();
