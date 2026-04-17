// ============================================================
// お知らせ取得フック
// Supabase から有効なお知らせを取得し、オフラインキャッシュ付きで返す
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, isSupabaseConfigured } from '../services/supabase';

// ─── 型定義 ───

export type AnnouncementType = 'maintenance' | 'update' | 'legal' | 'info';
export type AnnouncementSeverity = 'info' | 'warning' | 'critical';

export interface Announcement {
  id: string;
  type: AnnouncementType;
  severity: AnnouncementSeverity;
  title: string;
  body: string;
  active: boolean;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
}

// ─── 定数 ───

const CACHE_KEY = '@announcements_cache';
const DISMISSED_KEY = '@dismissed_announcements';

/** severity の優先度（低い値 = 高優先） */
const SEVERITY_ORDER: Record<AnnouncementSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

// ─── フック本体 ───

export function useAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  /** Supabase からアクティブなお知らせを取得 */
  const fetchAnnouncements = useCallback(async () => {
    if (!isSupabaseConfigured()) {
      setAnnouncements([]);
      setLoading(false);
      return;
    }

    try {
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('active', true)
        .lte('starts_at', now)
        .or(`ends_at.is.null,ends_at.gt.${now}`)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[useAnnouncements] fetch error:', error.message);
        // エラー時はキャッシュから復元
        await loadFromCache();
        return;
      }

      const items = (data ?? []) as Announcement[];

      // severity でソート（critical > warning > info）
      items.sort((a, b) => {
        const diff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        if (diff !== 0) return diff;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      // dismissed を除外してセット
      const dismissed = await getDismissedIds();
      const visible = items.filter(
        (a) => a.severity === 'critical' || !dismissed.includes(a.id),
      );

      setAnnouncements(visible);

      // キャッシュに保存（フルリスト）
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(items));
    } catch (err) {
      console.warn('[useAnnouncements] unexpected error:', err);
      await loadFromCache();
    } finally {
      setLoading(false);
    }
  }, []);

  /** キャッシュからお知らせを復元 */
  const loadFromCache = useCallback(async () => {
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const items: Announcement[] = JSON.parse(cached);
        const now = Date.now();

        // キャッシュ内でも有効期限をチェック
        const valid = items.filter(
          (a) =>
            a.active &&
            new Date(a.starts_at).getTime() <= now &&
            (a.ends_at === null || new Date(a.ends_at).getTime() > now),
        );

        const dismissed = await getDismissedIds();
        const visible = valid.filter(
          (a) => a.severity === 'critical' || !dismissed.includes(a.id),
        );

        setAnnouncements(visible);
      }
    } catch {
      // キャッシュ読込失敗は無視
    }
  }, []);

  /** dismissed ID 一覧を取得 */
  const getDismissedIds = async (): Promise<string[]> => {
    try {
      const raw = await AsyncStorage.getItem(DISMISSED_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  /** お知らせを dismiss（critical は不可） */
  const dismissAnnouncement = useCallback(async (id: string) => {
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    try {
      const existing = await getDismissedIds();
      if (!existing.includes(id)) {
        await AsyncStorage.setItem(
          DISMISSED_KEY,
          JSON.stringify([...existing, id]),
        );
      }
    } catch {
      // 保存失敗は無視（次回表示されるだけ）
    }
  }, []);

  // 初回ロード
  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  // アプリがフォアグラウンドに戻ったら再取得
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (
          appState.current.match(/inactive|background/) &&
          nextState === 'active'
        ) {
          fetchAnnouncements();
        }
        appState.current = nextState;
      },
    );

    return () => {
      subscription.remove();
    };
  }, [fetchAnnouncements]);

  return { announcements, loading, dismissAnnouncement };
}
