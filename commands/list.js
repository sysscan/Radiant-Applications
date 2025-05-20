const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getAllSections, getAllProducts } = require('../database');
const { checkPermission, getPermissionErrorMessage } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('list')
    .setDescription('List sections or products')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('What to list')
        .setRequired(true)
        .addChoices(
          { name: 'Sections', value: 'sections' },
          { name: 'Products', value: 'products' }
        )),
  
  async execute(interaction, config) {
    try {
      // Check user permissions (staff level or higher)
      const hasPermission = await checkPermission(interaction, config, 'staff');
      if (!hasPermission) {
        return interaction.reply({ content: getPermissionErrorMessage('staff'), ephemeral: true });
      }
      
      const type = interaction.options.getString('type');
      
      if (type === 'sections') {
        const sections = await getAllSections();
        if (!sections || sections.length === 0) {
          return interaction.reply({ content: 'No sections found.', ephemeral: true });
        }
        
        // Create pages for pagination (10 sections per page)
        const itemsPerPage = 10;
        const pages = [];
        
        for (let i = 0; i < sections.length; i += itemsPerPage) {
          const currentSections = sections.slice(i, i + itemsPerPage);
          const embed = new EmbedBuilder()
            .setTitle('📊 Status Sections')
            .setDescription(currentSections.map(s => `• **${s.name}**`).join('\n'))
            .setColor(0x3498db)
            .setFooter({ text: `Page ${pages.length + 1}/${Math.ceil(sections.length / itemsPerPage)}` });
          pages.push(embed);
        }
        
        // Send the first page
        await sendPaginatedEmbed(interaction, pages);
        
      } else if (type === 'products') {
        const products = await getAllProducts();
        if (!products || products.length === 0) {
          return interaction.reply({ content: 'No products found.', ephemeral: true });
        }
        
        // Group products by section
        const grouped = {};
        for (const product of products) {
          if (!grouped[product.section]) {
            grouped[product.section] = [];
          }
          grouped[product.section].push(product);
        }
        
        // Create pages for pagination
        const pages = [];
        const sections = Object.keys(grouped);
        const sectionsPerPage = 3; // Show 3 sections per page for readability
        
        for (let i = 0; i < sections.length; i += sectionsPerPage) {
          const currentSections = sections.slice(i, i + sectionsPerPage);
          const embed = new EmbedBuilder()
            .setTitle('🧩 Product List')
            .setColor(0x3498db)
            .setFooter({ text: `Page ${pages.length + 1}/${Math.ceil(sections.length / sectionsPerPage)}` });
            
          for (const section of currentSections) {
            const sectionProducts = grouped[section];
            const productList = sectionProducts.map(p => `• **${p.name}** - ${getStatusEmoji(p.status)} ${p.status}`).join('\n');
            embed.addFields({ name: `📁 ${section}`, value: productList || 'No products' });
          }
          
          pages.push(embed);
        }
        
        // Send the first page
        await sendPaginatedEmbed(interaction, pages);
      }
    } catch (error) {
      console.error(`Error executing /list: ${error.message}`);
      await interaction.reply({ content: '❌ An error occurred while retrieving the list.', ephemeral: true });
    }
  },
  permissionLevel: require('../constants').PERMISSION_LEVELS.STAFF,
};

// Function to send paginated embeds with navigation buttons
async function sendPaginatedEmbed(interaction, pages) {
  if (pages.length === 0) {
    return interaction.reply({ content: 'No data found.', ephemeral: true });
  }
  
  if (pages.length === 1) {
    // If only one page, just send it without buttons
    return interaction.reply({ embeds: [pages[0]], ephemeral: true });
  }
  
  let currentPage = 0;
  
  // Create navigation buttons
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('prev_page')
        .setLabel('◀️ Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0),
      new ButtonBuilder()
        .setCustomId('next_page')
        .setLabel('Next ▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === pages.length - 1)
    );
  
  // Send initial message with first page
  const message = await interaction.reply({ 
    embeds: [pages[currentPage]], 
    components: [row],
    ephemeral: true,
    fetchReply: true
  });
  
  // Create collector for button interactions
  const collector = message.createMessageComponentCollector({ 
    filter: i => i.user.id === interaction.user.id,
    time: 60000 // 1 minute timeout
  });
  
  collector.on('collect', async i => {
    // Update page based on button press
    if (i.customId === 'prev_page') {
      if (currentPage > 0) currentPage--;
    } else if (i.customId === 'next_page') {
      if (currentPage < pages.length - 1) currentPage++;
    }
    
    // Update buttons state
    row.components[0].setDisabled(currentPage === 0);
    row.components[1].setDisabled(currentPage === pages.length - 1);
    
    // Update the message
    await i.update({ 
      embeds: [pages[currentPage]], 
      components: [row]
    });
  });
  
  collector.on('end', async () => {
    // Disable all buttons when collector ends
    row.components.forEach(button => button.setDisabled(true));
    await message.edit({ components: [row] }).catch(() => {});
  });
}

// Helper function to get emoji for status
function getStatusEmoji(status) {
  status = status.toLowerCase();
  if (status.includes('operational') || status.includes('online')) return '🟢';
  if (status.includes('issue') || status.includes('degraded')) return '🟡';
  if (status.includes('outage') || status.includes('offline')) return '🔴';
  if (status.includes('maintenance')) return '🟠';
  return '⚪';
}
