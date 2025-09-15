// index.js

// ------------------- //
// --- SETUP --- //
// ------------------- //

import { Client, GatewayIntentBits, Partials, Collection } from 'discord.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

// Configure the Discord client with all necessary intents
const client = new Client({
    intents: Object.keys(GatewayIntentBits).map((intent) => GatewayIntentBits[intent]),
    partials: Object.keys(Partials).map((partial) => Partials[partial]),
});

// Configure Google Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" }); // Use the most powerful model

// Get IDs from environment variables
const BOT_TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_ID;

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
        // This prompt instructs the AI to act as a discord.js expert and write code.
        const prompt = `
            You are an expert-level discord.js v14 programmer integrated into a bot.
            The server owner has issued a command. Your task is to write a self-contained,
            asynchronous JavaScript function body to accomplish the user's request.

            You have access to the following variables:
            - 'client': The Discord Client object.
            - 'message': The Message object that triggered the command.
            - 'args': An array of strings representing the command arguments (not used here, parse from the full command).
            
            IMPORTANT RULES:
            1.  Your ENTIRE output must be ONLY the raw JavaScript code for the body of an async function.
            2.  DO NOT wrap your code in \`\`\`javascript ... \`\`\`.
            3.  DO NOT write "async function() { ... }". ONLY provide the code that would go INSIDE the curly brackets.
            4.  The code should be robust. Handle potential errors and edge cases.
            5.  Perform the action directly. Do not ask for confirmation.
            6.  Use the 'message.reply()' method to send a confirmation message back to the owner upon success or failure.
            7.  For bulk actions (e.g., banning multiple users), add a small delay (e.g., 1 second) between actions to avoid hitting API rate limits.

            Owner's Command: "${commandText}"
        `;

        const result = await model.generateContent(prompt);
        const generatedCode = result.response.text();

        console.log(`[AI Generated Code]:\n${generatedCode}`);

        // --- DANGEROUS CODE EXECUTION ---
        // Create an async function from the AI's generated code string and execute it.
        // This is similar to eval() and is the source of the power and danger.
        const dynamicFunction = new Function('client', 'message', `return (async () => { ${generatedCode} })()`);
        
        await dynamicFunction(client, message);

    } catch (error) {
        console.error("[EXECUTION FAILED]:", error);
        await message.reply(`❌ **Execution Error:**\n\`\`\`${error.message}\`\`\``);
    }
});

// --- BOT LOGIN --- //
client.login(BOT_TOKEN);
