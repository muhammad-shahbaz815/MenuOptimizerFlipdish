import { createClient } from '@supabase/supabase-js';

const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function checkAuth(req: Request) {
  const auth = req.headers.get('x-admin-secret');
  return ADMIN_SECRET && auth === ADMIN_SECRET;
}

export async function GET(req: Request) {
  if (!checkAuth(req)) return json({ error: 'Unauthorized' }, 401);
  if (!supabaseUrl || !supabaseServiceKey) return json({ error: 'Supabase not configured on server' }, 500);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: sessions, error } = await supabase
    .from('compare_sessions')
    .select('id, created_at, expires_at, submitted, menu_a, menu_b')
    .order('created_at', { ascending: false });

  if (error) return json({ error: error.message }, 500);

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
  // biome-ignore lint/suspicious/noExplicitAny: Supabase row type
  const enriched = (sessions ?? []).map((s: any) => {
    const menuAName = s.menu_a?.name || s.menu_a?.restaurantName || 'Untitled';
    const menuBName = s.menu_b?.name || s.menu_b?.restaurantName || null;
    const menuASize = JSON.stringify(s.menu_a || {}).length;
    const menuBSize = JSON.stringify(s.menu_b || {}).length;
    const storageBytes = menuASize + menuBSize;
    return {
      id: s.id,
      created_at: s.created_at,
      expires_at: s.expires_at,
      submitted: s.submitted,
      expired: s.expires_at ? new Date(s.expires_at) < now : false,
      menu_a_name: menuAName,
      menu_b_name: menuBName,
      storage_bytes: storageBytes,
      comment_count: countMap[s.id] || 0,
    };
  });

  // biome-ignore lint/suspicious/noExplicitAny: enriched row
  const totalStorageBytes = enriched.reduce((sum: number, s: any) => sum + s.storage_bytes, 0);

  let totalCreatedAllTime = null;
  let totalCompareAllTime = null;
  let totalCustomerAllTime = null;
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

  return json({
    sessions: enriched,
    total_sessions: enriched.length,
    total_storage_bytes: totalStorageBytes,
    total_created_all_time: totalCreatedAllTime,
    total_compare_all_time: totalCompareAllTime,
    total_customer_all_time: totalCustomerAllTime,
  });
}

export async function DELETE(req: Request) {
  if (!checkAuth(req)) return json({ error: 'Unauthorized' }, 401);
  if (!supabaseUrl || !supabaseServiceKey) return json({ error: 'Supabase not configured on server' }, 500);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return json({ error: 'Missing session id' }, 400);

  await supabase.from('comments').delete().eq('session_id', id);
  const { error } = await supabase.from('compare_sessions').delete().eq('id', id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
}
