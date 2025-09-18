require('dotenv').config();
const { Client, GatewayIntentBits, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');

// These are the environment variables this bot needs from Railway
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const WEBSITE_VERIFY_URL = 'https://eps1llon.win/verify'; // The page on your website

// This check makes sure the bot won't crash if the token is missing.
if (!BOT_TOKEN) {
    console.error("FATAL ERROR: DISCORD_BOT_TOKEN is missing from your environment variables. The bot cannot start.");
    process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// This event runs once, after the bot successfully logs in.
client.on('ready', () => {
    console.log(`✅ Bot has logged in successfully as ${client.user.tag}`);
});

// This event runs every time someone uses a command.
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
        ephemeral: true, // This makes the message only visible to the user who used the command
    });
});

// This is the most important line. It tells the bot to log in and stay connected.
client.login(BOT_TOKEN);
