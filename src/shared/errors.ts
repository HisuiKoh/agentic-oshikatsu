export class BaseError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly cause?: unknown,
	) {
		super(message);
		this.name = this.constructor.name;
	}
}

export class ValidationError extends BaseError {
	constructor(message: string, cause?: unknown) {
		super(message, "VALIDATION_ERROR", cause);
	}
}

export class DatabaseError extends BaseError {
	constructor(message: string, cause?: unknown) {
		super(message, "DATABASE_ERROR", cause);
	}
}

export class AIError extends BaseError {
	constructor(message: string, cause?: unknown) {
		super(message, "AI_ERROR", cause);
	}
}

export class AuthError extends BaseError {
	constructor(message: string, cause?: unknown) {
		super(message, "AUTH_ERROR", cause);
	}
}

export class ConfigError extends BaseError {
	constructor(message: string, cause?: unknown) {
		super(message, "CONFIG_ERROR", cause);
	}
}
