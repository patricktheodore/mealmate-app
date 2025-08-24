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
import { UserPreferences, UserPreferencesWithTags } from "@/types/database";

interface UserPreferencesState {
	preferences: UserPreferencesWithTags | null;
	loading: boolean;
	error: Error | null;
	initialized: boolean;

	// Core methods
	refreshPreferences: () => Promise<void>;

	// Update methods
	updateMealsPerWeek: (meals: number) => Promise<void>;
	updateServesPerMeal: (serves: number) => Promise<void>;
	updateGoals: (goals: string[]) => Promise<void>;
	updatePreferenceTags: (tagIds: string[]) => Promise<void>;
	updateAllPreferences: (
		updates: Partial<UserPreferencesWithTags>,
	) => Promise<void>;

	// Helper methods
	hasPreferences: () => boolean;
	hasGoals: () => boolean;
	hasPreferenceTags: () => boolean;
	getPreferenceTagIds: () => string[];
}

const UserPreferencesContext = createContext<UserPreferencesState>({
	preferences: null,
	loading: false,
	error: null,
	initialized: false,
	refreshPreferences: async () => {},
	updateMealsPerWeek: async () => {},
	updateServesPerMeal: async () => {},
	updateGoals: async () => {},
	updatePreferenceTags: async () => {},
	updateAllPreferences: async () => {},
	hasPreferences: () => false,
	hasGoals: () => false,
	hasPreferenceTags: () => false,
	getPreferenceTagIds: () => [],
});

export const useUserPreferences = () => {
	const context = useContext(UserPreferencesContext);
	if (!context) {
		throw new Error(
			"useUserPreferences must be used within UserPreferencesProvider",
		);
	}
	return context;
};

