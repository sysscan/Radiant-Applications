const { EmbedBuilder, WebhookClient, PermissionFlagsBits } = require('discord.js');
const { getSections, getProductDetailsBySection, getStaffRole, getAdminRole, getModRole2 } = require('./database');
const fs = require('fs');
const statuses = { up: '🟢', updating: '🟡', down: '🔴' };
const { COMMAND_PERMISSIONS, PERMISSION_DESCRIPTIONS, PERMISSION_LEVELS } = require('./constants');

function getStatusEmoji(status) {
  return statuses[status] || '❔';
}

function getStatusColor(status) {
  return status === 'up' ? 0x00FF00 : 
         status === 'updating' ? 0xFFAA00 : 
         status === 'down' ? 0xFF0000 : 
         0x888888; // default gray
}

function getStatusText(status) {
  return status === 'up' ? 'Operational' : 
         status === 'updating' ? 'Degraded/Updating' : 
         status === 'down' ? 'Offline/Down' : 
         'Unknown';
}

function updateConfigFile(updates) {
  try {
    const configPath = './config.json';
    if (!fs.existsSync(configPath)) {
      console.error('Config file not found.');
      return false;
    }
    
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    if (!config.statusSystem) {
      config.statusSystem = {};
    }
    
    // Make sure updates object exists
    if (!updates) {
      console.error('No updates provided to updateConfigFile');
      return false;
    }
    
    if (updates.hasOwnProperty('permissions')) {
      // Handle permissions update
      if (!config.permissions) {
        config.permissions = {};
      }
      
      // Update permissions section recursively
      deepMerge(config.permissions, updates.permissions);
    } else {
      // Apply status system updates
      Object.entries(updates).forEach(([key, value]) => {
        config.statusSystem[key] = value;
      });
    }
    
    // Write back to file
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log('\x1b[32m%s\x1b[0m', 'Config file updated successfully.');
    return true;
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', `Error updating config file: ${error.message}`);
    return false;
  }
}


function deepMerge(target, source) {
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (source[key] instanceof Object && !Array.isArray(source[key])) {
        if (!target[key]) {
          target[key] = {};
        }
        deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }
}

async function buildEmbeds() {
  try {
    const sections = await getSections();
    
    const lines = [
      '# Status Guide:',
      '🟢 | Online',
      '🟡 | Updating',
      '🔴 | Down',
      '## ———————————'
    ];

    // Group sections and their products
    const sectionGroups = [];
    let currentGroup = [];
    let currentLength = lines.join('\n').length;

    for (const section of sections) {
      const products = await getProductDetailsBySection(section);
      
      if (products && products.length) {
        const sectionLines = [
          `## ${section}`,
          ...products.map(({ product, status }) => `${getStatusEmoji(status)} 🔸 ${product}`),
          '## ———————————'
        ];
        
        const sectionContent = sectionLines.join('\n');
        
        // If adding this section would exceed Discord's limit (4096 characters), start a new group
        if (currentLength + sectionContent.length > 4000) {
          sectionGroups.push(currentGroup);
          currentGroup = [];
          currentLength = 0;
        }
        
        currentGroup.push(sectionLines);
        currentLength += sectionContent.length;
      }
    }
    
    // Add the last group if it's not empty
    if (currentGroup.length > 0) {
      sectionGroups.push(currentGroup);
    }

    // Create embeds for each group
    const embeds = [];
    
    // First embed with the guide
    const guideEmbed = new EmbedBuilder()
      .setDescription(lines.join('\n'))
      .setColor(15644944);
    embeds.push(guideEmbed);

    // Create additional embeds for each section group
    for (const group of sectionGroups) {
      const groupContent = group.flat().join('\n');
      const embed = new EmbedBuilder()
        .setDescription(groupContent)
        .setColor(15644944);
      embeds.push(embed);
    }

    console.log(`Built ${embeds.length} embeds successfully.`);
    return embeds;
  } catch (error) {
    console.error(`Error building embeds: ${error.message}`);
    throw error;
  }
}

/**
 * Ensures the webhook in config is valid. If not, creates a new one and updates config.
 * Returns a valid WebhookClient instance.
 */
