import type { DashboardData, DashboardOverview } from "../../core/dashboard/aggregator.js";
import type { Oshi } from "../../core/oshi/types.js";

/** TUI の画面フェーズ */
export type TuiPhase = "onboarding" | "dashboard";

/** コマンドログのエントリ */
export interface CommandLogEntry {
	id: string;
	command: string;
	resolvedCommand?: string;
	result: string;
	status: "success" | "error" | "info";
	timestamp: Date;
}

/** TUI のルート状態 */
export interface TuiState {
	phase: TuiPhase;
	selectedOshiIndex: number;
	oshiList: Oshi[];
	dashboardData: DashboardData | null;
	overview: DashboardOverview | null;
	commandLog: CommandLogEntry[];
	isRunning: boolean;
	activeFlow: null | "add-oshi" | "budget-set" | "budget-add";
	addPrefillName?: string;
}

/** TUI アクション */
export type TuiAction =
	| { type: "SET_PHASE"; phase: TuiPhase }
	| { type: "SET_OSHI_LIST"; oshiList: Oshi[] }
	| { type: "SELECT_OSHI"; index: number }
	| { type: "SET_DASHBOARD_DATA"; data: DashboardData | null }
	| { type: "SET_OVERVIEW"; overview: DashboardOverview | null }
	| { type: "ADD_LOG"; entry: CommandLogEntry }
	| { type: "SET_RUNNING"; isRunning: boolean }
	| {
			type: "REFRESH_ALL";
			oshiList: Oshi[];
			data: DashboardData | null;
			overview: DashboardOverview | null;
	  }
	| { type: "SET_ACTIVE_FLOW"; flow: TuiState["activeFlow"]; addPrefillName?: string }
	| { type: "CLEAR_LOG" };

/** コマンド実行結果 */
export interface CommandResult {
	message: string;
	status: "success" | "error" | "info";
}
