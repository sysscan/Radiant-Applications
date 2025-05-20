const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getAutoRoleEnabled, setAutoRoleEnabled, addAutoRole, removeAutoRole, getAutoRoles, updateAutoRoleConditions, getAutoRole } = require('../database');
const { checkPermission, getPermissionErrorMessage, checkBotPermissions } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Manage auto-roles for new server members')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand(subcommand =>
      subcommand
        .setName('enable')
        .setDescription('Enable auto-role assignment for new members'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('disable')
        .setDescription('Disable auto-role assignment for new members'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('add')
        .setDescription('Add a role to be automatically assigned to new members')
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('The role to add to auto-roles')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('remove')
        .setDescription('Remove a role from auto-roles')
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('The role to remove from auto-roles')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('list')
        .setDescription('List all roles that are automatically assigned to new members'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('set_condition')
        .setDescription('Set conditions for when an auto-role is assigned')
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('The role to set conditions for')
            .setRequired(true))
        .addStringOption(option =>
          option
            .setName('condition_type')
            .setDescription('The type of condition to set')
            .setRequired(true)
            .addChoices(
              { name: 'Account Age', value: 'account_age' },
              { name: 'Account Creation Month', value: 'creation_month' },
              { name: 'Account Creation Year', value: 'creation_year' },
              { name: 'Username Contains', value: 'username_contains' },
              { name: 'Username Regex', value: 'username_regex' },
              { name: 'Clear All Conditions', value: 'clear' }
            ))
        .addStringOption(option =>
          option
            .setName('condition_value')
            .setDescription('The value for the condition (required for all except "Clear All Conditions")')
            .setRequired(false))
        .addStringOption(option =>
          option
            .setName('operator')
            .setDescription('Comparison operator (for numeric conditions)')
            .setRequired(false)
            .addChoices(
              { name: 'Greater Than (>)', value: '>' },
              { name: 'Less Than (<)', value: '<' },
              { name: 'Equal To (=)', value: '=' },
              { name: 'Greater Than or Equal To (>=)', value: '>=' },
              { name: 'Less Than or Equal To (<=)', value: '<=' }
            )))
    .addSubcommand(subcommand =>
      subcommand
        .setName('view_conditions')
        .setDescription('View the conditions for a specific auto-role')
        .addRoleOption(option =>
          option
            .setName('role')
            .setDescription('The role to view conditions for')
            .setRequired(true))),
  
  async execute(interaction, config) {
    // Check role-based permission using our standardized system
    const hasPermission = await checkPermission(interaction, config, 'admin');
    if (!hasPermission) {
      return interaction.reply({
        content: getPermissionErrorMessage('admin'),
        ephemeral: true
      });
    }
    
    // Check bot permissions
    if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({
        content: '❌ I need the "Manage Roles" permission to manage auto-roles.',
        ephemeral: true
      });
    }
    
    const subcommand = interaction.options.getSubcommand();
    
    try {
      switch (subcommand) {
        case 'enable': {
          await setAutoRoleEnabled(true);
          await interaction.reply({
            content: '✅ Auto-role assignment has been **enabled**. New members will automatically receive configured roles.',
            ephemeral: true
          });
          break;
        }
        
        case 'disable': {
          await setAutoRoleEnabled(false);
          await interaction.reply({
            content: '✅ Auto-role assignment has been **disabled**. New members will not receive automatic roles.',
            ephemeral: true
          });
          break;
        }
        
        case 'add': {
          const role = interaction.options.getRole('role');
          
          // Check if the role is higher than bot's highest role
          if (role.position >= interaction.guild.members.me.roles.highest.position) {
            return interaction.reply({
              content: `❌ I cannot assign the role ${role.name} because it is positioned higher than or equal to my highest role.`,
              ephemeral: true
            });
          }
          
          try {
            await addAutoRole(role.id, role.name);
            await interaction.reply({
              content: `✅ The role **${role.name}** has been added to auto-roles. New members will now receive this role automatically.\n\nYou can set conditions for this role with \`/autorole set_condition\`.`,
              ephemeral: true
            });
          } catch (error) {
            if (error.message.includes('already in auto-roles')) {
              await interaction.reply({
                content: `⚠️ The role **${role.name}** is already in the auto-roles list.`,
                ephemeral: true
              });
            } else {
              throw error;
            }
          }
          break;
        }
        
        case 'remove': {
          const role = interaction.options.getRole('role');
          
          try {
            await removeAutoRole(role.id);
            await interaction.reply({
              content: `✅ The role **${role.name}** has been removed from auto-roles.`,
              ephemeral: true
            });
          } catch (error) {
            if (error.message.includes('not found in auto-roles')) {
              await interaction.reply({
                content: `⚠️ The role **${role.name}** is not in the auto-roles list.`,
                ephemeral: true
              });
            } else {
              throw error;
            }
          }
          break;
        }
        
        case 'set_condition': {
          const role = interaction.options.getRole('role');
          const conditionType = interaction.options.getString('condition_type');
          const conditionValue = interaction.options.getString('condition_value');
          const operator = interaction.options.getString('operator');
          
          // Get the current role data
          const roleData = await getAutoRole(role.id);
          if (!roleData) {
            return interaction.reply({
              content: `❌ The role **${role.name}** is not in the auto-roles list. Add it first with \`/autorole add\`.`,
              ephemeral: true
            });
          }
          
          // Handle clearing all conditions
          if (conditionType === 'clear') {
            await updateAutoRoleConditions(role.id, {});
            await interaction.reply({
              content: `✅ All conditions for the role **${role.name}** have been cleared. It will now be assigned to all new members.`,
              ephemeral: true
            });
            return;
          }
          
          // Validation for other condition types
          if (!conditionValue) {
            return interaction.reply({
              content: '❌ A condition value is required for this condition type.',
              ephemeral: true
            });
          }
          
          // Validation for numeric conditions
          if (['account_age', 'creation_year'].includes(conditionType)) {
            if (!operator) {
              return interaction.reply({
                content: '❌ An operator is required for numeric conditions.',
                ephemeral: true
              });
            }
            
            // Validate numeric value
            const numValue = Number(conditionValue);
            if (isNaN(numValue)) {
              return interaction.reply({
                content: '❌ The condition value must be a number for this condition type.',
                ephemeral: true
              });
            }
          }
          
          // Prepare the conditions object (preserving existing conditions)
          const conditions = roleData.conditions || {};
          
          // Set the new condition
          conditions[conditionType] = {
            value: conditionValue,
            operator: operator || '=' // Default to equals if not specified
          };
          
          // Save the updated conditions
          await updateAutoRoleConditions(role.id, conditions);
          
          let responseMessage = `✅ Condition set for role **${role.name}**:\n`;
          responseMessage += getConditionDescription(conditionType, conditionValue, operator);
          
          await interaction.reply({
            content: responseMessage,
            ephemeral: true
          });
          break;
        }
        
        case 'view_conditions': {
          const role = interaction.options.getRole('role');
          
          // Get the role data
          const roleData = await getAutoRole(role.id);
          if (!roleData) {
            return interaction.reply({
              content: `❌ The role **${role.name}** is not in the auto-roles list.`,
              ephemeral: true
            });
          }
          
          const conditions = roleData.conditions || {};
          const conditionKeys = Object.keys(conditions);
          
          const embed = new EmbedBuilder()
            .setTitle(`📋 Conditions for ${role.name}`)
            .setColor(0x3498DB)
            .setTimestamp();
          
          if (conditionKeys.length === 0) {
            embed.setDescription(`No conditions are set for this role. It will be assigned to all new members.`);
          } else {
            embed.setDescription(`The following conditions must be met for a new member to receive this role:`);
            
            conditionKeys.forEach(type => {
              const condition = conditions[type];
              const description = getConditionDescription(type, condition.value, condition.operator);
              
              embed.addFields({
                name: getConditionTypeName(type),
                value: description,
                inline: false
              });
            });
          }
          
          await interaction.reply({
            embeds: [embed],
            ephemeral: true
          });
          break;
        }
        
        case 'list': {
          const enabled = await getAutoRoleEnabled();
          const roles = await getAutoRoles();
          
          const embed = new EmbedBuilder()
            .setTitle('📋 Auto-Role Configuration')
            .setColor(enabled ? 0x00FF00 : 0xFF0000)
            .setDescription(`Auto-role assignment is currently **${enabled ? 'ENABLED' : 'DISABLED'}**`)
            .setTimestamp();
          
          if (roles.length === 0) {
            embed.addFields({
              name: 'Configured Roles',
              value: 'No roles configured. Add roles with `/autorole add`'
            });
          } else {
            // Map roles to list items with condition status
            const roleListItems = await Promise.all(roles.map(async role => {
              const conditions = role.conditions || {};
              const hasConditions = Object.keys(conditions).length > 0;
              return `• <@&${role.id}> (${role.name})${hasConditions ? ' [Has Conditions]' : ''}`;
            }));
            
            embed.addFields({
              name: 'Configured Roles',
              value: roleListItems.join('\n')
            });
            
            embed.addFields({
              name: 'Viewing & Setting Conditions',
              value: 'Use `/autorole view_conditions` to see conditions for a role\nUse `/autorole set_condition` to configure when a role is assigned'
            });
          }
          
          await interaction.reply({
            embeds: [embed],
            ephemeral: true
          });
          break;
        }
      }
    } catch (error) {
      console.error(`Error in autorole command (${subcommand}):`, error);
      await interaction.reply({
        content: `❌ An error occurred: ${error.message}`,
        ephemeral: true
      });
    }
  },
  permissionLevel: require('../constants').PERMISSION_LEVELS.ADMIN,
};

