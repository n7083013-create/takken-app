// ============================================================
// 宅建士 完全対策 - 問題誤り報告ストア
// ローカル保存 + 既存 feedback 経路(ai-chat mode=feedback)で運営へサーバー送信。
// 新規DBテーブル不要: Resend 経由でサポート受信箱にメール到達。
// 送信失敗時はローカル保持し、起動時 syncPendingReports() で再送。
// ============================================================

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logError } from '../services/errorLogger';
import { API_BASE_URL } from '../constants/config';

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
  /** 未送信(synced:false)の報告をサーバーへ再送。起動時に呼ぶ。 */
  syncPendingReports(): Promise<void>;
  resetStore(): void;
  markSynced(id: string): void;
}

/**
 * 問題報告を既存 feedback 経路(/ai-chat mode=feedback)でサーバーへ送る。
 * Resend 経由で運営のサポート受信箱にメール到達する(新規DB不要)。
 * 成功時 true。失敗時 false を返し、呼び出し側がローカル保持→次回再送する。
 */
async function postReportToServer(report: QuestionReport): Promise<boolean> {
  try {
    const reasonLabel = REPORT_REASON_LABELS[report.reason] ?? report.reason;
    const text =
      `【問題報告】\n問題ID: ${report.questionId}\n理由: ${reasonLabel}\n` +
      `詳細: ${report.detail?.trim() || '(記載なし)'}`;
    // ログイン中ならトークンを付与(運営側で user_id を把握できる)。未ログインでも送信可。
    let token: string | undefined;
    try {
      // 循環依存回避のため動的 require
      const { supabase } = require('../services/supabase');
      const { data } = await supabase.auth.getSession();
      token = data?.session?.access_token;
    } catch {
      /* 未ログイン/未設定でも匿名送信を試みる */
    }
    const res = await fetch(`${API_BASE_URL}/ai-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        mode: 'feedback',
        category: 'bug', // 問題の誤り=コンテンツのバグとして運営に届ける
        body: text,
        contactEmail: '',
        meta: { kind: 'question_report', questionId: report.questionId, reason: report.reason },
      }),
    });
    return res.ok;
  } catch (e) {
    logError(e, { context: 'report.postToServer' });
    return false;
  }
}

export const useReportStore = create<ReportState>((set, get) => ({
  reports: [],

  resetStore() {
    set({ reports: [] });
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  },

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
    // サーバー送信(失敗してもローカル保持。起動時 syncPendingReports で再送)
    postReportToServer(report)
      .then((ok) => {
        if (ok) get().markSynced(report.id);
      })
      .catch(() => {});
  },

  markSynced(id) {
    set({
      reports: get().reports.map((r) => (r.id === id ? { ...r, synced: true } : r)),
    });
    get().saveReports();
  },

  async syncPendingReports() {
    const pending = get().reports.filter((r) => !r.synced);
    for (const r of pending) {
      // 順次送信(件数は通常ごく少数)。1件成功ごとに markSynced。
      // eslint-disable-next-line no-await-in-loop
      const ok = await postReportToServer(r);
      if (ok) get().markSynced(r.id);
    }
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
