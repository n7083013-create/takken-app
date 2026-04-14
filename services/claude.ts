// ============================================================
// Claude AI API サービス（宅建問題の質問応答）
// ============================================================

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

// APIキーは環境変数 or AsyncStorage から取得（本番ではサーバー経由を推奨）
let apiKey: string | null = null;

export function setClaudeAPIKey(key: string) {
  apiKey = key;
}

/**
 * AIに問題について質問する
 * @param context 問題・選択肢・解説のコンテキスト
 * @param messages 会話履歴
 * @returns AIの回答テキスト
 */
export async function askAI(
  context: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
): Promise<string> {
  if (!apiKey) {
    // APIキーがない場合はローカルフォールバック
    return generateLocalResponse(context, messages);
  }

  const systemPrompt = [
    'あなたは宅建試験（宅地建物取引士試験）の専門家の講師です。',
    '受験生から問題の解説について質問を受けています。',
    '',
    '以下のルールに従って回答してください：',
    '- 難しい法律用語は噛み砕いてわかりやすく説明する',
    '- 具体例を使って説明する',
    '- 関連する条文番号があれば添える',
    '- 簡潔に回答する（長すぎない）',
    '- 日本語で回答する',
    '',
    '【問題のコンテキスト】',
    context,
  ].join('\n');

  const TIMEOUT_MS = 15_000; // 15秒タイムアウト

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    const res = await fetch(CLAUDE_API_URL, {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!res.ok) {
      // セキュリティ: 内部エラー詳細はログのみ、ユーザーにはサニタイズされたメッセージ
      const errBody = await res.text();
      console.error(`[Claude API] ${res.status}:`, errBody);
      if (res.status === 429) {
        throw new Error('リクエストが多すぎます。しばらく待ってからお試しください。');
      }
      if (res.status === 401 || res.status === 403) {
        throw new Error('APIキーが無効です。設定画面でAPIキーを確認してください。');
      }
      if (res.status >= 500) {
        throw new Error('AIサービスが一時的に利用できません。しばらくお待ちください。');
      }
      throw new Error('AI解説の取得に失敗しました。時間をおいて再度お試しください。');
    }

    clearTimeout(timeoutId);
    const data = await res.json();
    return data.content?.[0]?.text ?? 'AIからの回答を取得できませんでした。';
  } catch (e: any) {
    // タイムアウト
    if (e.name === 'AbortError') {
      throw new Error('AI応答がタイムアウトしました。通信環境をご確認の上、再度お試しください。');
    }
    // 既にサニタイズ済みのエラーはそのまま throw
    if (e.message && !e.message.includes('fetch')) throw e;
    console.error('[Claude API] Network error:', e);
    throw new Error('ネットワークエラー: AIサービスに接続できません。通信環境をご確認ください。');
  }
}

/**
 * APIキーがない場合のローカルフォールバック
 * 問題コンテキストから簡易的な追加解説を生成
 */
function generateLocalResponse(
  context: string,
  messages: { role: 'user' | 'assistant'; content: string }[],
): string {
  const lastMsg = messages[messages.length - 1]?.content ?? '';
  const lower = lastMsg.toLowerCase();

  if (lower.includes('簡単') || lower.includes('わかりやすく')) {
    return [
      'この問題のポイントをシンプルにまとめると：',
      '',
      '正解の選択肢は、法律の条文に正確に沿った内容です。',
      '不正解の選択肢は、一見正しそうに見えますが、条件や範囲が微妙に異なっています。',
      '',
      '💡 ヒント：選択肢を読む時は「常に」「必ず」「すべて」のような断定的な表現に注意しましょう。法律には例外が多いため、断定表現は誤りであることが多いです。',
      '',
      '※ より詳しいAI解説をご利用になるには、設定画面でAPIキーを設定してください。',
    ].join('\n');
  }

  if (lower.includes('具体例') || lower.includes('例え')) {
    return [
      '具体的な場面で考えてみましょう：',
      '',
      '例えば、あなたが実際にマイホームを購入する場面を想像してください。',
      '不動産取引では様々な法律が関わりますが、この問題で問われているのはその中の重要なルールの一つです。',
      '',
      '実務では、宅建士がお客様に重要事項を説明する際にも、この知識が必要になります。',
      '',
      '※ より詳しいAI解説をご利用になるには、設定画面でAPIキーを設定してください。',
    ].join('\n');
  }

  if (lower.includes('なぜ') || lower.includes('間違い') || lower.includes('誤り')) {
    return [
      'その選択肢が誤りである理由：',
      '',
      '法律の条文では、特定の条件や例外が定められています。',
      '誤りの選択肢は、その条件を省略したり、範囲を広げすぎたりしている場合がほとんどです。',
      '',
      '📝 学習のコツ：正解の根拠となる条文番号をセットで覚えると、似た問題が出ても対応できます。',
      '',
      '※ より詳しいAI解説をご利用になるには、設定画面でAPIキーを設定してください。',
    ].join('\n');
  }

  return [
    'ご質問ありがとうございます。',
    '',
    'この問題は宅建試験で頻出のテーマです。',
    '解説に記載されている条文を中心に、以下のポイントを押さえましょう：',
    '',
    '1. 正解の選択肢がなぜ正しいのか（条文の根拠）',
    '2. 各不正解の選択肢がどこが間違っているのか',
    '3. 似た問題が出た時の見分け方',
    '',
    '※ より詳しいAI解説をご利用になるには、設定画面でAPIキーを設定してください。',
  ].join('\n');
}
