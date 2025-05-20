const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { updateStatus, getSections, getProductsBySection, getUsersToNotify } = require('../database');
const { buildEmbeds, updateEmbed, updateUpdateInfo, checkPermission, getPermissionErrorMessage, handleCommandError, getStatusEmoji, getStatusColor, getStatusText } = require('../utils');
const { getModRole2 } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('updatestatus')
    .setDescription('Update the status of a product')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o =>
      o.setName('section')
        .setDescription('Section name')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(o =>
      o.setName('product')
        .setDescription('Product name')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(o =>
      o.setName('status')
        .setDescription('Status')
        .setRequired(true)
        .addChoices(
          { name: 'Up', value: 'up' },
          { name: 'Updating', value: 'updating' },
          { name: 'Down', value: 'down' }
        )
    ),
  async execute(interaction, config) {
    try {
      const hasPermission = await checkPermission(interaction, config, 'mod');
      if (!hasPermission) {
        return interaction.reply({ 
          content: getPermissionErrorMessage('mod'), 
          ephemeral: true 
        });
      }

      const section = interaction.options.getString('section');
      const product = interaction.options.getString('product');
      const status = interaction.options.getString('status');
      const userId = interaction.user.id;

      const changes = await updateStatus(section, product, status, userId);
      
      if (changes === 0) {
        return interaction.reply({ 
          content: `❌ I couldn't find **${product}** in the **${section}** section.`, 
          ephemeral: true 
        });
      }
      await interaction.deferReply({ ephemeral: true });

      let feedback = `✅ Successfully updated **${product}** in **${section}** to status **${status}**.`;
      console.log('\x1b[36m%s\x1b[0m', `Status update request: ${section} -> ${product} -> ${status}`);

      try {
        const embeds = await buildEmbeds();
        console.log('\x1b[36m%s\x1b[0m', `Built ${embeds.length} embeds, looking for relevant embeds to update`);
        
        const embedsToUpdate = [];
        let productFound = false;
        
        for (let i = 0; i < embeds.length; i++) {
          const embedContent = embeds[i].data.description || '';
          
          // The first embed is the status guide - always keep this as is
          if (i === 0 && embedContent.includes('Status Guide')) {
            console.log('\x1b[36m%s\x1b[0m', 'First embed is the status guide, skipping update');
            continue;
          }
          
          // Check if this embed contains the product we're updating
          if (embedContent.includes(section)) {
            console.log('\x1b[36m%s\x1b[0m', `Embed ${i+1} contains section "${section}"`);
            
            if (embedContent.includes(product)) {
              console.log('\x1b[32m%s\x1b[0m', `Found product "${product}" in embed ${i+1}, marking for update`);
              embedsToUpdate.push(embeds[i]);
              productFound = true;
              
              // Check the status indicator
              const statusIndicator = getStatusEmoji(status);
              console.log('\x1b[36m%s\x1b[0m', `Status indicator should be: ${statusIndicator} 🔸 ${product}`);
            }
          }
        }
        
        // Make sure config has client for embed updates
        const configWithClient = { 
          ...config, 
          client: interaction.client,
          // Add status system data if not present in config
          statusSystem: {
            ...(config?.statusSystem || {}),
            // Use channel where the command was executed if not specified in config
            statusChannelId: (config?.statusSystem?.statusChannelId || interaction.channelId)
          }
        };
        
        if (!productFound) {
          console.log('\x1b[33m%s\x1b[0m', `Warning: Product "${product}" not found in any embed`);
          // If product not found, update all embeds as a fallback
          console.log('\x1b[33m%s\x1b[0m', 'Falling back to updating all embeds');
          await updateEmbed(configWithClient, embeds);
        } else {
          // Only update embeds that contain our product
          console.log('\x1b[36m%s\x1b[0m', `Updating ${embedsToUpdate.length} embeds containing product "${product}"`);
          await updateEmbed(configWithClient, embedsToUpdate);
        }
        
        // Update the update info message
        const updateEmbedMsg = new EmbedBuilder()
          .setTitle("Server Status Updated")
          .setDescription(`Last updated by **${interaction.user.tag}** (<@${interaction.user.id}>) on ${new Date().toLocaleDateString()}.`)
          .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
          .setColor(15644944);
        await updateUpdateInfo(configWithClient, updateEmbedMsg);
        feedback += "\n🛠️ Server information updated.";
        
        // Send notifications to subscribed users
        try {
          await sendStatusNotifications(interaction.client, section, product, status, interaction.user);
          feedback += "\n🔔 Notifications sent to subscribed users.";
        } catch (notifyError) {
          console.error('Error sending notifications:', notifyError);
        }
      } catch (updateError) {
        console.error('\x1b[31m%s\x1b[0m', `Error updating embed: ${updateError.message}`, updateError);
        feedback += "\n⚠️ Warning: Status updated, but I couldn't update the server display.";
      }

      await interaction.editReply({ content: feedback, ephemeral: true });
    } catch (error) {
      return handleCommandError(interaction, error, "❌ Oops, I couldn't update the status. Please try again later.");
    }
  },
  async autocomplete(interaction) {
    try {
      const focused = interaction.options.getFocused(true);
      
      console.log(`[Autocomplete] Processing ${focused.name} with value "${focused.value}"`);
      
      if (focused.name === 'section') {
        try {
          // Get all sections from the database
          const sections = await getSections();
          console.log(`[Autocomplete] Found ${sections.length} sections`);
          
          // Filter sections based on user input and respond with matches
          const filtered = sections
            .filter(section => section.toLowerCase().includes(focused.value.toLowerCase()))
            .slice(0, 25) // Discord has a limit of 25 choices
            .map(section => ({ name: section, value: section }));
          
          console.log(`[Autocomplete] Returning ${filtered.length} section matches`);
          return interaction.respond(filtered);
        } catch (error) {
          console.error('[Autocomplete] Error fetching sections:', error);
          return interaction.respond([{ name: 'Error fetching sections', value: 'error' }]);
        }
      }
      
      if (focused.name === 'product') {
        // Get the selected section from the previous option
        const section = interaction.options.getString('section');
        
        if (!section) {
          console.log('[Autocomplete] No section selected yet');
          return interaction.respond([{ name: 'Please select a section first', value: 'select_section' }]);
        }
        
        try {
          // Get products for the selected section
          const products = await getProductsBySection(section);
          console.log(`[Autocomplete] Found ${products.length} products for section "${section}"`);
          
          // Filter products based on user input and respond with matches
          const filtered = products
            .filter(product => product.toLowerCase().includes(focused.value.toLowerCase()))
            .slice(0, 25) // Discord has a limit of 25 choices
            .map(product => ({ name: product, value: product }));
          
          console.log(`[Autocomplete] Returning ${filtered.length} product matches`);
          return interaction.respond(filtered);
        } catch (error) {
          console.error(`[Autocomplete] Error fetching products for section "${section}":`, error);
          return interaction.respond([{ name: 'Error fetching products', value: 'error' }]);
        }
      }
      
      // If we get here, it's not a recognized option
      console.log(`[Autocomplete] Unrecognized option: ${focused.name}`);
      return interaction.respond([]);
    } catch (error) {
      console.error('[Autocomplete] Unhandled error in autocomplete:', error);
      return interaction.respond([{ name: 'Error processing autocomplete', value: 'error' }]);
    }
  },
  permissionLevel: require('../constants').PERMISSION_LEVELS.MODERATOR,
};


