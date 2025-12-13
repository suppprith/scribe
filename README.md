# Scribe - Voice Note Assistant

A Discord meeting assistant that automatically joins voice channels, records conversations, uploads to Google Drive, and generates structured summaries using Google Gemini AI.

## Features

- **Automatic Operation**: Joins when target user joins a voice channel
- **High-Quality Recording**: Captures audio and converts to MP3
- **Google Drive Integration**: Automatically uploads recordings to your Drive folder
- **AI Summaries**: Generates structured meeting notes using Gemini 1.5 Flash
- **Discord Integration**: Posts summaries with recording links to your specified channel
- **Privacy-Focused**: Only records when target user is present, auto-deletes local files

## Flow

```
User Joins VC → Bot Joins & Records → User Leaves → Stop Recording
    → Merge Audio → Convert to MP3 → Upload to Google Drive
    → Generate AI Summary → Post to Discord (with Drive link)
```

## Tech Stack

- **Runtime**: Bun (v1.1+)
- **Server**: Hono
- **Discord**: discord.js v14 + @discordjs/voice
- **LLM**: Google Gemini 1.5 Flash
- **Audio**: prism-media + ffmpeg-static (WAV/MP3 format)
- **Cloud Storage**: Google Drive API

## Setup

### Prerequisites

- [Bun](https://bun.sh) installed
- [FFmpeg](https://ffmpeg.org/) installed and in PATH
- Discord Bot Token ([Discord Developer Portal](https://discord.com/developers/applications))
- Google Gemini API Key ([Google AI Studio](https://makersuite.google.com/app/apikey))
- Google Cloud Service Account (for Drive uploads)
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
# Discord
DISCORD_TOKEN=your_discord_bot_token_here
TARGET_USER_ID=your_discord_user_id_here
MEETING_NOTES_CHANNEL_ID=your_channel_id_here

# Gemini AI
GEMINI_API_KEY=your_gemini_api_key_here

# Google Drive
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_DRIVE_FOLDER_ID=your_folder_id_here
```

### Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select existing)
3. Enable the **Google Drive API**
4. Go to Credentials → Create Credentials → Service Account
5. Download the JSON key file
6. Copy `client_email` to `GOOGLE_SERVICE_ACCOUNT_EMAIL`
7. Copy `private_key` to `GOOGLE_PRIVATE_KEY`
8. Create a folder in Google Drive for recordings
9. Share the folder with the service account email (Editor access)
10. Copy the folder ID from the URL to `GOOGLE_DRIVE_FOLDER_ID`

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
   - Converts recording to MP3 and uploads to Google Drive
   - Sends a summary to your meeting notes channel with the Drive link