async function ensureValidWebhook(config) {
  if (!config || !config.statusSystem || !config.statusSystem.statusChannelId || !config.client) {
    throw new Error('Missing config, statusSystem, statusChannelId, or client');
  }
  const channel = await config.client.channels.fetch(config.statusSystem.statusChannelId);
  if (!channel) throw new Error('Status channel not found');
  let webhookUrl = config.statusSystem.webhookUrl;
  let webhookClient = null;
  let valid = false;
  if (webhookUrl) {
    try {
      webhookClient = new WebhookClient({ url: webhookUrl });
      // Try to fetch the webhook to check if it exists
      await webhookClient.fetch();
      valid = true;
    } catch (err) {
      valid = false;
    }
  }
  if (!valid) {
    // Delete any existing webhooks created by the bot in this channel
    const webhooks = await channel.fetchWebhooks();
    for (const [id, webhook] of webhooks) {
      if (webhook.owner && webhook.owner.id === config.client.user.id) {
        await webhook.delete().catch(() => {});
      }
    }
    // Create a new webhook
    const newWebhook = await channel.createWebhook({
      name: 'Status Bot Webhook',
      avatar: config.client.user.displayAvatarURL(),
      reason: 'Auto-created by ensureValidWebhook',
    });
    webhookUrl = newWebhook.url;
    webhookClient = new WebhookClient({ url: webhookUrl });
    // Update config and config file
    config.statusSystem.webhookUrl = webhookUrl;
    updateConfigFile({ webhookUrl });
    console.log('\x1b[32m%s\x1b[0m', 'Webhook was invalid or missing. Created a new webhook and updated config.');
  }
  return webhookClient;
}

