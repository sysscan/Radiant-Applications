const { getAutoRoleEnabled, getAutoRoles } = require('../database');

module.exports = {
  name: 'guildMemberAdd',
  once: false,
  async execute(client, member) {
    try {
      // Check if auto-role is enabled
      const isEnabled = await getAutoRoleEnabled();
      if (!isEnabled) return;
      
      // Get auto-roles
      const autoRoles = await getAutoRoles();
      if (!autoRoles || autoRoles.length === 0) return;
      
      // Assign roles
      let successCount = 0;
      let failedRoles = [];
      
      for (const roleData of autoRoles) {
        try {
          // Check if the member meets the role conditions
          const meetsConditions = await checkRoleConditions(member, roleData);
          if (!meetsConditions) {
            continue; // Skip this role
          }
          
          const role = await member.guild.roles.fetch(roleData.id);
          if (role) {
            await member.roles.add(role);
            successCount++;
          } else {
            failedRoles.push(`${roleData.name} (Role not found)`);
          }
        } catch (error) {
          failedRoles.push(`${roleData.name} (${error.message})`);
        }
      }
      
      // Log the result
      if (successCount > 0) {
        // console.log(`\x1b[32m%s\x1b[0m`, `Auto-assigned ${successCount} role(s) to new member: ${member.user.tag}`);
      }
      
      if (failedRoles.length > 0) {
        // console.error(`\x1b[31m%s\x1b[0m`, `Failed to assign the following roles to ${member.user.tag}: ${failedRoles.join(', ')}`);
      }
    } catch (error) {
      // console.error(`\x1b[31m%s\x1b[0m`, `Error in auto-role assignment for ${member.user.tag}: ${error.message}`);
    }
  }
};

// Helper function to check if a member meets the conditions for a role
async function checkRoleConditions(member, roleData) {
  // If no conditions are set, assign the role
  if (!roleData.conditions || Object.keys(roleData.conditions).length === 0) {
    return true;
  }
  
  // Check each condition
  for (const [conditionType, condition] of Object.entries(roleData.conditions)) {
    const { value, operator } = condition;
    
    switch (conditionType) {
      case 'account_age': {
        const accountAge = getAccountAgeDays(member.user.createdAt);
        const requiredAge = Number(value);
        
        if (!compareValues(accountAge, requiredAge, operator)) {
          return false;
        }
        break;
      }
      
      case 'creation_month': {
        const creationMonth = member.user.createdAt.getMonth() + 1; // JavaScript months are 0-indexed
        const requiredMonth = Number(value);
        
        if (creationMonth !== requiredMonth) {
          return false;
        }
        break;
      }
      
      case 'creation_year': {
        const creationYear = member.user.createdAt.getFullYear();
        const requiredYear = Number(value);
        
        if (!compareValues(creationYear, requiredYear, operator)) {
          return false;
        }
        break;
      }
      
      case 'username_contains': {
        const username = member.user.username.toLowerCase();
        const searchTerm = value.toLowerCase();
        
        if (!username.includes(searchTerm)) {
          return false;
        }
        break;
      }
      
      case 'username_regex': {
        try {
          const regex = new RegExp(value);
          if (!regex.test(member.user.username)) {
            return false;
          }
        } catch (error) {
          return false;
        }
        break;
      }
      
      default:
        // console.warn(`Unknown condition type: ${conditionType}`);
        break;
    }
  }
  
  // If we reached here, the member passed all conditions
  return true;
}

// Helper function to get account age in days
function getAccountAgeDays(createdAt) {
  const now = new Date();
  const diffTime = now - createdAt;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// Helper function to compare values using an operator
function compareValues(value1, value2, operator) {
  switch (operator) {
    case '>': return value1 > value2;
    case '<': return value1 < value2;
    case '=': return value1 === value2;
    case '>=': return value1 >= value2;
    case '<=': return value1 <= value2;
    default: return value1 === value2; // Default to equality
  }
} 