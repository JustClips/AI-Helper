// index.js

// ------------------- //
// --- SETUP --- //
// ------------------- //

import Discord, { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { GoogleGenerativeAI, FunctionDeclarationSchemaType } from '@google/generative-ai';
import 'dotenv/config';
import axios from 'axios';
import { Player } from 'discord-player';
// ✅ CORRECTED: Import the official extractor package
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

// Initialize the music player
const player = new Player(client);

// ✅ CORRECTED: Register the official extractor
await player.extractors.register(YouTubeExtractor, {});

// Configure Google Gemini AI
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: "gemini-1.5-pro-latest",
    systemInstruction: `You are a helpful and self-aware AI assistant with a full suite of music controls ('playMusic', 'skipTrack', 'stopPlayback', 'showQueue', 'togglePauseResume') and server admin tools ('executeDiscordCommand'). Use the correct tool for the user's request. If they are just chatting, respond conversationally.`,
});


// ----------------------------- //
// --- BOT & PLAYER EVENTS --- //
// ----------------------------- //

client.on('clientReady', () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);
    console.log(`🎶 Final Music Engine & God Mode enabled. Listening for owner: ${OWNER_ID}`);
});

player.events.on('playerStart', (queue, track) => {
    queue.metadata.channel.send(`▶️ Now playing: **${track.title}**`);
});
player.events.on('error', (queue, error) => {
    console.error(`[Player Error]: ${error.message}`);
    queue.metadata.channel.send('A player error occurred! Please check the logs.');
});


client.on('messageCreate', async (message) => {
    if (message.author.id !== OWNER_ID || !message.guild) return;
    if (!message.mentions.has(client.user.id)) return;

    await message.channel.sendTyping();
    const userRequest = message.content.replace(/<@!?d+>/g, '').trim();

    if (message.attachments.size > 0) {
        // ... (Image handling logic)
    }
    if (!userRequest) return;

    try {
        const chat = model.startChat({ tools: [commandExecutionTool] });
        const result = await chat.sendMessage(userRequest);
        const call = result.response.functionCalls()?.[0];

        if (call) {
            const { name, args } = call;
            switch (name) {
                case 'executeDiscordCommand':
                    await executeGodModeCommand(message, args.commandDescription);
                    break;
                case 'playMusic':
                    await playMusic(message, args.query);
                    break;
                case 'skipTrack':
                    await skipTrack(message);
                    break;
                case 'stopPlayback':
                    await stopPlayback(message);
                    break;
                case 'showQueue':
                    await showQueue(message);
                    break;
                case 'togglePauseResume':
                    await togglePauseResume(message);
                    break;
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

const commandExecutionTool = { /* Unchanged */ };
async function playMusic(message, query) { /* Unchanged */ }
async function skipTrack(message) { /* Unchanged */ }
async function stopPlayback(message) { /* Unchanged */ }
async function showQueue(message) { /* Unchanged */ }
async function togglePauseResume(message) { /* Unchanged */ }
async function handleImageQuery(message, textPrompt, imageAttachment) { /* Unchanged */ }
async function executeGodModeCommand(message, commandText) { /* Unchanged */ }

// --- UNCHANGED FUNCTIONS FOR COMPLETENESS ---
const commandExecutionTool = {
    functionDeclarations: [
        { name: "executeDiscordCommand", description: "For any administrative/moderation action.", parameters: { type: FunctionDeclarationSchemaType.OBJECT, properties: { commandDescription: { type: FunctionDeclarationSchemaType.STRING } }, required: ["commandDescription"] } },
        { name: "playMusic", description: "Plays a song in the user's voice channel from a URL or search query.", parameters: { type: FunctionDeclarationSchemaType.OBJECT, properties: { query: { type: FunctionDeclarationSchemaType.STRING, description: "The YouTube URL or search query." } }, required: ["query"] } },
        { name: "skipTrack", description: "Skips the currently playing song.", parameters: { type: FunctionDeclarationSchemaType.OBJECT, properties: {} } },
        { name: "stopPlayback", description: "Stops the music, clears the queue, and leaves the voice channel.", parameters: { type: FunctionDeclarationSchemaType.OBJECT, properties: {} } },
        { name: "showQueue", description: "Shows the current song and the list of upcoming tracks.", parameters: { type: FunctionDeclarationSchemaType.OBJECT, properties: {} } },
        { name: "togglePauseResume", description: "Pauses the music if it is playing, or resumes it if it is paused.", parameters: { type: FunctionDeclarationSchemaType.OBJECT, properties: {} } },
    ],
};
async function playMusic(message, query) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply('You need to be in a voice channel to play music!');
    try {
        await player.play(voiceChannel, query, {
            requestedBy: message.author,
            nodeOptions: { metadata: { channel: message.channel } }
        });
        await message.reply(`Searching for **${query}**...`);
    } catch (e) {
        console.error(`[Play Error]: ${e}`);
        await message.reply(`Something went wrong! I couldn't find or play the song.`);
    }
}
async function skipTrack(message) {
    const queue = player.nodes.get(message.guild.id);
    if (!queue || !queue.isPlaying()) return message.reply("There is no music playing to skip.");
    const skipped = queue.node.skip();
    await message.reply(skipped ? "⏭️ Skipped the current song." : "Something went wrong while skipping.");
}
async function stopPlayback(message) {
    const queue = player.nodes.get(message.guild.id);
    if (!queue) return message.reply("There is nothing to stop.");
    queue.delete();
    await message.reply("⏹️ Stopped the music and cleared the queue.");
}
async function showQueue(message) {
    const queue = player.nodes.get(message.guild.id);
    if (!queue || !queue.isPlaying()) return message.reply("There is no music playing right now.");
    const currentTrack = queue.currentTrack;
    const tracks = queue.tracks.toArray().slice(0, 10).map((track, i) => {
        return `${i + 1}. **${track.title}** - \`${track.duration}\``;
    }).join('\n');
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Server Queue')
        .setDescription(tracks.length > 0 ? tracks : 'No more songs in the queue.')
        .addFields({ name: 'Now Playing', value: `▶️ **${currentTrack.title}** - \`${currentTrack.duration}\`` });
    await message.reply({ embeds: [embed] });
}
async function togglePauseResume(message) {
    const queue = player.nodes.get(message.guild.id);
    if (!queue || !queue.isPlaying()) return message.reply("There is no music playing to pause or resume.");
    const isPaused = queue.node.isPaused();
    queue.node.setPaused(!isPaused);
    await message.reply(isPaused ? "▶️ Resumed the music." : "⏸️ Paused the music.");
}
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
    } catch (error) { 
        console.error(`[EXECUTION FAILED for command: "${commandText}"]`, error); 
        await message.reply(`❌ **Execution Error:**\n\`\`\`${error.message}\`\`\``); 
    }
}
