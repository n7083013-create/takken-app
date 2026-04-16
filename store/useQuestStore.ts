// ============================================================
// 宅建士 完全対策 - クエスト進捗ストア
// ============================================================

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QuestMissionProgress } from '../types';
import { QUEST_CHAPTERS, ALL_QUEST_MISSIONS } from '../data/quests';
import { logError } from '../services/errorLogger';

const STORAGE_KEY = '@takken_quest';

interface QuestState {
  missionProgress: Record<string, QuestMissionProgress>;

  // Actions
  recordMissionResult(missionId: string, score: number): void;
  getMissionProgress(missionId: string): QuestMissionProgress | undefined;
  isMissionUnlocked(missionId: string): boolean;
  isMissionCompleted(missionId: string): boolean;
  getChapterProgress(chapterId: string): {
    total: number;
    completed: number;
    unlocked: number;
  };
  getNextRecommendedMission(): string | null;
  getOverallProgress(): { total: number; completed: number; percent: number };
  resetQuest(): void;
  loadQuest(): Promise<void>;
  saveQuest(): Promise<void>;
}

export const useQuestStore = create<QuestState>((set, get) => ({
  missionProgress: {},

  recordMissionResult(missionId: string, score: number) {
    const state = get();
    const existing = state.missionProgress[missionId];
    const now = new Date().toISOString();
    const mission = ALL_QUEST_MISSIONS.find((m) => m.id === missionId);
    if (!mission) return;

    const passed = score >= mission.passingRate;
    const updated: QuestMissionProgress = {
      missionId,
      bestScore: Math.max(existing?.bestScore ?? 0, score),
      attempts: (existing?.attempts ?? 0) + 1,
      completedAt: passed ? (existing?.completedAt ?? now) : existing?.completedAt,
      lastAttemptAt: now,
    };

    set({
      missionProgress: { ...state.missionProgress, [missionId]: updated },
    });
    get().saveQuest();
  },

  getMissionProgress(missionId: string) {
    return get().missionProgress[missionId];
  },

  isMissionUnlocked(missionId: string): boolean {
    const { missionProgress } = get();

    // 最初のチャプターの最初のミッションは常にアンロック
    for (const chapter of QUEST_CHAPTERS) {
      for (let i = 0; i < chapter.missions.length; i++) {
        if (chapter.missions[i].id === missionId) {
          // チャプター内の最初のミッション
          if (i === 0) {
            // 前のチャプターの最後のミッションがクリアされているか
            const chIdx = QUEST_CHAPTERS.indexOf(chapter);
            if (chIdx === 0) return true; // 最初のチャプター → 常にアンロック
            const prevChapter = QUEST_CHAPTERS[chIdx - 1];
            const prevLastMission = prevChapter.missions[prevChapter.missions.length - 1];
            const prevProg = missionProgress[prevLastMission.id];
            return !!(prevProg?.completedAt);
          }
          // チャプター内の2番目以降 → 前のミッションがクリア済みか
          const prevMission = chapter.missions[i - 1];
          const prevProg = missionProgress[prevMission.id];
          return !!(prevProg?.completedAt);
        }
      }
    }
    return false;
  },

  isMissionCompleted(missionId: string): boolean {
    const prog = get().missionProgress[missionId];
    return !!(prog?.completedAt);
  },

  getChapterProgress(chapterId: string) {
    const chapter = QUEST_CHAPTERS.find((c) => c.id === chapterId);
    if (!chapter) return { total: 0, completed: 0, unlocked: 0 };

    const { missionProgress, isMissionUnlocked } = get();
    let completed = 0;
    let unlocked = 0;
    for (const m of chapter.missions) {
      if (missionProgress[m.id]?.completedAt) completed++;
      if (isMissionUnlocked(m.id)) unlocked++;
    }
    return { total: chapter.missions.length, completed, unlocked };
  },

  getNextRecommendedMission(): string | null {
    const { isMissionUnlocked, isMissionCompleted } = get();

    for (const chapter of QUEST_CHAPTERS) {
      for (const mission of chapter.missions) {
        if (isMissionUnlocked(mission.id) && !isMissionCompleted(mission.id)) {
          return mission.id;
        }
      }
    }
    return null; // 全ミッションクリア
  },

  getOverallProgress() {
    const total = ALL_QUEST_MISSIONS.length;
    const completed = Object.values(get().missionProgress).filter(
      (p) => p.completedAt,
    ).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percent };
  },

  resetQuest() {
    set({ missionProgress: {} });
    AsyncStorage.removeItem(STORAGE_KEY);
  },

  async loadQuest() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        set({ missionProgress: data.missionProgress ?? {} });
      }
    } catch (e) {
      logError(e, { context: 'quest.load' });
    }
  },

  async saveQuest() {
    try {
      const { missionProgress } = get();
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ missionProgress }));
    } catch (e) {
      logError(e, { context: 'quest.save' });
    }
  },
}));
