const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getStatusStatistics, getSystemUptimeStats, getStatusHistory } = require('../database');
const { checkPermission, getPermissionErrorMessage } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('View system status statistics')
    .addStringOption(option => 
      option.setName('period')
        .setDescription('Time period for statistics')
        .setRequired(false)
        .addChoices(
          { name: '7 days', value: '7' },
          { name: '30 days', value: '30' },
          { name: '90 days', value: '90' }
        ))
    .addStringOption(option =>
      option.setName('view')
        .setDescription('What statistics to view')
        .setRequired(false)
        .addChoices(
          { name: 'Summary', value: 'summary' },
          { name: 'Change History', value: 'history' },
          { name: 'Uptime Analysis', value: 'uptime' }
        )),
  permissionLevel: require('../constants').PERMISSION_LEVELS.STAFF,

  async execute(interaction, config) {
    try {
      // Check user permissions (staff level or higher)
      const hasPermission = await checkPermission(interaction, config, 'staff');
      if (!hasPermission) {
        return interaction.reply({ content: getPermissionErrorMessage('staff'), ephemeral: true });
      }
      
      await interaction.deferReply({ ephemeral: true });
      
      // Get options from the command
      const days = parseInt(interaction.options.getString('period') || '30');
      const view = interaction.options.getString('view') || 'summary';
      
      // Handle different views
      switch (view) {
        case 'summary':
          await showSummaryStats(interaction, days);
          break;
        case 'history':
          await showChangeHistory(interaction, days);
          break;
        case 'uptime':
          await showUptimeAnalysis(interaction, days);
          break;
        default:
          await showSummaryStats(interaction, days);
      }
    } catch (error) {
      console.error(`Error executing stats command: ${error.message}`);
      if (interaction.deferred) {
        await interaction.editReply({ content: `❌ Error retrieving statistics: ${error.message}`, ephemeral: true });
      } else {
        await interaction.reply({ content: `❌ Error retrieving statistics: ${error.message}`, ephemeral: true });
      }
    }
  }
};

async function showSummaryStats(interaction, days) {
  // Get status statistics
  const stats = await getStatusStatistics(days);
  
  if (!stats || stats.length === 0) {
    return interaction.editReply({ content: `No status changes recorded in the last ${days} days.`, ephemeral: true });
  }
  
  // Create summary embed
  const embed = new EmbedBuilder()
    .setTitle(`📊 Status Summary (${days} days)`)
    .setColor(0x3498db)
    .setDescription(`Overview of system status changes in the past ${days} days`)
    .setTimestamp()
    .setFooter({ text: 'Status Bot Statistics' });
  
  // Add top 5 most changed products
  const topChanges = stats.slice(0, 5);
  let topChangesText = '';
  for (let i = 0; i < topChanges.length; i++) {
    const item = topChanges[i];
    topChangesText += `${i+1}. **${item.product}** in ${item.section} - ${item.total_changes} changes\n`;
  }
  
  // Calculate total changes
  const totalChanges = stats.reduce((sum, item) => sum + item.total_changes, 0);
  const operationalChanges = stats.reduce((sum, item) => sum + item.operational_count, 0);
  const degradedChanges = stats.reduce((sum, item) => sum + item.degraded_count, 0);
  const outageChanges = stats.reduce((sum, item) => sum + item.outage_count, 0);
  const maintenanceChanges = stats.reduce((sum, item) => sum + item.maintenance_count, 0);
  
  // Add total statistics
  embed.addFields(
    { name: '📈 Total Status Changes', value: totalChanges.toString(), inline: true },
    { name: '🟢 To Operational', value: operationalChanges.toString(), inline: true },
    { name: '🟡 To Degraded', value: degradedChanges.toString(), inline: true },
    { name: '🔴 To Outage', value: outageChanges.toString(), inline: true },
    { name: '🟠 To Maintenance', value: maintenanceChanges.toString(), inline: true },
    { name: '\u200B', value: '\u200B', inline: false }, // Spacer
    { name: 'Most Changed Products', value: topChangesText || 'No changes recorded' }
  );
  
  // Create visual status distribution bar
  if (totalChanges > 0) {
    const operationalPercent = Math.round((operationalChanges / totalChanges) * 100);
    const degradedPercent = Math.round((degradedChanges / totalChanges) * 100);
    const outagePercent = Math.round((outageChanges / totalChanges) * 100);
    const maintenancePercent = Math.round((maintenanceChanges / totalChanges) * 100);
    
    let statusBar = createTextProgressBar(
      [
        { percent: operationalPercent, emoji: '🟩' },
        { percent: degradedPercent, emoji: '🟨' },
        { percent: outagePercent, emoji: '🟥' },
        { percent: maintenancePercent, emoji: '🟧' }
      ],
      20 // Bar length
    );
    
    embed.addFields({
      name: 'Status Distribution',
      value: statusBar + '\n' +
        `🟩 Operational (${operationalPercent}%) ` +
        `🟨 Degraded (${degradedPercent}%) ` +
        `🟥 Outage (${outagePercent}%) ` +
        `🟧 Maintenance (${maintenancePercent}%)`,
      inline: false
    });
  }
  
  // Create action row for other views
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('view_history')
        .setLabel('Change History')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('view_uptime')
        .setLabel('Uptime Analysis')
        .setStyle(ButtonStyle.Secondary)
    );
  
  const message = await interaction.editReply({ embeds: [embed], components: [row], ephemeral: true, fetchReply: true });
  
  // Create collector for button interactions
  const collector = message.createMessageComponentCollector({ 
    filter: i => i.user.id === interaction.user.id,
    time: 60000 // 1 minute timeout
  });
  
  collector.on('collect', async i => {
    try {
      if (i.customId === 'view_history') {
        await i.deferUpdate();
        await showChangeHistory(interaction, days);
      } else if (i.customId === 'view_uptime') {
        await i.deferUpdate();
        await showUptimeAnalysis(interaction, days);
      }
    } catch (error) {
      console.error(`Error handling button interaction: ${error.message}`);
      try {
        await i.followUp({ content: `❌ Error: ${error.message}`, ephemeral: true });
      } catch (followUpError) {
        console.error(`Failed to send error message: ${followUpError.message}`);
      }
    }
  });
}

