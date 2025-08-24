import {
	createContext,
	PropsWithChildren,
	useContext,
	useEffect,
	useState,
	useCallback,
	useMemo,
} from "react";
import { supabase } from "@/config/supabase";
import { useAuth } from "./supabase-provider";
import { WeekWithComputed } from "@/types/database";

interface WeeksState {
	weeks: WeekWithComputed[];
	currentWeek: WeekWithComputed | null;
	loading: boolean;
	error: Error | null;
	initialized: boolean;

	// Core methods
	refreshWeeks: () => Promise<void>;

	// Navigation methods
	getWeekById: (weekId: string) => WeekWithComputed | undefined;
	getWeekByOffset: (offset: number) => WeekWithComputed | undefined;
	getWeeksRange: (startOffset: number, endOffset: number) => WeekWithComputed[];
	getUpcomingWeeks: (count: number) => WeekWithComputed[];
	getPastWeeks: (count: number) => WeekWithComputed[];

	// Helper methods
	navigateToWeek: (weekId: string) => WeekWithComputed | undefined;
	navigateToOffset: (offset: number) => WeekWithComputed | undefined;
	navigateToNextWeek: () => WeekWithComputed | undefined;
	navigateToPreviousWeek: () => WeekWithComputed | undefined;
	getCurrentWeekOffset: () => number;
	getWeekDateRange: (weekId: string) => { start: Date; end: Date } | null;
	isCurrentWeek: (weekId: string) => boolean;
	isPastWeek: (weekId: string) => boolean;
	isFutureWeek: (weekId: string) => boolean;
}

const WeeksContext = createContext<WeeksState>({
	weeks: [],
	currentWeek: null,
	loading: false,
	error: null,
	initialized: false,
	refreshWeeks: async () => {},
	getWeekById: () => undefined,
	getWeekByOffset: () => undefined,
	getWeeksRange: () => [],
	getUpcomingWeeks: () => [],
	getPastWeeks: () => [],
	navigateToWeek: () => undefined,
	navigateToOffset: () => undefined,
	navigateToNextWeek: () => undefined,
	navigateToPreviousWeek: () => undefined,
	getCurrentWeekOffset: () => 0,
	getWeekDateRange: () => null,
	isCurrentWeek: () => false,
	isPastWeek: () => false,
	isFutureWeek: () => false,
});

export const useWeeks = () => {
	const context = useContext(WeeksContext);
	if (!context) {
		throw new Error("useWeeks must be used within WeeksProvider");
	}
	return context;
};

