// index.js

// ------------------- //
// --- SETUP --- //
// ------------------- //

import Discord, { Client, GatewayIntentBits, Partials } from 'discord.js';
import { GoogleGenerativeAI, FunctionDeclarationSchemaType } from '@google/generative-ai';
import 'dotenv/config';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } from '@discordjs/voice';
import ytdl from 'ytdl-core';
import axios from 'axios';


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
    systemInstruction: `You are a helpful and self-aware AI assistant integrated into a Discord bot. You are speaking directly to the server owner. Your primary function is to assist. You have tools for server administration ('executeDiscordCommand') and for playing music ('playMusic'). If the user provides an image, your primary goal is to analyze it. If they ask a question or chat, respond conversationally.`,
});


// ----------------------------- //
// --- BOT EVENT LISTENERS --- //
// ----------------------------- //

client.on('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);
    console.log(`📸 Image, Music & Command mode enabled. Listening for owner: ${OWNER_ID}`);
});

client.on('messageCreate', async (message) => {
    if (message.author.id !== OWNER_ID || !message.guild) return;
    if (!message.mentions.has(client.user.id)) return;

    await message.channel.sendTyping();

    const userRequest = message.content.replace(/<@!?\d+>/g, '').trim();

    if (message.attachments.size > 0) {
        const imageAttachment = message.attachments.first();
        if (imageAttachment.contentType?.startsWith('image/')) {
            console.log(`[Intent: Image Analysis] -> Analyzing image: ${imageAttachment.url}`);
            await handleImageQuery(message, userRequest, imageAttachment);
            return;
        }
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
                await playMusic(message, args.youtubeUrl);
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
// --- FUNCTION HANDLERS --- //
// ------------------------------------ //

async function handleImageQuery(message, textPrompt, imageAttachment) {
    try {
        const response = await axios.get(imageAttachment.url, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data, 'binary');

        const imagePart = {
            inlineData: { data: imageBuffer.toString('base64'), mimeType: imageAttachment.contentType, },
        };

        const prompt = textPrompt || "What is in this image?";
        const result = await model.generateContent([prompt, imagePart]);
        const aiResponse = result.response.text();

        await message.reply(aiResponse);

    } catch (error) {
        console.error('Error handling image query:', error);
        await message.reply("Sorry, I had trouble analyzing that image.");
    }
}

const commandExecutionTool = {
    functionDeclarations: [
        { name: "executeDiscordCommand", description: "Use for any administrative/moderation action like creating channels, banning users, managing roles, etc.", parameters: { type: FunctionDeclarationSchemaType.OBJECT, properties: { commandDescription: { type: FunctionDeclarationSchemaType.STRING, description: "A clear description of the command to execute." } }, required: ["commandDescription"], }, },
        { name: "playMusic", description: "Use this function to play audio from a YouTube URL in the user's voice channel.", parameters: { type: FunctionDeclarationSchemaType.OBJECT, properties: { youtubeUrl: { type: FunctionDeclarationSchemaType.STRING, description: "The full URL of the YouTube video to play." } }, required: ["youtubeUrl"], }, }
    ],
};
async function playMusic(message, url) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) { return message.reply('You need to be in a voice channel to play music!'); }
    if (!ytdl.validateURL(url)) { return message.reply('Please provide a valid YouTube URL.'); }
    try {
        const connection = joinVoiceChannel({ channelId: voiceChannel.id, guildId: voiceChannel.guild.id, adapterCreator: voiceChannel.guild.voiceAdapterCreator, });
        const stream = ytdl(url, { filter: 'audioonly' });
        const resource = createAudioResource(stream);
        const player = createAudioPlayer();
        player.play(resource);
        connection.subscribe(player);
        await message.reply(`Now playing: ${url}`);
        player.on(AudioPlayerStatus.Idle, () => { connection.destroy(); });
        player.on('error', error => { console.error(`Error in audio player: ${error.message}`); connection.destroy(); });
    } catch (error) { console.error('Error playing music:', error); await message.reply('I was unable to play the music.'); }
}
async function executeGodModeCommand(message, commandText) {
    try {
        const codeGenModel = genAI.getGenerativeModel({
            model: "gemini-1.5-pro-latest",
            // ✅ UPDATED: The new system instruction teaches the AI the correct way to join voice channels.
            systemInstruction: `You are an expert-level discord.js v14 programmer. Your ONLY task is to write a self-contained, asynchronous JavaScript function body to accomplish the user's request. Your ENTIRE output must be ONLY the raw JavaScript code. DO NOT wrap it in markdown. You have access to 'client', 'message', and 'Discord' variables.

            **VOICE CHANNEL LOGIC:**
            To join a voice channel, you MUST use the modern @discordjs/voice method. DO NOT use the old 'channel.join()'.
            You must import 'joinVoiceChannel' from '@discordjs/voice' at the top of your generated code.
            Example: const { joinVoiceChannel } = require('@discordjs/voice'); const connection = joinVoiceChannel({ channelId: message.member.voice.channel.id, guildId: message.guild.id, adapterCreator: message.guild.voiceAdapterCreator });

            **HANDLING TARGETS (Users, Channels, Roles):**
            1.  Prioritize Mentions: Always check 'message.mentions' collections first.
            2.  Fallback to Search by Name/ID: If no mention, parse the command string and search the cache.
            3.  Handle Failure: If a target isn't found, reply with a helpful error message.

            **BULK ACTION LOGIC:**
            For actions on many users, you MUST use a batching strategy with delays to avoid hitting API rate limits.

            You must reply to the user to confirm the action is complete.`,
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