async function updateEmbed(config, embeds) {
  try {
    // Check if embeds array is empty
    if (!embeds || embeds.length === 0) {
      console.log('No embeds to update.');
      return;
    }

    // Check if we're doing a partial update (specific embeds only)
    const isPartialUpdate = embeds.length > 0 && embeds[0].data.description && !embeds[0].data.description.includes('Status Guide');

    // First, try using the webhook method
    if (config && config.statusSystem && config.statusSystem.webhookUrl) {
      try {
        // Use the new ensureValidWebhook utility
        const webhook = await ensureValidWebhook(config);
        
        if (isPartialUpdate) {
          // For partial updates, we need to find which messages contain the sections we need to update
          // Get channel to fetch messages
          if (!config.client || !config.statusSystem.statusChannelId) {
            console.log('\x1b[33m%s\x1b[0m', 'Missing client or channel ID for partial update. Skipping channel message fetch.');
          } else {
            try {
              const channel = await config.client.channels.fetch(config.statusSystem.statusChannelId);
              if (!channel) throw new Error('Channel not found');
              
              // Fetch all messages in the channel
              const messages = await channel.messages.fetch({ limit: 20 });
              
              // Look for embeds that contain our content
              for (const embed of embeds) {
                const embedContent = embed.data.description;
                let updated = false;
                
                // Go through all messages to find a match
                for (const [id, message] of messages) {
                  if (message.embeds && message.embeds.length > 0) {
                    const msgEmbedContent = message.embeds[0].description;
                    
                    // Skip the status guide embed
                    if (msgEmbedContent && msgEmbedContent.includes('Status Guide')) {
                      continue;
                    }
                    
                    // Look for the right content to update
                    if (msgEmbedContent && embedContent) {
                      // Compare key parts to find a match
                      const embedSections = extractSections(embedContent);
                      const msgSections = extractSections(msgEmbedContent);
                      
                      // If they share at least one section, update this message
                      if (hasCommonSection(embedSections, msgSections)) {
                        try {
                          await webhook.editMessage(id, {
                            content: '',
                            embeds: [embed],
                            allowedMentions: { parse: [] }
                          });
                          updated = true;
                          break;
                        } catch (err) {
                          console.error(`Error updating message ${id}: ${err.message}`);
                        }
                      }
                    }
                  }
                }
              }
            } catch (channelError) {
              console.error(`Error accessing channel: ${channelError.message}`);
            }
          }
        } else {
          // For full updates, update the first embed and handle additional ones
          if (!config.statusSystem.embedMessageId) {
            console.log('\x1b[33m%s\x1b[0m', 'Missing embedMessageId for full update. Skipping primary embed update.');
          } else {
            try {
              await webhook.editMessage(config.statusSystem.embedMessageId, {
                content: '',
                embeds: [embeds[0]],
                allowedMentions: { parse: [] }
              });
              
              // For additional embeds, create new messages
              if (embeds.length > 1) {
                // Delete any existing additional embeds
                if (config.client && config.statusSystem.statusChannelId) {
                  try {
                    const channel = await config.client.channels.fetch(config.statusSystem.statusChannelId);
                    if (channel) {
                      const messages = await channel.messages.fetch({ limit: 10 });
                      for (const [id, message] of messages) {
                        if (id !== config.statusSystem.embedMessageId && id !== config.statusSystem.updateMessageId) {
                          await message.delete().catch(console.error);
                        }
                      }
                    }
                  } catch (error) {
                    console.error('Error cleaning up old embeds:', error.message);
                  }
                }
                
                // Send new additional embeds
                for (let i = 1; i < embeds.length; i++) {
                  await webhook.send({
                    content: '',
                    embeds: [embeds[i]],
                    allowedMentions: { parse: [] }
                  });
                }
              }
            } catch (webhookUpdateError) {
              console.error(`Error updating embed via webhook: ${webhookUpdateError.message}`);
            }
          }
        }
        
        console.log('Embed messages updated successfully via webhook.');
        return;
      } catch (webhookError) {
        console.error(`Webhook update failed: ${webhookError.message}`);
        console.log('Falling back to direct message edit...');
      }
    }

    // Fallback to direct message edit if webhook fails or isn't available
    if (config && config.client && config && config.statusSystem && config.statusSystem.statusChannelId && config.statusSystem.embedMessageId) {
      try {
        const channel = await config.client.channels.fetch(config.statusSystem.statusChannelId);
        if (!channel) throw new Error('Channel not found');
        
        if (isPartialUpdate) {
          // For partial updates, find the right messages to update
          // Fetch all messages in the channel
          const messages = await channel.messages.fetch({ limit: 20 });
          
          // Look for embeds that contain our content
          for (const embed of embeds) {
            const embedContent = embed.data.description;
            let updated = false;
            
            // Go through all messages to find a match
            for (const [id, message] of messages) {
              if (message.embeds && message.embeds.length > 0) {
                const msgEmbedContent = message.embeds[0].description;
                
                // Skip the status guide embed
                if (msgEmbedContent && msgEmbedContent.includes('Status Guide')) {
                  continue;
                }
                
                // Look for the right content to update
                if (msgEmbedContent && embedContent) {
                  // Compare key parts to find a match
                  const embedSections = extractSections(embedContent);
                  const msgSections = extractSections(msgEmbedContent);
                  
                  // If they share at least one section, update this message
                  if (hasCommonSection(embedSections, msgSections)) {
                    try {
                      await message.edit({ embeds: [embed] });
                      updated = true;
                      break;
                    } catch (err) {
                      console.error(`Error updating message ${id}: ${err.message}`);
                    }
                  }
                }
              }
            }
          }
        } else {
          // For full updates, use standard approach
          // Retrieve existing messages
          const messages = await channel.messages.fetch({ limit: 20 });
          
          // First, update the main status guide (first embed)
          const mainMessage = await channel.messages.fetch(config.statusSystem.embedMessageId);
          if (!mainMessage) throw new Error('Main embed message not found');
          
          // Keep the existing embed if it's just the status guide
          if (mainMessage.embeds && mainMessage.embeds.length > 0 && 
              mainMessage.embeds[0].description && 
              mainMessage.embeds[0].description.includes('Status Guide')) {
            // Keep this message as is
          } else {
            // Update it with the first embed if needed
            await mainMessage.edit({ embeds: [embeds[0]] });
          }
          
          // Find all other embeds that contain statuses
          const statusMessages = [];
          for (const [id, message] of messages) {
            // Skip the main embed and the update message
            if (id !== config.statusSystem.embedMessageId && id !== config.statusSystem.updateMessageId) {
              if (message.embeds && message.embeds.length > 0) {
                statusMessages.push(message);
              }
            }
          }
          
          // Only update status embeds (second message onward), leaving guide untouched
          for (let i = 1; i < embeds.length; i++) {
            const embedIndex = i - 1; // Adjust index for statusMessages array
            
            if (embedIndex < statusMessages.length) {
              // Update existing status message
              await statusMessages[embedIndex].edit({ embeds: [embeds[i]] });
            } else {
              // Create new status message if needed
              await channel.send({ embeds: [embeds[i]] });
            }
          }
        }
        
        console.log('Status embeds updated successfully.');
        return;
      } catch (directEditError) {
        console.error(`Direct message edit failed: ${directEditError.message}`);
        throw directEditError;
      }
    } else {
      // Instead of throwing an error, log the issue and continue
      const missingFields = [];
      if (!config || !config.client) missingFields.push('client');
      if (!config || !config.statusSystem || !config.statusSystem.statusChannelId) missingFields.push('statusChannelId');
      if (!config || !config.statusSystem || !config.statusSystem.embedMessageId) missingFields.push('embedMessageId');
      
      const warningMessage = `Cannot update embed: Missing ${missingFields.join(', ')}`;
      console.warn('\x1b[33m%s\x1b[0m', warningMessage);
      console.log('\x1b[33m%s\x1b[0m', 'Status was updated in the database, but embeds could not be updated.');
      
      // Return instead of throwing an error
      return;
    }
  } catch (error) {
    console.error(`Error updating embed message: ${error.message}`);
    // Log the error but don't throw it
    console.log('\x1b[33m%s\x1b[0m', 'Status was updated in the database, but embeds could not be updated.');
    return;
  }
}

