// Faraj League Admin Auth — password login, returns JWT
// Set ADMIN_PASSWORD, SUPABASE_SERVICE_ROLE_KEY in Supabase Edge Function secrets

import { SignJWT } from 'https://deno.land/x/jose@v5.2.0/index.ts';
import { createServiceClient } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function getIp(req: Request): string {
  const ff = req.headers.get('X-Forwarded-For');
  if (ff) {
    const first = ff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('X-Real-IP');
  if (real) return real;
  return 'unknown';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
    );
  }

  try {
    const body = await req.json();
    const password = body?.password ?? '';
    const ip = getIp(req);

    const adminPassword = Deno.env.get('ADMIN_PASSWORD');
    if (!adminPassword) {
      console.error('ADMIN_PASSWORD not set in Edge Function secrets');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Rate limiting (requires SUPABASE_SERVICE_ROLE_KEY)
    let supabase;
    try {
      supabase = await createServiceClient();
    } catch (e) {
      console.error('createServiceClient failed:', e);
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // 1. Delete old attempts (> 1 minute ago)
    await supabase.from('login_attempts').delete().eq('ip', ip).lt('attempted_at', new Date(Date.now() - 60000).toISOString());

    // 2. Count remaining attempts
    const { data: attempts, error: countErr } = await supabase.from('login_attempts').select('attempted_at').eq('ip', ip).order('attempted_at', { ascending: true });
    if (countErr) {
      console.error('Rate limit count error:', countErr);
    }
    const count = attempts?.length ?? 0;

    // 3. If >= 5, return 429
    if (count >= 5) {
      const oldest = attempts?.[0]?.attempted_at;
      let seconds = 60;
      if (oldest) {
        const oldestMs = new Date(oldest).getTime();
        seconds = Math.ceil((oldestMs + 60000 - Date.now()) / 1000);
        if (seconds < 1) seconds = 1;
      }
      return new Response(
        JSON.stringify({ error: `Too many login attempts. Try again in ${seconds} seconds.` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
      );
    }

    // 4. Insert this attempt
    await supabase.from('login_attempts').insert({ ip, attempted_at: new Date().toISOString() });

    // 5. Check password
    if (password !== adminPassword) {
      return new Response(
        JSON.stringify({ error: 'Invalid password' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // 6. Success: delete attempts for this IP
    await supabase.from('login_attempts').delete().eq('ip', ip);

    // Create HMAC key from password for HS256 signing
    const secret = new TextEncoder().encode(adminPassword);
    const key = await crypto.subtle.importKey(
      'raw',
      secret,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const token = await new SignJWT({ sub: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(key);

    return new Response(
      JSON.stringify({ token }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: 'Invalid request' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
