// ============================================================
// 宅建士 完全対策 - 実績バッジストア
// ゲーミフィケーションで継続率・モチベーションUP
// ============================================================

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Achievement, AchievementId, Category } from '../types';
import { logError } from '../services/errorLogger';

const STORAGE_KEY = '@takken_achievements';

// ── 全実績定義 ──
export const ALL_ACHIEVEMENTS: Achievement[] = [
  // ストリーク系
  { id: 'streak_3', title: '三日坊主突破', description: '3日連続で学習した', icon: '🔥', condition: '3日連続学習' },
  { id: 'streak_7', title: '一週間の習慣', description: '7日連続で学習した', icon: '🔥', condition: '7日連続学習' },
  { id: 'streak_14', title: '2週間マラソン', description: '14日連続で学習した', icon: '💪', condition: '14日連続学習' },
  { id: 'streak_30', title: '30日の鉄人', description: '30日連続で学習した', icon: '🏆', condition: '30日連続学習' },
  { id: 'streak_60', title: '60日の継続力', description: '60日連続で学習した', icon: '👑', condition: '60日連続学習' },
  { id: 'streak_100', title: '100日の伝説', description: '100日連続で学習した', icon: '🌟', condition: '100日連続学習' },

  // 解答数系
  { id: 'answers_10', title: 'はじめの一歩', description: '10問解答した', icon: '📝', condition: '累計10問解答' },
  { id: 'answers_50', title: '50問突破', description: '50問解答した', icon: '📚', condition: '累計50問解答' },
  { id: 'answers_100', title: '100問達成', description: '100問解答した', icon: '🎯', condition: '累計100問解答' },
  { id: 'answers_300', title: '300問の努力', description: '300問解答した', icon: '💎', condition: '累計300問解答' },
  { id: 'answers_500', title: '500問の修行', description: '500問解答した', icon: '⚡', condition: '累計500問解答' },
  { id: 'answers_1000', title: '1000問の覇者', description: '1000問解答した', icon: '🏅', condition: '累計1000問解答' },

  // 正答率系
  { id: 'accuracy_70', title: '合格圏突入', description: '全体正答率が70%に到達', icon: '📊', condition: '正答率70%以上（50問以上解答後）' },
  { id: 'accuracy_80', title: '実力者', description: '全体正答率が80%に到達', icon: '📈', condition: '正答率80%以上（100問以上解答後）' },
  { id: 'accuracy_90', title: '達人の域', description: '全体正答率が90%に到達', icon: '🌟', condition: '正答率90%以上（200問以上解答後）' },

  // 模擬試験系
  { id: 'exam_first', title: '初めての模擬試験', description: '模擬試験を初めて受験した', icon: '📋', condition: '模擬試験を1回受験' },
  { id: 'exam_pass', title: '合格ライン突破', description: '模擬試験で35点以上取得', icon: '🎉', condition: '模擬試験で35点以上' },
  { id: 'exam_40', title: '40点の壁突破', description: '模擬試験で40点以上取得', icon: '🏆', condition: '模擬試験で40点以上' },
  { id: 'exam_45', title: '圧倒的実力', description: '模擬試験で45点以上取得', icon: '👑', condition: '模擬試験で45点以上' },
  { id: 'exam_perfect', title: '完全無欠', description: '模擬試験で満点を取得', icon: '💯', condition: '模擬試験で50点' },

  // クエスト系
  { id: 'quest_first', title: 'クエスト開始', description: '初めてのミッションをクリア', icon: '🗺️', condition: 'クエスト1ミッションクリア' },
  { id: 'quest_10', title: '10ミッション達成', description: '10ミッションをクリア', icon: '⭐', condition: 'クエスト10ミッションクリア' },
  { id: 'quest_30', title: '30ミッション達成', description: '30ミッションをクリア', icon: '🌟', condition: 'クエスト30ミッションクリア' },
  { id: 'quest_all', title: 'クエストマスター', description: '全ミッションをクリア', icon: '🏅', condition: '全ミッションクリア' },

  // カテゴリ制覇系
  { id: 'master_kenri', title: '権利関係マスター', description: '権利関係の全問に正解', icon: '⚖️', condition: '権利関係の全問正解経験' },
  { id: 'master_takkengyoho', title: '宅建業法マスター', description: '宅建業法の全問に正解', icon: '🏢', condition: '宅建業法の全問正解経験' },
  { id: 'master_horei', title: '法令制限マスター', description: '法令上の制限の全問に正解', icon: '📋', condition: '法令上の制限の全問正解経験' },
  { id: 'master_tax', title: '税その他マスター', description: '税・その他の全問に正解', icon: '💰', condition: '税・その他の全問正解経験' },

  // 一問一答系
  { id: 'quick_50', title: '一問一答50問', description: '一問一答を50問解答', icon: '⚡', condition: '一問一答50問解答' },
  { id: 'quick_100', title: '一問一答100問', description: '一問一答を100問解答', icon: '💫', condition: '一問一答100問解答' },
  { id: 'quick_500', title: '一問一答マスター', description: '一問一答を500問解答', icon: '🌟', condition: '一問一答500問解答' },
];

interface AchievementState {
  unlocked: Record<string, string>;   // achievementId -> unlockedAt ISO string
  newlyUnlocked: AchievementId[];     // 未表示の新規解除バッジ