// Helper function to extract section names from an embed description
function extractSections(description) {
  if (!description) return [];
  
  const sections = [];
  const regex = /## ([^#\n]+)/g;
  let match;
  
  while ((match = regex.exec(description)) !== null) {
    sections.push(match[1].trim());
  }
  
  return sections;
}

// Helper function to check if two arrays have any common elements
function hasCommonSection(arr1, arr2) {
  return arr1.some(item => arr2.includes(item));
}

async function updateUpdateInfo(config, updateMsg) {
  try {
    console.log('\x1b[36m%s\x1b[0m', 'Attempting to update info message...');
    console.log('\x1b[36m%s\x1b[0m', `Config status:`, {
      hasClient: !!(config && config.client),
      hasWebhook: !!(config && config.statusSystem && config.statusSystem.webhookUrl),
      channelId: config && config.statusSystem ? config.statusSystem.statusChannelId : undefined,
      updateMessageId: config && config.statusSystem ? config.statusSystem.updateMessageId : undefined
    });

    // First try using webhook
    if (config && config.statusSystem && config.statusSystem.webhookUrl && config.statusSystem.updateMessageId) {
      try {
        console.log('\x1b[36m%s\x1b[0m', 'Attempting webhook update...');
        // Use the new ensureValidWebhook utility
        const webhook = await ensureValidWebhook(config);
        let content = '\u200B';
        let embeds = [];
        if (typeof updateMsg === 'string') {
          content = updateMsg.trim() || '\u200B';
        } else if (typeof updateMsg === 'object') {
          // Assume it's an embed
          embeds = [updateMsg];
        }
        console.log('\x1b[36m%s\x1b[0m', `Updating message ${config.statusSystem.updateMessageId} via webhook...`);
        await webhook.editMessage(config.statusSystem.updateMessageId, {
          content,
          embeds,
          allowedMentions: { parse: [] }
        });
        console.log('\x1b[32m%s\x1b[0m', 'Update info message updated successfully via webhook.');
        return;
      } catch (webhookError) {
        console.error('\x1b[33m%s\x1b[0m', `Webhook update failed: ${webhookError.message}`);
        console.log('\x1b[33m%s\x1b[0m', 'Falling back to direct message edit...');
      }
    }
    
    // Fallback to direct message edit
    if (config && config.client && config.statusSystem && config.statusSystem.statusChannelId && config.statusSystem.updateMessageId) {
      try {
        console.log('\x1b[36m%s\x1b[0m', 'Attempting direct message edit...');
        console.log('\x1b[36m%s\x1b[0m', `Fetching channel ${config.statusSystem.statusChannelId}...`);
        const channel = await config.client.channels.fetch(config.statusSystem.statusChannelId);
        if (!channel) throw new Error('Channel not found');
        
        console.log('\x1b[36m%s\x1b[0m', `Fetching message ${config.statusSystem.updateMessageId}...`);
        const message = await channel.messages.fetch(config.statusSystem.updateMessageId);
        if (!message) throw new Error('Message not found');
        
        let content = '\u200B';
        let embeds = [];
        if (typeof updateMsg === 'string') {
          content = updateMsg.trim() || '\u200B';
        } else if (typeof updateMsg === 'object') {
          // Assume it's an embed
          embeds = [updateMsg];
        }
        
        console.log('\x1b[36m%s\x1b[0m', 'Editing message...');
        await message.edit({ content, embeds });
        console.log('\x1b[32m%s\x1b[0m', 'Update info message updated successfully via direct edit.');
        return;
      } catch (directEditError) {
        console.error('\x1b[31m%s\x1b[0m', `Direct message edit failed: ${directEditError.message}`);
        console.warn('\x1b[33m%s\x1b[0m', 'Could not update the info message, but the status was updated in the database.');
        return;
      }
    } else {
      const missingFields = [];
      if (!config || !config.client) missingFields.push('client');
      if (!config || !config.statusSystem || !config.statusSystem.statusChannelId) missingFields.push('statusChannelId');
      if (!config || !config.statusSystem || !config.statusSystem.updateMessageId) missingFields.push('updateMessageId');
      
      // Instead of throwing an error, log a warning and continue
      const warningMessage = `Cannot update info message: Missing ${missingFields.join(', ')}`;
      console.warn('\x1b[33m%s\x1b[0m', warningMessage);
      console.log('\x1b[33m%s\x1b[0m', 'Status was updated in the database, but the info message could not be updated.');
      return;
    }
  } catch (error) {
    console.error('\x1b[31m%s\x1b[0m', `Error updating update info message: ${error.message}`);
    console.warn('\x1b[33m%s\x1b[0m', 'Status was updated in the database, but the info message could not be updated.');
    return;
  }
}

