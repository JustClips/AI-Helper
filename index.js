require('dotenv').config();
const { Client, GatewayIntentBits, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on('ready', () => {
    console.log(`Linker Bot logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'verify') return;

    const verifyButton = new ButtonBuilder()
        .setLabel('Go to Verification Page')
        .setStyle(ButtonStyle.Link)
        .setURL('https://eps1llon.win/verify'); // This link sends the user to your website

    const row = new ActionRowBuilder().addComponents(verifyButton);

    await interaction.reply({
        content: "Please proceed to our website to complete verification.",
        components: [row],
        ephemeral: true, // Only the user who typed the command can see this
    });
});

client.login(process.env.DISCORD_BOT_TOKEN);
