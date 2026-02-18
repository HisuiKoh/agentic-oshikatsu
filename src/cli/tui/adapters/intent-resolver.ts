import { z } from "zod";
import { createProvider } from "../../../infrastructure/ai/provider-factory.js";
import { TUI_COMMANDS } from "../commands.js";

const IntentSchema = z.object({
	command: z.enum([
		"collect",
		"suggest",
		"lint",
		"budget",
		"cost",
		"info",
		"list",
		"add",
		"refresh",
		"clear",
		"exit",
		"help",
		"unknown",
	]),
	args: z.array(z.string()),
});

export interface ResolvedIntent {
	/** "/collect 杵月のあ" 等のスラッシュコマンド形式 */
	command: string;
	/** 元の自然言語入力 */
	rawInput: string;
	/** AI が unknown と判定した場合 true */
	isUnknown?: boolean;
}

function buildCommandList(): string {
	const descriptions = TUI_COMMANDS.map((cmd) => {
		const argsHint = cmd.args ? ` ${cmd.args}` : "";
		return `- ${cmd.name.slice(1)}${argsHint}: ${cmd.description}`;
	});
	// TUI_COMMANDS に含まれない内部コマンドも追加
	descriptions.push("- clear: 画面をリセットする");
	descriptions.push("- exit: アプリを終了する");
	descriptions.push("- unknown: どのコマンドにも該当しない場合");
	return descriptions.join("\n");
}

const SYSTEM_PROMPT = `あなたは推し活ツールのコマンドルーターです。
ユーザーの自然言語入力を、以下のコマンドのいずれかにマッピングしてください。

利用可能なコマンド:
${buildCommandList()}

ルール:
- [name] が省略可能なコマンドで、入力に推し名が含まれていなければ args は空配列にする
- lint の場合、入力文から「リスク評価したい行動」を抽出して args に入れる
- 判断できない場合は command: "unknown" にする`;

/** 自然言語入力をスラッシュコマンドに変換する */
export async function resolveIntent(
	input: string,
	selectedOshiName: string | undefined,
): Promise<ResolvedIntent> {
	// AIプロバイダー未設定時はそのまま throw（呼び出し元で catch）
	const provider = createProvider();

	const userMessage = selectedOshiName
		? `現在選択中の推し: ${selectedOshiName}\n\nユーザー入力: ${input}`
		: `現在選択中の推し: なし\n\nユーザー入力: ${input}`;

	const result = await provider.queryStructured(userMessage, IntentSchema, {
		systemPrompt: SYSTEM_PROMPT,
		maxTokens: 200,
		temperature: 0,
		purpose: "intent_resolution",
	});

	const { command, args } = result.data;

	// unknown → フォールバック
	if (command === "unknown") {
		return {
			command: "/help",
			rawInput: input,
			isUnknown: true,
		};
	}

	// スラッシュコマンド形式に組み立て
	const slashCommand = args.length > 0 ? `/${command} ${args.join(" ")}` : `/${command}`;

	return {
		command: slashCommand,
		rawInput: input,
	};
}
