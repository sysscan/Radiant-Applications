const PERMISSION_LEVELS = {
  USER: 0,      // Regular users - can use basic commands
  TRUSTED: 1,   // Trusted users - can use more features with fewer restrictions
  HELPER: 2,    // Helpers - can assist with support functions
  STAFF: 3,     // Staff members - can use help desk and support commands
  MODERATOR: 4, // Moderators - can update status and manage products
  ADMIN: 5,     // Administrators - full access to all commands
  OWNER: 6      // Bot owner - can use system commands and override restrictions
};

// Command cooldowns in milliseconds
const COOLDOWNS = {
  DEFAULT: 3000,       // Default cooldown for most commands
  TTS: 5000,           // Text-to-speech cooldown
  PRAISE: 30000,       // Praise command cooldown
  UB: 10000,           // Ultimate Bravery cooldown
  ADMIN_COMMANDS: 0,   // No cooldown for admin commands
};

/**
 * Discord permission requirements for commands
 * These are the Discord permissions the bot checks before allowing a command
 */
const COMMAND_PERMISSIONS = {
  // Status Management Commands (role ID 1288235352808493137 also has access via utils.js, except postembed)
  UPDATE_STATUS: ['SendMessages', 'EmbedLinks', 'ManageMessages'],
  // postembed is restricted to administrators and role ID 1370011414378319872 only
  POST_EMBED: ['SendMessages', 'EmbedLinks', 'ManageWebhooks', 'ManageMessages'],
  
  // Server Configuration Commands (role ID 1370011414378319872 also has access via utils.js and command code)
  SETUP: ['Administrator', 'ManageGuild', 'ManageChannels'],
  APPLICATIONS: ['ManageGuild'],
  AUTOROLE: ['ManageRoles'],
  
  // Content Management Commands (role ID 1288235352808493137 also has access via utils.js)
  GUIDE: ['SendMessages', 'EmbedLinks'],
  
  // TTS Commands
  SAY: ['SendMessages', 'Connect', 'Speak'],
  SHUO: ['SendMessages', 'Connect', 'Speak'],
  PRAISE: ['SendMessages', 'Connect', 'Speak'],
  
  // Game Commands
  CHALLENGE: ['SendMessages', 'EmbedLinks'],
  
  // Default minimum permissions for all commands
  DEFAULT: ['SendMessages', 'EmbedLinks']
};

/**
 * Channel type restrictions for commands
 * Defines which channel types each command can be used in
 */
const CHANNEL_RESTRICTIONS = {
  // Unrestricted - can be used in any channel
  UNRESTRICTED: ['say', 'shuo', 'praise', 'challengeMeMortals'],
  
  // Admin channels only
  ADMIN_ONLY: ['setup', 'config', 'autorole'],
  
  // Default channel types where commands can be executed
  DEFAULT: ['GUILD_TEXT', 'GUILD_VOICE', 'DM']
};

/**
 * Human-readable permission level descriptions
 * Used for error messages and documentation
 */
const PERMISSION_DESCRIPTIONS = {
  USER: "This command can be used by any server member",
  TRUSTED: "This command requires trusted user status",
  HELPER: "This command requires helper status",
  STAFF: "This command requires staff permissions",
  MODERATOR: "This command requires moderator permissions",
  ADMIN: "This command requires administrator permissions",
  OWNER: "This command can only be used by the bot owner"
};

/**
 * Error messages for permission and restriction failures
 */
const ERROR_MESSAGES = {
  MISSING_PERMISSIONS: "You don't have the required permissions to use this command:",
  COOLDOWN_ACTIVE: "Please wait {time} before using this command again.",
  WRONG_CHANNEL: "This command can only be used in {channels}.",
  BOT_MISSING_PERMISSIONS: "I need the following permissions to execute this command: {permissions}"
};

module.exports = {
  PERMISSION_LEVELS,
  COMMAND_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  COOLDOWNS,
  CHANNEL_RESTRICTIONS,
  ERROR_MESSAGES
}; 