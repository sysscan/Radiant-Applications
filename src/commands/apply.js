import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import config from '../config.json' assert { type: 'json' };

export default {
  data: new SlashCommandBuilder()
    .setName('apply')
    .setDescription('Apply for a staff position'),
    
  async execute(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('application:submit:new')
      .setTitle('Staff Application');
    
    const inputs = config.defaultQuestions.slice(0, 5).map((question, index) => {
      return new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(`question_${index}`)
          .setLabel(question.length > 45 ? `${question.slice(0, 42)}...` : question)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('Your answer here')
      );
    });
    
    modal.addComponents(...inputs);
    await interaction.showModal(modal);
  },
  
  async handleButton(interaction, action, id) {
    if (action === 'apply') {
      await this.execute(interaction);
    } else if (action === 'approve' || action === 'deny') {
      if (!interaction.member.roles.cache.has(config.staffRoleId) && 
          !interaction.member.roles.cache.has(config.adminRoleId)) {
        await interaction.reply({ content: 'You do not have permission to review applications.', ephemeral: true });
        return;
      }
      
      const messageId = id;
      const message = await interaction.channel.messages.fetch(messageId);
      
      if (!message) {
        await interaction.reply({ content: 'This application no longer exists.', ephemeral: true });
        return;
      }
      
      const userId = message.embeds[0]?.footer?.text.split(': ')[1];
      if (!userId) {
        await interaction.reply({ content: 'Could not determine the applicant.', ephemeral: true });
        return;
      }
      
      const result = action === 'approve' ? 'Approved' : 'Denied';
      const color = action === 'approve' ? '#00FF00' : '#FF0000';
      
      const originalEmbed = message.embeds[0];
      const updatedEmbed = EmbedBuilder.from(originalEmbed)
        .setColor(color)
        .setTitle(`Staff Application - ${result}`)
        .addFields({ name: 'Reviewed By', value: `<@${interaction.user.id}>`, inline: true });
      
      const disabledButtons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`application:approve:${messageId}`)
            .setLabel('Approve')
            .setStyle(ButtonStyle.Success)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`application:deny:${messageId}`)
            .setLabel('Deny')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true)
        );
      
      await message.edit({ embeds: [updatedEmbed], components: [disabledButtons] });
      
      try {
        const user = await interaction.client.users.fetch(userId);
        const resultEmbed = new EmbedBuilder()
          .setColor(color)
          .setTitle(`Application ${result}`)
          .setDescription(`Your staff application has been ${result.toLowerCase()}.${action === 'approve' ? ' Congratulations!' : ''}`)
          .setTimestamp();
        
        await user.send({ embeds: [resultEmbed] });
      } catch (error) {
        console.error(`Could not DM user ${userId}:`, error);
      }
      
      await interaction.reply({ content: `Application ${result.toLowerCase()} successfully.`, ephemeral: true });
    }
  },
  
  async handleModalSubmit(interaction, action, id) {
    if (action === 'submit') {
      await interaction.deferReply({ ephemeral: true });
      
      const responses = [];
      for (let i = 0; i < config.defaultQuestions.length; i++) {
        try {
          const response = interaction.fields.getTextInputValue(`question_${i}`);
          if (response) {
            responses.push({
              question: config.defaultQuestions[i],
              answer: response
            });
          }
        } catch (error) {
          break;
        }
      }
      
      const applicationEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('Staff Application')
        .setDescription(`From <@${interaction.user.id}>`)
        .setTimestamp()
        .setFooter({ text: `Applicant ID: ${interaction.user.id}` });
      
      responses.forEach(({ question, answer }) => {
        applicationEmbed.addFields({ name: question, value: answer });
      });
      
      const buttons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`application:approve:MESSAGE_ID_PLACEHOLDER`)
            .setLabel('Approve')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`application:deny:MESSAGE_ID_PLACEHOLDER`)
            .setLabel('Deny')
            .setStyle(ButtonStyle.Danger)
        );
      
      const channel = await interaction.guild.channels.fetch(config.applicationChannelId);
      const message = await channel.send({ embeds: [applicationEmbed], components: [buttons] });
      
      const updatedButtons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`application:approve:${message.id}`)
            .setLabel('Approve')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`application:deny:${message.id}`)
            .setLabel('Deny')
            .setStyle(ButtonStyle.Danger)
        );
      
      await message.edit({ components: [updatedButtons] });
      
      await interaction.editReply({ 
        content: 'Your application has been submitted! You will be notified once it has been reviewed.', 
        ephemeral: true 
      });
    }
  }
};
