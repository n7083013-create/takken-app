// ============================================================
// Claude AI サービス（宅建問題の質問応答）
// サーバー経由でClaude APIを安全に呼び出す
// [FIX C2] 認証ヘッダーを付与してAPI呼び出し
// [Bugfix] ネット不安定時に意図せず AI 回数を消費する問題を回避
//   - 明らかにオフライン時は API を叩かずローカルでブロック
//   - サーバー到達前にカウントが消費される事故を防止
// ============================================================

import { useAuthStore } from '../store/useAuthStore';
import { API_BASE_URL } from '../constants/config';
import { isLikelyOffline } from '../utils/networkGuard';

const API_BASE = API_BASE_URL;

export type AskAIResult = {
  text: string;
  /** サーバー側の本日残回数（クライアントローカルカウントではなくこっちが正） */
  remaining: number | null;
};

// 互換性のため re-export (既存の import パスを壊さない)
export { isLikelyOffline };

/**
 * AIに問題について質問する
 * @param context 問題・選択肢・解説のコンテキスト
 * @param messages 会話履歴
 * @returns AIの回答テキスト + サーバー認定の残回数
 */
export async function askAI(
  context: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
): Promise<AskAIResult> {
  const TIMEOUT_MS = 20_000; // 20秒タイムアウト

  // 認証トークンを取得
  const session = useAuthStore.getState().session;
  if (!session?.access_token) {
    throw new Error('ログインが必要です。ログインしてからお試しください。');
  }

  // [Bugfix] 明らかにオフライン時はサーバーを叩かずローカルで止める
  // → AI回数を無駄に消費しない (サーバーは到達時点でカウントする設計のため)
  if (isLikelyOffline()) {
    throw new Error('オフラインのため AI に接続できません。通信環境を確認してから再度お試しください。(回数は消費されていません)');
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(`${API_BASE}/ai-chat`, {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ context, messages }),
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        throw new Error('セッションが切れました。再ログインしてください。');
      }
      if (res.status === 429) {
        throw new Error('リクエストが多すぎます。少し待ってからお試しください。');
      }
      throw new Error(data.error || 'AI解説の取得に失敗しました。');
    }

    const data = await res.json();
    return {
      text: data.text || 'AIからの回答を取得できませんでした。',
      remaining: typeof data.remaining === 'number' ? data.remaining : null,
    };
  } catch (e: any) {
    if (e.name === 'AbortError') {
      // [Bugfix] タイムアウト時は「カウントされている可能性がある」ことを明示
      // (サーバーがリクエスト受信時点でカウントする設計のため、判別不能)
      throw new Error('AI応答がタイムアウトしました。通信環境をご確認の上、再度お試しください。');
    }
    if (e.message && !e.message.includes('fetch')) throw e;
    throw new Error('ネットワークエラー: AIサービスに接続できません。');
  }
}
