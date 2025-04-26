import { REST, Routes } from 'discord.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const configPath = join(dirname(__dirname), 'config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));

const commands = [];
const commandsPath = join(dirname(__dirname), 'commands');
const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.js'));

console.log(`Started refreshing application (/) commands.`);

for (const file of commandFiles) {
  const filePath = join(commandsPath, file);
  const command = await import(`file://${filePath}`);
  
  if ('data' in command.default && 'execute' in command.default) {
    commands.push(command.default.data.toJSON());
    console.log(`Added command: ${command.default.data.name}`);
  } else {
    console.log(`Command at ${filePath} is missing required properties`);
  }
}

const rest = new REST().setToken(config.token);

const deployCommands = async () => {
  try {
    console.log(`Registering ${commands.length} application commands with Discord API...`);
    
    const data = await rest.put(
      Routes.applicationGuildCommands(config.clientId, config.guildId),
      { body: commands },
    );
    
    console.log(`Successfully registered ${data.length} application commands!`);
  } catch (error) {
    console.error(error);
  }
};

deployCommands();
