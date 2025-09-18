require('dotenv').config(); // For local testing with a .env file
const express = require('express');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();

// --- CONFIGURATION ---
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const PORT = process.env.PORT || 3000;

// Use your custom domain here
const DOMAIN_URL = 'https://eps1llon.win';
// CHANGED: The callback route is now /discord-auth
const REDIRECT_URI = `${DOMAIN_URL}/discord-auth`;

// --- DATABASE SETUP ---
// This path points to your persistent volume on Railway: /data
const dbPath = '/data/user_vault.db'; 
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Error opening database', err.message);
    else console.log('Connected to the persistent database.');
});

db.run(`CREATE TABLE IF NOT EXISTS users (
    discord_id TEXT PRIMARY KEY NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL
)`);


// --- WEB SERVER ---
const app = express();

app.get('/', (req, res) => {
    const scope = 'identify guilds.join';
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=${scope}`;
    res.send(`<h1>Verification Required</h1><a href="${authUrl}"><h3>Click here to Authorize</h3></a>`);
});

// CHANGED: The route handler now listens for /discord-auth
app.get('/discord-auth', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.send('Error: No code provided.');

    try {
        const tokenResponse = await axios.post('https://discord.com/api/v10/oauth2/token', 
            new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI,
            }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const { access_token, refresh_token } = tokenResponse.data;

        const userResponse = await axios.get('https://discord.com/api/v10/users/@me', {
            headers: { Authorization: `Bearer ${access_token}` },
        });

        const { id: discord_id, username } = userResponse.data;

        // Save user to the persistent database
        db.run(`REPLACE INTO users (discord_id, access_token, refresh_token) VALUES (?, ?, ?)`,
            [discord_id, access_token, refresh_token], 
            (err) => {
                if (err) {
                    console.error('Database error:', err.message);
                    return res.status(500).send('Database error.');
                }
                res.send(`<h1>Success!</h1><p>Welcome, ${username}. You've been verified and can now close this page.</p>`);
            }
        );
    } catch (error) {
        console.error('Error during auth process:', error);
        res.status(500).send('An error occurred during verification.');
    }
});

app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
});
