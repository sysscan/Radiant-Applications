const { SlashCommandBuilder, WebhookClient, EmbedBuilder, PermissionsBitField, PermissionFlagsBits, ChannelType } = require('discord.js');
const { buildEmbeds, prebuiltEmbedMessage, updateEmbed, updateUpdateInfo, updateConfigFile, checkPermission, getPermissionErrorMessage, checkBotPermissions } = require('../utils');
const { getModRole2 } = require('../database');
const webhookCreationRateLimit = new Map();
const { COMMAND_PERMISSIONS } = require('../constants');

// Discord interaction timeout is 3 seconds
const INTERACTION_TIMEOUT = 3000;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('postembed')
    .setDescription('Post or update the status embed')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addChannelOption(o =>
      o.setName('channel')
        .setDescription('Channel to post the embed in')
        .setRequired(true)
    ),
  async execute(interaction, config) {
    // Store channel reference outside try block for error handling
    let channel;
    
    try {
      // Before doing anything, get the channel for later use
      channel = interaction.options.getChannel('channel');
      if (!channel) {
        return await interaction.reply({ 
          content: '❌ Please specify a valid channel.', 
          ephemeral: true 
        });
      }
      
      // Check if user has permission to use this command - but don't await the reply yet
      const hasPermission = await checkPermission(interaction, config, 'postembed');
      if (!hasPermission) {
        // We need to check if the interaction has been replied to already
        if (interaction.replied || interaction.deferred) {
          console.log('Interaction already replied to or deferred when checking permissions');
          return;
        }
        return await interaction.reply({
          content: '❌ This command can only be used by administrators or users with the designated moderator role.',
          ephemeral: true
        });
      }
      
      // Check bot permissions in the channel
      const requiredPermissions = [
        PermissionFlagsBits.SendMessages, 
        PermissionFlagsBits.EmbedLinks, 
        PermissionFlagsBits.ManageWebhooks
      ];
      
      const permissionsCheck = checkBotPermissions(channel, requiredPermissions);
      if (!permissionsCheck.hasAll) {
        const missingPerms = permissionsCheck.missing.map(p => `\`${p}\``).join(', ');
        // Check if interaction is still valid
        if (interaction.replied || interaction.deferred) {
          console.log('Interaction already replied to or deferred when checking permissions');
          return;
        }
        return await interaction.reply({ 
          content: `❌ I'm missing required permissions in ${channel}: ${missingPerms}`,
          ephemeral: true 
        });
      }
      
      // Check if interaction is still valid before deferring
      if (interaction.replied || interaction.deferred) {
        console.log('Interaction already replied to or deferred before deferring reply');
        return;
      }
      
      // Now defer the reply
      await interaction.deferReply({ ephemeral: true });

      // Create a webhook for the channel
      console.log('\x1b[36m%s\x1b[0m', `Creating webhook for channel ${channel.id}...`);
      
      let embeds, firstMessage, updateInfoMessage;
      
      try {
        // Delete any existing webhooks created by the bot
        const existingWebhooks = await channel.fetchWebhooks();
        for (const [id, webhook] of existingWebhooks) {
          if (webhook.owner.id === interaction.client.user.id) {
            await webhook.delete();
            console.log('\x1b[36m%s\x1b[0m', `Deleted existing webhook: ${webhook.name}`);
          }
        }

        // Create a new webhook
        const webhook = await channel.createWebhook({
          name: 'Status Bot Webhook',
          avatar: interaction.client.user.displayAvatarURL(),
          reason: 'Created for status updates'
        });
        console.log('\x1b[32m%s\x1b[0m', `Webhook created successfully: ${webhook.url}`);
        
        // Build embeds
        embeds = await buildEmbeds();
        
        // Send the first embed using the webhook
        firstMessage = await webhook.send({
          embeds: [embeds[0]],
          allowedMentions: { parse: [] }
        });
        
        // Send additional embeds if any
        if (embeds.length > 1) {
          for (let i = 1; i < embeds.length; i++) {
            await webhook.send({
              embeds: [embeds[i]],
              allowedMentions: { parse: [] }
            });
          }
        }

        // Create and send the update info embed last
        const updateInfoEmbed = new EmbedBuilder()
          .setTitle("Server Status Updated")
          .setDescription(`Last updated by **${interaction.user.tag}** (<@${interaction.user.id}>) on ${new Date().toLocaleDateString()}.`)
          .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
          .setColor(15644944);
        updateInfoMessage = await webhook.send({
          embeds: [updateInfoEmbed],
          allowedMentions: { parse: [] }
        });
        
        // Initialize statusSystem if it doesn't exist
        if (!config) {
          config = {};
        }
        
        if (!config.statusSystem) {
          config.statusSystem = {};
        }
        
        // Update config with new channel, webhook, and message IDs
        const updates = {
          statusChannelId: channel.id,
          webhookUrl: webhook.url,
          embedMessageId: firstMessage.id,
          updateMessageId: updateInfoMessage.id
        };
        
        // Update config file
        if (updateConfigFile(updates)) {
          // Update the config object with new values
          config.statusSystem.statusChannelId = channel.id;
          config.statusSystem.webhookUrl = webhook.url;
          config.statusSystem.embedMessageId = firstMessage.id;
          config.statusSystem.updateMessageId = updateInfoMessage.id;
          
          console.log('\x1b[32m%s\x1b[0m', 'Config updated with webhook URL and message IDs');
        }

        if (interaction.replied) {
          console.log('Interaction already replied to when trying to edit webhook success');
          return;
        }

        return await interaction.editReply({ content: `✅ Status embed posted in ${channel} with a new webhook!` });
      } catch (webhookError) {
        console.error('\x1b[31m%s\x1b[0m', `Error creating webhook: ${webhookError.message}`);
        
        // Fallback to sending messages directly
        console.log('\x1b[33m%s\x1b[0m', 'Falling back to direct message method...');
        
        // Build embeds
        embeds = await buildEmbeds();
        
        // Send the first embed
        firstMessage = await channel.send({ embeds: [embeds[0]] });
        
        // Send additional embeds if any
        if (embeds.length > 1) {
          for (let i = 1; i < embeds.length; i++) {
            await channel.send({ embeds: [embeds[i]] });
          }
        }

        // Create and send the update info embed last
        const updateInfoEmbed = new EmbedBuilder()
          .setTitle("Server Status Updated")
          .setDescription(`Last updated by **${interaction.user.tag}** (<@${interaction.user.id}>) on ${new Date().toLocaleDateString()}.`)
          .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
          .setColor(15644944);
        updateInfoMessage = await channel.send({ embeds: [updateInfoEmbed] });
        
        // Update config with new channel and message IDs (without webhook)
        const updates = {
          statusChannelId: channel.id,
          embedMessageId: firstMessage.id,
          updateMessageId: updateInfoMessage.id
        };
        
        // Update config file
        if (updateConfigFile(updates)) {
          // Update the config object with new values
          if (!config) {
            config = {};
          }
          
          if (!config.statusSystem) {
            config.statusSystem = {};
          }
          
          config.statusSystem.statusChannelId = channel.id;
          config.statusSystem.embedMessageId = firstMessage.id;
          config.statusSystem.updateMessageId = updateInfoMessage.id;
        }

        if (interaction.replied) {
          console.log('Interaction already replied to when trying to edit direct message success');
          return;
        }

        return await interaction.editReply({ content: `✅ Status embed posted in ${channel}! (Webhook creation failed, using direct message method)` });
      }
    } catch (error) {
      console.error('Error in postembed command:', error);
      
      try {
        // Check if we can respond to the interaction
        if (!interaction.replied && !interaction.deferred) {
          // Haven't responded yet, try to reply
          await interaction.reply({ content: '❌ An error occurred while processing the command.', ephemeral: true })
            .catch(e => console.error('Failed to reply with error:', e));
        } else if (interaction.deferred && !interaction.replied) {
          // We've deferred but not replied, so edit the reply
          await interaction.editReply({ content: '❌ An error occurred while processing the command.' })
            .catch(e => console.error('Failed to edit reply with error:', e));
        }
      } catch (interactionError) {
        console.error('Error handling interaction error:', interactionError);
      }
      
      // If we have a channel reference, try to send a message to the channel as a fallback
      if (channel) {
        try {
          await channel.send('⚠️ An error occurred while processing the command. Please try again.')
            .catch(e => console.error('Failed to send error message to channel:', e));
        } catch (channelError) {
          console.error('Failed to send message to channel:', channelError);
        }
      }
    }
  },
  permissionLevel: require('../constants').PERMISSION_LEVELS.ADMIN,
};