const prebuiltEmbedMessage = {
  content: null,
  embeds: [
    new EmbedBuilder()
      .setDescription(
        "# Status Guide:\n" +
        "🟢 | Online\n" +
        "🟡 | Updating\n" +
        "🔴 | Down\n" +
        "## ———————————\n" +
        "## Counter Strike 2\n" +
        "🟢🔸 Midnight\n" +
        "🟢🔸 Plague\n" +
        "🟢🔸 Predator\n" +
        "🟢🔸 Ovix\n" +
        "🟡🔸 Vanity\n" +
        "🟢🔸 Nixware\n" +
        "🟡🔸 Anyx.gg\n" +
        "🟢🔸 Neverlose\n" +
        "🟢🔸 Meme-Sense\n" +
        "## ——————————\n" +
        "## Apex Legends\n" +
        "🟡🔸 Lexis\n" +
        "## ———————————\n" +
        "## Fecurity\n" +
        "🟡 🔸 Valorant\n" +
        "🟢 🔸 PUBG\n" +
        "🟢 🔸 Bloodhunt\n" +
        "🟡 🔸 Deadside\n" +
        "🟢 🔸 World War 3\n" +
        "🟢 🔸 Squad\n" +
        "🟢 🔸 Dead by Daylight\n" +
        "🟢 🔸 Insurgency\n" +
        "🟡 🔸 Unturned\n" +
        "🟢 🔸 BattleBit\n" +
        "🟢 🔸 Battlefield 2042\n" +
        "🟢 🔸 Rogue Company\n" +
        "🟡 🔸 War Thunder\n" +
        "🟢 🔸 The Finals\n" +
        "🟢 🔸 Counter Strike 2\n" +
        "🟢 🔸 Escape From Tarkov\n" +
        "🟢 🔸 Apex Legends\n" +
        "🟢 🔸 Fortnite\n" +
        "🟢 🔸 Call of Duty, MW, MW2, WZ & WZ2\n" +
        "## ———————————\n" +
        "## Klar\n" +
        "🟡🔸DayZ\n" +
        "🟢🔸Marvel Rival\n" +
        "🟢🔸Fortnite\n" +
        "🟡🔸Apex Legends\n" +
        "🟡🔸Escape From Tarkov: Full\n" +
        "🟡🔸Escape From Tarkov: Lite\n" +
        "## ———————————\n" +
        "## Kernaim\n" +
        "🟢🔸MW3\n" +
        "🟢🔸Black Ops 6\n" +
        "🟢🔸The Finals\n" +
        "🟢🔸DayZ\n" +
        "🟢🔸Counter Strike 2\n" +
        "## ———————————\n" +
        "## Ring-1\n" +
        "🟢 🔸 Apex Legends\n" +
        "🟢 🔸 Ark\n" +
        "🟢 🔸 Battle Bit\n" +
        "🟢 🔸 COD: Black Ops 6\n" +
        "🟢 🔸 COD: Cold War\n" +
        "🟢 🔸 COD: MW\n" +
        "🟢 🔸 COD: MW2\n" +
        "🟢 🔸 COD: MW3\n" +
        "🟢 🔸 COD: Vanguard\n" +
        "🟢 🔸 Dark and Darker\n" +
        "🟢 🔸 DayZ\n" +
        "🟢 🔸 Dead by Daylight\n" +
        "🟢 🔸 Deadlock\n" +
        "🟢 🔸 Escape from Tarkov\n" +
        "🟢 🔸 Hell Let Loose\n" +
        "🟢 🔸 Hunt Showdown\n" +
        "🟢 🔸 Marvel Rivals\n" +
        "🟢 🔸 Overwatch 2\n" +
        "🟢 🔸 PUBG (BASIC)\n" +
        "🟢 🔸 PUBG (FULL)\n" +
        "🟢 🔸 Rainbow Six Siege (BASIC)\n" +
        "🟢 🔸 Rainbow Six Siege (FULL)\n" +
        "🟢 🔸 SCUM\n" +
        "🟢 🔸 XDefiant\n" +
        "🟢 🔸 Arena Breakout Infinite\n" +
        "🔴 🔸 Rust\n" +
        "## ———————————\n" +
        "## Minecraft\n" +
        "🟢 🔸 Dream\n" +
        "## ———————————\n" +
        "## Rust\n" +
        "🟢 🔸Disconnect.wtf\n" +
        "## ———————————\n" +
        "## HWID Spoofer & VPN\n" +
        "🟢 🔸Ethereal HWID Spoofer\n" +
        "## ———————————"
      )
      .setColor(15644944)
  ],
  attachments: []
};

