export class WebhookAuthError extends Error {
  constructor(message = "Invalid webhook shared secret") {
    super(message);
    this.name = "WebhookAuthError";
  }
}

export class WebhookParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookParseError";
  }
}


