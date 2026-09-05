import type { MeetingLiveTranscriptProviderId } from "@app/shared/meeting-transcription";
import { app, safeStorage } from "electron";
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

const storedCredentialsSchema = z
  .object({
    deepgram: z.string().optional(),
    qwen: z.string().optional(),
  })
  .strict();

type StoredCredentials = z.infer<typeof storedCredentialsSchema>;

function credentialsPath(): string {
  return join(app.getPath("userData"), "meeting-transcription-credentials.json");
}

function readStoredCredentials(): StoredCredentials {
  try {
    return storedCredentialsSchema.parse(JSON.parse(readFileSync(credentialsPath(), "utf-8")));
  } catch {
    return {};
  }
}

function writeStoredCredentials(credentials: StoredCredentials): void {
  const path = credentialsPath();
  const temporaryPath = `${path}.tmp`;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(temporaryPath, JSON.stringify(credentials, null, 2), { mode: 0o600 });
  chmodSync(temporaryPath, 0o600);
  renameSync(temporaryPath, path);
}

export function readMeetingTranscriptionProviderCredential(
  provider: MeetingLiveTranscriptProviderId,
): string | null {
  if (!safeStorage.isEncryptionAvailable()) {
    return null;
  }
  const encrypted = readStoredCredentials()[provider];
  if (!encrypted) {
    return null;
  }
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
  } catch {
    return null;
  }
}

export function getMeetingTranscriptionProviderCredentialStatus() {
  const credentials = readStoredCredentials();
  return {
    deepgram: Boolean(credentials.deepgram),
    qwen: Boolean(credentials.qwen),
    secureStorageAvailable: safeStorage.isEncryptionAvailable(),
  };
}

export function setMeetingTranscriptionProviderCredential(
  provider: MeetingLiveTranscriptProviderId,
  apiKey: string,
) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("当前系统安全存储不可用，无法保存转录 API Key");
  }
  const credentials = readStoredCredentials();
  credentials[provider] = safeStorage.encryptString(apiKey.trim()).toString("base64");
  writeStoredCredentials(credentials);
  return getMeetingTranscriptionProviderCredentialStatus();
}

export function clearMeetingTranscriptionProviderCredential(
  provider: MeetingLiveTranscriptProviderId,
) {
  const credentials = readStoredCredentials();
  if (provider === "deepgram") {
    delete credentials.deepgram;
  } else {
    delete credentials.qwen;
  }
  writeStoredCredentials(credentials);
  return getMeetingTranscriptionProviderCredentialStatus();
}
