import { useCallback, useEffect } from "react";
import { BudgetManager } from "../../../core/budget/manager.js";
import {
	aggregateDashboard,
	aggregateOverview,
	type DashboardData,
	type DashboardOverview,
} from "../../../core/dashboard/aggregator.js";
import { OshiRepository } from "../../../core/oshi/repository.js";
import { getDbPath } from "../../../infrastructure/config/manager.js";
import { getDb } from "../../../infrastructure/db/connection.js";
import type { TuiAction } from "../types.js";

interface UseDashboardDataOptions {
	selectedOshiIndex: number;
	dispatch: React.Dispatch<TuiAction>;
}

export function useDashboardData({ selectedOshiIndex, dispatch }: UseDashboardDataOptions) {
	const refresh = useCallback(() => {
		try {
			const db = getDb(getDbPath());
			const repo = new OshiRepository(db);
			const manager = new BudgetManager(db);

			const allOshis = repo.findAll();
			const selectedOshi = allOshis[selectedOshiIndex];

			let data: DashboardData | null = null;
			let overview: DashboardOverview | null = null;

			if (selectedOshi) {
				const budgetSummaries = manager.getSummary(selectedOshi.id);
				data = aggregateDashboard(db, selectedOshi, budgetSummaries);
			}

			const totalBudgetSummaries = manager.getSummary();
			overview = aggregateOverview(db, allOshis, totalBudgetSummaries);

			dispatch({
				type: "REFRESH_ALL",
				oshiList: allOshis,
				data,
				overview,
			});
		} catch {
			// DB 未初期化等の場合は無視
		}
	}, [selectedOshiIndex, dispatch]);

	// 初回マウント時にデータ取得
	useEffect(() => {
		refresh();
	}, [refresh]);

	return { refresh };
}
