const SECRET_ASSIGNMENT_PATTERN =
  /(CURSOR_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY|DEEPSEEK_API_KEY|OPENROUTER_API_KEY)\s*=\s*["']?[^"'\s]+/gi;

const CURSOR_KEY_PATTERN = /\b(cursor_[A-Za-z0-9._-]{12,}|key_[A-Za-z0-9._-]{12,})\b/g;

export function redactSecrets(input: unknown, extraSecrets: string[] = []): string {
  let text = typeof input === "string" ? input : JSON.stringify(input, null, 2);

  for (const secret of extraSecrets) {
    if (!secret) continue;
    text = text.split(secret).join("[redacted]");
  }

  return text
    .replace(SECRET_ASSIGNMENT_PATTERN, "$1=[redacted]")
    .replace(CURSOR_KEY_PATTERN, "[redacted]");
}

export function safeError(error: unknown, extraSecrets: string[] = []): string {
  if (error instanceof Error) {
    return redactSecrets(`${error.name}: ${error.message}`, extraSecrets);
  }
  return redactSecrets(error, extraSecrets);
}
