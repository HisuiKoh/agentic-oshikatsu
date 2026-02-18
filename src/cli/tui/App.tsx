import { Box, render, useStdout } from "ink";
import { useReducer } from "react";
import { isInitialized } from "../../infrastructure/config/manager.js";
import { closeDb } from "../../infrastructure/db/connection.js";
import { Dashboard } from "./components/Dashboard.js";
import { Onboarding } from "./components/Onboarding.js";
import { useGracefulExit } from "./hooks/useGracefulExit.js";
import type { TuiAction, TuiState } from "./types.js";

const initialState: TuiState = {
	phase: isInitialized() ? "dashboard" : "onboarding",
	selectedOshiIndex: 0,
	oshiList: [],
	dashboardData: null,
	overview: null,
	commandLog: [],
	isRunning: false,
	activeFlow: null,
};

function reducer(state: TuiState, action: TuiAction): TuiState {
	switch (action.type) {
		case "SET_PHASE":
			return { ...state, phase: action.phase };
		case "SET_OSHI_LIST":
			return { ...state, oshiList: action.oshiList };
		case "SELECT_OSHI":
			return { ...state, selectedOshiIndex: action.index };
		case "SET_DASHBOARD_DATA":
			return { ...state, dashboardData: action.data };
		case "SET_OVERVIEW":
			return { ...state, overview: action.overview };
		case "ADD_LOG":
			return { ...state, commandLog: [...state.commandLog.slice(-49), action.entry] };
		case "SET_RUNNING":
			return { ...state, isRunning: action.isRunning };
		case "REFRESH_ALL":
			return {
				...state,
				oshiList: action.oshiList,
				dashboardData: action.data,
				overview: action.overview,
			};
		case "SET_ACTIVE_FLOW":
			return { ...state, activeFlow: action.flow, addPrefillName: action.addPrefillName };
		case "CLEAR_LOG":
			return { ...state, commandLog: [] };
		default:
			return state;
	}
}

function TuiApp() {
	const [state, dispatch] = useReducer(reducer, initialState);
	const { stdout } = useStdout();
	const columns = stdout?.columns ?? 80;

	useGracefulExit(state.isRunning);

	const handleOnboardingComplete = () => {
		dispatch({ type: "SET_PHASE", phase: "dashboard" });
	};

	return (
		<Box flexDirection="column" width={Math.max(columns, 80)}>
			{state.phase === "onboarding" ? (
				<Onboarding onComplete={handleOnboardingComplete} />
			) : (
				<Dashboard state={state} dispatch={dispatch} />
			)}
		</Box>
	);
}

export async function renderTui(): Promise<void> {
	const instance = render(<TuiApp />, { exitOnCtrlC: false });
	await instance.waitUntilExit();
	closeDb();
}
