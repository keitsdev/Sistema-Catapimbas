import { createHash, randomBytes, randomInt } from "node:crypto";

export const INVITATION_INVALID_MESSAGE = "Este convite não é mais válido. Peça um novo link a quem convidou você.";
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{20,64}$/;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const generateToken = () => randomBytes(32).toString("base64url");

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function generateTemporaryPassword() {
  const part = () => Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${part()}-${part()}`;
}

export interface InvitationState {
  revoked_at: string | null;
  expires_at: string;
  uses: number;
  max_uses: number;
}
export type InvitationStatus = "active" | "exhausted" | "expired" | "revoked";

export function invitationStatus(row: InvitationState, now = new Date()): InvitationStatus {
  if (row.revoked_at) return "revoked";
  if (new Date(row.expires_at).getTime() <= now.getTime()) return "expired";
  if (row.uses >= row.max_uses) return "exhausted";
  return "active";
}