  // Actions
  checkAndUnlock(params: CheckParams): AchievementId[];
  dismissNew(id: AchievementId): void;
  isUnlocked(id: AchievementId): boolean;
  getAll(): (Achievement & { unlockedAt?: string })[];
  getUnlockedCount(): number;
  loadAchievements(): Promise<void>;
  saveAchievements(): Promise<void>;
}

export interface CheckParams {
  streak: number;
  totalAnswers: number;
  accuracy: number;            // 0-1
  examScore?: number;          // 模試の得点（0-50）
  questCompleted?: number;     // クエスト完了数
  questTotal?: number;         // クエスト全ミッション数
  quickQuizTotal?: number;     // 一問一答の解答数
  categoryMastered?: Category; // カテゴリ制覇チェック
}

export const useAchievementStore = create<AchievementState>((set, get) => ({
  unlocked: {},
  newlyUnlocked: [],

  checkAndUnlock(params: CheckParams): AchievementId[] {
    const state = get();
    const now = new Date().toISOString();
    const newUnlocks: AchievementId[] = [];

    function tryUnlock(id: AchievementId, condition: boolean) {
      if (!state.unlocked[id] && condition) {
        newUnlocks.push(id);
      }
    }

    // ストリーク系
    tryUnlock('streak_3', params.streak >= 3);
    tryUnlock('streak_7', params.streak >= 7);
    tryUnlock('streak_14', params.streak >= 14);
    tryUnlock('streak_30', params.streak >= 30);
    tryUnlock('streak_60', params.streak >= 60);
    tryUnlock('streak_100', params.streak >= 100);

    // 解答数系
    tryUnlock('answers_10', params.totalAnswers >= 10);
    tryUnlock('answers_50', params.totalAnswers >= 50);
    tryUnlock('answers_100', params.totalAnswers >= 100);
    tryUnlock('answers_300', params.totalAnswers >= 300);
    tryUnlock('answers_500', params.totalAnswers >= 500);
    tryUnlock('answers_1000', params.totalAnswers >= 1000);

    // 正答率系（一定数以上解答後のみ）
    tryUnlock('accuracy_70', params.totalAnswers >= 50 && params.accuracy >= 0.7);
    tryUnlock('accuracy_80', params.totalAnswers >= 100 && params.accuracy >= 0.8);
    tryUnlock('accuracy_90', params.totalAnswers >= 200 && params.accuracy >= 0.9);

    // 模擬試験系
    if (params.examScore !== undefined) {
      tryUnlock('exam_first', true);
      tryUnlock('exam_pass', params.examScore >= 35);
      tryUnlock('exam_40', params.examScore >= 40);
      tryUnlock('exam_45', params.examScore >= 45);
      tryUnlock('exam_perfect', params.examScore >= 50);
    }

    // クエスト系
    if (params.questCompleted !== undefined) {
      tryUnlock('quest_first', params.questCompleted >= 1);
      tryUnlock('quest_10', params.questCompleted >= 10);
      tryUnlock('quest_30', params.questCompleted >= 30);
      if (params.questTotal && params.questCompleted >= params.questTotal) {
        tryUnlock('quest_all', true);
      }
    }

    // 一問一答系
    if (params.quickQuizTotal !== undefined) {
      tryUnlock('quick_50', params.quickQuizTotal >= 50);
      tryUnlock('quick_100', params.quickQuizTotal >= 100);
      tryUnlock('quick_500', params.quickQuizTotal >= 500);
    }

    // カテゴリ制覇
    if (params.categoryMastered) {
      const catMap: Record<Category, AchievementId> = {
        kenri: 'master_kenri',
        takkengyoho: 'master_takkengyoho',
        horei_seigen: 'master_horei',
        tax_other: 'master_tax',
      };
      tryUnlock(catMap[params.categoryMastered], true);
    }

    if (newUnlocks.length > 0) {
      const updatedUnlocked = { ...state.unlocked };
      for (const id of newUnlocks) {
        updatedUnlocked[id] = now;
      }
      set({
        unlocked: updatedUnlocked,
        newlyUnlocked: [...state.newlyUnlocked, ...newUnlocks],
      });
      get().saveAchievements();
    }

    return newUnlocks;
  },

  dismissNew(id: AchievementId) {
    set((state) => ({
      newlyUnlocked: state.newlyUnlocked.filter((x) => x !== id),
    }));
  },

  isUnlocked(id: AchievementId): boolean {
    return !!get().unlocked[id];
  },

  getAll(): (Achievement & { unlockedAt?: string })[] {
    const { unlocked } = get();
    return ALL_ACHIEVEMENTS.map((a) => ({
      ...a,
      unlockedAt: unlocked[a.id],
    }));
  },

  getUnlockedCount(): number {
    return Object.keys(get().unlocked).length;
  },

  async loadAchievements() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        set({
          unlocked: data.unlocked ?? {},
          newlyUnlocked: data.newlyUnlocked ?? [],
        });
      }
    } catch (e) {
      logError(e, { context: 'achievement.load' });
    }
  },

  async saveAchievements() {
    try {
      const { unlocked, newlyUnlocked } = get();
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ unlocked, newlyUnlocked }));
    } catch (e) {
      logError(e, { context: 'achievement.save' });
    }
  },
}));
