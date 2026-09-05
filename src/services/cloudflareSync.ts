import { Note, CloudflareSyncConfig } from '../types';
import { parseNotesArray } from './noteValidation';

/**
 * Cloudflare Workers KV または REST API へのメモ同期クライアント
 */
export async function syncWithCloudflare(
  notes: Note[],
  config: CloudflareSyncConfig
): Promise<{ success: boolean; remoteNotes?: Note[]; error?: string }> {
  // 1. 設定されていない場合のテスト用セルフシミュレーションモードまたは実エンドポイント
  if (!config.workerUrl) {
    return {
      success: false,
      error: 'Cloudflare WorkerのURLが設定されていません。設定画面でURLを入力してください。'
    };
  }

  try {
    // ネットワークオンライン確認
    if (!navigator.onLine) {
      return {
        success: false,
        error: '現在オフラインです。インターネット接続が復帰したら同期されます。'
      };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.apiToken) {
      headers['Authorization'] = `Bearer ${config.apiToken}`;
    }

    // POSTでメモ配列とKVキーを同期
    const workerUrl = config.workerUrl.trim();
    try {
      const parsedUrl = new URL(workerUrl);
      if (!['https:', 'http:'].includes(parsedUrl.protocol)) throw new Error('unsupported protocol');
    } catch {
      return { success: false, error: 'Cloudflare Worker URLの形式が正しくありません。' };
    }

    const response = await fetch(workerUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'sync',
        namespace: config.kvNamespace || 'NOTES_KV',
        notes,
        clientTimestamp: Date.now()
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return {
        success: false,
        error: `Cloudflare同期エラー (${response.status}): ${errorText || response.statusText}`
      };
    }

    const data: unknown = await response.json().catch(() => null);
    if (data && typeof data === 'object' && 'notes' in data) {
      const parsedRemoteNotes = parseNotesArray((data as { notes?: unknown }).notes);
      if (!parsedRemoteNotes) {
        return {
          success: false,
          error: '同期先から不正なメモデータが返されました。ローカルの内容は上書きしていません。'
        };
      }
      return { success: true, remoteNotes: parsedRemoteNotes };
    }

    // A successful Worker may only return { success, count }. In that case do not
    // feed the submitted snapshot back into React state; doing so can roll back edits
    // made while the request was in flight.
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '同期中に通信エラーが発生しました';
    return {
      success: false,
      error: message
    };
  }
}

/**
 * Cloudflare Worker 用のテンプレートコード（ユーザーがコピーしてすぐ使える）
 */
export const SAMPLE_WORKER_CODE = `/**
 * Cloudflare Worker for iOS Notes Sync
 * 1. Cloudflare ダッシュボードで Workers & Pages > 作成
 * 2. KV ネームスペース 'NOTES_KV' をバインド
 * 3. 以下のコードを貼り付けてデプロイ
 */

export default {
  async fetch(request, env, ctx) {
    // CORS ヘッダー
    const corsHeaders = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Recommended: set SYNC_TOKEN as a Worker secret and enter the same token in the app.
      if (env.SYNC_TOKEN) {
        const authorization = request.headers.get('Authorization') || '';
        if (authorization !== 'Bearer ' + env.SYNC_TOKEN) {
          return new Response('Unauthorized', { status: 401, headers: corsHeaders });
        }
      }

      if (request.method === 'GET') {
        const notes = await env.NOTES_KV.get('user_notes', { type: 'json' }) || [];
        return new Response(JSON.stringify({ notes }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (request.method === 'POST') {
        const body = await request.json();
        if (body.action === 'sync' && Array.isArray(body.notes)) {
          // KV に最新のメモ一覧を保存
          await env.NOTES_KV.put('user_notes', JSON.stringify(body.notes));
          return new Response(JSON.stringify({ success: true, count: body.notes.length, notes: body.notes }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      return new Response('Invalid Request', { status: 400, headers: corsHeaders });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
`;
