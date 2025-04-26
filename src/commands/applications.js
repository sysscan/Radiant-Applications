import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import config from '../utils/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper function to create application embed based on status
const createApplicationEmbed = (isOpen) => {
  const status = isOpen ? 'open' : 'closed';
  const statusText = isOpen 
    ? 'Applications are currently open! Click the button below to apply.' 
    : 'Applications are currently closed. Please check back later.';
  
  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('Staff Applications')
    .setDescription(`We are looking for new staff members!\n\n**Status: ${status.toUpperCase()}**\n${statusText}`)
    .setTimestamp();
};

// Helper function to create button row
const createButtonRow = () => {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('application:apply:new')
        .setLabel('Apply for Staff')
        .setStyle(ButtonStyle.Primary)
    );
};

export default {
  data: new SlashCommandBuilder()
    .setName('applications')
    .setDescription('Manage staff applications')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(subcommand =>
      subcommand
        .setName('open')
        .setDescription('Open staff applications to the public'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('close')
        .setDescription('Close staff applications to the public'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setDescription('Check if staff applications are currently open')),
        
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    
    if (subcommand === 'status') {
      const status = config.applicationsOpen ? 'open' : 'closed';
      const statusEmbed = new EmbedBuilder()
        .setColor(config.applicationsOpen ? '#00FF00' : '#FF0000')
        .setTitle('Staff Applications Status')
        .setDescription(`Staff applications are currently **${status}**.`)
        .setTimestamp();
        
      await interaction.reply({ embeds: [statusEmbed], ephemeral: true });
      return;
    }
    
    // For open/close subcommands
    await interaction.deferReply({ ephemeral: true });
    
    const newStatus = subcommand === 'open';
    
    // Update the config
    const newConfig = { ...config };
    newConfig.applicationsOpen = newStatus;
    
    const configPath = join(__dirname, '..', 'config.json');
    await writeFile(configPath, JSON.stringify(newConfig, null, 2));
    
    // Try to update the application message if it exists
    if (config.applicationMessageId) {
      try {
        const channel = await interaction.client.channels.fetch(config.applicationChannelId);
        const message = await channel.messages.fetch(config.applicationMessageId);
        
        if (message) {
          const updatedEmbed = createApplicationEmbed(newStatus);
          const buttonRow = createButtonRow();
          
          await message.edit({ embeds: [updatedEmbed], components: [buttonRow] });
          console.log(`Updated application message ${message.id} with new status: ${newStatus ? 'open' : 'closed'}`);
        }
      } catch (error) {
        console.error('Error updating application message:', error);
      }
    }
    
    // Reply to the command
    const status = newStatus ? 'opened' : 'closed';
    const statusEmbed = new EmbedBuilder()
      .setColor(newStatus ? '#00FF00' : '#FF0000')
      .setTitle(`Staff Applications ${status.charAt(0).toUpperCase() + status.slice(1)}`)
      .setDescription(`Staff applications have been **${status}**.`)
      .setTimestamp();
      
    await interaction.editReply({ embeds: [statusEmbed] });
  }
}; 