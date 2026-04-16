// ============================================================
// 宅建士 完全対策 - 問題誤り報告ストア
// ローカル保存 → 将来的にSupabaseで開発者に集約
// ============================================================

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logError } from '../services/errorLogger';

const STORAGE_KEY = '@takken_reports';

export type ReportReason =
  | 'wrong_answer'
  | 'typo'
  | 'unclear'
  | 'outdated'
  | 'other';

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  wrong_answer: '正解が誤っていると思う',
  typo: '誤字・脱字がある',
  unclear: '問題文・解説がわかりにくい',
  outdated: '法改正に対応していない',
  other: 'その他',
};

export interface QuestionReport {
  id: string;
  questionId: string;
  reason: ReportReason;
  detail: string;
  createdAt: string;
  synced: boolean;
}

interface ReportState {
  reports: QuestionReport[];
  addReport(questionId: string, reason: ReportReason, detail: string): void;
  loadReports(): Promise<void>;
  saveReports(): Promise<void>;
  markSynced(id: string): void;
}

export const useReportStore = create<ReportState>((set, get) => ({
  reports: [],

  addReport(questionId, reason, detail) {
    const report: QuestionReport = {
      id: `rep_${Date.now()}`,
      questionId,
      reason,
      detail,
      createdAt: new Date().toISOString(),
      synced: false,
    };
    set({ reports: [...get().reports, report] });
    get().saveReports();
  },

  markSynced(id) {
    set({
      reports: get().reports.map((r) => (r.id === id ? { ...r, synced: true } : r)),
    });
    get().saveReports();
  },

  async loadReports() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) set({ reports: JSON.parse(raw) });
    } catch (e) {
      logError(e, { context: 'report.loadReports' });
    }
  },

  async saveReports() {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(get().reports));
    } catch (e) {
      logError(e, { context: 'report.save' });
    }
  },
}));
