// index.js

// ------------------- //
// --- SETUP --- //
// ------------------- //

import Discord, { Client, GatewayIntentBits, Partials } from 'discord.js';
import { GoogleGenerativeAI, FunctionDeclarationSchemaType } from '@google/generative-ai';
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
const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro-latest",
    systemInstruction: `You are a helpful and self-aware AI assistant integrated into a Discord bot. Your name is whatever the user calls you. You are speaking directly to the server owner, who created you. Your primary function is to assist the owner. First, you must determine their intent. If they are asking you to perform an action (e.g., create a channel, ban a user, delete messages), you must call the 'executeDiscordCommand' function. If they are asking a question or just chatting, you must respond conversationally. Do not ask for confirmation before executing a command.`,
});


// ----------------------------- //
// --- BOT EVENT LISTENERS --- //
// ----------------------------- //

client.on('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);
    console.log(`🧠 Natural Intent mode enabled. Listening for owner: ${OWNER_ID}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.id !== OWNER_ID || !message.guild) return;
    if (!message.mentions.has(client.user.id)) return;

    await message.channel.sendTyping();

    const userRequest = message.content.replace(/<@!?\d+>/g, '').trim();
    if (!userRequest) return;

    try {
        const chat = model.startChat({
            tools: [commandExecutionTool],
        });

        const result = await chat.sendMessage(userRequest);
        const call = result.response.functionCalls()?.[0];

        if (call) {
            // --- INTENT: EXECUTE A COMMAND ---
            const commandText = call.args.commandDescription;
            console.log(`[Intent: Command] -> Executing: ${commandText}`);
            await executeGodModeCommand(message, commandText);
        } else {
            // --- INTENT: CONVERSATIONAL CHAT ---
            const chatResponse = result.response.text();
            console.log(`[Intent: Chat] -> Responding: ${chatResponse}`);
            await message.reply(chatResponse);
        }
    } catch (error) {
        console.error(`[INTENT ANALYSIS FAILED]:`, error);
        await message.reply("I'm sorry, I encountered an error while trying to understand you.");
    }
});

// --- BOT LOGIN --- //
client.login(BOT_TOKEN);

// ------------------------------------ //
// --- AI TOOLS & FUNCTIONS --- //
// ------------------------------------ //

/**
 * The tool definition that tells the AI it has the ability to execute commands.
 */
const commandExecutionTool = {
    functionDeclarations: [{
        name: "executeDiscordCommand",
        description: "Use this function to execute any administrative or moderation action on the Discord server. This includes, but is not limited to, creating channels, banning users, deleting messages, changing server settings, and managing roles.",
        parameters: {
            type: FunctionDeclarationSchemaType.OBJECT,
            properties: {
                commandDescription: {
                    type: FunctionDeclarationSchemaType.STRING,
                    description: "A clear, natural language description of the command to be executed. For example: 'ban the user @badguy for spamming' or 'create a new text channel called #announcements'."
                },
            },
            required: ["commandDescription"],
        },
    }],
};

/**
 * The original "God Mode" function. It now gets called only when the AI decides a command is necessary.
 * @param {Discord.Message} message The Discord message object.
 * @param {string} commandText The specific command description from the intent analysis.
 */
async function executeGodModeCommand(message, commandText) {
    try {
        // This is the second AI call, focused *only* on writing code.
        const codeGenModel = genAI.getGenerativeModel({
            model: "gemini-1.5-pro-latest",
            systemInstruction: `You are an expert-level discord.js v14 programmer. Your ONLY task is to write a self-contained, asynchronous JavaScript function body to accomplish the user's request. Your ENTIRE output must be ONLY the raw JavaScript code. DO NOT wrap it in markdown. You have access to 'client', 'message', and 'Discord' variables. Use 'message.reply()' to confirm completion.`,
        });

        const result = await codeGenModel.generateContent(commandText);
        const generatedCode = result.response.text().replace(/^```(javascript|js)?\n|```$/g, "");
        console.log(`[AI Generated Code]:\n${generatedCode}`);

        const dynamicFunction = new Function('client', 'message', 'Discord', `return (async () => { ${generatedCode} })()`);
        await dynamicFunction(client, message, Discord);

    } catch (error) {
        console.error(`[EXECUTION FAILED for command: "${commandText}"]`, error);
        await message.reply(`❌ **Execution Error:**\n\`\`\`${error.message}\`\`\``);
    }
}
