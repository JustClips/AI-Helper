// index.js

// ------------------- //
// --- SETUP --- //
// ------------------- //

import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

// Get IDs from environment variables
const BOT_TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// --- ✅ NEW: Pre-flight Environment Variable Check ---
// Checks if all required secrets are provided before starting the bot.
if (!BOT_TOKEN || !OWNER_ID || !GEMINI_API_KEY) {
    console.error("❌ FATAL ERROR: Missing one or more required environment variables (DISCORD_TOKEN, OWNER_ID, GEMINI_API_KEY).");
    process.exit(1); // Stop the bot
}

// Configure the Discord client with all necessary intents
const client = new Client({
    intents: Object.keys(GatewayIntentBits).map((intent) => GatewayIntentBits[intent]),
    partials: Object.keys(Partials).map((partial) => Partials[partial]),
});

// Configure Google Gemini AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });


// ----------------------------- //
// --- BOT EVENT LISTENERS --- //
// ----------------------------- //

client.on('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);
    console.log(`☢️  GOD MODE ENGAGED. Listening exclusively for owner: ${OWNER_ID}`);
});

client.on('messageCreate', async (message) => {
    // We only listen to the owner. No one else. Not even ourselves.
    if (message.author.id !== OWNER_ID || !message.guild) return;

    // Command must start by pinging the bot
    if (!message.mentions.has(client.user.id)) return;

    const commandText = message.content.replace(/<@!?\d+>/g, '').trim();
    if (!commandText) return;

    console.log(`[Owner Command Received]: ${commandText}`);
    await message.channel.sendTyping();

    try {
        // --- THE DYNAMIC CODE GENERATION PROMPT ---
        const prompt = `
            You are an expert-level discord.js v14 programmer integrated into a bot.
            The server owner has issued a command. Your task is to write a self-contained,
            asynchronous JavaScript function body to accomplish the user's request.
            The current date and time is ${new Date().toString()}.

            You have access to the following variables:
            - 'client': The Discord Client object.
            - 'message': The Message object that triggered the command.
            
            IMPORTANT RULES:
            1.  Your ENTIRE output must be ONLY the raw JavaScript code for the body of an async function.
            2.  DO NOT wrap your code in \`\`\`javascript ... \`\`\`.
            3.  DO NOT write "async function() { ... }". ONLY provide the code that would go INSIDE the curly brackets.
            4.  The code should be robust. Handle potential errors and edge cases.
            5.  Perform the action directly. Do not ask for confirmation.
            6.  Use 'message.reply()' to send a confirmation message back to the owner upon success or failure.
            7.  For bulk actions (e.g., banning multiple users), add a small delay (e.g., 1 second) between actions to avoid hitting API rate limits.
            8.  When possible, prefer using IDs over names for users, roles, and channels to ensure accuracy.

            Owner's Command: "${commandText}"
        `;

        const result = await model.generateContent(prompt);
        // --- ✅ NEW: Sanitize the AI's response to remove markdown code blocks ---
        const generatedCode = result.response.text().replace(/^```(javascript|js)?\n|```$/g, "");

        console.log(`[AI Generated Code]:\n${generatedCode}`);

        // --- DANGEROUS CODE EXECUTION ---
        // This creates and executes an async function from the AI's generated code string.
        // This is the source of the bot's power and its danger.
        const dynamicFunction = new Function('client', 'message', `return (async () => { ${generatedCode} })()`);
        
        await dynamicFunction(client, message);

    } catch (error) {
        // --- ✅ NEW: Improved Error Logging ---
        console.error(`[EXECUTION FAILED for command: "${commandText}"]`, error);
        await message.reply(`❌ **Execution Error:**\n\`\`\`${error.message}\`\`\``);
    }
});

// --- BOT LOGIN --- //
client.login(BOT_TOKEN);
