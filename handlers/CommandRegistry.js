const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');
const { COOLDOWNS, PERMISSION_LEVELS } = require('../constants');
const { getServerConfig } = require('../database');

/**
 * CommandRegistry - Handles command registration, loading, and execution
 * Implements a registry pattern for managing Discord commands
 */
class CommandRegistry {
  constructor(client) {
    this.client = client;
    this.commands = new Collection();
    this.cooldowns = new Collection();
    this.aliases = new Collection();
    
    // Bind methods to ensure proper 'this' context
    this.loadCommands = this.loadCommands.bind(this);
    this.registerCommand = this.registerCommand.bind(this);
    this.handleCommand = this.handleCommand.bind(this);
    this.getCooldownRemaining = this.getCooldownRemaining.bind(this);
  }

  /**
   * Load all commands from a directory and its subdirectories
   * @param {string} directory - The directory to load commands from
   * @returns {Promise<number>} - The number of commands loaded
   */
  async loadCommands(directory) {
    let commandCount = 0;
    
    try {
      // Get all files in the directory
      const items = fs.readdirSync(directory);
      
      for (const item of items) {
        const itemPath = path.join(directory, item);
        const stats = fs.statSync(itemPath);
        
        if (stats.isDirectory()) {
          // Recursively load commands from subdirectories
          commandCount += await this.loadCommands(itemPath);
        } else if (item.endsWith('.js')) {
          try {
            // Load the command module
            const command = require(itemPath);
            
            // Register the command
            this.registerCommand(command);
            commandCount++;
          } catch (error) {
            // No console.log statements here
          }
        }
      }
      
      return commandCount;
    } catch (error) {
      return commandCount;
    }
  }

  /**
   * Register a command with the command registry
   * @param {Object} command - The command module to register
   */
  registerCommand(command) {
    // Add to commands collection using the command name
    this.commands.set(command.data.name, command);
    
    // Register aliases if any
    if (command.aliases && Array.isArray(command.aliases)) {
      command.aliases.forEach(alias => {
        this.aliases.set(alias, command.data.name);
      });
    }
  }

  /**
   * Get commands for deployment
   * @returns {Array} - Array of commands for deployment
   */
  getCommandsForDeployment() {
    return Array.from(this.commands.values()).map(cmd => cmd.data.toJSON());
  }

  /**
   * Check if user has permission to use the command
   * @param {Object} interaction - Discord interaction
   * @param {Object} command - Command object
   * @param {Object} config - Bot config object (for role IDs)
   * @returns {boolean} - Whether the user has permission
   */
  async checkPermission(interaction, command, config = {}) {
    // If no permission level is specified, assume USER level
    const requiredLevel = command.permissionLevel ?? PERMISSION_LEVELS.USER;
    // Get user's permission level
    const userLevel = this.getUserPermissionLevel(interaction, config);
    // Check if user has the required permission level
    return userLevel >= requiredLevel;
  }

  /**
   * Get user's permission level
   * @param {Object} interaction - Discord interaction
   * @param {Object} config - Bot config object (for role IDs)
   * @returns {number} - User's permission level
   */
  getUserPermissionLevel(interaction, config = {}) {
    // Check if user is the bot owner
    if (interaction.client.application?.owner?.id === interaction.user.id) {
      return PERMISSION_LEVELS.OWNER;
    }
    // Check if user is the guild owner
    if (interaction.guild?.ownerId === interaction.user.id) {
      return PERMISSION_LEVELS.ADMIN;
    }
    // Get member's roles
    const member = interaction.member;
    if (!member) return PERMISSION_LEVELS.USER;
    // Get role IDs from config
    const roleIds = (config.permissions && config.permissions.roleIds) || {};
    // Check custom admin role
    if (roleIds.admin && member.roles.cache.has(roleIds.admin)) {
      return PERMISSION_LEVELS.ADMIN;
    }
    // Check custom moderator role(s)
    if ((roleIds.moderator && member.roles.cache.has(roleIds.moderator)) ||
        (roleIds.moderator2 && member.roles.cache.has(roleIds.moderator2))) {
      return PERMISSION_LEVELS.MODERATOR;
    }
    // Check custom staff role
    if (roleIds.staff && member.roles.cache.has(roleIds.staff)) {
      return PERMISSION_LEVELS.STAFF;
    }
    // Check custom helper role
    if (roleIds.helper && member.roles.cache.has(roleIds.helper)) {
      return PERMISSION_LEVELS.HELPER;
    }
    // Fallback to Discord permissions
    if (member.permissions.has('Administrator')) {
      return PERMISSION_LEVELS.ADMIN;
    }
    if (member.permissions.has('ManageGuild') || member.permissions.has('ModerateMembers')) {
      return PERMISSION_LEVELS.MODERATOR;
    }
    // Default to user level
    return PERMISSION_LEVELS.USER;
  }

