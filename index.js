require('dotenv').config();
const { Client, GatewayIntentBits, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

// These are the only two variables this bot needs from Railway
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const WEBSITE_VERIFY_URL = 'https://eps1llon.win/verify'; // The page on your website

if (!BOT_TOKEN) {
    console.error("FATAL ERROR: DISCORD_BOT_TOKEN is missing. The bot cannot start.");
    process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on('ready', () => {
    console.log(`✅ Bot has logged in successfully as ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
    // We only care about the /verify slash command
    if (!interaction.isChatInputCommand() || interaction.commandName !== 'verify') {
        return;
    }

    // Create the button that links to your website
    const verifyButton = new ButtonBuilder()
        .setLabel('Go to Verification Page')
        .setStyle(ButtonStyle.Link)
        .setURL(WEBSITE_VERIFY_URL);

    const row = new ActionRowBuilder().addComponents(verifyButton);

    // Reply to the user with the button
    await interaction.reply({
        content: "Please click the button below to proceed to our website and complete verification.",
        components: [row],
        ephemeral: true, // This makes the message only visible to the person who used the command
    });
});

client.login(BOT_TOKEN);
