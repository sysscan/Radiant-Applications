const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getApplicationsStatus, getApplicationChannel, getStaffRole, getAdminRole, saveApplication, getApplication } = require('../database');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('apply')
    .setDescription('Apply for a staff position'),
  
  async execute(interaction, config) {
    try {
      // Check if user has already applied
      const existingApplication = await getApplication(interaction.user.id);
      if (existingApplication) {
        // Check status of existing application
        if (existingApplication.status === 'pending') {
          return interaction.reply({ 
            content: '❌ You already have a pending application. Please wait for a response before applying again.',
            ephemeral: true 
          });
        } else if (existingApplication.status === 'approved') {
          return interaction.reply({ 
            content: '✅ Your application has already been approved. You are already a staff member!',
            ephemeral: true 
          });
        } else if (existingApplication.status === 'denied') {
          // Ask for confirmation if they want to reapply after being denied
          const confirmButton = new ButtonBuilder()
            .setCustomId('confirm_reapply')
            .setLabel('Yes, reapply')
            .setStyle(ButtonStyle.Primary);
          
          const cancelButton = new ButtonBuilder()
            .setCustomId('cancel_reapply')
            .setLabel('No, cancel')
            .setStyle(ButtonStyle.Secondary);
          
          const row = new ActionRowBuilder()
            .addComponents(confirmButton, cancelButton);
          
          const response = await interaction.reply({
            content: 'Your previous application was denied. Are you sure you want to apply again?',
            components: [row],
            ephemeral: true,
            fetchReply: true
          });
          
          // Create a collector to listen for button clicks
          const filter = i => i.user.id === interaction.user.id;
          try {
            const confirmation = await response.awaitMessageComponent({ filter, time: 60000 });
            
            if (confirmation.customId === 'cancel_reapply') {
              return confirmation.update({
                content: 'Application cancelled.',
                components: [],
              });
            }
            
            // If confirmed, continue with the application process
            await confirmation.update({
              content: 'Preparing your application form...',
              components: [],
            });
          } catch (error) {
            // Timeout handling
            return interaction.editReply({
              content: 'Confirmation timed out. Please try again if you want to reapply.',
              components: [],
            });
          }
        }
        // If denied and confirmed, they can apply again - continue with the process
      }
      
      // Check if applications are open
      const isOpen = await getApplicationsStatus();
      if (!isOpen) {
        return interaction.reply({ 
          content: '❌ Staff applications are currently closed.',
          ephemeral: true 
        });
      }

      // Create the modal
      const modal = new ModalBuilder()
        .setCustomId('staffApplicationModal')
        .setTitle('Staff Application');

      // Create the text input components
      const nameInput = new TextInputBuilder()
        .setCustomId('nameInput')
        .setLabel('What is your name/nickname?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50);

      const ageInput = new TextInputBuilder()
        .setCustomId('ageInput')
        .setLabel('How old are you?')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(3)
        .setPlaceholder('Enter a number');

      const experienceInput = new TextInputBuilder()
        .setCustomId('experienceInput')
        .setLabel('Do you have previous staff experience?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder('Please describe any relevant experience you have')
        .setMaxLength(1000);

      const whyInput = new TextInputBuilder()
        .setCustomId('whyInput')
        .setLabel('Why do you want to join our staff team?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

      const availabilityInput = new TextInputBuilder()
        .setCustomId('availabilityInput')
        .setLabel('What is your availability?')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder('How many hours per week can you dedicate? What timezone are you in?')
        .setMaxLength(1000);

      // Add inputs to the modal
      const firstActionRow = new ActionRowBuilder().addComponents(nameInput);
      const secondActionRow = new ActionRowBuilder().addComponents(ageInput);
      const thirdActionRow = new ActionRowBuilder().addComponents(experienceInput);
      const fourthActionRow = new ActionRowBuilder().addComponents(whyInput);
      const fifthActionRow = new ActionRowBuilder().addComponents(availabilityInput);

      modal.addComponents(firstActionRow, secondActionRow, thirdActionRow, fourthActionRow, fifthActionRow);

      // Show the modal to the user
      await interaction.showModal(modal);
      
      // Inform the user about timeout
      const timeoutWarning = setTimeout(async () => {
        try {
          // Check if interaction is already replied - if so, the modal was submitted
          if (!interaction.replied && !interaction.deferred) {
            await interaction.followUp({
              content: '⏰ Just a reminder: Your application form is still open. You have 5 more minutes to submit it before it expires.',
              ephemeral: true
            }).catch(() => {}); // Ignore errors if the interaction has expired
          }
        } catch (error) {
          console.error('Error sending timeout warning:', error);
        }
      }, 300000); // 5 minute warning

      // Wait for modal submission
      const filter = i => i.customId === 'staffApplicationModal' && i.user.id === interaction.user.id;
      
      try {
        const modalSubmission = await interaction.awaitModalSubmit({ filter, time: 600000 }); // 10 minute timeout
        
        // Clear the timeout
        clearTimeout(timeoutWarning);
        
        // Get values from modal
        const name = modalSubmission.fields.getTextInputValue('nameInput').trim();
        const age = modalSubmission.fields.getTextInputValue('ageInput').trim();
        const experience = modalSubmission.fields.getTextInputValue('experienceInput').trim();
        const why = modalSubmission.fields.getTextInputValue('whyInput').trim();
        const availability = modalSubmission.fields.getTextInputValue('availabilityInput').trim();
        
        // Validate age input is a number
        if (isNaN(age) || parseInt(age) <= 0) {
          return modalSubmission.reply({ 
            content: '❌ Please enter a valid number for your age.',
            ephemeral: true 
          });
        }
        
        // Get application channel
        const channelId = await getApplicationChannel();
        const channel = interaction.guild.channels.cache.get(channelId);
        
        if (!channel) {
          return modalSubmission.reply({ 
            content: '❌ The application system is not properly configured. Please contact an administrator.',
            ephemeral: true 
          });
        }
        
        // Create and send application embed
        const applicationEmbed = new EmbedBuilder()
          .setTitle('New Staff Application')
          .setAuthor({ 
            name: interaction.user.tag, 
            iconURL: interaction.user.displayAvatarURL({ dynamic: true }) 
          })
          .setColor(0x3498DB)
          .addFields(
            { name: 'Name', value: name },
            { name: 'Age', value: age },
            { name: 'Experience', value: experience },
            { name: 'Why They Want to Join', value: why },
            { name: 'Availability', value: availability },
            { name: 'Discord ID', value: interaction.user.id }
          )
          .setFooter({ text: `Application ID: ${interaction.user.id}` })
          .setTimestamp();
        
        // Create approve/deny buttons
        const approveButton = new ButtonBuilder()
          .setCustomId(`approve_application_${interaction.user.id}`)
          .setLabel('Approve')
          .setStyle(ButtonStyle.Success);
        
        const denyButton = new ButtonBuilder()
          .setCustomId(`deny_application_${interaction.user.id}`)
          .setLabel('Deny')
          .setStyle(ButtonStyle.Danger);
        
        const buttonRow = new ActionRowBuilder()
          .addComponents(approveButton, denyButton);
        
        // Send application to staff channel
        const applicationMessage = await channel.send({ 
          embeds: [applicationEmbed],
          components: [buttonRow]
        }).catch(error => {
          console.error('Error sending application to channel:', error);
          throw new Error('Failed to send application to staff channel.');
        });
        
        // Save application to database
        await saveApplication({
          userId: interaction.user.id,
          username: interaction.user.tag,
          name,
          age,
          experience,
          why,
          availability,
          timestamp: new Date().toISOString(),
          messageId: applicationMessage.id,
          status: 'pending'
        });
        
        // Confirm to the user
        await modalSubmission.reply({ 
          content: '✅ Your application has been submitted successfully! You will be notified once it has been reviewed.',
          ephemeral: true 
        });
        
      } catch (error) {
        // Clear the timeout
        clearTimeout(timeoutWarning);
        
        if (error.code === 'InteractionCollectorError') {
          // Modal timed out
          try {
            await interaction.followUp({ 
              content: '⏰ Your application form has expired. Please use the `/apply` command again if you wish to continue.',
              ephemeral: true 
            }).catch(() => {}); // Ignore errors if the interaction has expired
          } catch (e) {
            console.error('Error sending timeout message:', e);
          }
          return;
        }
        console.error(error);
        try {
          await interaction.followUp({ 
            content: '❌ An error occurred while submitting your application. Please try again later.',
            ephemeral: true 
          });
        } catch (e) {
          console.error('Error sending error reply:', e);
        }
      }
      
    } catch (error) {
      console.error(error);
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ 
          content: '❌ An error occurred while processing your application. Please try again later.',
          ephemeral: true 
        });
      } else {
        await interaction.reply({ 
          content: '❌ An error occurred while processing your application. Please try again later.',
          ephemeral: true 
        });
      }
    }
  }
}; 