const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getApplicationsStatus, getApplicationChannel, saveApplication, getApplication } = require('../database');

module.exports = {
  name: 'interactionCreate',
  once: false,
  async execute(client, interaction) {
    try {
      // Handle autocomplete interactions
      if (interaction.isAutocomplete()) {
        const command = client.commandRegistry.commands.get(interaction.commandName);
        
        if (!command) {
          console.error(`No command matching ${interaction.commandName} was found.`);
          return;
        }
        
        if (!command.autocomplete) {
          console.error(`Command ${interaction.commandName} doesn't have an autocomplete function.`);
          return;
        }
        
        try {
          await command.autocomplete(interaction);
        } catch (error) {
          console.error(`Error in autocomplete for ${interaction.commandName}:`, error);
        }
        return;
      }
      
      // Handle button interactions
      if (interaction.isButton()) {
        // Handle the apply button click
        if (interaction.customId === 'apply_button') {
          try {
            // Check if applications are open
            const isOpen = await getApplicationsStatus();
            if (!isOpen) {
              return interaction.reply({ 
                content: '❌ Staff applications are currently closed.',
                ephemeral: true 
              });
            }
            
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
                
                return interaction.reply({
                  content: 'Your previous application was denied. Are you sure you want to apply again?',
                  components: [row],
                  ephemeral: true
                });
              }
            }
            
            // Instead of executing the apply command, we'll directly show the modal
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
          } catch (error) {
            console.error('Error executing apply button handler:', error);
            try {
              await interaction.reply({
                content: '❌ Error processing your application. Please try using the `/apply` command instead.',
                ephemeral: true
              }).catch(console.error);
            } catch (replyError) {
              console.error('Error replying to interaction:', replyError);
            }
          }
          return;
        }
        
        // Handle reapply confirmation buttons
        if (interaction.customId === 'confirm_reapply') {
          try {
            // User confirmed reapplying - show the modal
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

            // Show the modal to the user without updating first
            await interaction.showModal(modal);
          } catch (error) {
            console.error('Error handling confirm_reapply:', error);
            try {
              // Only try to respond if we haven't already
              if (!interaction.replied) {
                await interaction.reply({
                  content: '❌ An error occurred. Please try the `/apply` command instead.',
                  ephemeral: true
                });
              }
            } catch (updateError) {
              console.error('Error updating interaction:', updateError);
            }
          }
          return;
        }
        
        if (interaction.customId === 'cancel_reapply') {
          try {
            // Only update if we haven't replied yet
            if (!interaction.replied) {
              await interaction.update({
                content: 'Application cancelled.',
                components: []
              });
            }
          } catch (error) {
            console.error('Error handling cancel_reapply:', error);
          }
          return;
        }
        
        // Handle other button interactions based on their customId
        if (interaction.customId.startsWith('approve_application_') || 
            interaction.customId.startsWith('deny_application_')) {
          try {
            // Extract the user ID from the button customId
            const userId = interaction.customId.startsWith('approve_application_')
              ? interaction.customId.replace('approve_application_', '')
              : interaction.customId.replace('deny_application_', '');
            
            // Get the application from database
            const application = await getApplication(userId);
            if (!application) {
              return await interaction.reply({
                content: '❌ Application not found. It may have been deleted or processed already.',
                ephemeral: true
              });
            }
            
            // Check if application is already processed
            if (application.status !== 'pending') {
              return await interaction.reply({
                content: `❌ This application has already been ${application.status}.`,
                ephemeral: true
              });
            }
            
            // Determine if approving or denying
            const isApproving = interaction.customId.startsWith('approve_application_');
            const newStatus = isApproving ? 'approved' : 'denied';
            
            // Update the application status in the database
            const { processApplicationDecision } = require('../database');
            await processApplicationDecision(userId, newStatus, isApproving);
            
            // Update the message to show it's been processed
            const messageEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
            messageEmbed.setColor(isApproving ? 0x00FF00 : 0xFF0000);
            messageEmbed.addFields({ name: 'Status', value: newStatus.toUpperCase() });
            messageEmbed.addFields({ 
              name: 'Processed By', 
              value: `${interaction.user.tag} (${interaction.user.id})` 
            });
            
            const disabledRow = new ActionRowBuilder()
              .addComponents(
                ButtonBuilder.from(interaction.message.components[0].components[0])
                  .setDisabled(true),
                ButtonBuilder.from(interaction.message.components[0].components[1])
                  .setDisabled(true)
              );
            
            await interaction.update({
              embeds: [messageEmbed],
              components: [disabledRow]
            });
            
            // Notify the applicant
            try {
              const applicant = await interaction.client.users.fetch(userId);
              if (applicant) {
                if (isApproving) {
                  // New Q&A logic for approved applicants
                  const questions = [
                    "Why do you want to be a part of the team?",
                    "What timezone are you in?",
                    "What is your email?"
                  ];
                  let answers = [];
                  let dmChannel;

                  try {
                    dmChannel = await applicant.createDM();
                  } catch (dmError) {
                    console.error('Failed to create DM channel with applicant:', dmError);
                    // Optionally, send a message to a staff channel about the failure
                    const appChannelId = await getApplicationChannel(); // Using existing application channel
                    if (appChannelId) {
                      const appChannel = interaction.guild.channels.cache.get(appChannelId);
                      if (appChannel) {
                        appChannel.send(`⚠️ Could not DM applicant ${applicant.tag} (${applicant.id}) after approval. Their DMs might be closed. Please follow up manually.`).catch(console.error);
                      }
                    }
                    // Fallback to old approval message in this case if DM fails to open
                    await applicant.send({
                      content: '✅ Congratulations! Your staff application has been approved. We tried to ask some follow-up questions via DM but failed. Please check the server for more information or contact a staff member.'
                    }).catch(err => console.error('Failed to send fallback DM to applicant:', err));
                    return; // Stop further processing for this applicant
                  }

                  for (let i = 0; i < questions.length; i++) {
                    await dmChannel.send(questions[i]);
                    try {
                      const filter = m => m.author.id === applicant.id;
                      const collected = await dmChannel.awaitMessages({ filter, max: 1, time: 300000, errors: ['time'] }); // 5 minute timeout per question
                      answers.push(collected.first().content);
                    } catch (error) {
                      await dmChannel.send("You didn't respond in time. Please contact a staff member to complete your onboarding.").catch(console.error);
                      // Notify staff channel about timeout
                      const appChannelId = await getApplicationChannel();
                       if (appChannelId) {
                         const appChannel = interaction.guild.channels.cache.get(appChannelId);
                         if (appChannel) {
                            let unansweredQuestion = questions[i];
                            let answeredSoFar = "";
                            if (answers.length > 0) {
                                answeredSoFar = "\n\nAnswered so far:\n";
                                for(let j=0; j < answers.length; j++) {
                                    answeredSoFar += `**${questions[j]}**\n${answers[j]}\n`;
                                }
                            }
                           appChannel.send(`⚠️ Applicant ${applicant.tag} (${applicant.id}) did not respond to the question: "${unansweredQuestion}" in DMs.${answeredSoFar}\nPlease follow up manually.`).catch(console.error);
                         }
                       }
                      return; // Stop asking further questions
                    }
                  }

                  // Post answers to staff channel
                  const appChannelId = await getApplicationChannel(); // Using existing application channel
                  if (appChannelId) {
                    const appChannel = interaction.guild.channels.cache.get(appChannelId);
                    if (appChannel) {
                      const responsesEmbed = new EmbedBuilder()
                        .setTitle(`Staff Application Q&A - ${applicant.tag}`)
                        .setColor(0x00FF00) // Green for approved
                        .setAuthor({ name: applicant.tag, iconURL: applicant.displayAvatarURL({ dynamic: true }) })
                        .addFields(
                          questions.map((q, index) => ({ name: q, value: answers[index] || '_No response_' }))
                        )
                        .setFooter({ text: `Applicant ID: ${applicant.id}` })
                        .setTimestamp();
                      await appChannel.send({ embeds: [responsesEmbed] });
                      await dmChannel.send("✅ Thank you for your answers! We have received them and a staff member will be in touch if needed.").catch(console.error);
                    } else {
                      console.error('Could not find application channel to post Q&A results.');
                      await dmChannel.send("I've collected your answers, but there was an issue posting them. A staff member will follow up.").catch(console.error);
                    }
                  } else {
                     console.error('Application channel ID not configured for Q&A results.');
                     await dmChannel.send("I've collected your answers, but the staff channel for results is not configured. A staff member will follow up.").catch(console.error);
                  }

                } else {
                  // Existing denial logic
                  await applicant.send({
                    content: '❌ We regret to inform you that your staff application has been denied at this time. You may reapply in the future if you wish.'
                  }).catch(err => console.error('Failed to DM applicant about denial:', err));
                }
              }
            } catch (error) {
              console.error('Error notifying applicant:', error);
              // Only reply if we haven't already replied
              if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                  content: '❌ An error occurred while processing this application.',
                  ephemeral: true
                });
              }
            }
          } catch (error) {
            console.error('Error processing application:', error);
            // Only reply if we haven't already replied
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({
                content: '❌ An error occurred while processing this application.',
                ephemeral: true
              });
            }
          }
          return;
        }
        
        if (interaction.customId.startsWith('confirm_') ||
            interaction.customId.startsWith('cancel_')) {
          // Handle confirmation buttons for applications
          if (interaction.customId.startsWith('confirm_clear_') || 
              interaction.customId === 'cancel_clear') {
            
            try {
              if (interaction.customId === 'cancel_clear') {
                return await interaction.update({
                  content: 'Operation cancelled.',
                  components: []
                });
              }
              
              // Extract status or user ID
              let status = null;
              let userId = null;
              const customId = interaction.customId;
              
              if (customId.startsWith('confirm_clear_user_')) {
                userId = customId.replace('confirm_clear_user_', '');
              } else {
                status = customId.replace('confirm_clear_', '');
              }
              
              // Get database function
              const { clearApplications, clearUserApplication } = require('../database');
              
              // Process the clear operation
              let result;
              let message;
              
              if (userId) {
                result = await clearUserApplication(userId);
                message = '✅ User application cleared successfully.';
              } else {
                result = await clearApplications(status);
                message = `✅ Cleared ${result} ${status === 'all' ? 'approved and denied' : status} application(s).`;
              }
              
              // Update the original message
              await interaction.update({
                content: message,
                components: []
              });
            } catch (error) {
              console.error('Error handling application clear button:', error);
              
              // Only try to respond if we haven't already
              if (!interaction.replied) {
                await interaction.update({
                  content: '❌ An error occurred while clearing applications.',
                  components: []
                }).catch(err => console.error('Error sending update after button error:', err));
              }
            }
            return;
          }
          
          // Handle confirmation buttons for application removal
          if (interaction.customId.startsWith('confirm_remove_') || 
              interaction.customId === 'cancel_remove') {
            
            try {
              if (interaction.customId === 'cancel_remove') {
                return await interaction.update({
                  content: 'Operation cancelled.',
                  components: []
                });
              }
              
              // Extract user ID
              const userId = interaction.customId.replace('confirm_remove_', '');
              
              // Get database function
              const { clearUserApplication } = require('../database');
              
              // Remove the application
              await clearUserApplication(userId);
              
              // Update the original message
              await interaction.update({
                content: '✅ Application removed successfully.',
                components: []
              });
            } catch (error) {
              console.error('Error handling application remove button:', error);
              
              // Only try to respond if we haven't already
              if (!interaction.replied) {
                await interaction.update({
                  content: '❌ An error occurred while removing the application.',
                  components: []
                }).catch(err => console.error('Error sending update after button error:', err));
              }
            }
            return;
          }
          
          // Let original collectors handle other confirm/cancel buttons
          return;
        }
        
        // Handle unrecognized buttons
        await interaction.reply({
          content: '❌ This button interaction is not currently supported.',
          ephemeral: true
        }).catch(console.error);
        return;
      }
      
      // Handle command interactions
      if (interaction.isCommand()) {
        // The client has the CommandRegistry attached in main index.js
        if (client.commandRegistry) {
          await client.commandRegistry.handleCommand(interaction);
        } else {
          console.error(`\x1b[31m%s\x1b[0m`, 'Command registry not initialized');
        }
      }
      
      // Handle modal submissions
      if (interaction.isModalSubmit() && interaction.customId === 'staffApplicationModal') {
        try {
          // Get values from modal
          const name = interaction.fields.getTextInputValue('nameInput').trim();
          const age = interaction.fields.getTextInputValue('ageInput').trim();
          const experience = interaction.fields.getTextInputValue('experienceInput').trim();
          const why = interaction.fields.getTextInputValue('whyInput').trim();
          const availability = interaction.fields.getTextInputValue('availabilityInput').trim();
          
          // Validate age input is a number
          if (isNaN(age) || parseInt(age) <= 0) {
            return interaction.reply({ 
              content: '❌ Please enter a valid number for your age.',
              ephemeral: true 
            });
          }
          
          // Get application channel
          const channelId = await getApplicationChannel();
          const channel = interaction.guild.channels.cache.get(channelId);
          
          if (!channel) {
            return interaction.reply({ 
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
          await interaction.reply({ 
            content: '✅ Your application has been submitted successfully! You will be notified once it has been reviewed.',
            ephemeral: true 
          });
        } catch (error) {
          console.error('Error processing modal submission:', error);
          try {
            await interaction.reply({ 
              content: '❌ An error occurred while submitting your application. Please try again later.',
              ephemeral: true 
            });
          } catch (replyError) {
            console.error('Error replying to modal submission:', replyError);
          }
        }
      }
    } catch (error) {
      console.error(`\x1b[31m%s\x1b[0m`, 'Error handling interaction:', error);
      
      // Respond to the interaction if it hasn't been already
      if (!interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({
            content: 'There was an error while processing this interaction.',
            ephemeral: true
          });
        } catch (replyError) {
          console.error('Failed to send error response:', replyError);
        }
      }
    }
  }
}; 