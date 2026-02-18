type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

let currentLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel) {
	currentLevel = level;
}

/** API キーやトークンをマスキング */
function maskSecrets(message: string): string {
	let masked = message;

	// Anthropic API Key: sk-ant-api03-xxx → sk-an...xxxx
	masked = masked.replace(
		/\b(sk-ant-api03-[a-zA-Z0-9]{2})[a-zA-Z0-9_-]{20,}([a-zA-Z0-9_-]{4})\b/g,
		"$1...$2",
	);

	// OpenAI API Key: sk-xxx...xxx → sk-a...7b9c
	masked = masked.replace(/\b(sk-[a-zA-Z0-9]{2})[a-zA-Z0-9]{20,}([a-zA-Z0-9]{4})\b/g, "$1...$2");

	// OAuth / JWT トークン
	masked = masked.replace(
		/\b(eyJ[a-zA-Z0-9]{2})[a-zA-Z0-9_-]{50,}([a-zA-Z0-9_-]{4})\b/g,
		"$1...$2",
	);

	return masked;
}

/** 安全な JSON 文字列化（循環参照・Error 対応） */
function safeStringify(obj: unknown): string {
	if (obj instanceof Error) {
		return `${obj.name}: ${obj.message}${obj.stack ? `\n${obj.stack}` : ""}`;
	}
	const seen = new WeakSet();
	try {
		return JSON.stringify(obj, (_key, value) => {
			if (typeof value === "object" && value !== null) {
				if (seen.has(value)) return "[Circular]";
				seen.add(value);
			}
			return value;
		});
	} catch {
		return String(obj);
	}
}

function formatData(data: unknown): string {
	if (data instanceof Error) {
		return data.message;
	}
	if (typeof data === "string") {
		return data;
	}
	return safeStringify(data);
}

function log(level: LogLevel, message: string, data?: unknown) {
	if (LOG_LEVELS[level] < LOG_LEVELS[currentLevel]) return;

	const timestamp = new Date().toISOString();
	const masked = maskSecrets(message);
	const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

	if (data !== undefined) {
		const summary = maskSecrets(formatData(data));
		// debug レベルのみ詳細データを付加、それ以外は簡潔に
		if (level === "debug") {
			console.error(`${prefix} ${masked} ${summary}`);
		} else {
			// Error や文字列はメッセージに含める、オブジェクトは省略
			if (data instanceof Error || typeof data === "string") {
				console.error(`${prefix} ${masked} — ${summary}`);
			} else {
				console.error(`${prefix} ${masked}`);
			}
		}
	} else {
		console.error(`${prefix} ${masked}`);
	}
}

export const logger = {
	debug: (msg: string, data?: unknown) => log("debug", msg, data),
	info: (msg: string, data?: unknown) => log("info", msg, data),
	warn: (msg: string, data?: unknown) => log("warn", msg, data),
	error: (msg: string, data?: unknown) => log("error", msg, data),
};
