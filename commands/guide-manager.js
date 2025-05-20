const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getAllProducts, setGuideLink, getGuideLink, getProductsBySection, getModRole2, getSections } = require('../database');
const { checkPermission, getPermissionErrorMessage } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('guide')
    .setDescription('Manage and view product guides')
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('Set a guide link for a product')
        .addStringOption(option =>
          option.setName('section')
            .setDescription('The section containing the product')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('product')
            .setDescription('The product to set the guide for')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('url')
            .setDescription('The guide URL')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('setsection')
        .setDescription('Set guide link for all products in a section')
        .addStringOption(option =>
          option.setName('section')
            .setDescription('The section to set guide links for')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('url')
            .setDescription('The guide URL to set for all products in the section')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand => 
      subcommand
        .setName('view')
        .setDescription('View guide for a product')
        .addStringOption(option =>
          option.setName('section')
            .setDescription('The section containing the product')
            .setRequired(true)
            .setAutocomplete(true)
        )
        .addStringOption(option =>
          option.setName('product')
            .setDescription('The product to get the guide for')
            .setRequired(true)
            .setAutocomplete(true)
        )
    ),

  async execute(interaction, config) {
    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
      case 'set':
        return this.executeSetGuide(interaction, config);
      case 'setsection':
        return this.executeSetGuideSection(interaction, config);
      case 'view':
        return this.executeViewGuide(interaction, config);
    }
  },

  async executeSetGuide(interaction, config) {
    try {
      // Check if user has mod role using standardized function
      const hasPermission = await checkPermission(interaction, config, 'mod');
      if (!hasPermission) {
        return interaction.reply({ 
          content: getPermissionErrorMessage('mod'), 
          ephemeral: true 
        });
      }

      const section = interaction.options.getString('section');
      const product = interaction.options.getString('product');
      const url = interaction.options.getString('url');

      // Validate URL
      try {
        new URL(url);
      } catch (e) {
        return interaction.reply({
          content: '❌ Please provide a valid URL.',
          ephemeral: true
        });
      }

      // Set the guide link
      await setGuideLink(section, product, url);

      await interaction.reply({
        content: `✅ Successfully set guide link for **${product}** in **${section}**.`,
        ephemeral: true
      });

    } catch (error) {
      console.error('Error in guide set command:', error);
      await interaction.reply({
        content: '❌ An error occurred while setting the guide link.',
        ephemeral: true
      });
    }
  },

  async executeSetGuideSection(interaction, config) {
    try {
      // Check if user has mod role using standardized function
      const hasPermission = await checkPermission(interaction, config, 'mod');
      if (!hasPermission) {
        return interaction.reply({ 
          content: getPermissionErrorMessage('mod'), 
          ephemeral: true 
        });
      }

      const section = interaction.options.getString('section');
      const url = interaction.options.getString('url');

      // Validate URL format
      try {
        new URL(url);
      } catch (error) {
        return interaction.reply({
          content: '❌ Please provide a valid URL (e.g., https://example.com)',
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });

      // Get all products in the section
      const products = await getProductsBySection(section);
      
      if (!products || products.length === 0) {
        return interaction.editReply({
          content: `❌ No products found in the **${section}** section.`,
          ephemeral: true
        });
      }

      // Set guide link for each product
      const results = await Promise.all(
        products.map(product => setGuideLink(section, product, url))
      );

      const successCount = results.filter(r => r).length;
      
      await interaction.editReply({
        content: `✅ Successfully set guide link for ${successCount}/${products.length} products in the **${section}** section.\nGuide URL: ${url}`,
        ephemeral: true
      });
    } catch (error) {
      console.error('Error in guide setsection:', error);
      if (interaction.deferred) {
        await interaction.editReply({
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

  async executeViewGuide(interaction, config) {
    try {
      // View guides should be available to all staff members
      const hasPermission = await checkPermission(interaction, config, 'staff');
      if (!hasPermission) {
        return interaction.reply({ 
          content: getPermissionErrorMessage('staff'), 
          ephemeral: true 
        });
      }

      const section = interaction.options.getString('section');
      const product = interaction.options.getString('product');

      // Get the guide link for the product
      const guideUrl = await getGuideLink(section, product);

      if (!guideUrl) {
        return interaction.reply({
          content: `❌ No guide link found for **${product}** in **${section}**.`,
          ephemeral: true
        });
      }

      // Create and send the embed
      const embed = new EmbedBuilder()
        .setTitle(`📚 Guide for ${product}`)
        .setDescription(`Here's the guide for **${product}** in **${section}**:\n${guideUrl}`)
        .setColor(0x3498db)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Error in guide view command:', error);
      await interaction.reply({
        content: '❌ An error occurred while fetching the guide.',
        ephemeral: true
      });
    }
  },

  async autocomplete(interaction) {
    try {
      const focused = interaction.options.getFocused(true);
      
      if (focused.name === 'section') {
        // Use getSections for the setsection subcommand
        if (interaction.options.getSubcommand() === 'setsection') {
          const sections = await getSections();
          return interaction.respond(
            sections
              .filter(s => s.toLowerCase().includes(focused.value.toLowerCase()))
              .slice(0, 25)
              .map(s => ({ name: s, value: s }))
          );
        } else {
          // For other subcommands, get unique sections from all products
          const products = await getAllProducts();
          const sections = [...new Set(products.map(p => p.section))];
          return interaction.respond(
            sections
              .filter(s => s.toLowerCase().includes(focused.value.toLowerCase()))
              .slice(0, 25)
              .map(s => ({ name: s, value: s }))
          );
        }
      }

      if (focused.name === 'product') {
        const section = interaction.options.getString('section');
        if (!section) return interaction.respond([]);

        // Filter products by section
        const products = await getAllProducts();
        const sectionProducts = products
          .filter(p => p.section === section)
          .map(p => p.product);

        return interaction.respond(
          sectionProducts
            .filter(p => p.toLowerCase().includes(focused.value.toLowerCase()))
            .slice(0, 25)
            .map(p => ({ name: p, value: p }))
        );
      }
    } catch (error) {
      console.error('Error in guide autocomplete:', error);
      return interaction.respond([]);
    }
  },

  permissionLevel: require('../constants').PERMISSION_LEVELS.MODERATOR
}; 