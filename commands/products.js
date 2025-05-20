const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { addProduct, removeProduct, getSections, getProductsBySection } = require('../database');
const { buildEmbeds, updateEmbed, updateUpdateInfo, checkPermission, getPermissionErrorMessage } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('products')
    .setDescription('Manage products on the status board')
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a product to a section')
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
            .setRequired(false)
            .addChoices(
              { name: 'Up', value: 'up' },
              { name: 'Updating', value: 'updating' },
              { name: 'Down', value: 'down' }
            )
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a product from a section')
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
    ),

  async execute(interaction, config) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'add':
        return this.executeAddProduct(interaction, config);
      case 'remove':
        return this.executeRemoveProduct(interaction, config);
    }
  },

  async executeAddProduct(interaction, config) {
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
      const product = interaction.options.getString('product');
      const status = interaction.options.getString('status') || 'up';

      await addProduct(section, product, status);
      let feedback = `✅ Successfully added **${product}** to **${section}** with status: **${status}**.`;

      try {
        // Build all embeds but find which one contains our section
        const embeds = await buildEmbeds();
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
        feedback += "\n🛠️ Server information updated.";
      } catch (updateError) {
        feedback += "\n⚠️ Warning: Product added, but I couldn't update the server display.";
      }

      await interaction.reply({ content: feedback, ephemeral: true });
    } catch (error) {
      console.error(`Error executing /addproduct: ${error.message}`);
      await interaction.reply({ content: '❌ An error occurred while adding the product.', ephemeral: true });
    }
  },

  async executeRemoveProduct(interaction, config) {
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
      const product = interaction.options.getString('product');

      await removeProduct(section, product);
      let feedback = `✅ Successfully removed **${product}** from **${section}**.`;

      try {
        // Build all embeds but find which one contains our section
        const embeds = await buildEmbeds();
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
        feedback += "\n🛠️ Server information updated.";
      } catch (updateError) {
        feedback += "\n⚠️ Warning: Product removed, but I couldn't update the server display.";
      }

      await interaction.reply({ content: feedback, ephemeral: true });
    } catch (error) {
      console.error('Error in removeproduct command:', error);
      await interaction.reply({ 
        content: `❌ An error occurred: ${error.message}`, 
        ephemeral: true 
      });
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
      if (focused.name === 'product') {
        const section = interaction.options.getString('section');
        if (!section) return interaction.respond([]);
        const products = await getProductsBySection(section);
        return interaction.respond(
          products
            .filter(p => p.toLowerCase().includes(focused.value.toLowerCase()))
            .slice(0, 25)
            .map(p => ({ name: p, value: p }))
        );
      }
    } catch {
      return interaction.respond([]);
    }
  },

  permissionLevel: require('../constants').PERMISSION_LEVELS.MODERATOR,
}; 