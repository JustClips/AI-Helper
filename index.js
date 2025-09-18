// deploy-commands.js
require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

if (!BOT_TOKEN || !CLIENT_ID) {
    console.error("ERROR: DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID is missing.");
    process.exit(1);
}

const commands = [
    new SlashCommandBuilder().setName('verify').setDescription('Begin the server verification process.'),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

(async () => {
    try {
        console.log('Registering /verify command...');
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands },
        );
        console.log('Successfully registered the /verify command.');
    } catch (error) {
        console.error(error);
    }
})();
