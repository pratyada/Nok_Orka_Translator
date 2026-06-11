import {
  TeamsActivityHandler,
  TurnContext,
  CardFactory,
  MessageFactory,
  type TeamsChannelAccount,
} from "botbuilder";
import { isValidLanguage, SUPPORTED_LANGUAGES, type LanguageCode } from "@orka/shared";
import {
  getOrCreateSession,
  removeSession,
  type MeetingParticipant,
} from "../services/meeting-session.js";

/**
 * Nokia Orka Translator Bot.
 *
 * Handles:
 * - Meeting join/leave events
 * - Language selection commands
 * - Transcript processing and translation delivery
 */
export class OrkaBot extends TeamsActivityHandler {
  constructor() {
    super();

    // When bot is added to a conversation
    this.onMembersAdded(async (context, next) => {
      for (const member of context.activity.membersAdded ?? []) {
        if (member.id !== context.activity.recipient.id) {
          await context.sendActivity(
            MessageFactory.text(
              "👋 **Nokia Orka Translator** is ready!\n\n" +
                "I'll translate meeting speech in real-time.\n\n" +
                "**Commands:**\n" +
                "- `translate to spanish` — Set your target language\n" +
                "- `translate to french` — Set your target language\n" +
                "- `translate to portuguese` — Set your target language\n" +
                "- `stop` — Stop translation\n" +
                "- `status` — Show current settings",
            ),
          );
        }
      }
      await next();
    });

    // Handle messages
    this.onMessage(async (context, next) => {
      const text = (context.activity.text ?? "").trim().toLowerCase();

      if (text.startsWith("translate to ")) {
        await this.handleSetLanguage(context, text);
      } else if (text === "stop") {
        await this.handleStop(context);
      } else if (text === "status") {
        await this.handleStatus(context);
      } else if (text === "start") {
        await this.handleStart(context);
      } else {
        await context.sendActivity(
          "Say `translate to spanish`, `translate to french`, or `translate to portuguese` to start.",
        );
      }

      await next();
    });
  }

  /**
   * Called when the bot detects a meeting transcription event.
   * This is the main translation pipeline entry point.
   */
  async handleTeamsTranscription(
    context: TurnContext,
    meetingId: string,
    speaker: string,
    text: string,
  ): Promise<void> {
    const session = getOrCreateSession(meetingId);
    await session.processTranscript(speaker, text);
  }

  private async handleSetLanguage(
    context: TurnContext,
    text: string,
  ): Promise<void> {
    const langName = text.replace("translate to ", "").trim();

    // Find language code from name
    const langEntry = Object.entries(SUPPORTED_LANGUAGES).find(
      ([, v]) => v.name.toLowerCase() === langName,
    );

    if (!langEntry) {
      await context.sendActivity(
        `Language "${langName}" is not supported yet. Available: English, Spanish, French, Portuguese.`,
      );
      return;
    }

    const langCode = langEntry[0] as LanguageCode;
    const meetingId = this.getMeetingId(context);
    const userId = context.activity.from.id;
    const userName = context.activity.from.name ?? "Unknown";

    const session = getOrCreateSession(meetingId);
    session.addParticipant({
      userId,
      name: userName,
      targetLanguage: langCode,
    });

    // Wire up translation delivery for this participant
    session.on("translation", async (result: any, participant: any) => {
      if (participant.userId === userId) {
        const targetLang = participant.targetLanguage as LanguageCode;
        const card = CardFactory.adaptiveCard({
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              text: `**${result.speaker}** (${SUPPORTED_LANGUAGES[session.sourceLanguage].name})`,
              size: "Small",
              color: "Accent",
            },
            {
              type: "TextBlock",
              text: result.originalText,
              wrap: true,
              color: "Default",
            },
            {
              type: "TextBlock",
              text: `**Translation** (${SUPPORTED_LANGUAGES[targetLang].name})`,
              size: "Small",
              color: "Good",
              spacing: "Medium",
            },
            {
              type: "TextBlock",
              text: result.translatedText,
              wrap: true,
              weight: "Bolder",
            },
          ],
        });

        await context.sendActivity(MessageFactory.attachment(card));
      }
    });

    session.start();

    await context.sendActivity(
      `Translation active: **${SUPPORTED_LANGUAGES[session.sourceLanguage].name}** -> **${SUPPORTED_LANGUAGES[langCode].name}**\n\nI'll translate meeting speech for you in real-time.`,
    );
  }

  private async handleStop(context: TurnContext): Promise<void> {
    const meetingId = this.getMeetingId(context);
    removeSession(meetingId);
    await context.sendActivity("⏹️ Translation stopped.");
  }

  private async handleStart(context: TurnContext): Promise<void> {
    await context.sendActivity(
      "To start, tell me your target language:\n" +
        "- `translate to spanish`\n" +
        "- `translate to french`\n" +
        "- `translate to portuguese`",
    );
  }

  private async handleStatus(context: TurnContext): Promise<void> {
    const meetingId = this.getMeetingId(context);
    const session = getOrCreateSession(meetingId);

    await context.sendActivity(
      `**Meeting:** ${meetingId.slice(0, 8)}...\n` +
        `**Source:** ${SUPPORTED_LANGUAGES[session.sourceLanguage].name}\n` +
        `**Participants:** ${session.participantCount}\n` +
        `**Status:** Active`,
    );
  }

  private getMeetingId(context: TurnContext): string {
    // Use conversation ID as meeting identifier
    return context.activity.conversation?.id ?? "default";
  }

  // Register meeting event handlers in constructor won't work —
  // use onTeamsMembers pattern instead. Meeting events handled via bot messages.
}
