// ============================================================
// 予測スコアの日次履歴を記録＆取得
// ============================================================
// - 1日1回、現在の予測スコアを localStorage にスナップショット
// - 直近30日分を保持
// - 推移グラフ用に供給

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logError } from '../services/errorLogger';

const STORAGE_KEY = '@takken_prediction_history';
const MAX_DAYS = 30;

export interface PredictionSnapshot {
  date: string;         // YYYY-MM-DD
  score: number;        // 0-50
  passProbability: number; // 0-100
}

/** 今日の YYYY-MM-DD */
function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** スナップショットを非同期で保存 */
async function saveSnapshot(snapshot: PredictionSnapshot): Promise<PredictionSnapshot[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const arr: PredictionSnapshot[] = raw ? JSON.parse(raw) : [];

    // 同日付の既存があれば置き換え、なければ追加
    const idx = arr.findIndex((s) => s.date === snapshot.date);
    if (idx >= 0) {
      arr[idx] = snapshot;
    } else {
      arr.push(snapshot);
    }

    // 日付順に並べ替え、MAX_DAYS を超えたら古いものを削除
    arr.sort((a, b) => a.date.localeCompare(b.date));
    const trimmed = arr.slice(-MAX_DAYS);

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    return trimmed;
  } catch (e) {
    logError(e, { context: 'predictionHistory.save' });
    return [];
  }
}

async function loadHistory(): Promise<PredictionSnapshot[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    logError(e, { context: 'predictionHistory.load' });
    return [];
  }
}

/**
 * 予測スコアの履歴フック
 * - currentScore, currentProb が変わるたびに今日のスナップショットを更新
 * - 履歴配列を返す（推移グラフ用）
 */
export function usePredictionHistory(
  currentScore: number,
  currentProb: number,
  hasData: boolean,
): PredictionSnapshot[] {
  const [history, setHistory] = useState<PredictionSnapshot[]>([]);

  useEffect(() => {
    if (!hasData) return;

    const snap: PredictionSnapshot = {
      date: getTodayKey(),
      score: currentScore,
      passProbability: currentProb,
    };

    saveSnapshot(snap).then(setHistory);
  }, [currentScore, currentProb, hasData]);

  // 初回ロード
  useEffect(() => {
    loadHistory().then(setHistory);
  }, []);

  return history;
}