/**
 * Check if a user has the required permission level
 * @param {Interaction} interaction Discord interaction object
 * @param {Object} config Bot configuration object
 * @param {String} requiredLevel Permission level required ('admin', 'mod', 'staff', 'helper', or 'user')
 * @returns {Promise<Boolean>} Whether the user has permission
 */
async function checkPermission(interaction, config, requiredLevel = 'mod') {
  // Debug logging for permission checks
  try {
    const userId = interaction.user?.id || interaction.member?.user?.id;
    const username = interaction.user?.tag || interaction.member?.user?.tag;
    const roleIds = interaction.member?.roles?.cache ? Array.from(interaction.member.roles.cache.keys()) : [];
    console.log(`[DEBUG] checkPermission called for user: ${username} (${userId})`);
    console.log(`[DEBUG] User roles:`, roleIds);
    console.log(`[DEBUG] Required level:`, requiredLevel);
  } catch (e) {
    console.log('[DEBUG] Error logging permission check:', e);
  }
  // Role ID mapping
  const ROLE_IDS = {
    OWNER: '1288235345128853607', // Manager/Main Admin
    ADMIN: '1370011414378319872', // Admin
    MODERATOR: '1288235352808493137', // Moderator/Support+
    STAFF: '1288235357682401310', // Support
    HELPER: '1288235359372709958', // Trial Support
  };

  // Permission level mapping (for backward compatibility)
  const permLevelMap = {
    'admin': 'ADMIN',
    'mod': 'MODERATOR',
    'staff': 'STAFF',
    'helper': 'HELPER',
    'user': 'USER'
  };
  const stdRequiredLevel = permLevelMap[requiredLevel] || requiredLevel.toUpperCase();

  // Get member roles
  const member = interaction.member;
  if (!member || !member.roles || !member.roles.cache) return stdRequiredLevel === 'USER';

  // Determine user's highest permission level
  let userLevel = 'USER';
  if (member.roles.cache.has(ROLE_IDS.OWNER)) {
    userLevel = 'OWNER';
  } else if (member.roles.cache.has(ROLE_IDS.ADMIN)) {
    userLevel = 'ADMIN';
  } else if (member.roles.cache.has(ROLE_IDS.MODERATOR)) {
    userLevel = 'MODERATOR';
  } else if (member.roles.cache.has(ROLE_IDS.STAFF)) {
    userLevel = 'STAFF';
  } else if (member.roles.cache.has(ROLE_IDS.HELPER)) {
    userLevel = 'HELPER';
  }

  // Permission hierarchy
  const hierarchy = ['USER', 'HELPER', 'STAFF', 'MODERATOR', 'ADMIN', 'OWNER'];
  const userLevelIndex = hierarchy.indexOf(userLevel);
  const requiredLevelIndex = hierarchy.indexOf(stdRequiredLevel);

  return userLevelIndex >= requiredLevelIndex;
}

