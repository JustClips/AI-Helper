// -------------------------------------------------------------------------------- //
// --- ⚙️ SETUP & INITIALIZATION ⚙️ --- //
// -------------------------------------------------------------------------------- //

import Discord, { Client, GatewayIntentBits, Partials, EmbedBuilder } from 'discord.js';
import { GoogleGenerativeAI, FunctionDeclarationSchemaType } from '@google/generative-ai';
import 'dotenv/config';
import axios from 'axios';
import { Player } from 'discord-player';

// --- Environment Variable Loading & Validation --- //
const { DISCORD_TOKEN, OWNER_ID, GEMINI_API_KEY } = process.env;

if (!DISCORD_TOKEN || !OWNER_ID || !GEMINI_API_KEY) {
    console.error("❌ FATAL ERROR: Missing required environment variables (DISCORD_TOKEN, OWNER_ID, GEMINI_API_KEY).");
    process.exit(1);
}

// --- Discord Client Configuration --- //
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel], // Necessary for DMs
});

// --- Music Player Initialization --- //
const player = new Player(client);
// Load default extractors (YouTube, Spotify, Apple Music, etc.)
await player.extractors.loadDefault();

// --- Google Gemini AI Configuration --- //
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const conversationalModel = genAI.getGenerativeModel({
    model: "gemini-1.5-pro-latest",
    systemInstruction: `You are a helpful and self-aware AI assistant named Gemini. You have a full suite of music controls ('playMusic', 'skipTrack', 'stopPlayback', 'showQueue', 'togglePauseResume') and a powerful server admin tool ('executeDiscordCommand'). Use the correct tool to fulfill the user's request. If they are just chatting, respond conversationally. Be concise unless asked for detail.`,
});

// --- In-Memory Store for Conversation Histories --- //
const chatHistories = new Map();


// -------------------------------------------------------------------------------- //
// --- 🎧 BOT & PLAYER EVENTS 🎧 --- //
// -------------------------------------------------------------------------------- //

client.on('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);
    console.log(`🎶 Reworked Music Engine & God Mode enabled. Listening for owner: ${OWNER_ID}`);
});

player.events.on('playerStart', (queue, track) => {
    // Announce the track once it actually starts playing.
    queue.metadata.channel.send(`▶️ Now playing: **${track.title}**`);
});

player.events.on('error', (queue, error) => {
    console.error(`[Player Error @ ${queue.guild.name}]: ${error.message}`);
    if (queue.metadata.channel) {
        queue.metadata.channel.send('A player error occurred! The operation has been cancelled.');
    }
});

player.events.on('connectionError', (queue, error) => {
    console.error(`[Player Connection Error @ ${queue.guild.name}]: ${error.message}`);
    if (queue.metadata.channel) {
        queue.metadata.channel.send('Could not connect to the voice channel. Please check my permissions.');
    }
});


// -------------------------------------------------------------------------------- //
// --- 💬 MESSAGE HANDLER 💬 --- //
// -------------------------------------------------------------------------------- //

client.on('messageCreate', async (message) => {
    // --- Initial validation checks --- //
    if (message.author.bot || message.author.id !== OWNER_ID || !message.guild) return;
    if (!message.mentions.has(client.user.id)) return;

    await message.channel.sendTyping();

    // --- Clean user input --- //
    const userRequest = message.content.replace(/<@!?\d+>/g, '').trim();
    const authorId = message.author.id;

    // --- Handle image-based queries --- //
    const imageAttachment = message.attachments.first();
    if (imageAttachment?.contentType?.startsWith('image/')) {
        return handleImageQuery(message, userRequest, imageAttachment);
    }

    if (!userRequest) return;

    try {
        // --- Manage conversation history --- //
        if (!chatHistories.has(authorId)) {
            chatHistories.set(authorId, {
                chat: conversationalModel.startChat({ tools: [commandExecutionTool], history: [] }),
                timeout: setTimeout(() => chatHistories.delete(authorId), 600000) // 10 minute timeout
            });
        }
        // Refresh timeout on new message
        clearTimeout(chatHistories.get(authorId).timeout);
        chatHistories.get(authorId).timeout = setTimeout(() => chatHistories.delete(authorId), 600000);

        const { chat } = chatHistories.get(authorId);
        const result = await chat.sendMessage(userRequest);
        const call = result.response.functionCalls()?.[0];

        if (call) {
            // --- AI wants to use a tool --- //
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
            // --- Standard conversational reply --- //
            const chatResponse = result.response.text();
            await message.reply(chatResponse);
        }
    } catch (error) {
        console.error(`[INTENT ANALYSIS FAILED]:`, error);
        await message.reply("I'm sorry, I encountered an error while trying to process your request.");
    }
});

// --- Final step: Bot Login --- //
client.login(DISCORD_TOKEN);


// -------------------------------------------------------------------------------- //
// --- 🛠️ AI TOOLS & IMPLEMENTATIONS 🛠️ --- //
// -------------------------------------------------------------------------------- //

