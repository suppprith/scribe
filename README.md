# Scribe - Voice Note Assistant

A Discord meeting assistant that automatically joins voice channels, records conversations, and generates structured summaries using Google Gemini 2.5 Flash.

## Features

- **Automatic Operation**: Joins when target user joins a voice channel
- **Audio Recording**: Captures high-quality audio with buffering
- **Automated Summaries**: Generates structured meeting notes using Gemini 2.5 Flash
- **Privacy-Focused**: Only records when target user is present, auto-deletes audio files

## Tech Stack

- **Runtime**: Bun (v1.1+)
- **Server**: Hono
- **Discord**: discord.js v14 + @discordjs/voice
- **LLM**: Google Gemini 2.5 Flash
- **Audio**: prism-media + ffmpeg-static

## Setup

### Prerequisites

- [Bun](https://bun.sh) installed
- Discord Bot Token ([Discord Developer Portal](https://discord.com/developers/applications))
- Google Gemini API Key ([Google AI Studio](https://makersuite.google.com/app/apikey))
- Your Discord User ID

### Installation

1. Clone the repository:

```bash
git clone https://github.com/suppprith/scribe.git
cd scribe
```

2. Install dependencies:

```bash
bun install
```

3. Configure environment variables:

```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:

```env
DISCORD_TOKEN=your_discord_bot_token_here
TARGET_USER_ID=your_discord_user_id_here
GEMINI_API_KEY=your_gemini_api_key_here
MEETING_NOTES_CHANNEL_ID=your_channel_id_here
```

### Getting Your Discord User ID

1. Enable Developer Mode in Discord (User Settings → Advanced → Developer Mode)
2. Right-click your username and select "Copy User ID"

### Running the Bot

Development mode (with hot reload):

```bash
bun run dev
```

Production mode:

```bash
bun run start
```

## Usage

1. Invite the bot to your Discord server
2. Grant it permissions: View Channels, Connect, Speak
3. When you (the target user) join a voice channel, the bot automatically:
   - Joins the same channel
   - Starts recording
   - Leaves when you leave
   - Sends a summary to #meeting-notes
