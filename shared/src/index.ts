/**
 * @scribe/shared — types shared between the bot (WebSocket server) and the
 * client (web dashboard). Types only: no runtime code, so it can be imported
 * from both the Bun and Next.js sides without a build step.
 */
export * from "./session";
export * from "./caption";
export * from "./messages";
