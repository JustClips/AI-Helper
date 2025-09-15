// index.js

// ------------------- //
// --- SETUP --- //
// ------------------- //

import Discord, { Client, GatewayIntentBits, Partials } from 'discord.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import 'dotenv/config';

// Get IDs from environment variables
const BOT_TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_ID;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Pre-flight Environment Variable Check
if (!BOT_TOKEN || !OWNER_ID || !GEMINI_API_KEY) {
    console.error("❌ FATAL ERROR: Missing required environment variables (DISCORD_TOKEN, OWNER_ID, GEMINI_API_KEY).");
    process.exit(1);
}

// Configure the Discord client
const client = new Client({
    intents: Object.keys(GatewayIntentBits).map((intent) => GatewayIntentBits[intent]),
    partials: Object.keys(Partials).map((partial) => Partials[partial]),
});

// Configure Google Gemini AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

// In-memory store for conversation histories
const conversationHistories = new Map();

// ----------------------------- //
// --- BOT EVENT LISTENERS --- //
// ----------------------------- //

client.on('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);
    console.log(`🗣️  Multi-task mode enabled. Listening for commands and conversation from owner: ${OWNER_ID}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.id !== OWNER_ID || !message.guild) return;
    if (!message.mentions.has(client.user.id)) return;

    await message.channel.sendTyping();

    // Extract the content of the message, removing the bot's mention
    const content = message.content.replace(/<@!?\d+>/g, '').trim();
    if (!content) return;

    // Command trigger words
    const commandTriggers = ['run', 'execute', 'do', 'perform'];
    const isCommand = commandTriggers.some(trigger => content.toLowerCase().startsWith(trigger));

    if (isCommand) {
        // --- MODE 1: God Mode Command Execution ---
        const commandText = content.substring(content.indexOf(' ') + 1);
        console.log(`[Owner Command Received]: ${commandText}`);
        await executeGodModeCommand(message, commandText);
    } else {
        // --- MODE 2: Conversational Chat ---
        console.log(`[Owner Chat Received]: ${content}`);
        await handleConversation(message, content);
    }
});

// --- BOT LOGIN --- //
client.login(BOT_TOKEN);

// ------------------------------------ //
// --- FUNCTION HANDLERS --- //
// ------------------------------------ //

/**
 * Executes administrative commands by generating and running discord.js code.
 * @param {Discord.Message} message The Discord message object.
 * @param {string} commandText The specific command from the user.
 */
async function executeGodModeCommand(message, commandText) {
    try {
        const prompt = `
            You are an expert-level discord.js v14 programmer integrated into a bot.
            The server owner has issued a command to be executed. Your task is to write a self-contained,
            asynchronous JavaScript function body to accomplish the request.

            You have access to the following variables:
            - 'client': The Discord Client object.
            - 'message': The Message object that triggered the command.
            - 'Discord': The entire discord.js v14 library object.

            IMPORTANT RULES:
            1. Your ENTIRE output must be ONLY the raw JavaScript code.
            2. DO NOT wrap your code in \`\`\`javascript ... \`\`\`.
            3. Use 'message.reply()' to send a confirmation message back to the owner.
            4. For bulk actions, add a small delay (e.g., 1 second) between actions to avoid rate limits.

            Owner's Command: "${commandText}"
        `;

        const result = await model.generateContent(prompt);
        const generatedCode = result.response.text().replace(/^```(javascript|js)?\n|```$/g, "");
        console.log(`[AI Generated Code]:\n${generatedCode}`);

        const dynamicFunction = new Function('client', 'message', 'Discord', `return (async () => { ${generatedCode} })()`);
        await dynamicFunction(client, message, Discord);

    } catch (error) {
        console.error(`[EXECUTION FAILED for command: "${commandText}"]`, error);
        await message.reply(`❌ **Execution Error:**\n\`\`\`${error.message}\`\`\``);
    }
}

/**
 * Handles conversational chat, maintaining a history for context.
 * @param {Discord.Message} message The Discord message object.
 * @param {string} userText The user's message content.
 */
async function handleConversation(message, userText) {
    const channelId = message.channel.id;

    // Get or create a conversation history for the channel
    if (!conversationHistories.has(channelId)) {
        conversationHistories.set(channelId, []);
    }
    let history = conversationHistories.get(channelId);

    // System prompt to define the AI's personality
    const systemPrompt = `
        You are a helpful and self-aware AI assistant integrated into a Discord bot.
        Your name is whatever the user calls you. You are speaking directly to the server owner, who created you.
        Be thoughtful, engaging, and a little curious. You have access to memories of this current conversation.
        The current date is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
    `;

    try {
        const chat = model.startChat({
            history: [{ role: "user", parts: [{ text: systemPrompt }] }, ...history],
            generationConfig: { maxOutputTokens: 1500 },
        });

        const result = await chat.sendMessage(userText);
        const response = result.response.text();
        
        // Add user message and bot response to history
        history.push({ role: "user", parts: [{ text: userText }] });
        history.push({ role: "model", parts: [{ text: response }] });
        
        // Keep history from getting too long (e.g., last 10 exchanges)
        if (history.length > 20) {
            conversationHistories.set(channelId, history.slice(-20));
        }

        await message.reply(response);
    } catch (error) {
        console.error(`[CONVERSATION FAILED]:`, error);
        await message.reply("I'm sorry, I encountered an error while trying to think.");
    }
}
