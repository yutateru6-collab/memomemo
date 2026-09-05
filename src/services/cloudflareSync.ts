import { Note, CloudflareSyncConfig } from '../types';
import { normalizeNotes } from './storage';

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
    const response = await fetch(config.workerUrl, {
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

    const data = await response.json().catch(() => null);
    const remoteNotes = data && Object.prototype.hasOwnProperty.call(data, 'notes')
      ? normalizeNotes(data.notes)
      : null;

    if (data && Object.prototype.hasOwnProperty.call(data, 'notes') && remoteNotes === null) {
      return {
        success: false,
        error: '同期先から不正なメモデータが返されました。ローカルデータは変更していません。'
      };
    }

    // remoteNotes is included only when the server actually returned a valid notes array.
    // A normal "saved successfully" response must never echo stale local state back into React.
    return remoteNotes === null
      ? { success: true }
      : { success: true, remoteNotes };
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
 * Cloudflare Worker for Memomemo Sync
 * 1. Cloudflare ダッシュボードで Workers & Pages > 作成
 * 2. KV ネームスペース 'NOTES_KV' をバインド
 * 3. 任意: Worker secret SYNC_TOKEN を設定し、アプリ側にも同じAPIトークンを入力
 * 4. 以下のコードを貼り付けてデプロイ
 */

export default {
  async fetch(request, env, ctx) {
    const allowedOrigin = env.ALLOWED_ORIGIN || '*';
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // If SYNC_TOKEN is configured as a Worker secret, every data request must authenticate.
    if (env.SYNC_TOKEN) {
      const expected = 'Bearer ' + env.SYNC_TOKEN;
      if (request.headers.get('Authorization') !== expected) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    try {
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
          return new Response(JSON.stringify({ success: true, count: body.notes.length }), {
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
