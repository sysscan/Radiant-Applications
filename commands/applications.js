const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { setApplicationsStatus, getApplicationsStatus, getAdminRole, getApplicationChannel, getModRole2, clearApplications, clearUserApplication, getApplication, getApplicationsByStatus, getStaffRole } = require('../database');
const { checkPermission } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('applications')
    .setDescription('Manage staff applications')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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
        .setDescription('Check if applications are open or closed'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List applications by status')
        .addStringOption(option =>
          option
            .setName('status')
            .setDescription('The status of applications to list')
            .setRequired(true)
            .addChoices(
              { name: 'Pending', value: 'pending' },
              { name: 'Approved', value: 'approved' },
              { name: 'Denied', value: 'denied' },
              { name: 'All', value: 'all' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('clear')
        .setDescription('Clear approved or denied applications from the database')
        .addStringOption(option =>
          option
            .setName('status')
            .setDescription('The status of applications to clear')
            .setRequired(true)
            .addChoices(
              { name: 'Approved', value: 'approved' },
              { name: 'Denied', value: 'denied' },
              { name: 'All (Approved and Denied)', value: 'all' }
            )
        )
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('Clear application for a specific user (optional)')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a specific accepted/denied application by user ID')
        .addStringOption(option =>
          option
            .setName('user_id')
            .setDescription('The Discord ID of the user whose application to remove')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('applyrole')
        .setDescription('Assign staff role to accepted applications')
        .addStringOption(option =>
          option
            .setName('mode')
            .setDescription('Apply to all accepted applications or a specific one')
            .setRequired(true)
            .addChoices(
              { name: 'All Accepted Applications', value: 'all' },
              { name: 'Specific Application', value: 'specific' }
            )
        )
        .addUserOption(option =>
          option
            .setName('user')
            .setDescription('Specific user to assign the staff role to (only if mode is "specific")')
            .setRequired(false)
        )
    ),
  
  async execute(interaction, config) {
    const subcommand = interaction.options.getSubcommand();
    
    // Only check permissions for open/close, not for status
    if (subcommand !== 'status') {
      try {
        // Get role IDs from database
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
            content: '❌ You do not have permission to manage staff applications.',
            ephemeral: true 
          });
        }
      } catch (error) {
        console.error(error);
        return interaction.reply({ 
          content: '❌ Could not verify permissions. Please make sure the application system is set up.',
          ephemeral: true 
        });
      }
    }

    try {
      if (subcommand === 'open') {
        // Check if applications are already open
        const currentStatus = await getApplicationsStatus();
        if (currentStatus) {
          return interaction.reply({ 
            content: '⚠️ Staff applications are already open.',
            ephemeral: true 
          });
        }
        
        await setApplicationsStatus(true);
        
        // Update the application panel if it exists
        if (global.updateApplicationPanel) {
          await global.updateApplicationPanel(config.client);
        }
        
        await interaction.reply({ 
          content: '✅ Staff applications are now open! Users can apply using the `/apply` command.',
          ephemeral: true 
        });
      } 
      else if (subcommand === 'close') {
        // Check if applications are already closed
        const currentStatus = await getApplicationsStatus();
        if (!currentStatus) {
          return interaction.reply({ 
            content: '⚠️ Staff applications are already closed.',
            ephemeral: true 
          });
        }
        
        await setApplicationsStatus(false);
        
        // Update the application panel if it exists
        if (global.updateApplicationPanel) {
          await global.updateApplicationPanel(config.client);
        }
        
        await interaction.reply({ 
          content: '✅ Staff applications are now closed.',
          ephemeral: true 
        });
      } 
      else if (subcommand === 'status') {
        const isOpen = await getApplicationsStatus();
        const statusEmbed = new EmbedBuilder()
          .setTitle('Staff Applications Status')
          .setDescription(`Staff applications are currently **${isOpen ? 'OPEN' : 'CLOSED'}**.`)
          .setColor(isOpen ? 0x00FF00 : 0xFF0000)
          .setTimestamp();
        
        await interaction.reply({ embeds: [statusEmbed], ephemeral: true });
      }
      else if (subcommand === 'list') {
        const status = interaction.options.getString('status');
        
        // Defer reply since this might take a moment
        await interaction.deferReply({ ephemeral: true });
        
        try {
          // Get applications with the specified status
          const applications = await getApplicationsByStatus(status);
          
          if (applications.length === 0) {
            return interaction.followUp({
              content: `No ${status === 'all' ? '' : status + ' '}applications found.`,
              ephemeral: true
            });
          }
          
          // Create an embed to display the applications
          const embed = new EmbedBuilder()
            .setTitle(`${status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)} Applications`)
            .setColor(status === 'approved' ? 0x00FF00 : status === 'denied' ? 0xFF0000 : 0x3498DB)
            .setDescription(`Found ${applications.length} application(s)`)
            .setTimestamp();
          
          // Add each application to the embed (up to 25 max due to field limits)
          const maxToShow = Math.min(applications.length, 25);
          
          for (let i = 0; i < maxToShow; i++) {
            const app = applications[i];
            embed.addFields({
              name: app.username,
              value: `ID: ${app.id}\nName: ${app.name}\nAge: ${app.age}\nStatus: ${app.status}\nSubmitted: ${new Date(app.timestamp).toLocaleString()}`
            });
          }
          
          // If there are more than 25 applications, add a note
          if (applications.length > 25) {
            embed.setFooter({ text: `Showing 25/${applications.length} applications. Use more specific filters to see others.` });
          }
          
          await interaction.followUp({
            embeds: [embed],
            ephemeral: true
          });
        } catch (error) {
          console.error('Error listing applications:', error);
          await interaction.followUp({
            content: `❌ An error occurred: ${error.message}`,
            ephemeral: true
          });
        }
      }
      else if (subcommand === 'clear') {
        // Get options
        const status = interaction.options.getString('status');
        const user = interaction.options.getUser('user');
        
        let confirmationMessage = '';
        let confirmId = '';
        
        if (user) {
          // Check if user has an application
          const application = await getApplication(user.id);
          if (!application) {
            return interaction.reply({
              content: `❌ No application found for ${user.tag}`,
              ephemeral: true
            });
          }
          
          // Only clear if application is approved or denied
          if (application.status === 'pending') {
            return interaction.reply({
              content: `⚠️ Cannot clear ${user.tag}'s application as it is still pending.`,
              ephemeral: true
            });
          }
          
          confirmationMessage = `Are you sure you want to clear ${user.tag}'s application?`;
          confirmId = `confirm_clear_user_${user.id}`;
        } else {
          // Get count of applications with specified status
          const applications = await getApplicationsByStatus(status === 'all' ? 'all' : status);
          
          if (applications.length === 0) {
            return interaction.reply({
              content: `No ${status === 'all' ? 'approved or denied' : status} applications found to clear.`,
              ephemeral: true
            });
          }
          
          let statusDisplay = status;
          if (status === 'all') {
            statusDisplay = 'approved and denied';
          }
          
          confirmationMessage = `Are you sure you want to clear ${applications.length} ${statusDisplay} application(s)?`;
          confirmId = `confirm_clear_${status}`;
        }
        
        // Create confirmation buttons
        const confirmButton = new ButtonBuilder()
          .setCustomId(confirmId)
          .setLabel('Confirm')
          .setStyle(ButtonStyle.Danger);
        
        const cancelButton = new ButtonBuilder()
          .setCustomId('cancel_clear')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary);
        
        const row = new ActionRowBuilder()
          .addComponents(confirmButton, cancelButton);
        
        // Send confirmation message with buttons
        await interaction.reply({
          content: confirmationMessage,
          components: [row],
          ephemeral: true
        });
      }
      else if (subcommand === 'remove') {
        // Get the user ID from the options
        const userId = interaction.options.getString('user_id');
        
        // Try to get the application from the database
        const application = await getApplication(userId);
        if (!application) {
          return interaction.reply({
            content: `❌ No application found for user ID: ${userId}`,
            ephemeral: true
          });
        }
        
        // Only allow removing accepted or denied applications
        if (application.status === 'pending') {
          return interaction.reply({
            content: `⚠️ Cannot remove user's application as it is still pending. Use the approve/deny buttons first.`,
            ephemeral: true
          });
        }
        
        // Create confirmation buttons
        const confirmButton = new ButtonBuilder()
          .setCustomId(`confirm_remove_${userId}`)
          .setLabel('Confirm')
          .setStyle(ButtonStyle.Danger);
        
        const cancelButton = new ButtonBuilder()
          .setCustomId('cancel_remove')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary);
        
        const row = new ActionRowBuilder()
          .addComponents(confirmButton, cancelButton);
        
        // Send confirmation message with buttons
        await interaction.reply({
          content: `Are you sure you want to remove the ${application.status} application for ${application.username || userId}?`,
          components: [row],
          ephemeral: true
        });
      }
      else if (subcommand === 'applyrole') {
        // Defer reply since this might take a moment
        await interaction.deferReply({ ephemeral: true });
        
        const mode = interaction.options.getString('mode');
        const user = interaction.options.getUser('user');
        
        // Get the staff role ID
        const staffRoleId = await getStaffRole();
        if (!staffRoleId) {
          return interaction.followUp({
            content: '❌ No staff role has been configured. Please use `/setup permissions` to set up roles first.',
            ephemeral: true
          });
        }
        
        // Get the role object
        const staffRole = await interaction.guild.roles.fetch(staffRoleId).catch(err => {
          console.error('Error fetching staff role:', err);
          return null;
        });
        
        if (!staffRole) {
          return interaction.followUp({
            content: '❌ Could not find the staff role. It may have been deleted or is no longer accessible.',
            ephemeral: true
          });
        }
        
        // Check if the bot has permissions to assign roles
        if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return interaction.followUp({
            content: '❌ I don\'t have permission to manage roles. Please give me the "Manage Roles" permission.',
            ephemeral: true
          });
        }
        
        // Check if the staff role is higher than the bot's highest role
        if (staffRole.position >= interaction.guild.members.me.roles.highest.position) {
          return interaction.followUp({
            content: `❌ I cannot assign the staff role because it is positioned higher than or equal to my highest role.`,
            ephemeral: true
          });
        }
        
        if (mode === 'specific' && !user) {
          return interaction.followUp({
            content: '❌ You must specify a user when using the "specific" mode.',
            ephemeral: true
          });
        }
        
        if (mode === 'specific') {
          // Process a single specific user
          const application = await getApplication(user.id);
          
          if (!application) {
            return interaction.followUp({
              content: `❌ No application found for ${user.tag}.`,
              ephemeral: true
            });
          }
          
          if (application.status !== 'approved') {
            return interaction.followUp({
              content: `❌ Cannot assign staff role to ${user.tag} as their application is not approved (current status: ${application.status}).`,
              ephemeral: true
            });
          }
          
          // Try to assign the role
          try {
            const member = await interaction.guild.members.fetch(user.id);
            await member.roles.add(staffRole);
            
            return interaction.followUp({
              content: `✅ Successfully assigned the staff role to ${user.tag}.`,
              ephemeral: true
            });
          } catch (error) {
            console.error('Error assigning role to specific user:', error);
            return interaction.followUp({
              content: `❌ Error assigning staff role to ${user.tag}: ${error.message}`,
              ephemeral: true
            });
          }
        } else {
          // Process all approved applications
          const approvedApplications = await getApplicationsByStatus('approved');
          
          if (approvedApplications.length === 0) {
            return interaction.followUp({
              content: '❌ No approved applications found.',
              ephemeral: true
            });
          }
          
          // Keep track of successes and failures
          let successCount = 0;
          let failedUsers = [];
          
          // Process each application
          for (const application of approvedApplications) {
            try {
              // Try to fetch the member and assign the role
              const member = await interaction.guild.members.fetch(application.id).catch(err => null);
              
              if (!member) {
                failedUsers.push(`${application.username} (User not in server)`);
                continue;
              }
              
              await member.roles.add(staffRole);
              successCount++;
            } catch (error) {
              console.error(`Error assigning role to ${application.username}:`, error);
              failedUsers.push(`${application.username} (${error.message})`);
            }
          }
          
          // Generate the response message
          let responseContent = `✅ Role assignment complete.\n\n`;
          responseContent += `Successfully assigned staff role to ${successCount} of ${approvedApplications.length} approved applicants.`;
          
          if (failedUsers.length > 0) {
            responseContent += `\n\nFailed to assign roles to the following users:\n`;
            failedUsers.forEach(user => {
              responseContent += `- ${user}\n`;
            });
          }
          
          return interaction.followUp({
            content: responseContent,
            ephemeral: true
          });
        }
      }
    } catch (error) {
      console.error('Error executing applications command:', error);
      
      // If we've already replied, use followUp
      if (interaction.deferred) {
        await interaction.followUp({
          content: `❌ An error occurred: ${error.message}`,
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: `❌ An error occurred: ${error.message}`,
          ephemeral: true
        });
      }
    }
  },
  permissionLevel: require('../constants').PERMISSION_LEVELS.MODERATOR,
}; 