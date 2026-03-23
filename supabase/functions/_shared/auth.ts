/**
 * Shared JWT verification for admin Edge Functions.
 * Verifies Bearer token using ADMIN_PASSWORD as HMAC secret.
 */

import { jwtVerify } from 'https://deno.land/x/jose@v5.2.0/index.ts';

export async function verifyAdminToken(req: Request): Promise<{ valid: true } | { valid: false; status: number; error: string }> {
  const token = req.headers.get('X-Admin-Token');
  if (!token) {
    return { valid: false, status: 401, error: 'Missing or invalid Authorization header' };
  }
  const secret = new TextEncoder().encode(Deno.env.get('ADMIN_PASSWORD'));
  if (!secret.length) {
    return { valid: false, status: 500, error: 'ADMIN_PASSWORD not configured' };
  }
  try {
    const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    await jwtVerify(token, key);
    return { valid: true };
  } catch {
    return { valid: false, status: 401, error: 'Invalid or expired token' };
  }
}

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
    'Access-Control-Allow-Methods': 'POST, GET, PUT, PATCH, DELETE, OPTIONS',
  };
}

export function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    status,
  });
}

export async function createServiceClient() {
  const { createClient } = await import('npm:@supabase/supabase-js@2');
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
  return createClient(url, key);
}
