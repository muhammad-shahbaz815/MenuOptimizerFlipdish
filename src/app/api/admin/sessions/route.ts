import { createClient } from '@supabase/supabase-js';

const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const runtime = 'edge';

export async function GET(req: Request) {
  const auth = req.headers.get('x-admin-secret');
  if (!ADMIN_SECRET || auth !== ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Supabase not configured on server' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: sessions, error } = await supabase
    .from('compare_sessions')
    .select('id, created_at, expires_at, submitted, menu_a, menu_b')
    .order('created_at', { ascending: false });

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  const { data: commentCounts, error: ccError } = await supabase
    .from('comments')
    .select('session_id');

  const countMap: Record<string, number> = {};
  if (!ccError && commentCounts) {
    for (const row of commentCounts) {
      countMap[row.session_id] = (countMap[row.session_id] || 0) + 1;
    }
  }

  const now = new Date();
  const enriched = (sessions || []).map((s: Record<string, unknown>) => {
    const menuA = s.menu_a as Record<string, unknown> | null;
    const menuB = s.menu_b as Record<string, unknown> | null;
    const menuAName = (menuA?.name || menuA?.restaurantName || 'Untitled') as string;
    const menuBName = (menuB?.name || menuB?.restaurantName || null) as string | null;
    const menuASize = JSON.stringify(menuA || {}).length;
    const menuBSize = JSON.stringify(menuB || {}).length;
    const storageBytes = menuASize + menuBSize;
    return {
      id: s.id,
      created_at: s.created_at,
      expires_at: s.expires_at,
      submitted: s.submitted,
      expired: s.expires_at ? new Date(s.expires_at as string) < now : false,
      menu_a_name: menuAName,
      menu_b_name: menuBName,
      storage_bytes: storageBytes,
      comment_count: countMap[s.id as string] || 0,
    };
  });

  const totalStorageBytes = enriched.reduce((sum: number, s) => sum + s.storage_bytes, 0);

  let totalCreatedAllTime: number | null = null;
  let totalCompareAllTime: number | null = null;
  let totalCustomerAllTime: number | null = null;
  try {
    const { count: allCount } = await supabase
      .from('session_events')
      .select('*', { count: 'exact', head: true });
    const { count: compareCount } = await supabase
      .from('session_events')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'compare');
    const { count: customerCount } = await supabase
      .from('session_events')
      .select('*', { count: 'exact', head: true })
      .eq('type', 'customer');
    totalCreatedAllTime = allCount ?? 0;
    totalCompareAllTime = compareCount ?? 0;
    totalCustomerAllTime = customerCount ?? 0;
  } catch {
    // Table may not exist yet
  }

  return new Response(JSON.stringify({
    sessions: enriched,
    total_sessions: enriched.length,
    total_storage_bytes: totalStorageBytes,
    total_created_all_time: totalCreatedAllTime,
    total_compare_all_time: totalCompareAllTime,
    total_customer_all_time: totalCustomerAllTime,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export async function DELETE(req: Request) {
  const auth = req.headers.get('x-admin-secret');
  if (!ADMIN_SECRET || auth !== ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Supabase not configured on server' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return new Response(JSON.stringify({ error: 'Missing session id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  await supabase.from('comments').delete().eq('session_id', id);
  const { error } = await supabase.from('compare_sessions').delete().eq('id', id);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
