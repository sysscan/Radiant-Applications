const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const { getApplicationsStatus, setApplicationPanel, getAdminRole, getModRole2 } = require('../database');
const { checkPermission } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Create an application panel with apply button')
    .addChannelOption(option =>
      option.setName('channel')
        .setDescription('Channel to post the application panel')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  
  async execute(interaction, config) {
    try {
      // Check for admin/mod permissions
      const adminRoleId = await getAdminRole();
      const modRole2Id = await getModRole2() || config.MOD_ROLE_2;
      
      if (!adminRoleId && !modRole2Id) {
        return interaction.reply({ 
          content: '❌ The application system has not been set up properly. Please use the `/setup` command first.',
          ephemeral: true 
        });
      }
      
      // Check if user has either admin role, mod role 2, or "Manage Server" permission
      const hasAdminRole = adminRoleId && interaction.member.roles.cache.has(adminRoleId);
      const hasModRole2 = modRole2Id && interaction.member.roles.cache.has(modRole2Id);
      const hasManageGuildPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
      
      if (!hasAdminRole && !hasModRole2 && !hasManageGuildPerm) {
        return interaction.reply({ 
          content: '❌ You do not have permission to manage the application panel.',
          ephemeral: true 
        });
      }
      
      await interaction.deferReply({ ephemeral: true });
      
      // Get the channel or use the current one
      const channel = interaction.options.getChannel('channel') || interaction.channel;
      
      // Check bot permissions in the channel
      if (!channel.permissionsFor(interaction.guild.members.me).has(['SendMessages', 'EmbedLinks'])) {
        return interaction.editReply({
          content: `❌ I don't have permission to send messages and embeds in ${channel}. Please grant the necessary permissions and try again.`,
          ephemeral: true
        });
      }
      
      // Get current application status
      const isOpen = await getApplicationsStatus();
      
      // Create the panel embed
      const embed = new EmbedBuilder()
        .setTitle('🔰 Staff Applications')
        .setDescription(
          isOpen 
            ? 'Applications are currently **OPEN**!\n\nUse the button below to apply or run the `/apply` command to start your application process.'
            : 'Applications are currently **CLOSED**.\n\nCheck back later for open positions!'
        )
        .setColor(isOpen ? 0x00FF00 : 0xFF0000)
        .setFooter({ text: `Last updated: ${new Date().toLocaleString()}` });
      
      // Create apply button
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('apply_button')
          .setLabel('Apply for Staff')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!isOpen)
          .setEmoji('📝')
      );
      
      // Send the panel
      const message = await channel.send({ embeds: [embed], components: [row] });
      
      // Save panel information to database
      await setApplicationPanel(channel.id, message.id);
      
      await interaction.editReply({
        content: `✅ Application panel created successfully in ${channel}!\n\nThe panel will automatically update when applications are opened or closed.`,
        ephemeral: true
      });
    } catch (error) {
      console.error('Error creating application panel:', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `❌ An error occurred while creating the application panel: ${error.message}`,
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: `❌ An error occurred while creating the application panel: ${error.message}`,
          ephemeral: true
        });
      }
    }
  },
  permissionLevel: require('../constants').PERMISSION_LEVELS.MODERATOR,
}; 