import { describe, expect, it } from "vitest";
import {
  looksLikeExistingSupabaseUser,
  validateLoginInput,
  validateRegistrationInput,
} from "./auth-validation";

describe("auth validation", () => {
  it("rejects incomplete login", () => {
    expect(validateLoginInput("", "senha123")).toBe("Preencha e-mail e senha.");
  });

  it("accepts a normal login payload", () => {
    expect(validateLoginInput("admin@empresa.com", "senha123")).toBeNull();
  });

  it("rejects short registration passwords", () => {
    expect(validateRegistrationInput({
      companyName: "Empresa",
      fullName: "Admin",
      email: "admin@empresa.com",
      password: "1234567",
      confirmPassword: "1234567",
    })).toBe("A senha deve ter ao menos 8 caracteres.");
  });

  it("rejects mismatching passwords", () => {
    expect(validateRegistrationInput({
      companyName: "Empresa",
      fullName: "Admin",
      email: "admin@empresa.com",
      password: "12345678",
      confirmPassword: "87654321",
    })).toBe("As senhas não coincidem.");
  });

  it("detects Supabase obfuscated duplicate signup response", () => {
    expect(looksLikeExistingSupabaseUser({ identities: [] })).toBe(true);
    expect(looksLikeExistingSupabaseUser({ identities: [{}] })).toBe(false);
    expect(looksLikeExistingSupabaseUser(null)).toBe(false);
  });
});
