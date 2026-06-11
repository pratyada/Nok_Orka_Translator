# Nokia Orka Translator — Teams Bot Setup Guide

## Prerequisites

You'll need Nokia IT to provision:
1. **Azure Entra ID App Registration** (single-tenant)
2. **Azure Bot Service** registration
3. **Teams Admin** to allow sideloading or publish to org app store

## Step 1: Azure Entra ID App Registration

1. Go to [Azure Portal](https://portal.azure.com) → Azure Active Directory → App registrations
2. Click **New registration**
   - Name: `Nokia Orka Translator`
   - Supported account types: **Single tenant** (Nokia only)
   - Redirect URI: Leave blank for now
3. After creation, note the:
   - **Application (client) ID** → This is your `BOT_ID` / `AZURE_CLIENT_ID`
   - **Directory (tenant) ID** → This is your `AZURE_TENANT_ID`
4. Go to **Certificates & secrets** → New client secret
   - Description: `orka-bot-secret`
   - Expiry: 12 months
   - Copy the **Value** → This is your `BOT_PASSWORD` / `AZURE_CLIENT_SECRET`

### API Permissions

Add these permissions (Application type, not Delegated):

| Permission | Type | Purpose |
|-----------|------|---------|
| `OnlineMeetingTranscript.Read.All` | Application | Read meeting transcripts |
| `OnlineMeeting.Read.All` | Application | Access meeting details |
| `Calls.JoinGroupCall.All` | Application | Bot joins meetings |
| `Calls.InitiateGroupCall.All` | Application | Bot initiates calls |

Click **Grant admin consent** (requires Nokia IT admin).

## Step 2: Azure Bot Service

1. Go to Azure Portal → Create resource → **Azure Bot**
2. Configure:
   - Bot handle: `nokia-orka-translator`
   - Pricing: **Free (F0)** for POC
   - Microsoft App ID: Use the App ID from Step 1
   - App type: **Single Tenant**
   - Tenant ID: Nokia's tenant ID
3. After creation, go to **Channels** → Add **Microsoft Teams** channel
4. Go to **Configuration**:
   - Messaging endpoint: `https://<your-domain>/api/messages`
   - For local dev: Use ngrok → `https://<ngrok-id>.ngrok.io/api/messages`

## Step 3: Configure Environment

Copy `packages/bot/.env.example` to `packages/bot/.env` and fill in:

```env
BOT_ID=<Application (client) ID from Step 1>
BOT_PASSWORD=<Client secret from Step 1>
BOT_HOSTNAME=<your-ngrok-or-azure-domain>

AZURE_TENANT_ID=<Nokia tenant ID>
AZURE_CLIENT_ID=<Same as BOT_ID>
AZURE_CLIENT_SECRET=<Same as BOT_PASSWORD>

OPENAI_API_KEY=<Your OpenAI API key>

BOT_PORT=3978
```

## Step 4: Local Development with ngrok

1. Install ngrok: `npm install -g ngrok`
2. Start the bot: `npm run dev -w packages/bot`
3. Start ngrok tunnel: `ngrok http 3978`
4. Copy the ngrok HTTPS URL
5. Update Azure Bot messaging endpoint to `https://<ngrok-id>.ngrok.io/api/messages`

## Step 5: Teams App Package

1. Update `packages/bot/appPackage/manifest.json`:
   - Replace `{{BOT_ID}}` with your App ID
   - Replace `{{BOT_HOSTNAME}}` with your domain
   - Replace `{{BASE_URL}}` with your base URL
2. Create icons:
   - `color.png` — 192x192 full-color Nokia logo
   - `outline.png` — 32x32 outline icon
3. Zip the `appPackage/` folder contents (manifest.json + icons)
4. In Teams → Apps → **Upload a custom app** → Upload the zip

## Step 6: Test

1. Start a Teams meeting
2. In meeting chat, mention the bot: `@Orka Translator translate to spanish`
3. The bot will confirm: "Translation active: English → Spanish"
4. When others speak, the bot delivers translated text cards

## Architecture

```
Teams Meeting
    │
    ├── Meeting transcription (Teams built-in)
    │         │
    │         ▼
    │   Graph API webhook notification
    │         │
    │         ▼
    │   Orka Bot Server (Node.js)
    │     ├── Receives transcript text
    │     ├── Translates via GPT-4o-mini
    │     ├── Generates TTS audio via OpenAI
    │     └── Sends Adaptive Card to participant
    │         │
    │         ▼
    └── Participant sees translated text + hears audio
```

## Demo Flow (No Azure Setup Required)

For a quick demo without Azure registration, the bot has a **manual transcript mode**:

1. Start the bot: `npm run dev -w packages/bot`
2. Connect via WebSocket to `ws://localhost:3978/ws/meeting`
3. Send: `{"type":"join","meetingId":"demo","userName":"Prat","targetLanguage":"es"}`
4. Simulate someone speaking: `{"type":"transcript","speaker":"John","text":"Hello, welcome to the Nokia meeting"}`
5. Receive: translated text + audio in Spanish

This lets you demo the translation pipeline without Azure/Teams integration.

## Production Deployment

For production, deploy to Azure:
- Azure App Service or AKS
- Azure Key Vault for secrets
- Custom domain with SSL
- Teams app published to Nokia org store via Teams Admin Center