export function WeeksProvider({ children }: PropsWithChildren) {
	const [weeks, setWeeks] = useState<WeekWithComputed[]>([]);
	const [currentWeek, setCurrentWeek] = useState<WeekWithComputed | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [initialized, setInitialized] = useState(false);

	const { session } = useAuth();

	const fetchWeeks = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);

			if (__DEV__) {
				console.log("📅 Fetching weeks...");
			}

			// Get current date for calculations
			const today = new Date();
			const todayStr = today.toISOString().split("T")[0];

			// Fetch weeks around current date (e.g., 4 weeks back, 8 weeks forward)
			const startDate = new Date(today.getTime() - 28 * 24 * 60 * 60 * 1000);
			const endDate = new Date(today.getTime() + 56 * 24 * 60 * 60 * 1000);

			const { data, error: fetchError } = await supabase
				.from("weeks")
				.select("*")
				.gte("end_date", startDate.toISOString().split("T")[0])
				.lte("start_date", endDate.toISOString().split("T")[0])
				.order("start_date", { ascending: true });

			if (fetchError) {
				throw new Error(fetchError.message);
			}

			// Process weeks to add computed properties
			const processedWeeks: WeekWithComputed[] = (data || []).map((week) => {
				const currentWeekData = data?.find((w) => w.is_current_week);
				let weekOffset = 0;

				if (currentWeekData) {
					const currentStart = new Date(currentWeekData.start_date);
					const thisStart = new Date(week.start_date);
					weekOffset = Math.round(
						(thisStart.getTime() - currentStart.getTime()) /
							(7 * 24 * 60 * 60 * 1000),
					);
				}

				// Generate display title
				let displayTitle = week.display_title || "";
				if (!displayTitle) {
					if (week.is_current_week) {
						displayTitle = "This week";
					} else if (weekOffset === 1) {
						displayTitle = "Next week";
					} else if (weekOffset === -1) {
						displayTitle = "Last week";
					} else if (weekOffset > 1) {
						displayTitle = `In ${weekOffset} weeks`;
					} else if (weekOffset < -1) {
						displayTitle = `${Math.abs(weekOffset)} weeks ago`;
					}
				}

				// Determine status
				let status: "past" | "current" | "future" = "future";
				if (week.is_current_week) {
					status = "current";
				} else if (new Date(week.end_date) < today) {
					status = "past";
				} else if (new Date(week.start_date) > today) {
					status = "future";
				}

				return {
					...week,
					displayTitle,
					weekOffset,
					status,
				};
			});

			if (__DEV__) {
				console.log("📅 Weeks processed:", {
					total: processedWeeks.length,
					past: processedWeeks.filter((w) => w.status === "past").length,
					current: processedWeeks.filter((w) => w.status === "current").length,
					future: processedWeeks.filter((w) => w.status === "future").length,
				});
			}

			setWeeks(processedWeeks);

			// Set the current week
			const current = processedWeeks.find((w) => w.is_current_week);
			if (current) {
				setCurrentWeek(current);
				if (__DEV__) {
					console.log("📅 Current week set:", current.displayTitle);
				}
			} else {
				console.warn("⚠️ No current week found in data");
			}

			setInitialized(true);
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			console.error("Error fetching weeks:", error);
			setError(error);
		} finally {
			setLoading(false);
		}
	}, []);

	// Get week by ID
	const getWeekById = useCallback(
		(weekId: string): WeekWithComputed | undefined => {
			return weeks.find((w) => w.id === weekId);
		},
		[weeks],
	);

	// Get week by offset from current week
	const getWeekByOffset = useCallback(
		(offset: number): WeekWithComputed | undefined => {
			return weeks.find((w) => w.weekOffset === offset);
		},
		[weeks],
	);

	// Get range of weeks by offset
	const getWeeksRange = useCallback(
		(startOffset: number, endOffset: number): WeekWithComputed[] => {
			return weeks.filter(
				(w) => w.weekOffset >= startOffset && w.weekOffset <= endOffset,
			);
		},
		[weeks],
	);

	// Get upcoming weeks (current + future)
	const getUpcomingWeeks = useCallback(
		(count: number): WeekWithComputed[] => {
			return weeks
				.filter((w) => w.status === "current" || w.status === "future")
				.slice(0, count);
		},
		[weeks],
	);

	// Get past weeks
	const getPastWeeks = useCallback(
		(count: number): WeekWithComputed[] => {
			return weeks
				.filter((w) => w.status === "past")
				.sort(
					(a, b) =>
						new Date(b.start_date).getTime() - new Date(a.start_date).getTime(),
				)
				.slice(0, count);
		},
		[weeks],
	);

	// Navigate to a specific week
	const navigateToWeek = useCallback(
		(weekId: string): WeekWithComputed | undefined => {
			const week = getWeekById(weekId);
			if (week) {
				if (__DEV__) {
					console.log("📅 Navigating to week:", week.displayTitle);
				}
				// You could emit an event or update navigation state here
				// For now, just return the week
				return week;
			}
			return undefined;
		},
		[getWeekById],
	);

	// Navigate by offset
	const navigateToOffset = useCallback(
		(offset: number): WeekWithComputed | undefined => {
			const week = getWeekByOffset(offset);
			if (week) {
				if (__DEV__) {
					console.log(
						"📅 Navigating to week offset:",
						offset,
						week.displayTitle,
					);
				}
				return week;
			}
			return undefined;
		},
		[getWeekByOffset],
	);

	// Navigate to next week
	const navigateToNextWeek = useCallback((): WeekWithComputed | undefined => {
		if (!currentWeek) return undefined;
		return navigateToOffset(currentWeek.weekOffset + 1);
	}, [currentWeek, navigateToOffset]);

	// Navigate to previous week
	const navigateToPreviousWeek = useCallback(():
		| WeekWithComputed
		| undefined => {
		if (!currentWeek) return undefined;
		return navigateToOffset(currentWeek.weekOffset - 1);
	}, [currentWeek, navigateToOffset]);

	// Get current week offset
	const getCurrentWeekOffset = useCallback((): number => {
		return currentWeek?.weekOffset ?? 0;
	}, [currentWeek]);

	// Get date range for a week
	const getWeekDateRange = useCallback(
		(weekId: string): { start: Date; end: Date } | null => {
			const week = getWeekById(weekId);
			if (!week) return null;

			return {
				start: new Date(week.start_date),
				end: new Date(week.end_date),
			};
		},
		[getWeekById],
	);

	// Check if week is current
	const isCurrentWeek = useCallback(
		(weekId: string): boolean => {
			const week = getWeekById(weekId);
			return week?.is_current_week ?? false;
		},
		[getWeekById],
	);

	// Check if week is in the past
	const isPastWeek = useCallback(
		(weekId: string): boolean => {
			const week = getWeekById(weekId);
			return week?.status === "past";
		},
		[getWeekById],
	);

	// Check if week is in the future
	const isFutureWeek = useCallback(
		(weekId: string): boolean => {
			const week = getWeekById(weekId);
			return week?.status === "future";
		},
		[getWeekById],
	);

	// Initialize weeks on mount
	useEffect(() => {
		if (!initialized) {
			fetchWeeks();
		}
	}, [initialized, fetchWeeks]);

	// Refresh weeks periodically to handle week transitions
	useEffect(() => {
		if (!initialized) return;

		// Check daily at midnight if we need to refresh weeks
		const checkForWeekTransition = () => {
			const now = new Date();
			const tomorrow = new Date(now);
			tomorrow.setDate(tomorrow.getDate() + 1);
			tomorrow.setHours(0, 0, 0, 0);

			const msUntilMidnight = tomorrow.getTime() - now.getTime();

			const timeout = setTimeout(() => {
				if (__DEV__) {
					console.log("📅 Checking for week transition at midnight");
				}
				fetchWeeks();

				// Set up daily check
				const interval = setInterval(
					() => {
						fetchWeeks();
					},
					24 * 60 * 60 * 1000,
				); // 24 hours

				return () => clearInterval(interval);
			}, msUntilMidnight);

			return () => clearTimeout(timeout);
		};

		const cleanup = checkForWeekTransition();
		return cleanup;
	}, [initialized, fetchWeeks]);

	const contextValue = useMemo(
		() => ({
			weeks,
			currentWeek,
			loading,
			error,
			initialized,
			refreshWeeks: fetchWeeks,
			getWeekById,
			getWeekByOffset,
			getWeeksRange,
			getUpcomingWeeks,
			getPastWeeks,
			navigateToWeek,
			navigateToOffset,
			navigateToNextWeek,
			navigateToPreviousWeek,
			getCurrentWeekOffset,
			getWeekDateRange,
			isCurrentWeek,
			isPastWeek,
			isFutureWeek,
		}),
		[
			weeks,
			currentWeek,
			loading,
			error,
			initialized,
			fetchWeeks,
			getWeekById,
			getWeekByOffset,
			getWeeksRange,
			getUpcomingWeeks,
			getPastWeeks,
			navigateToWeek,
			navigateToOffset,
			navigateToNextWeek,
			navigateToPreviousWeek,
			getCurrentWeekOffset,
			getWeekDateRange,
			isCurrentWeek,
			isPastWeek,
			isFutureWeek,
		],
	);

	return (
		<WeeksContext.Provider value={contextValue}>
			{children}
		</WeeksContext.Provider>
	);
}