export function UserPreferencesProvider({ children }: PropsWithChildren) {
	const [preferences, setPreferences] =
		useState<UserPreferencesWithTags | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [initialized, setInitialized] = useState(false);

	const { session } = useAuth();
	const userId = session?.user?.id;

	const fetchPreferences = useCallback(async () => {
		if (!userId) {
			if (__DEV__) {
				console.log("⚠️ No user ID, skipping preferences fetch");
			}
			return;
		}

		try {
			setLoading(true);
			setError(null);

			if (__DEV__) {
				console.log("👤 Fetching user preferences...");
			}

			// Fetch user preferences
			const { data: prefData, error: prefError } = await supabase
				.from("user_preferences")
				.select("*")
				.eq("user_id", userId)
				.single();

			if (prefError) {
				if (prefError.code === "PGRST116") {
					// No preferences found, create default
					if (__DEV__) {
						console.log("👤 No preferences found, creating defaults");
					}

					const defaultPrefs: UserPreferencesWithTags = {
						id: "",
						user_id: userId,
						meals_per_week: 4,
						serves_per_meal: 2,
						user_goals: [],
						user_preference_tags: [],
						created_at: new Date().toISOString(),
					};

					setPreferences(defaultPrefs);
					setInitialized(true);

					// Optionally create preferences in database
					await createDefaultPreferences(userId);
					return;
				}
				throw new Error(prefError.message);
			}

			if (prefData) {
				// Fetch preference tags
				const { data: tagData, error: tagError } = await supabase
					.from("user_preference_tags")
					.select("tag_id")
					.eq("user_preference_id", prefData.id);

				if (tagError) {
					console.error("Error fetching preference tags:", tagError);
				}

				// Combine the data
				const completePreferences: UserPreferencesWithTags = {
					...prefData,
					user_preference_tags:
						tagData?.map((tag) => ({
							tag_id: tag.tag_id,
						})) || [],
				};

				if (__DEV__) {
					console.log("👤 User preferences loaded:", {
						mealsPerWeek: completePreferences.meals_per_week,
						servesPerMeal: completePreferences.serves_per_meal,
						goals: completePreferences.user_goals,
						preferenceTagCount: completePreferences.user_preference_tags?.length,
					});
				}

				setPreferences(completePreferences);
				setInitialized(true);
			}
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			console.error("Error fetching user preferences:", error);
			setError(error);
		} finally {
			setLoading(false);
		}
	}, [userId]);

	const createDefaultPreferences = async (userId: string) => {
		try {
			const { data, error } = await supabase
				.from("user_preferences")
				.insert({
					user_id: userId,
					meals_per_week: 4,
					serves_per_meal: 2,
					user_goals: [],
				})
				.select()
				.single();

			if (error) {
				console.error("Error creating default preferences:", error);
				return;
			}

			if (data) {
				const completePreferences: UserPreferencesWithTags = {
					...data,
					user_preference_tags: [],
				};
				setPreferences(completePreferences);
			}
		} catch (err) {
			console.error("Failed to create default preferences:", err);
		}
	};

	const updateMealsPerWeek = useCallback(
		async (meals: number) => {
			if (!preferences?.id || !userId) return;

			try {
				setLoading(true);
				setError(null);

				const { error } = await supabase
					.from("user_preferences")
					.update({ meals_per_week: meals })
					.eq("id", preferences.id);

				if (error) throw error;

				setPreferences((prev) =>
					prev ? { ...prev, meals_per_week: meals } : null,
				);

				if (__DEV__) {
					console.log("✅ Updated meals per week:", meals);
				}
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				console.error("Error updating meals per week:", error);
				setError(error);
				throw error;
			} finally {
				setLoading(false);
			}
		},
		[preferences?.id, userId],
	);

	const updateServesPerMeal = useCallback(
		async (serves: number) => {
			if (!preferences?.id || !userId) return;

			try {
				setLoading(true);
				setError(null);

				const { error } = await supabase
					.from("user_preferences")
					.update({ serves_per_meal: serves })
					.eq("id", preferences.id);

				if (error) throw error;

				setPreferences((prev) =>
					prev ? { ...prev, serves_per_meal: serves } : null,
				);

				if (__DEV__) {
					console.log("✅ Updated serves per meal:", serves);
				}
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				console.error("Error updating serves per meal:", error);
				setError(error);
				throw error;
			} finally {
				setLoading(false);
			}
		},
		[preferences?.id, userId],
	);

	const updateGoals = useCallback(
		async (goals: string[]) => {
			if (!preferences?.id || !userId) return;

			try {
				setLoading(true);
				setError(null);

				const { error } = await supabase
					.from("user_preferences")
					.update({ user_goals: goals })
					.eq("id", preferences.id);

				if (error) throw error;

				setPreferences((prev) =>
					prev ? { ...prev, user_goals: goals } : null,
				);

				if (__DEV__) {
					console.log("✅ Updated user goals:", goals);
				}
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				console.error("Error updating goals:", error);
				setError(error);
				throw error;
			} finally {
				setLoading(false);
			}
		},
		[preferences?.id, userId],
	);

	const updatePreferenceTags = useCallback(
		async (tagIds: string[]) => {
			if (!preferences?.id || !userId) return;

			try {
				setLoading(true);
				setError(null);

				// Use a transaction to update tags atomically
				// First, delete existing preference tags
				const { error: deleteError } = await supabase
					.from("user_preference_tags")
					.delete()
					.eq("user_preference_id", preferences.id);

				if (deleteError) throw deleteError;

				// Then insert new ones
				if (tagIds.length > 0) {
					const tagInserts = tagIds.map((tagId, index) => ({
						user_preference_id: preferences.id,
						tag_id: tagId,
						priority: index, // Use index as priority for ordering
					}));

					const { error: insertError } = await supabase
						.from("user_preference_tags")
						.insert(tagInserts);

					if (insertError) throw insertError;
				}

				// Update local state
				const newPreferenceTags = tagIds.map((tagId, index) => ({
					tag_id: tagId,
					priority: index,
				}));

				setPreferences((prev) =>
					prev
						? {
								...prev,
								user_preference_tags: newPreferenceTags,
							}
						: null,
				);

				if (__DEV__) {
					console.log("✅ Updated preference tags:", tagIds);
				}
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				console.error("Error updating preference tags:", error);
				setError(error);
				throw error;
			} finally {
				setLoading(false);
			}
		},
		[preferences?.id, userId],
	);

	const updateAllPreferences = useCallback(
		async (updates: Partial<UserPreferencesWithTags>) => {
			if (!preferences?.id || !userId) return;

			try {
				setLoading(true);
				setError(null);

				// Update main preferences
				const { meals_per_week, serves_per_meal, user_goals } = updates;
				if (
					meals_per_week !== undefined ||
					serves_per_meal !== undefined ||
					user_goals !== undefined
				) {
					const mainUpdates: Partial<UserPreferences> = {};
					if (meals_per_week !== undefined)
						mainUpdates.meals_per_week = meals_per_week;
					if (serves_per_meal !== undefined)
						mainUpdates.serves_per_meal = serves_per_meal;
					if (user_goals !== undefined) mainUpdates.user_goals = user_goals;

					const { error } = await supabase
						.from("user_preferences")
						.update(mainUpdates)
						.eq("id", preferences.id);

					if (error) throw error;
				}

				// Update preference tags if provided
				if (updates.user_preference_tags !== undefined) {
					const tagIds = updates.user_preference_tags.map((t) => t.tag_id);
					await updatePreferenceTags(tagIds);
				}

				// Update local state
				setPreferences((prev) => (prev ? { ...prev, ...updates } : null));

				if (__DEV__) {
					console.log("✅ Updated all preferences:", updates);
				}
			} catch (err) {
				const error = err instanceof Error ? err : new Error(String(err));
				console.error("Error updating all preferences:", error);
				setError(error);
				throw error;
			} finally {
				setLoading(false);
			}
		},
		[preferences?.id, userId, updatePreferenceTags],
	);

	// Helper methods
	const hasPreferences = useCallback(() => {
		return preferences !== null && preferences.id !== "";
	}, [preferences]);

	const hasGoals = useCallback(() => {
		return (preferences?.user_goals?.length ?? 0) > 0;
	}, [preferences]);

	const hasPreferenceTags = useCallback(() => {
		return (preferences?.user_preference_tags?.length ?? 0) > 0;
	}, [preferences]);

	const getPreferenceTagIds = useCallback(() => {
		return preferences?.user_preference_tags?.map((t) => t.tag_id) || [];
	}, [preferences]);

	// Initialize preferences when user logs in
	useEffect(() => {
		if (userId && !initialized) {
			fetchPreferences();
		}
	}, [userId, initialized, fetchPreferences]);

	// Clear preferences on logout
	useEffect(() => {
		if (!userId && preferences) {
			setPreferences(null);
			setInitialized(false);
		}
	}, [userId, preferences]);

	const contextValue = useMemo(
		() => ({
			preferences,
			loading,
			error,
			initialized,
			refreshPreferences: fetchPreferences,
			updateMealsPerWeek,
			updateServesPerMeal,
			updateGoals,
			updatePreferenceTags,
			updateAllPreferences,
			hasPreferences,
			hasGoals,
			hasPreferenceTags,
			getPreferenceTagIds,
		}),
		[
			preferences,
			loading,
			error,
			initialized,
			fetchPreferences,
			updateMealsPerWeek,
			updateServesPerMeal,
			updateGoals,
			updatePreferenceTags,
			updateAllPreferences,
			hasPreferences,
			hasGoals,
			hasPreferenceTags,
			getPreferenceTagIds,
		],
	);

	return (
		<UserPreferencesContext.Provider value={contextValue}>
			{children}
		</UserPreferencesContext.Provider>
	);
}
