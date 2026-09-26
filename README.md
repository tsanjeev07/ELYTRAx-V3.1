# Feel Good Funk Discord bot

A Discord.js bot that joins the voice channel of the person who runs `/play`, loops every supported song in `audio/`, and greets members only when they join the voice channel where the bot is playing. Its one now-playing message is edited as tracks change. The bot activity rotates every 30 seconds. Run `/stop` to stop playback and leave.

## Requirements

- Node.js 22.12 or newer
- A Discord application/bot with the **bot** and **applications.commands** scopes
- Bot permissions in your server: **View Channels**, **Connect**, **Speak**, and **Send Messages** in voice-channel chat

## Setup

1. In the Discord Developer Portal, create an application and add a bot. Copy its bot token.
2. Invite it to your server using OAuth2 URL Generator with the `bot` and `applications.commands` scopes and the permissions listed above.
3. Copy `.env.example` to `.env` and put the token after `DISCORD_TOKEN=`. Keep `.env` private.
4. From this folder, run:

   ```sh
   npm install
   npm start
   ```

5. Join a voice channel and use `/play`. Use `/stop` when finished.

The bot registers its global slash commands at startup; Discord may take a short time to show them the first time. Keep the Node process running while you want music to play. Songs play in alphabetical order, then loop. The bot scans `audio/` again after each track ends, so added and removed files are picked up during playback. The project includes `ffmpeg-static` so it can decode MP3 and other supported formats without a separate system FFmpeg install.

## Audio file

Put `.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a`, or `.aac` files in `audio/`. The included track is `audio/feel-good-funk.mp3`. Add or remove files there and redeploy/sync the folder with your hosting provider; the bot will use the updated folder. If your host uses temporary storage, changes made directly on the host can disappear on restart, so keep the songs in the Git repository or use persistent storage.

## Voice welcomes and now playing

When playback starts, the bot sends one now-playing message to the voice channel's chat and edits that same message each time the song changes. When a member joins or switches into the voice channel currently playing music, the bot posts:

> Welcome @member to **ELYTRAx — Team Elytra**! 🚀 We're under development. Follow **@tsanjeev_07** for updates.

The bot does not DM members and does not save welcome history or other member data. Its status cycles through ELYTRAx radio, playlist, and VC-vibe activities every 30 seconds.
