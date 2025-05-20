const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { PERMISSION_LEVELS } = require('../constants');
const { 
  DEFAULT_CONFIG, 
  getServerConfig, 
  setServerConfig, 
  getAllServerConfig, 
  resetServerConfig 
} = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure bot settings for this server')
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View current server configuration'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('Set a configuration value')
        .addStringOption(option =>
          option.setName('key')
            .setDescription('The configuration key to set')
            .setRequired(true)
            .addChoices(
              { name: 'Command Prefix', value: 'prefix' },
              { name: 'Language', value: 'language' },
              { name: 'TTS Enabled', value: 'ttsEnabled' },
              { name: 'TTS Volume', value: 'ttsVolume' },
              { name: 'TTS Language', value: 'ttsLanguage' },
              { name: 'Ultimate Bravery Enabled', value: 'ultimateBraveryEnabled' },
              { name: 'Welcome Message', value: 'welcomeMessage' },
              { name: 'Log Channel', value: 'logChannel' },
              { name: 'Mod Logging Enabled', value: 'modLogEnabled' },
              { name: 'Cooldown Multiplier', value: 'cooldownMultiplier' }
            ))
        .addStringOption(option =>
          option.setName('value')
            .setDescription('The new value for this setting')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('reset')
        .setDescription('Reset all server configuration to defaults'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  permissionLevel: PERMISSION_LEVELS.ADMIN,
  
  async execute(interaction, config) {
    // Check if user has "Manage Server" permission
    const hasManageGuildPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
    // If they don't have Manage Server permission, we'll let Discord handle it automatically
    // since we've set DefaultMemberPermissions to ManageGuild above
    
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    
    switch (subcommand) {
      case 'view':
        return await handleViewConfig(interaction, guildId);
      case 'set':
        return await handleSetConfig(interaction, guildId);
      case 'reset':
        return await handleResetConfig(interaction, guildId);
      default:
        return interaction.reply({ content: 'Invalid subcommand', ephemeral: true });
    }
  }
};

async function handleViewConfig(interaction, guildId) {
  await interaction.deferReply();
  
  try {
    const config = await getAllServerConfig(guildId);
    
    const embed = new EmbedBuilder()
      .setTitle('Server Configuration')
      .setColor('#0099ff')
      .setDescription('Current configuration for this server')
      .addFields(
        Object.entries(config).map(([key, value]) => {
          // Format boolean values as "Yes"/"No" and null values as "Not set"
          let displayValue = value;
          if (typeof value === 'boolean') {
            displayValue = value ? 'Yes' : 'No';
          } else if (value === null) {
            displayValue = 'Not set';
          }
          
          return {
            name: formatConfigKey(key),
            value: String(displayValue),
            inline: true
          };
        })
      )
      .setTimestamp()
      .setFooter({ text: `Server ID: ${guildId}` });
    
    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error(`[CONFIG] Error viewing config for guild ${guildId}:`, error);
    return interaction.editReply({ 
      content: 'An error occurred while retrieving server configuration.', 
      ephemeral: true 
    });
  }
}

async function handleSetConfig(interaction, guildId) {
  const key = interaction.options.getString('key');
  let value = interaction.options.getString('value');
  
  // Convert string values to appropriate types
  switch (key) {
    case 'ttsEnabled':
    case 'ultimateBraveryEnabled':
    case 'modLogEnabled':
      value = value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
      break;
    case 'ttsVolume':
    case 'cooldownMultiplier':
      value = parseFloat(value);
      if (isNaN(value)) {
        return interaction.reply({ 
          content: 'Invalid number format. Please provide a valid number.', 
          ephemeral: true 
        });
      }
      // Validate ranges
      if (key === 'ttsVolume' && (value < 0 || value > 2)) {
        return interaction.reply({ 
          content: 'TTS volume must be between 0 and 2.', 
          ephemeral: true 
        });
      }
      if (key === 'cooldownMultiplier' && (value < 0.1 || value > 10)) {
        return interaction.reply({ 
          content: 'Cooldown multiplier must be between 0.1 and 10.', 
          ephemeral: true 
        });
      }
      break;
    case 'welcomeMessage':
    case 'logChannel':
      // If value is "null" or "none", set to null
      if (value.toLowerCase() === 'null' || value.toLowerCase() === 'none') {
        value = null;
      }
      break;
  }
  
  try {
    await setServerConfig(guildId, key, value);
    
    return interaction.reply({ 
      content: `Successfully set \`${formatConfigKey(key)}\` to \`${value}\``,
      ephemeral: true 
    });
  } catch (error) {
    console.error(`[CONFIG] Error setting config ${key} for guild ${guildId}:`, error);
    return interaction.reply({ 
      content: 'An error occurred while updating server configuration.', 
      ephemeral: true 
    });
  }
}

async function handleResetConfig(interaction, guildId) {
  try {
    await resetServerConfig(guildId);
    
    return interaction.reply({ 
      content: 'All server configuration has been reset to defaults.',
      ephemeral: true 
    });
  } catch (error) {
    console.error(`[CONFIG] Error resetting config for guild ${guildId}:`, error);
    return interaction.reply({ 
      content: 'An error occurred while resetting server configuration.', 
      ephemeral: true 
    });
  }
}

// Helper function to format config keys for display
function formatConfigKey(key) {
  // Convert camelCase to Title Case with Spaces
  return key
    .replace(/([A-Z])/g, ' $1') // Insert space before capital letters
    .replace(/^./, str => str.toUpperCase()); // Capitalize first letter
} 