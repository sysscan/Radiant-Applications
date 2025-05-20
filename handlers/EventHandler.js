const fs = require('fs');
const path = require('path');

/**
 * EventHandler - Handles Discord.js event registration and loading
 */
class EventHandler {
  constructor(client) {
    this.client = client;
    this.events = new Map();
    
    // Bind methods to ensure proper 'this' context
    this.loadEvents = this.loadEvents.bind(this);
    this.registerEvent = this.registerEvent.bind(this);
  }

  /**
   * Load all events from a directory and its subdirectories
   * @param {string} directory - The directory to load events from
   * @returns {Promise<number>} - The number of events loaded
   */
  async loadEvents(directory) {
    let eventCount = 0;
    
    try {
      // Get all files in the directory
      const items = fs.readdirSync(directory);
      
      for (const item of items) {
        const itemPath = path.join(directory, item);
        const stats = fs.statSync(itemPath);
        
        if (stats.isDirectory()) {
          // Recursively load events from subdirectories
          eventCount += await this.loadEvents(itemPath);
        } else if (item.endsWith('.js')) {
          try {
            // Load the event module
            const event = require(itemPath);
            
            // Register the event
            this.registerEvent(event);
            eventCount++;
          } catch (error) {
            // No console.log statements here
          }
        }
      }
      
      return eventCount;
    } catch (error) {
      return eventCount;
    }
  }

  /**
   * Register an event with the client
   * @param {Object} event - The event module to register
   */
  registerEvent(event) {
    // Store in map for reference
    this.events.set(event.name, event);
    
    if (event.once) {
      this.client.once(event.name, (...args) => this.handleEvent(event, ...args));
    } else {
      this.client.on(event.name, (...args) => this.handleEvent(event, ...args));
    }
  }

  /**
   * Handle an event invocation
   * @param {Object} event - Event object
   * @param {...any} args - Event arguments
   */
  async handleEvent(event, ...args) {
    try {
      await event.execute(this.client, ...args);
    } catch (error) {
      // No console.log statements here
    }
  }
}

module.exports = EventHandler; 