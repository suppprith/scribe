/**
 * One-time Google Drive OAuth2 setup — mints the refresh token the bot uses to
 * upload to your personal Drive without any interactive prompt at runtime.
 *
 * Prerequisites (Google Cloud Console → APIs & Services):
 *   1. Enable the "Google Drive API".
 *   2. Create an OAuth 2.0 Client ID of type "Web application".
 *   3. Add  http://localhost:53682  as an authorized redirect URI.
 *   4. Put the client id/secret in bot/.env as GOOGLE_DRIVE_CLIENT_ID /
 *      GOOGLE_DRIVE_CLIENT_SECRET.
 *
 * Then run:  bun run auth:google
 * Open the printed URL, approve access, and copy the GOOGLE_DRIVE_REFRESH_TOKEN
 * it prints into bot/.env. (Optionally set GOOGLE_DRIVE_FOLDER_ID to a folder id
 * to nest all uploads under an existing Drive folder.)
 *
 * We request the least-privilege `drive.file` scope: the bot can only see and
 * manage files it creates, never the rest of your Drive.
 */
import { google } from "googleapis";

const REDIRECT_PORT = 53682;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`;
const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET?.trim();

if (!clientId || !clientSecret) {
  console.error(
    "Set GOOGLE_DRIVE_CLIENT_ID and GOOGLE_DRIVE_CLIENT_SECRET in bot/.env first.\n" +
      "See the header of this script for how to create them.",
  );
  process.exit(1);
}

const oauth = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
const authUrl = oauth.generateAuthUrl({
  access_type: "offline", // ask for a refresh token
  prompt: "consent", // force a refresh token even on re-auth
  scope: SCOPES,
});

// Wait for Google to redirect back to our loopback server with the auth code.
const code = await new Promise<string>((resolve, reject) => {
  const server = Bun.serve({
    port: REDIRECT_PORT,
    fetch(req) {
      const url = new URL(req.url);
      const authCode = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      if (error) {
        reject(new Error(`authorization failed: ${error}`));
        queueMicrotask(() => server.stop(true));
        return new Response("Authorization failed. You can close this tab.", { status: 400 });
      }
      if (authCode) {
        resolve(authCode);
        queueMicrotask(() => server.stop(true));
        return new Response("scribe is authorized. You can close this tab and return to the terminal.");
      }
      return new Response("Waiting for the authorization redirect…");
    },
  });

  console.log("\nOpen this URL in your browser to authorize scribe:\n");
  console.log(authUrl);
  console.log(`\nListening for the redirect on ${REDIRECT_URI} …`);
});

const { tokens } = await oauth.getToken(code);
if (!tokens.refresh_token) {
  console.error(
    "\nNo refresh token was returned. Revoke scribe's access at " +
      "https://myaccount.google.com/permissions and run this again (the consent " +
      "screen must appear to issue a refresh token).",
  );
  process.exit(1);
}

console.log("\n✅ Success. Add this line to bot/.env:\n");
console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`);
process.exit(0);
