// index.js

// ------------------- //
// --- SETUP --- //
// ------------------- //

import Discord, { Client, GatewayIntentBits, Partials } from 'discord.js';
import { GoogleGenerativeAI, FunctionDeclarationSchemaType } from '@google/generative-ai';
import 'dotenv/config';
import axios from 'axios';

// ✅ NEW: Import the new music player engine
import { Player } from 'discord-player';
import { YouTubeExtractor } from '@discord-player/extractor';


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

// ✅ NEW: Initialize the music player and attach it to the client
const player = new Player(client);
// Load the YouTube extractor to search for songs
await player.extractors.load(YouTubeExtractor.identifier);


// Configure Google Gemini AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro-latest",
    systemInstruction: `You are a helpful and self-aware AI assistant. You have tools for server administration ('executeDiscordCommand') and for playing music ('playMusic'). If the user asks to play a song, you MUST use the 'playMusic' function. For all other tasks, use 'executeDiscordCommand'. If the user is just chatting, respond conversationally.`,
});


// ----------------------------- //
// --- BOT EVENT LISTENERS --- //
// ----------------------------- //

// ✅ FIX: Use 'clientReady' to avoid the deprecation warning
client.on('clientReady', () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);
    console.log(`🎶 Professional Music Engine & God Mode enabled. Listening for owner: ${OWNER_ID}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.id !== OWNER_ID || !message.guild) return;
    if (!message.mentions.has(client.user.id)) return;

    await message.channel.sendTyping();

    const userRequest = message.content.replace(/<@!?\d+>/g, '').trim();

    if (message.attachments.size > 0) {
        // ... (Image handling logic is unchanged)
    }

    if (!userRequest) return;

    try {
        const chat = model.startChat({ tools: [commandExecutionTool] });
        const result = await chat.sendMessage(userRequest);
        const call = result.response.functionCalls()?.[0];

        if (call) {
            const { name, args } = call;
            if (name === 'executeDiscordCommand') {
                await executeGodModeCommand(message, args.commandDescription);
            } else if (name === 'playMusic') {
                // ✅ UPDATED: The 'playMusic' function is now much simpler and more powerful
                await playMusic(message, args.query);
            }
        } else {
            const chatResponse = result.response.text();
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

const commandExecutionTool = {
    functionDeclarations: [
        { name: "executeDiscordCommand", description: "For any administrative/moderation action.", parameters: { type: FunctionDeclarationSchemaType.OBJECT, properties: { commandDescription: { type: FunctionDeclarationSchemaType.STRING } }, required: ["commandDescription"] } },
        { 
            name: "playMusic", 
            description: "Plays a song in the user's voice channel. Can accept a YouTube URL or a search query like 'lofi hip hop'.", 
            parameters: { 
                type: FunctionDeclarationSchemaType.OBJECT, 
                properties: { query: { type: FunctionDeclarationSchemaType.STRING, description: "The YouTube URL or search query for the song." } }, 
                required: ["query"] 
            },
        }
    ],
};

/**
 * ✅ NEW: The music function is now a simple interface for the discord-player engine.
 * @param {Discord.Message} message
 * @param {string} query The song to search for or the URL.
 */
async function playMusic(message, query) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
        return message.reply('You need to be in a voice channel to play music!');
    }

    try {
        await player.play(voiceChannel, query, {
            nodeOptions: {
                metadata: message, // Associates the track with the message
                leaveOnEnd: true,
                leaveOnStop: true,
                leaveOnEmpty: true,
            }
        });
        await message.reply(`Searching for your song...`);
    } catch (e) {
        console.error(e);
        await message.reply('Something went wrong, I couldn\'t play the song.');
    }
}

// (The other functions like handleImageQuery and executeGodModeCommand remain unchanged)
async function handleImageQuery(message, textPrompt, imageAttachment) { /* ... */ }
async function executeGodModeCommand(message, commandText) { /* ... */ }

// Unchanged functions for completeness
async function handleImageQuery(message, textPrompt, imageAttachment) {
    try {
        const response = await axios.get(imageAttachment.url, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data, 'binary');
        const imagePart = { inlineData: { data: imageBuffer.toString('base64'), mimeType: imageAttachment.contentType, }, };
        const prompt = textPrompt || "What is in this image?";
        const result = await model.generateContent([prompt, imagePart]);
        const aiResponse = result.response.text();
        await message.reply(aiResponse);
    } catch (error) {
        console.error('Error handling image query:', error);
        await message.reply("Sorry, I had trouble analyzing that image.");
    }
}
async function executeGodModeCommand(message, commandText) {
    try {
        const codeGenModel = genAI.getGenerativeModel({
            model: "gemini-1.5-pro-latest",
            systemInstruction: `You are an expert-level discord.js v14 programmer. Your ONLY task is to write a self-contained, asynchronous JavaScript function body to accomplish the user's request. Your ENTIRE output must be ONLY the raw JavaScript code. DO NOT wrap it in markdown. You have access to 'client', 'message', and 'Discord' variables. Handle mentions, names, and voice channels intelligently. For bulk actions, use batching. You must reply to the user to confirm the action is complete.`,
        });
        const result = await codeGenModel.generateContent(commandText);
        const generatedCode = result.response.text().replace(/^```(javascript|js)?\n|```$/g, "");
        console.log(`[AI Generated Code]:\n${generatedCode}`);
        const dynamicFunction = new Function('client', 'message', 'Discord', `return (async () => { ${generatedCode} })()`);
        await dynamicFunction(client, message, Discord);
    } catch (error) { console.error(`[EXECUTION FAILED for command: "${commandText}"]`, error); await message.reply(`❌ **Execution Error:**\n\`\`\`${error.message}\`\`\``); }
}
