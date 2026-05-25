// ============================================================
// Vercel Edge Middleware
// 役割: ホスト名ベースのルーティング
//   - takkenkanzen.com / www.takkenkanzen.com  →  / を /lp.html に rewrite（LP）
//   - app.takkenkanzen.com / 旧Vercelドメイン →  そのままアプリ本体（index.html）
//
// vercel.json の rewrites では filesystem precedence により
// dist/index.html がルートで先に応答してしまうため、
// それより前に走る Edge Middleware で書き換える。
// ============================================================

export const config = {
  // ルートのみ対象。/ai-chat 等のサブパスは触らない（SPA ルーティングそのまま）
  matcher: '/',
};

export default function middleware(request) {
  const host = request.headers.get('host') || '';

  // apex / www は LP に書き換え
  if (host === 'takkenkanzen.com' || host === 'www.takkenkanzen.com') {
    const url = new URL(request.url);
    url.pathname = '/lp.html';
    return new Response(null, {
      headers: {
        'x-middleware-rewrite': url.toString(),
      },
    });
  }

  // それ以外（app.takkenkanzen.com / takken-app-olive.vercel.app 等）はスルー
}
