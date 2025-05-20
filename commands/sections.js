const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { addSection, removeSection, updateSectionStatus, getSections, getModRole2 } = require('../database');
const { buildEmbeds, updateEmbed, updateUpdateInfo, checkPermission, getPermissionErrorMessage } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sections')
    .setDescription('Manage sections on the status board')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a new section to the status board')
        .addStringOption(option => 
          option.setName('section')
            .setDescription('Section name')
            .setRequired(true)
        )
        .addBooleanOption(option =>
          option.setName('showifempty')
            .setDescription('Whether to show the section even if it has no products')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a section from the status board')
        .addStringOption(option =>
          option.setName('section')
            .setDescription('Section name')
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('update')
        .setDescription('Update the status of all products in a section')
        .addStringOption(option =>
          option.setName('section')
            .setDescription('The section to update')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('status')
            .setDescription('Status to set for all products in the section')
            .setRequired(true)
            .addChoices(
              { name: 'Up', value: 'up' },
              { name: 'Updating', value: 'updating' },
              { name: 'Down', value: 'down' }
            )
        )
    ),

  async execute(interaction, config) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'add':
        return this.executeAddSection(interaction, config);
      case 'remove':
        return this.executeRemoveSection(interaction, config);
      case 'update':
        return this.executeUpdateSection(interaction, config);
    }
  },

  async executeAddSection(interaction, config) {
    // Check permission using standardized function
    const hasPermission = await checkPermission(interaction, config, 'mod');
    if (!hasPermission) {
      return interaction.reply({ 
        content: getPermissionErrorMessage('mod'), 
        ephemeral: true 
      });
    }
    
    const section = interaction.options.getString('section');
    const showIfEmpty = interaction.options.getBoolean('showifempty') || false;
    
    try {
      await addSection(section, showIfEmpty);
      let feedback = `✅ Section **${section}** added successfully. ${showIfEmpty ? '(Will be shown even when empty)' : ''}`;

      try {
        // When adding a section, rebuild all embeds to include the new section
        const embeds = await buildEmbeds();
        await updateEmbed(config, embeds);
        
        const updateEmbedMsg = new EmbedBuilder()
          .setTitle("Server Status Updated")
          .setDescription(`Last updated by **${interaction.user.tag}** (<@${interaction.user.id}>) on ${new Date().toLocaleDateString()}.`)
          .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
          .setColor(15644944);
        await updateUpdateInfo(config, updateEmbedMsg);
        feedback += "\n🛠️ Server information updated.";
      } catch (updateError) {
        console.error('Error updating embeds:', updateError);
        feedback += "\n⚠️ Warning: Section added, but I couldn't update the server display.";
      }
      
      await interaction.reply({ content: feedback, ephemeral: true });
    } catch (error) {
      let errorMessage = "❌ Failed to add section.";
      if (error.message && error.message.toLowerCase().includes('already exists'))
        errorMessage += ` Section **${section}** already exists.`;
      else
        errorMessage += " Please try again later.";
      
      return interaction.reply({ content: errorMessage, ephemeral: true });
    }
  },

  async executeRemoveSection(interaction, config) {
    try {
      // Check permission using standardized function
      const hasPermission = await checkPermission(interaction, config, 'mod');
      if (!hasPermission) {
        return interaction.reply({ 
          content: getPermissionErrorMessage('mod'), 
          ephemeral: true 
        });
      }

      const section = interaction.options.getString('section');

      await removeSection(section);
      let feedback = `✅ Successfully removed the **${section}** section.`;

      try {
        // When removing a section, we need to update all embeds
        const embeds = await buildEmbeds();
        await updateEmbed(config, embeds);
        
        const updateEmbedMsg = new EmbedBuilder()
          .setTitle("Server Status Updated")
          .setDescription(`Last updated by **${interaction.user.tag}** (<@${interaction.user.id}>) on ${new Date().toLocaleDateString()}.`)
          .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
          .setColor(15644944);
        await updateUpdateInfo(config, updateEmbedMsg);
        feedback += "\n🛠️ Server information updated.";
      } catch (updateError) {
        feedback += "\n⚠️ Warning: Section removed, but I couldn't update the server display.";
      }

      await interaction.reply({ content: feedback, ephemeral: true });
    } catch (error) {
      console.error('Error in removesection command:', error);
      await interaction.reply({ 
        content: `❌ An error occurred: ${error.message}`, 
        ephemeral: true 
      });
    }
  },

  async executeUpdateSection(interaction, config) {
    try {
      // Check permission using standardized function
      const hasPermission = await checkPermission(interaction, config, 'mod');
      if (!hasPermission) {
        return interaction.reply({ 
          content: getPermissionErrorMessage('mod'), 
          ephemeral: true 
        });
      }

      const section = interaction.options.getString('section');
      const status = interaction.options.getString('status');

      await interaction.deferReply({ ephemeral: true });

      try {
        const changes = await updateSectionStatus(section, status);
        if (changes === 0) {
          return interaction.editReply({
            content: `❌ I couldn't find any products in the **${section}** section.`,
            ephemeral: true
          });
        }

        try {
          const embeds = await buildEmbeds();
          
          // Find which embeds contain our section
          const embedsToUpdate = [];
          let sectionFound = false;
          
          for (let i = 0; i < embeds.length; i++) {
            const embedContent = embeds[i].data.description || '';
            
            // Skip the status guide (first embed)
            if (i === 0 && embedContent.includes('Status Guide')) {
              continue;
            }
            
            // Check if this embed contains the section we're updating
            if (embedContent.includes(`## ${section}`)) {
              embedsToUpdate.push(embeds[i]);
              sectionFound = true;
            }
          }
          
          if (!sectionFound) {
            await updateEmbed(config, embeds);
          } else {
            await updateEmbed(config, embedsToUpdate);
          }
          
          const updateEmbedMsg = new EmbedBuilder()
            .setTitle("Server Status Updated")
            .setDescription(`Last updated by **${interaction.user.tag}** (<@${interaction.user.id}>) on ${new Date().toLocaleDateString()}.`)
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .setColor(15644944);
          await updateUpdateInfo(config, updateEmbedMsg);
          await interaction.editReply({
            content: `✅ Successfully updated all products in the **${section}** section to status **${status}**.`,
            ephemeral: true
          });
        } catch (updateError) {
          await interaction.editReply({
            content: `✅ Successfully updated all products in the **${section}** section to status **${status}**.
⚠️ Warning: Status updated, but I couldn't update the server display.`,
            ephemeral: true
          });
        }
      } catch (error) {
        console.error("Error in updatesection:", error);
        await interaction.editReply({
          content: `❌ An error occurred: ${error.message}`,
          ephemeral: true
        });
      }
    } catch (error) {
      console.error("Error in updatesection:", error);
      if (!interaction.deferred && !interaction.replied) {
        await interaction.reply({ content: `❌ An error occurred. Please try again later.`, ephemeral: true });
      } else {
        await interaction.editReply({ content: `❌ An error occurred. Please try again later.`, ephemeral: true });
      }
    }
  },

  async autocomplete(interaction) {
    try {
      const focused = interaction.options.getFocused(true);
      if (focused.name === 'section') {
        const sections = await getSections();
        return interaction.respond(
          sections
            .filter(s => s.toLowerCase().includes(focused.value.toLowerCase()))
            .slice(0, 25)
            .map(s => ({ name: s, value: s }))
        );
      }
    } catch {
      return interaction.respond([]);
    }
  },

  permissionLevel: require('../constants').PERMISSION_LEVELS.MODERATOR,
}; 