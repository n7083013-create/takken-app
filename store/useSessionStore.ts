// ============================================================
// 学習セッション状態ストア
//
// 構成:
//  - combo / bestCombo: メモリ上のみ（セッション切れで自然消失）
//  - celebratedToday: ⚠ AsyncStorage に永続化（日付ごとリセット）
//    アプリ再起動時に「達成済みなのに祝福ポップアップが再表示」される
//    バグを修正するため (2026-05-23 ユーザー報告)
// ============================================================

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CELEBRATED_STORAGE_KEY = '@takken_celebrated_today';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

interface SessionState {
  /** 現在セッションの連続正解数 */
  combo: number;
  /** これまでのセッション最高コンボ */
  bestCombo: number;
  /** 今日表示した祝福の種類（多重表示防止） */
  celebratedToday: Set<string>;
  /** celebratedToday の対象日付 (YYYY-MM-DD) */
  celebratedDate: string;
  /** AsyncStorage からの初回ロード完了フラグ */
  celebratedLoaded: boolean;

  // Actions
  /** 正解を記録 → コンボ+1 */
  recordCorrect(): number;
  /** 不正解を記録 → コンボリセット */
  recordIncorrect(): void;
  /** コンボを明示的にリセット */
  resetCombo(): void;
  /** 今日の祝福済みフラグをセット (AsyncStorage に永続化) */
  markCelebrated(key: string): void;
  /** 今日すでに祝福済みか */
  isCelebrated(key: string): boolean;
  /** 日付変更時に呼ぶ：祝福フラグクリア */
  resetDailyFlags(): void;
  /** アプリ起動時に AsyncStorage から celebratedToday を復元 */
  loadCelebrated(): Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  combo: 0,
  bestCombo: 0,
  celebratedToday: new Set(),
  celebratedDate: todayStr(),
  celebratedLoaded: false,

  recordCorrect() {
    const next = get().combo + 1;
    set({
      combo: next,
      bestCombo: Math.max(get().bestCombo, next),
    });
    return next;
  },

  recordIncorrect() {
    set({ combo: 0 });
  },

  resetCombo() {
    set({ combo: 0 });
  },

  markCelebrated(key: string) {
    const today = todayStr();
    const state = get();
    // 日付が変わっていたら Set をリセットしてから追加
    const baseSet = state.celebratedDate === today ? state.celebratedToday : new Set<string>();
    const next = new Set(baseSet);
    next.add(key);
    set({ celebratedToday: next, celebratedDate: today });
    // 非同期で永続化 (失敗は無視: 次回起動時にもう一度祝福されるだけ)
    AsyncStorage.setItem(
      CELEBRATED_STORAGE_KEY,
      JSON.stringify({ date: today, keys: [...next] }),
    ).catch(() => {});
  },

  isCelebrated(key: string): boolean {
    const state = get();
    // 未ロード時は「祝福済み」として扱い、重複発火を防ぐ
    // (ロード完了後、本当に未祝福ならその時点で再評価される)
    if (!state.celebratedLoaded) return true;
    // 日付が変わっていたら未祝福扱い
    if (state.celebratedDate !== todayStr()) return false;
    return state.celebratedToday.has(key);
  },

  resetDailyFlags() {
    set({ celebratedToday: new Set(), celebratedDate: todayStr() });
    AsyncStorage.removeItem(CELEBRATED_STORAGE_KEY).catch(() => {});
  },

  async loadCelebrated() {
    try {
      const today = todayStr();
      const raw = await AsyncStorage.getItem(CELEBRATED_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { date?: string; keys?: string[] };
        if (parsed?.date === today && Array.isArray(parsed.keys)) {
          set({
            celebratedToday: new Set(parsed.keys),
            celebratedDate: today,
            celebratedLoaded: true,
          });
          return;
        }
      }
      // データなし or 日付ズレ → 空でロード完了
      set({
        celebratedToday: new Set(),
        celebratedDate: today,
        celebratedLoaded: true,
      });
    } catch {
      // 異常時もロード完了扱い (祝福を永久に抑制しないため)
      set({ celebratedLoaded: true });
    }
  },
}));