async function showChangeHistory(interaction, days) {
  // Get status history
  const history = await getStatusHistory(days);
  
  if (!history || history.length === 0) {
    return interaction.editReply({ content: `No status changes recorded in the last ${days} days.`, ephemeral: true });
  }
  
  // Create history pages (10 items per page)
  const itemsPerPage = 10;
  const pages = [];
  
  for (let i = 0; i < Math.min(history.length, 50); i += itemsPerPage) {
    const pageItems = history.slice(i, i + itemsPerPage);
    const embed = new EmbedBuilder()
      .setTitle(`📝 Status Change History (${days} days)`)
      .setColor(0x3498db)
      .setTimestamp()
      .setFooter({ text: `Page ${Math.floor(i/itemsPerPage) + 1}/${Math.ceil(Math.min(history.length, 50)/itemsPerPage)}` });
    
    let description = '';
    for (const item of pageItems) {
      const date = new Date(item.timestamp).toLocaleString();
      const oldStatusEmoji = getStatusEmoji(item.old_status);
      const newStatusEmoji = getStatusEmoji(item.new_status);
      
      description += `**${date}**\n`;
      description += `${item.section} / ${item.product}\n`;
      description += `${oldStatusEmoji} ${item.old_status} → ${newStatusEmoji} ${item.new_status}\n\n`;
    }
    
    embed.setDescription(description);
    pages.push(embed);
  }
  
  // Create navigation row
  let currentPage = 0;
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
        .setDisabled(currentPage === pages.length - 1),
      new ButtonBuilder()
        .setCustomId('view_summary')
        .setLabel('Back to Summary')
        .setStyle(ButtonStyle.Primary)
    );
  
  // Send message
  const message = await interaction.editReply({ 
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
    try {
      if (i.customId === 'prev_page') {
        if (currentPage > 0) currentPage--;
        row.components[0].setDisabled(currentPage === 0);
        row.components[1].setDisabled(currentPage === pages.length - 1);
        await i.update({ embeds: [pages[currentPage]], components: [row] });
      } else if (i.customId === 'next_page') {
        if (currentPage < pages.length - 1) currentPage++;
        row.components[0].setDisabled(currentPage === 0);
        row.components[1].setDisabled(currentPage === pages.length - 1);
        await i.update({ embeds: [pages[currentPage]], components: [row] });
      } else if (i.customId === 'view_summary') {
        await i.deferUpdate();
        await showSummaryStats(interaction, days);
      }
    } catch (error) {
      console.error(`Error handling button interaction: ${error.message}`);
      try {
        await i.followUp({ content: `❌ Error: ${error.message}`, ephemeral: true });
      } catch (followUpError) {
        console.error(`Failed to send error message: ${followUpError.message}`);
      }
    }
  });
}