/**
 * Get a standardized permission error message
 * @param {String} requiredLevel Permission level required
 * @returns {String} Error message
 */
function getPermissionErrorMessage(requiredLevel = 'mod') {
  // Permission level mapping (for backward compatibility)
  const permLevelMap = {
    'admin': 'ADMIN',
    'mod': 'MODERATOR', 
    'staff': 'STAFF',
    'user': 'USER'
  };
  
  // Standardize the required level to uppercase format
  const stdRequiredLevel = permLevelMap[requiredLevel] || requiredLevel.toUpperCase();
  
  // Use the descriptions from constants.js
  if (PERMISSION_DESCRIPTIONS && PERMISSION_DESCRIPTIONS[stdRequiredLevel]) {
    return `❌ ${PERMISSION_DESCRIPTIONS[stdRequiredLevel]}.`;
  }
  
  // Fallback messages if not found in PERMISSION_DESCRIPTIONS
  const fallbackMessages = {
    'ADMIN': '❌ This command requires administrator permissions.',
    'MODERATOR': '❌ This command requires moderator permissions.',
    'STAFF': '❌ This command requires staff permissions.',
    'USER': '❌ You do not have permission to use this command.'
  };
  
  return fallbackMessages[stdRequiredLevel] || '❌ You do not have permission to use this command.';
}

/**
 * Safely get a value from config object
 * @param {Object} config Config object
 * @param {String} key Key to get
 * @param {*} defaultValue Default value if key doesn't exist
 * @returns {*} Value from config or default
 */
function getConfigSafe(config, key, defaultValue = null) {
  if (!config || typeof config !== 'object') {
    return defaultValue;
  }
  
  return config[key] !== undefined ? config[key] : defaultValue;
}

/**
 * Check if the bot has required permissions in a channel
 * @param {Channel} channel Discord channel object
 * @param {Array} permissions Array of permission flags
 * @returns {Object} Object with missing permissions and has all permissions bool
 */
function checkBotPermissions(channel, permissions) {
  if (!channel || !channel.permissionsFor) {
    return { hasAll: false, missing: permissions };
  }
  
  const botMember = channel.guild.members.me;
  const missingPermissions = permissions.filter(
    perm => !channel.permissionsFor(botMember).has(perm)
  );
  
  return {
    hasAll: missingPermissions.length === 0,
    missing: missingPermissions
  };
}

function handleCommandError(interaction, error, customMessage = null) {
  console.error(`Error in command execution:`, error);
  const message = customMessage || '❌ An error occurred. Please try again later.';
  
  if (interaction.deferred && !interaction.replied) {
    return interaction.editReply({ content: message, ephemeral: true });
  } else if (!interaction.replied) {
    return interaction.reply({ content: message, ephemeral: true });
  }
}

// Export all utility functions
module.exports = {
  updateConfigFile,
  deepMerge,
  buildEmbeds,
  updateEmbed,
  extractSections,
  hasCommonSection,
  updateUpdateInfo,
  checkPermission,
  getPermissionErrorMessage,
  getConfigSafe,
  checkBotPermissions,
  handleCommandError,
  getStatusEmoji,
  getStatusColor,
  getStatusText
};