// Helper function to get a human-readable description of a condition
function getConditionDescription(type, value, operator) {
  switch (type) {
    case 'account_age':
      return `Account must be ${getOperatorText(operator)} ${value} days old`;
    case 'creation_month':
      return `Account must be created in month: ${getMonthName(parseInt(value))}`;
    case 'creation_year':
      return `Account creation year must be ${getOperatorText(operator)} ${value}`;
    case 'username_contains':
      return `Username must contain: "${value}"`;
    case 'username_regex':
      return `Username must match regex: ${value}`;
    default:
      return `${type}: ${value}`;
  }
}

// Helper function to get the display name for a condition type
function getConditionTypeName(type) {
  const typeMap = {
    'account_age': 'Account Age',
    'creation_month': 'Account Creation Month',
    'creation_year': 'Account Creation Year',
    'username_contains': 'Username Contains',
    'username_regex': 'Username Regular Expression'
  };
  
  return typeMap[type] || type;
}

// Helper function to get operator text
function getOperatorText(operator) {
  const operatorMap = {
    '>': 'greater than',
    '<': 'less than',
    '=': 'equal to',
    '>=': 'greater than or equal to',
    '<=': 'less than or equal to'
  };
  
  return operatorMap[operator] || operator;
}

// Helper function to get month name
function getMonthName(monthNumber) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  if (monthNumber >= 1 && monthNumber <= 12) {
    return months[monthNumber - 1];
  }
  
  return monthNumber.toString();
} 