async function showUptimeAnalysis(interaction, days) {
  // Get uptime statistics
  const uptimeStats = await getSystemUptimeStats(days);
  
  if (!uptimeStats || uptimeStats.length === 0) {
    return interaction.editReply({ 
      content: `No status data available for uptime analysis in the last ${days} days.`, 
      ephemeral: true 
    });
  }
  
  // Create uptime embed
  const embed = new EmbedBuilder()
    .setTitle(`⏱️ Uptime Analysis (${days} days)`)
    .setColor(0x3498db)
    .setDescription(`System uptime percentages for the past ${days} days`)
    .setTimestamp()
    .setFooter({ text: 'Status Bot Statistics' });
  
  // Find top 5 products with highest uptime
  const sortedByUptime = [...uptimeStats].sort((a, b) => 
    b.operational_percentage - a.operational_percentage
  );
  
  // Add top 5 most stable products
  let topUptimeText = '';
  for (let i = 0; i < Math.min(sortedByUptime.length, 5); i++) {
    const item = sortedByUptime[i];
    const bar = createTextProgressBar([{ percent: item.operational_percentage, emoji: '🟩' }], 10);
    topUptimeText += `${i+1}. **${item.product}** in ${item.section}\n`;
    topUptimeText += `   ${bar} ${item.operational_percentage.toFixed(2)}% uptime\n`;
  }
  
  // Find products with issues
  const productsWithIssues = uptimeStats.filter(p => p.outage_percentage > 5 || p.degraded_percentage > 10);
  let issuesText = '';
  for (let i = 0; i < Math.min(productsWithIssues.length, 5); i++) {
    const item = productsWithIssues[i];
    const degradedBar = createTextProgressBar([{ percent: item.degraded_percentage, emoji: '🟨' }], 10);
    const outageBar = createTextProgressBar([{ percent: item.outage_percentage, emoji: '🟥' }], 10);
    
    issuesText += `${i+1}. **${item.product}** in ${item.section}\n`;
    issuesText += `   🟨 ${degradedBar} ${item.degraded_percentage.toFixed(2)}% degraded\n`;
    issuesText += `   🟥 ${outageBar} ${item.outage_percentage.toFixed(2)}% outage\n`;
  }
  
  // Calculate overall system uptime
  const totalOperational = uptimeStats.reduce((sum, item) => 
    sum + (item.operational_percentage * item.total_tracked_time), 0);
  const totalTime = uptimeStats.reduce((sum, item) => sum + item.total_tracked_time, 0);
  const overallUptime = totalTime > 0 ? (totalOperational / totalTime) : 0;
  
  // Create visual representation of overall uptime
  const overallBar = createTextProgressBar([{ percent: overallUptime, emoji: '🟩' }], 20);
  
  // Add fields to embed
  embed.addFields(
    { 
      name: '🌟 Overall System Uptime', 
      value: `${overallBar} ${overallUptime.toFixed(2)}%`, 
      inline: false 
    },
    { 
      name: '🏆 Top Performing Products', 
      value: topUptimeText || 'No data available', 
      inline: false 
    }
  );
  
  if (issuesText) {
    embed.addFields({ 
      name: '⚠️ Products Needing Attention', 
      value: issuesText, 
      inline: false 
    });
  }
  
  // Create action row for other views
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('view_summary')
        .setLabel('Back to Summary')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('view_history')
        .setLabel('View Change History')
        .setStyle(ButtonStyle.Secondary)
    );
  
  const message = await interaction.editReply({ embeds: [embed], components: [row], ephemeral: true, fetchReply: true });
  
  // Create collector for button interactions
  const collector = message.createMessageComponentCollector({ 
    filter: i => i.user.id === interaction.user.id,
    time: 60000 // 1 minute timeout
  });
  
  collector.on('collect', async i => {
    try {
      if (i.customId === 'view_summary') {
        await i.deferUpdate();
        await showSummaryStats(interaction, days);
      } else if (i.customId === 'view_history') {
        await i.deferUpdate();
        await showChangeHistory(interaction, days);
      }
    } catch (error) {
      console.error(`Error handling button interaction: ${error.message}`);
      try {
        await i.followUp({ content: `❌ Error: ${error.message}`, ephemeral: true });
      } catch (followUpError) {
        console.error(`Failed to send error message: ${followUpError.message}`);
      }
    }
  });
}

// Helper function to get emoji for status
function getStatusEmoji(status) {
  if (!status) return '⚪';
  status = status.toLowerCase();
  if (status.includes('operational') || status.includes('online')) return '🟢';
  if (status.includes('issue') || status.includes('degraded')) return '🟡';
  if (status.includes('outage') || status.includes('offline')) return '🔴';
  if (status.includes('maintenance')) return '🟠';
  return '⚪';
}

// Helper function to create a text-based progress bar
function createTextProgressBar(segments, length = 10) {
  let bar = '';
  let remainingLength = length;
  
  // Calculate blocks for each segment
  for (const segment of segments) {
    const blockCount = Math.round((segment.percent / 100) * length);
    const actualBlocks = Math.min(blockCount, remainingLength);
    
    bar += segment.emoji.repeat(actualBlocks);
    remainingLength -= actualBlocks;
  }
  
  // Fill remaining with empty blocks if any
  if (remainingLength > 0) {
    bar += '⬜'.repeat(remainingLength);
  }
  
  return bar;
} 