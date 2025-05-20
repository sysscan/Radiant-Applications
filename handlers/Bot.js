const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const CommandRegistry = require('./CommandRegistry');
const EventHandler = require('./EventHandler');

/**
 * Bot - Main bot class that ties together all components
 */
class Bot {
  constructor(config) {
    this.config = config;
    
    // Create client with appropriate intents
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
      ]
    });
    
    // Attach config to the client for use in commands
    this.client.botConfig = config;
    
    // Initialize handlers
    this.commandRegistry = new CommandRegistry(this.client);
    this.eventHandler = new EventHandler(this.client);
    
    // Attach the command registry to the client for access in events
    this.client.commandRegistry = this.commandRegistry;
  }

  /**
   * Initialize the bot
   * @returns {Promise<void>}
   */
  async initialize() {
    // Load commands
    const commandsPath = path.join(__dirname, '..', 'commands');
    const commandCount = await this.commandRegistry.loadCommands(commandsPath);
    
    // Load events
    const eventsPath = path.join(__dirname, '..', 'events');
    const eventCount = await this.eventHandler.loadEvents(eventsPath);
  }

  /**
   * Start the bot
   * @returns {Promise<void>}
   */
  async start() {
    try {
      // Login to Discord
      await this.client.login(this.config.TOKEN);
    } catch (error) {
      throw error;
    }
  }
}

module.exports = Bot; 