// Centralized, typed access to server-side environment variables.
// Throwing here surfaces misconfiguration early instead of as obscure runtime errors.

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  // GitHub Enterprise
  githubClientId: required("GITHUB_CLIENT_ID"),
  githubClientSecret: required("GITHUB_CLIENT_SECRET"),
  // Web host, e.g. https://github.example.com (no trailing slash)
  githubBaseUrl: required("GITHUB_BASE_URL").replace(/\/$/, ""),
  // REST API base, e.g. https://github.example.com/api/v3
  githubApiUrl: required("GITHUB_API_URL").replace(/\/$/, ""),

  tokenEncKey: required("TOKEN_ENC_KEY"),

  // LLM (OpenAI-compatible: LiteLLM / vLLM)
  llmBaseUrl: required("LLM_BASE_URL"),
  llmApiKey: optional("LLM_API_KEY", "not-needed"),
  llmModels: optional("LLM_MODELS", "default")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean),
  llmDefaultModel: process.env.LLM_DEFAULT_MODEL,
  llmMaxContext: Number(optional("LLM_MAX_CONTEXT", "16000")),
};

// GitHub OAuth (user-to-server) endpoints, derived from the enterprise host.
export const githubOAuth = {
  authorization: `${env.githubBaseUrl}/login/oauth/authorize`,
  token: `${env.githubBaseUrl}/login/oauth/access_token`,
  // On GHES the API user endpoint lives under /api/v3; on github.com under api.github.com.
  userinfo: `${env.githubApiUrl}/user`,
};

export function defaultModel(): string {
  return env.llmDefaultModel ?? env.llmModels[0] ?? "default";
}
