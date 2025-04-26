import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import config from '../utils/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper function to create application embed based on status
const createApplicationEmbed = (isOpen) => {
  const status = isOpen ? 'open' : 'closed';
  const statusText = isOpen 
    ? 'Applications are currently open! Click the button below to apply.' 
    : 'Applications are currently closed. Please check back later.';
  
  return new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('Staff Applications')
    .setDescription(`We are looking for new staff members!\n\n**Status: ${status.toUpperCase()}**\n${statusText}`)
    .setTimestamp();
};

// Helper function to create button row
const createButtonRow = () => {
  return new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('application:apply:new')
        .setLabel('Apply for Staff')
        .setStyle(ButtonStyle.Primary)
    );
};

export default {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configure the staff application system')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption(option => 
      option.setName('channel')
        .setDescription('The channel where applications will be submitted')
        .setRequired(true))
    .addRoleOption(option => 
      option.setName('staff_role')
        .setDescription('The role that can review applications')
        .setRequired(true))
    .addRoleOption(option => 
      option.setName('admin_role')
        .setDescription('The role that can manage the application system')
        .setRequired(true)),
        
  async execute(interaction) {
    const channel = interaction.options.getChannel('channel');
    const staffRole = interaction.options.getRole('staff_role');
    const adminRole = interaction.options.getRole('admin_role');
    
    await interaction.deferReply({ ephemeral: true });
    
    const newConfig = { ...config };
    newConfig.applicationChannelId = channel.id;
    newConfig.staffRoleId = staffRole.id;
    newConfig.adminRoleId = adminRole.id;
    
    const configPath = join(__dirname, '..', 'config.json');
    await writeFile(configPath, JSON.stringify(newConfig, null, 2));
    
    const setupEmbed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('Staff Application Setup')
      .setDescription('The staff application system is ready! Use the buttons below to customize questions or create an application message.')
      .addFields(
        { name: 'Application Channel', value: `<#${channel.id}>`, inline: true },
        { name: 'Staff Role', value: `<@&${staffRole.id}>`, inline: true },
        { name: 'Admin Role', value: `<@&${adminRole.id}>`, inline: true }
      )
      .setTimestamp();
    
    const buttons = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('setup:questions:new')
          .setLabel('Customize Questions')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('setup:message:create')
          .setLabel('Create Application Message')
          .setStyle(ButtonStyle.Success)
      );
    
    await interaction.editReply({ embeds: [setupEmbed], components: [buttons] });
  },
  
  async handleButton(interaction, action, id) {
    if (action === 'questions') {
      const modal = new ModalBuilder()
        .setCustomId(`setup:questions:submit`)
        .setTitle('Customize Application Questions');
      
      const questionInputs = [];
      
      for (let i = 0; i < 5; i++) {
        const questionNumber = i + 1;
        const defaultQuestion = config.defaultQuestions[i] || '';
        
        questionInputs.push(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(`question_${questionNumber}`)
              .setLabel(`Question ${questionNumber}`)
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder('Enter your question here')
              .setValue(defaultQuestion)
              .setRequired(i < 3)
          )
        );
      }
      
      modal.addComponents(...questionInputs);
      await interaction.showModal(modal);
    } else if (action === 'message') {
      const embed = createApplicationEmbed(config.applicationsOpen);
      const button = createButtonRow();
      
      const channel = await interaction.guild.channels.fetch(config.applicationChannelId);
      const message = await channel.send({ embeds: [embed], components: [button] });
      
      const newConfig = { ...config };
      newConfig.applicationMessageId = message.id;
      const configPath = join(__dirname, '..', 'config.json');
      await writeFile(configPath, JSON.stringify(newConfig, null, 2));
      
      await interaction.reply({ content: 'Application message created successfully!', ephemeral: true });
    }
  },
  
  async handleModalSubmit(interaction, action, id) {
    if (action === 'questions') {
      const questions = [];
      
      for (let i = 1; i <= 5; i++) {
        const question = interaction.fields.getTextInputValue(`question_${i}`);
        if (question.trim()) {
          questions.push(question.trim());
        }
      }
      
      const newConfig = { ...config };
      newConfig.defaultQuestions = questions;
      
      const configPath = join(__dirname, '..', 'config.json');
      await writeFile(configPath, JSON.stringify(newConfig, null, 2));
      
      await interaction.reply({ 
        content: `Application questions updated!\n\n${questions.map((q, i) => `${i+1}. ${q}`).join('\n')}`, 
        ephemeral: true 
      });
    }
  }
};
