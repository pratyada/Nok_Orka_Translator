import { Client } from "@microsoft/microsoft-graph-client";
import { ClientSecretCredential } from "@azure/identity";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";
import { config } from "../config.js";

let graphClient: Client | null = null;

/**
 * Get authenticated Microsoft Graph client.
 * Uses app-only auth (client credentials flow).
 */
export function getGraphClient(): Client {
  if (graphClient) return graphClient;

  const credential = new ClientSecretCredential(
    config.azure.tenantId,
    config.azure.clientId,
    config.azure.clientSecret,
  );

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ["https://graph.microsoft.com/.default"],
  });

  graphClient = Client.initWithMiddleware({ authProvider });
  return graphClient;
}

/**
 * Subscribe to real-time transcription for a meeting.
 * Returns a subscription ID that can be used to manage the subscription.
 */
export async function subscribeToTranscription(
  meetingId: string,
  notificationUrl: string,
): Promise<string> {
  const client = getGraphClient();

  const subscription = await client
    .api("/subscriptions")
    .post({
      changeType: "created",
      notificationUrl,
      resource: `/communications/onlineMeetings/${meetingId}/transcripts`,
      expirationDateTime: new Date(
        Date.now() + 60 * 60 * 1000,
      ).toISOString(), // 1 hour
      clientState: "orka-translator",
    });

  console.log(`[graph] Subscription created: ${subscription.id}`);
  return subscription.id;
}

/**
 * Get the transcript content for a meeting.
 */
export async function getTranscriptContent(
  meetingId: string,
  transcriptId: string,
): Promise<string> {
  const client = getGraphClient();

  const content = await client
    .api(
      `/communications/onlineMeetings/${meetingId}/transcripts/${transcriptId}/content`,
    )
    .header("Accept", "text/vtt")
    .get();

  return content;
}

/**
 * Start transcription for a call.
 * The bot must be in the call for this to work.
 */
export async function startCallTranscription(callId: string): Promise<void> {
  const client = getGraphClient();

  await client
    .api(`/communications/calls/${callId}/startTranscription`)
    .post({});

  console.log(`[graph] Transcription started for call: ${callId}`);
}

/**
 * Join a meeting by meeting URL.
 * Returns the call resource.
 */
export async function joinMeeting(meetingUrl: string): Promise<any> {
  const client = getGraphClient();

  const call = await client.api("/communications/calls").post({
    "@odata.type": "#microsoft.graph.call",
    callbackUri: `https://${process.env.BOT_HOSTNAME}/api/calls`,
    requestedModalities: ["audio"],
    mediaConfig: {
      "@odata.type": "#microsoft.graph.serviceHostedMediaConfig",
    },
    chatInfo: {
      "@odata.type": "#microsoft.graph.chatInfo",
      threadId: meetingUrl,
    },
    tenantId: config.azure.tenantId,
  });

  console.log(`[graph] Joined meeting, call ID: ${call.id}`);
  return call;
}
