// index.js

// ------------------- //
// --- SETUP --- //
// ------------------- //

import Discord, { Client, GatewayIntentBits, Partials } from 'discord.js';
import { GoogleGenerativeAI, FunctionDeclarationSchemaType } from '@google/generative-ai';
import 'dotenv/config';

// ✅ NEW: Import music-related libraries
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } from '@discordjs/voice';
import ytdl from 'ytdl-core';


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
    systemInstruction: `You are a helpful and self-aware AI assistant integrated into a Discord bot. You are speaking directly to the server owner. Your primary function is to assist. You have two types of tools: one for general server administration ('executeDiscordCommand') and one specifically for playing music ('playMusic'). If the user asks you to play a song from a YouTube link, you MUST use the 'playMusic' function. For all other administrative tasks, use 'executeDiscordCommand'. If the user is just chatting, respond conversationally.`,
});


// ----------------------------- //
// --- BOT EVENT LISTENERS --- //
// ----------------------------- //

client.on('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);
    console.log(`🎵 Music & Command mode enabled. Listening for owner: ${OWNER_ID}`);
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
            const { name, args } = call;
            // ✅ NEW: Route to the correct function based on AI's choice
            if (name === 'executeDiscordCommand') {
                const commandText = args.commandDescription;
                console.log(`[Intent: Command] -> Executing: ${commandText}`);
                await executeGodModeCommand(message, commandText);
            } else if (name === 'playMusic') {
                const url = args.youtubeUrl;
                console.log(`[Intent: Music] -> Playing: ${url}`);
                await playMusic(message, url);
            }
        } else {
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
 * The tool definition that tells the AI about its available functions.
 */
const commandExecutionTool = {
    functionDeclarations: [
        { // God Mode command
            name: "executeDiscordCommand",
            description: "Use for any administrative/moderation action like creating channels, banning users, managing roles, etc.",
            parameters: {
                type: FunctionDeclarationSchemaType.OBJECT,
                properties: { commandDescription: { type: FunctionDeclarationSchemaType.STRING, description: "A clear description of the command to execute." } },
                required: ["commandDescription"],
            },
        },
        { // ✅ NEW: Music command
            name: "playMusic",
            description: "Use this function to play audio from a YouTube URL in the user's voice channel.",
            parameters: {
                type: FunctionDeclarationSchemaType.OBJECT,
                properties: { youtubeUrl: { type: FunctionDeclarationSchemaType.STRING, description: "The full URL of the YouTube video to play." } },
                required: ["youtubeUrl"],
            },
        }
    ],
};

/**
 * ✅ NEW: Dedicated function for playing music.
 * @param {Discord.Message} message
 * @param {string} url
 */
async function playMusic(message, url) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
        return message.reply('You need to be in a voice channel to play music!');
    }
    if (!ytdl.validateURL(url)) {
        return message.reply('Please provide a valid YouTube URL.');
    }

    try {
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });

        const stream = ytdl(url, { filter: 'audioonly' });
        const resource = createAudioResource(stream);
        const player = createAudioPlayer();

        player.play(resource);
        connection.subscribe(player);

        await message.reply(`Now playing: ${url}`);

        player.on(AudioPlayerStatus.Idle, () => {
            connection.destroy(); // Disconnect when the song is over
        });
        player.on('error', error => {
            console.error(`Error in audio player: ${error.message}`);
            connection.destroy();
        });

    } catch (error) {
        console.error('Error playing music:', error);
        await message.reply('I was unable to play the music. Please check the link and my permissions.');
    }
}


/**
 * The "God Mode" function for all non-music commands.
 * @param {Discord.Message} message
 * @param {string} commandText
 */
async function executeGodModeCommand(message, commandText) {
    try {
        const codeGenModel = genAI.getGenerativeModel({
            model: "gemini-1.5-pro-latest",
            systemInstruction: `You are an expert-level discord.js v14 programmer. Your ONLY task is to write a self-contained, asynchronous JavaScript function body to accomplish the user's request. Your ENTIRE output must be ONLY the raw JavaScript code. DO NOT wrap it in markdown. You have access to 'client', 'message', and 'Discord' variables. Handle mentions and names intelligently. For bulk actions, use batching. You must reply to the user to confirm the action is complete.`,
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
