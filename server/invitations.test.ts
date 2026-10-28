import { describe, expect, it } from "vitest";
import { detectAudio } from "./services/audio-signature.js";
import { generateTemporaryPassword, generateToken, hashToken, invitationStatus, TOKEN_PATTERN } from "./services/invitations.js";

const base = { revoked_at: null, expires_at: "2030-01-01T00:00:00Z", uses: 0, max_uses: 2 };
const now = new Date("2029-01-01T00:00:00Z");
const bytes = (s: string, pad = 12) => Uint8Array.from([...s].map((c) => c.charCodeAt(0)).concat(Array(pad).fill(0)));

describe("token de convite", () => {
  it("gera tokens longos, únicos e que passam no padrão da URL", () => {
    const a = generateToken(), b = generateToken();
    expect(a === b).toBe(false);
    expect(TOKEN_PATTERN.test(a)).toBe(true);
    expect(a.length).toBeGreaterThanOrEqual(40);
  });
  it("hash é determinístico, tem 64 hex e não revela o token", () => {
    const t = generateToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t).length).toBe(64);
    expect(hashToken(t).includes(t)).toBe(false);
  });
  it("senha temporária legível, sem caracteres ambíguos", () => {
    for (let i = 0; i < 50; i++) expect(/^[a-hjkmnp-z2-9]{5}-[a-hjkmnp-z2-9]{5}$/.test(generateTemporaryPassword())).toBe(true);
  });
});

describe("situação do convite", () => {
  it("ativo", () => expect(invitationStatus(base, now)).toBe("active"));
  it("revogado vence tudo", () => expect(invitationStatus({ ...base, revoked_at: "2028-01-01T00:00:00Z", uses: 2 }, now)).toBe("revoked"));
  it("expirado", () => expect(invitationStatus(base, new Date("2031-01-01T00:00:00Z"))).toBe("expired"));
  it("esgotado ao atingir o limite de usos", () => expect(invitationStatus({ ...base, uses: 2 }, now)).toBe("exhausted"));
});

describe("assinatura de áudio (upload da música do pódio)", () => {
  it("reconhece MP3, WAV e OGG pelo conteúdo", () => {
    expect(detectAudio(bytes("ID3"))?.mime).toBe("audio/mpeg");
    expect(detectAudio(Uint8Array.from([0xff, 0xfb, 0x90, 0, 0, 0, 0, 0, 0, 0, 0, 0]))?.ext).toBe("mp3");
    expect(detectAudio(Uint8Array.from([...bytes("RIFF", 0), 1, 2, 3, 4, ...bytes("WAVE", 0)]))?.ext).toBe("wav");
    expect(detectAudio(bytes("OggS"))?.mime).toBe("audio/ogg");
  });
  it("recusa PDF, executável, texto e arquivo curto demais", () => {
    expect(detectAudio(bytes("%PDF-1.7"))).toBe(null);
    expect(detectAudio(bytes("MZ"))).toBe(null);
    expect(detectAudio(bytes("isto nao e audio"))).toBe(null);
    expect(detectAudio(Uint8Array.from([0xff, 0xfb]))).toBe(null);
  });
});
