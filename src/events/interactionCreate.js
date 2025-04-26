import { Events } from 'discord.js';

export default {
  name: Events.InteractionCreate,
  once: false,
  async execute(interaction) {
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      
      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
      }
      
      console.log(`Executing command: ${interaction.commandName}`);
      await command.execute(interaction);
    } else if (interaction.isButton()) {
      const [type, action, id] = interaction.customId.split(':');
      console.log(`Button interaction: ${type} ${action} ${id}`);
      
      if (type === 'application') {
        const command = interaction.client.commands.get('apply');
        if (command && command.handleButton) {
          await command.handleButton(interaction, action, id);
        }
      } else if (type === 'setup') {
        const command = interaction.client.commands.get('setup');
        if (command && command.handleButton) {
          await command.handleButton(interaction, action, id);
        }
      }
    } else if (interaction.isModalSubmit()) {
      const [type, action, id] = interaction.customId.split(':');
      console.log(`Modal submission: ${type} ${action} ${id}`);
      
      if (type === 'application') {
        const command = interaction.client.commands.get('apply');
        if (command && command.handleModalSubmit) {
          await command.handleModalSubmit(interaction, action, id);
        }
      } else if (type === 'setup') {
        const command = interaction.client.commands.get('setup');
        if (command && command.handleModalSubmit) {
          await command.handleModalSubmit(interaction, action, id);
        }
      }
    }
  },
};
