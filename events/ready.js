const { initializeDatabase } = require('../database');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    try {
      // Initialize the database
      await initializeDatabase();
      
      // Set bot activity
      client.user.setPresence({
        activities: [{ name: 'Status Bot', type: 0 }], // Type 0 is "Playing"
        status: 'online'
      });
    } catch (error) {
      console.error('Error in ready event:', error);
    }
  }
};
 