export class ProviderNotConfiguredError extends Error {
  constructor(message = "The music provider is not configured.") {
    super(message);
    this.name = "ProviderNotConfiguredError";
    this.code = "PROVIDER_NOT_CONFIGURED";
  }
}

export class InvalidProviderResponseError extends Error {
  constructor(message = "The provider returned an invalid response.") {
    super(message);
    this.name = "InvalidProviderResponseError";
    this.code = "INVALID_PROVIDER_RESPONSE";
  }
}

export class ProtectedStreamUnsupportedError extends Error {
  constructor() {
    super("Protected or encrypted streams are not supported by this addon.");
    this.name = "ProtectedStreamUnsupportedError";
    this.code = "PROTECTED_STREAM_UNSUPPORTED";
  }
}