async function sendStatusNotifications(client, section, product, status, updatedBy) {
  try {
    // Check if client is defined
    if (!client) {
      console.warn('Cannot send notifications: Discord client is not available');
      return;
    }

    // Get users to notify
    const userIds = await getUsersToNotify(section, product);
    
    if (!userIds || userIds.length === 0) {
      return; // No users to notify
    }
    
    // Create notification embed
    const statusEmoji = getStatusEmoji(status);
    const statusText = getStatusText(status);
    
    const embed = new EmbedBuilder()
      .setTitle('Status Update Notification')
      .setDescription(`A product you're subscribed to has been updated.`)
      .addFields(
        { name: 'Product', value: product, inline: true },
        { name: 'Section', value: section, inline: true },
        { name: 'Status', value: `${statusEmoji} ${statusText}`, inline: true },
        { name: 'Updated By', value: updatedBy.tag, inline: true },
        { name: 'Time', value: new Date().toLocaleString(), inline: true }
      )
      .setColor(getStatusColor(status))
      .setFooter({ text: 'You received this message because you subscribed to notifications. Use /notify unsubscribe to stop receiving them.' })
      .setTimestamp();
    
    // Send DM to each user
    let sentCount = 0;
    for (const userId of userIds) {
      try {
        const user = await client.users.fetch(userId);
        if (user) {
          await user.send({ embeds: [embed] });
          sentCount++;
        }
      } catch (error) {
        console.error(`Error sending notification to user ${userId}:`, error.message);
        // Continue with other users if one fails
      }
    }
    
    console.log(`[Notifications] Sent status change notifications to ${sentCount}/${userIds.length} users`);
  } catch (error) {
    console.error('Error sending status notifications:', error);
    // Don't throw error, just log it
    return;
  }
}
