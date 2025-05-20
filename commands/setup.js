const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { 
  setApplicationChannel, 
  setStaffRole, 
  setAdminRole, 
  setModRole2, 
  setApplicationsStatus, 
  setApplicationPanel, 
  setAutoRoleEnabled
} = require('../database');
const { updateConfigFile, checkPermission, getPermissionErrorMessage } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure all bot systems: permissions, status system, and applications')
    .addSubcommand(subcommand =>
      subcommand
        .setName('permissions')
        .setDescription('Configure the bot permission roles')
        .addRoleOption(option =>
          option.setName('admin_role')
            .setDescription('Role that has full bot access (ADMIN level)')
            .setRequired(true))
        .addRoleOption(option =>
          option.setName('moderator_role')
            .setDescription('Primary moderator role (MODERATOR level)')
            .setRequired(true))
        .addRoleOption(option =>
          option.setName('moderator_role_2')
            .setDescription('Secondary moderator role (MODERATOR level)')
            .setRequired(true))
        .addRoleOption(option =>
          option.setName('staff_role')
            .setDescription('Staff role for basic permissions (STAFF level)')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('status_system')
        .setDescription('Configure the status tracking and display system')
        .addChannelOption(option =>
          option.setName('status_channel')
            .setDescription('Channel where status updates will be displayed')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true))
        .addStringOption(option =>
          option.setName('webhook_url')
            .setDescription('Discord webhook URL for the status channel (optional)')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('applications')
        .setDescription('Configure the staff application system')
        .addChannelOption(option =>
          option.setName('applications_channel')
            .setDescription('Channel where applications will be sent for review')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true))
        .addBooleanOption(option =>
          option.setName('applications_open')
            .setDescription('Whether staff applications are open')
            .setRequired(true))
        .addChannelOption(option =>
          option.setName('panel_channel')
            .setDescription('Channel where the application panel will be displayed')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('auto_roles')
        .setDescription('Configure automatic role assignment')
        .addBooleanOption(option =>
          option.setName('enabled')
            .setDescription('Enable or disable automatic role assignment')
            .setRequired(true))),
  
  async execute(interaction, config) {
    try {
      // Check for admin permission, ManageGuild Discord permission, or specific role
      const hasAdminRole = await checkPermission(interaction, config, 'admin');
      const hasManageGuildPerm = interaction.member.permissions.has(PermissionFlagsBits.ManageGuild);
      const hasSpecificRole = interaction.member.roles.cache.has('1370011414378319872');
      
      if (!hasAdminRole && !hasManageGuildPerm && !hasSpecificRole) {
        return interaction.reply({
          content: '❌ This command requires administrator role, "Manage Server" permissions, or the designated moderator role.',
          ephemeral: true
        });
      }

      // Defer the reply since we might need more time
      await interaction.deferReply({ ephemeral: true });

      // Get the subcommand
      const subcommand = interaction.options.getSubcommand();
      
      if (subcommand === 'permissions') {
        await this.setupPermissions(interaction, config);
      } 
      else if (subcommand === 'status_system') {
        await this.setupStatusSystem(interaction, config);
      } 
      else if (subcommand === 'applications') {
        await this.setupApplications(interaction, config);
      }
      else if (subcommand === 'auto_roles') {
        await this.setupAutoRoles(interaction, config);
      }
    } catch (error) {
      console.error('Setup command error:', error);
      
      // Check if the interaction has been replied to
      if (interaction.deferred) {
        await interaction.editReply({ 
          content: '❌ Failed to complete the setup process. Please check the error logs and try again.' 
        });
      } else if (!interaction.replied) {
        await interaction.reply({ 
          content: '❌ Failed to complete the setup process. Please check the error logs and try again.',
          ephemeral: true 
        });
      }
    }
  },

  // Setup permission roles
  async setupPermissions(interaction, config) {
    const adminRole = interaction.options.getRole('admin_role');
    const moderatorRole = interaction.options.getRole('moderator_role');
    const moderatorRole2 = interaction.options.getRole('moderator_role_2');
    const staffRole = interaction.options.getRole('staff_role');

    // Save to database
    await setAdminRole(adminRole.id);
    await setModRole2(moderatorRole2.id);
    await setStaffRole(staffRole.id);

    // Update config file
    const updates = {
      modRoleId: moderatorRole.id,
      modRole2Id: moderatorRole2.id
    };

    const permissionsUpdate = {
      permissions: {
        roleIds: {
          admin: adminRole.id,
          moderator: moderatorRole.id,
          moderator2: moderatorRole2.id,
          staff: staffRole.id
        }
      }
    };

    // Update both config file and config object
    updateConfigFile(updates);
    if (config.statusSystem) {
      config.statusSystem.modRoleId = moderatorRole.id;
      config.statusSystem.modRole2Id = moderatorRole2.id;
    }
    
    // Update permissions in memory
    if (!config.permissions) {
      config.permissions = {};
    }
    if (!config.permissions.roleIds) {
      config.permissions.roleIds = {};
    }
    config.permissions.roleIds.admin = adminRole.id;
    config.permissions.roleIds.moderator = moderatorRole.id;
    config.permissions.roleIds.moderator2 = moderatorRole2.id;
    config.permissions.roleIds.staff = staffRole.id;

    await interaction.editReply({
      content: `✅ Permission roles configured successfully!\n\n` +
        `Administrator: ${adminRole}\n` +
        `Moderator: ${moderatorRole}\n` +
        `Moderator (Alt): ${moderatorRole2}\n` +
        `Staff: ${staffRole}`
    });
  },

  // Setup status system
  async setupStatusSystem(interaction, config) {
    const statusChannel = interaction.options.getChannel('status_channel');
    const webhookUrl = interaction.options.getString('webhook_url');

    // Verify bot permissions
    const botMember = interaction.guild.members.me;
    const requiredPermissions = [
      'SendMessages',
      'EmbedLinks',
      'ManageWebhooks',
      'ManageMessages'
    ];

    const missingPermissions = requiredPermissions.filter(
      perm => !statusChannel.permissionsFor(botMember).has(perm)
    );

    if (missingPermissions.length > 0) {
      return interaction.editReply({
        content: `❌ I'm missing required permissions in ${statusChannel}: ${missingPermissions.join(', ')}. Please update my permissions and try again.`
      });
    }

    // Update config file with the new status channel and webhook
    const updates = {
      statusChannelId: statusChannel.id
    };
    
    if (webhookUrl) {
      updates.webhookUrl = webhookUrl;
    } else {
      // If no webhook URL is provided, try to create one
      try {
        const webhook = await statusChannel.createWebhook({
          name: 'Status Bot',
          avatar: interaction.client.user.displayAvatarURL(),
          reason: 'Auto-created by /setup command'
        });
        updates.webhookUrl = webhook.url;
      } catch (error) {
        console.error('Failed to create webhook:', error);
        await interaction.followUp({
          content: `⚠️ Warning: Failed to create a webhook. Some features may be limited.`,
          ephemeral: true
        });
      }
    }

    // Save to config
    updateConfigFile(updates);
    
    // Update config in memory
    if (config.statusSystem) {
      config.statusSystem.statusChannelId = statusChannel.id;
      if (updates.webhookUrl) {
        config.statusSystem.webhookUrl = updates.webhookUrl;
      }
    }

    // Ensure webhook is valid and update config if needed
    try {
      // Attach client to config for ensureValidWebhook
      config.client = interaction.client;
      const { ensureValidWebhook } = require('../utils');
      await ensureValidWebhook(config);
    } catch (err) {
      console.error('Failed to validate or refresh webhook after setup:', err);
    }

    // Send a test message to the channel
    try {
      const message = await statusChannel.send({
        content: '✅ This channel has been set up for status updates. This message will be replaced with the status embed.'
      });

      // Save the message ID to use for future updates
      const messageUpdates = {
        embedMessageId: message.id
      };
      
      // Try to send a second message for update information
      const updateMessage = await statusChannel.send({
        content: 'This message will be used for status update notifications.'
      });
      
      if (updateMessage) {
        messageUpdates.updateMessageId = updateMessage.id;
      }
      
      updateConfigFile(messageUpdates);
      
      // Update config in memory
      if (config.statusSystem) {
        config.statusSystem.embedMessageId = message.id;
        if (messageUpdates.updateMessageId) {
          config.statusSystem.updateMessageId = updateMessage.id;
        }
      }
    } catch (error) {
      console.error('Error sending test message:', error);
      await interaction.followUp({
        content: `⚠️ Warning: Failed to send a test message to ${statusChannel}. Please check my permissions.`,
        ephemeral: true
      });
    }

    await interaction.editReply({
      content: `✅ Status system configured successfully!\n\n` +
        `Status Channel: ${statusChannel}\n` +
        `Webhook: ${updates.webhookUrl ? 'Configured ✓' : 'Not configured'}`
    });
  },

  // Setup application system
  async setupApplications(interaction, config) {
    const applicationsChannel = interaction.options.getChannel('applications_channel');
    const applicationsOpen = interaction.options.getBoolean('applications_open');
    const panelChannel = interaction.options.getChannel('panel_channel') || applicationsChannel;

    // Verify bot permissions
    const botMember = interaction.guild.members.me;
    const requiredPermissions = [
      'SendMessages',
      'EmbedLinks',
      'ManageMessages'
    ];

    const missingPermissions = requiredPermissions.filter(
      perm => !applicationsChannel.permissionsFor(botMember).has(perm)
    );

    if (missingPermissions.length > 0) {
      return interaction.editReply({
        content: `❌ I'm missing required permissions in ${applicationsChannel}: ${missingPermissions.join(', ')}. Please update my permissions and try again.`
      });
    }

    // Set up the application system
    await setApplicationChannel(applicationsChannel.id);
    await setApplicationsStatus(applicationsOpen);

    // Create and set up the application panel
    try {
      const panelMessage = await panelChannel.send({
        content: 'Setting up application panel...'
      });
      
      await setApplicationPanel(panelChannel.id, panelMessage.id);
      
      // Update the application panel with the proper embed and buttons
      if (interaction.client.user && global.updateApplicationPanel) {
        await global.updateApplicationPanel(interaction.client);
      }
    } catch (error) {
      console.error('Error creating application panel:', error);
      await interaction.followUp({
        content: `⚠️ Warning: Failed to create the application panel. Please try again or create it manually.`,
        ephemeral: true
      });
    }

    await interaction.editReply({
      content: `✅ Application system configured successfully!\n\n` +
        `Applications Channel: ${applicationsChannel}\n` +
        `Panel Channel: ${panelChannel}\n` +
        `Applications Status: ${applicationsOpen ? '**OPEN**' : '**CLOSED**'}`
    });
  },

  // Setup auto roles
  async setupAutoRoles(interaction, config) {
    const enabled = interaction.options.getBoolean('enabled');
    
    // Set the auto-role status
    await setAutoRoleEnabled(enabled);
    
    await interaction.editReply({
      content: `✅ Auto-role system ${enabled ? 'enabled' : 'disabled'} successfully!\n\n` +
        `Use the \`/autorole\` command to add, remove, or configure auto-roles.`
    });
  },

  permissionLevel: require('../constants').PERMISSION_LEVELS.ADMIN,
}; 