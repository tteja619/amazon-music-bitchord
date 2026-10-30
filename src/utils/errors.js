export class AppError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export class ProviderNotConfiguredError extends AppError {
  constructor() {
    super(
      "AMAZON_MUSIC_API_NOT_CONFIGURED",
      "Amazon Music API access has not been authorized and configured for this addon.",
      503
    );
    this.name = "ProviderNotConfiguredError";
  }
}