  /**
   * Handle a command interaction
   * @param {Object} interaction - Discord interaction
   * @returns {Promise<void>}
   */
  async handleCommand(interaction) {
    const commandName = interaction.commandName;
    const command = this.commands.get(commandName);
    
    if (!command) return;
    
    try {
      // Get the config from the client
      const config = interaction.client.botConfig || {};
      // Check user permissions
      if (!await this.checkPermission(interaction, command, config)) {
        // Map numeric permission level back to its name
        const requiredLevelName = Object.keys(PERMISSION_LEVELS).find(
          key => PERMISSION_LEVELS[key] === (command.permissionLevel ?? PERMISSION_LEVELS.USER)
        ) || 'UNKNOWN';
        return interaction.reply({
          content: `You don't have permission to use this command. Required level: ${requiredLevelName}`,
          ephemeral: true
        });
      }
      
      // Check cooldowns
      const cooldownRemaining = await this.getCooldownRemaining(interaction, command);
      if (cooldownRemaining > 0) {
        return interaction.reply({
          content: `Please wait ${(cooldownRemaining / 1000).toFixed(1)} seconds before using this command again.`,
          ephemeral: true
        });
      }
      
      // Execute the command
      await command.execute(interaction, config);
    } catch (error) {
      // No console.log statements here
      
      // Reply to interaction if it hasn't been replied to yet
      try {
        const replyContent = {
          content: 'There was an error while executing this command.',
          ephemeral: true
        };
        
        if (interaction.replied) {
          // Already replied, try to follow up
          await interaction.followUp(replyContent);
        } else if (interaction.deferred) {
          // Deferred but not replied yet, edit the reply
          await interaction.editReply(replyContent);
        } else {
          // Not replied or deferred yet
          await interaction.reply(replyContent);
        }
      } catch (replyError) {
        // No further action - we've already tried our best to respond
      }
    }
  }

  /**
   * Get the remaining cooldown time for a command
   * @param {Object} interaction - Discord interaction
   * @param {Object} command - Command object
   * @returns {Promise<number>} - Remaining cooldown time in ms
   */
  async getCooldownRemaining(interaction, command) {
    // Skip cooldown checks for admin users
    if (this.getUserPermissionLevel(interaction) >= PERMISSION_LEVELS.ADMIN) {
      return 0;
    }
    
    const { user, guild } = interaction;
    const userId = user.id;
    const guildId = guild?.id;
    
    // Determine the cooldown amount
    let cooldownAmount;
    
    if (command.cooldown) {
      // Use command-specific cooldown if provided
      cooldownAmount = command.cooldown * 1000;
    } else {
      // Get the cooldown category for the command
      const category = command.category || 'DEFAULT';
      cooldownAmount = COOLDOWNS[category] || COOLDOWNS.DEFAULT;
      
      // Apply server-specific cooldown multiplier if available
      if (guildId) {
        try {
          const multiplier = await getServerConfig(guildId, 'cooldownMultiplier');
          cooldownAmount *= multiplier;
        } catch (error) {
          // No console.log statements here
        }
      }
    }
    
    // Check if the command is on cooldown
    const commandKey = `${guildId || 'dm'}-${userId}-${command.data.name}`;
    const timestamps = this.cooldowns.get(commandKey) || 0;
    const now = Date.now();
    
    // Calculate remaining time
    if (now < timestamps + cooldownAmount) {
      return timestamps + cooldownAmount - now;
    }
    
    // Command is not on cooldown, set new timestamp
    this.cooldowns.set(commandKey, now);
    
    // Auto-delete the cooldown after it expires
    setTimeout(() => this.cooldowns.delete(commandKey), cooldownAmount);
    
    return 0;
  }
}

module.exports = CommandRegistry; 