const commandExecutionTool = {
    functionDeclarations: [
        { name: "executeDiscordCommand", description: "For any administrative/moderation action (kick, ban, create channel, etc).", parameters: { type: FunctionDeclarationSchemaType.OBJECT, properties: { commandDescription: { type: FunctionDeclarationSchemaType.STRING } }, required: ["commandDescription"] } },
        { name: "playMusic", description: "Plays a song in the user's voice channel from a URL or search query.", parameters: { type: FunctionDeclarationSchemaType.OBJECT, properties: { query: { type: FunctionDeclarationSchemaType.STRING, description: "The song name, YouTube/Spotify URL, or search query." } }, required: ["query"] } },
        { name: "skipTrack", description: "Skips the currently playing song.", parameters: { type: FunctionDeclarationSchemaType.OBJECT, properties: {} } },
        { name: "stopPlayback", description: "Stops the music, clears the queue, and leaves the voice channel.", parameters: { type: FunctionDeclarationSchemaType.OBJECT, properties: {} } },
        { name: "showQueue", description: "Shows the current song and the list of upcoming tracks.", parameters: { type: FunctionDeclarationSchemaType.OBJECT, properties: {} } },
        { name: "togglePauseResume", description: "Pauses the music if it is playing, or resumes it if it is paused.", parameters: { type: FunctionDeclarationSchemaType.OBJECT, properties: {} } },
    ],
};

async function playMusic(message, query) {
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply('You need to be in a voice channel to play music!');

    await message.reply(`🔎 Searching for **${query}**...`); // Acknowledge first

    try {
        await player.play(voiceChannel, query, {
            requestedBy: message.author,
            nodeOptions: {
                metadata: { channel: message.channel },
                leaveOnEmpty: true,
                leaveOnEmptyCooldown: 300000, // 5 minutes
                leaveOnEnd: true,
                leaveOnStop: true,
            }
        });
    } catch (e) {
        console.error(`[Play Error]: ${e}`);
        await message.channel.send(`Something went wrong! I couldn't find a track for that query.`);
    }
}

async function skipTrack(message) {
    const queue = player.nodes.get(message.guild.id);
    if (!queue?.isPlaying()) return message.reply("There is no music playing to skip.");

    const success = queue.node.skip();
    await message.reply(success ? "⏭️ Skipped the current song." : "Something went wrong while skipping.");
}

async function stopPlayback(message) {
    const queue = player.nodes.get(message.guild.id);
    if (!queue) return message.reply("There is nothing to stop.");

    queue.delete();
    await message.reply("⏹️ Stopped the music and cleared the queue.");
}

async function showQueue(message) {
    const queue = player.nodes.get(message.guild.id);
    if (!queue?.isPlaying()) return message.reply("There is no music playing right now.");

    const currentTrack = queue.currentTrack;
    const tracks = queue.tracks.toArray().slice(0, 10).map((track, i) => {
        return `${i + 1}. **${track.title}** - \`${track.duration}\``;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Server Queue')
        .setDescription(tracks.length > 0 ? tracks : 'No more songs in the queue.')
        .addFields({ name: 'Now Playing', value: `▶️ **${currentTrack.title}** (\`${currentTrack.duration}\`)` })
        .setThumbnail(currentTrack.thumbnail)
        .setTimestamp();

    await message.reply({ embeds: [embed] });
}

async function togglePauseResume(message) {
    const queue = player.nodes.get(message.guild.id);
    if (!queue?.isPlaying()) return message.reply("There is no music playing to pause or resume.");

    const isPaused = queue.node.togglePause();
    await message.reply(isPaused ? "⏸️ Paused the music." : "▶️ Resumed the music.");
}

async function handleImageQuery(message, textPrompt, imageAttachment) {
    try {
        const response = await axios.get(imageAttachment.url, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data, 'binary');
        const imagePart = { inlineData: { data: imageBuffer.toString('base64'), mimeType: imageAttachment.contentType } };

        const prompt = textPrompt || "Describe this image in detail.";
        const result = await conversationalModel.generateContent([prompt, imagePart]);
        await message.reply(result.response.text());
    } catch (error) {
        console.error('Error handling image query:', error);
        await message.reply("Sorry, I had trouble analyzing that image.");
    }
}

async function executeGodModeCommand(message, commandText) {
    // --- ⚠️ SECURITY WARNING ⚠️ --- //
    // This function executes AI-generated code. It is restricted to the OWNER_ID,
    // but still poses a significant security risk if the AI is tricked into
    // generating malicious code. PROCEED WITH EXTREME CAUTION.
    try {
        const codeGenModel = genAI.getGenerativeModel({
            model: "gemini-1.5-pro-latest",
            systemInstruction: `You are a discord.js v14 expert. Write a self-contained, async JavaScript function body to accomplish the user's request.
            - Your ENTIRE output must be ONLY raw JavaScript code, without any markdown wrappers.
            - You have access to the variables 'client', 'message', and 'Discord'.
            - The code must be safe and not perform destructive actions unless explicitly told to.
            - DO NOT use 'process' or any file system modules.
            - Confirm completion by replying to the original 'message'.`,
        });

        const result = await codeGenModel.generateContent(commandText);
        const generatedCode = result.response.text().replace(/^```(javascript|js)?\n|```$/g, "").trim();

        // Basic sandbox to prevent obvious high-risk actions.
        if (generatedCode.includes('process.')) {
            throw new Error('Execution blocked: Generated code attempted to access the `process` object.');
        }

        console.log(`[God Mode Command: "${commandText}"]\n[Generated Code]:\n${generatedCode}`);

        // Execute the generated code in a controlled async function.
        const dynamicFunction = new Function('client', 'message', 'Discord', `return (async () => { ${generatedCode} })()`);
        await dynamicFunction(client, message, Discord);

    } catch (error) {
        console.error(`[EXECUTION FAILED for command: "${commandText}"]`, error);
        await message.reply(`❌ **Execution Error:**\n\`\`\`${error.message}\`\`\``);
    }
}
