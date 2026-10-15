import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';

const ACCESS_COOKIE = 'ironair_access';
const REFRESH_COOKIE = 'ironair_refresh';

type AuthTokens = { access_token: string; refresh_token: string; expires_in?: number };
export type AuthUser = { id: string; email?: string; email_confirmed_at?: string | null; user_metadata?: { company_name?: string } };

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase Auth não configurado');
  return { url: url.replace(/\/$/, ''), key };
}

function cookieValue(req: Request, name: string) {
  const entry = req.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge };
}

export function setAuthCookies(response: NextResponse, tokens: AuthTokens) {
  response.cookies.set(ACCESS_COOKIE, tokens.access_token, cookieOptions(Math.max(60, Number(tokens.expires_in || 3600))));
  response.cookies.set(REFRESH_COOKIE, tokens.refresh_token, cookieOptions(30 * 86400));
}

export function clearAuthCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, '', cookieOptions(0));
  response.cookies.set(REFRESH_COOKIE, '', cookieOptions(0));
}

export async function revokeAuthSession(req: Request) {
  const access = cookieValue(req, ACCESS_COOKIE);
  if (!access) return;
  const { url, key } = config();
  await fetch(`${url}/auth/v1/logout`, { method: 'POST', headers: { apikey: key, authorization: `Bearer ${access}` }, cache: 'no-store' }).catch(() => undefined);
}

export async function supabasePasswordSignIn(email: string, password: string): Promise<AuthTokens> {
  const { url, key } = config();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: key, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }), cache: 'no-store'
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token || !payload.refresh_token) throw new Error('E-mail ou senha inválidos, ou e-mail ainda não confirmado');
  return payload;
}

export async function supabaseSignUp(email: string, password: string, companyName: string) {
  const { url, key } = config();
  const response = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST', headers: { apikey: key, 'content-type': 'application/json' }, body: JSON.stringify({ email, password, data: { company_name: companyName } }), cache: 'no-store'
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.msg || payload.message || payload.error_description || 'Falha ao criar conta');
  return payload;
}

export async function requestPasswordReset(email: string) {
  const { url, key } = config();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || !/^https?:\/\//.test(appUrl)) throw new Error('URL pública do ERP não configurada');
  const redirectTo = `${appUrl.replace(/\/$/, '')}/reset-password`;
  const response = await fetch(`${url}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: 'POST', headers: { apikey: key, 'content-type': 'application/json' }, body: JSON.stringify({ email }), cache: 'no-store'
  });
  if (!response.ok) throw new Error('Não foi possível enviar o e-mail de recuperação');
}

export async function updatePasswordWithRecoveryToken(token: string, password: string) {
  const { url, key } = config();
  const user = await fetchUser(token);
  if (!user?.id) throw new Error('Link de recuperação expirado ou inválido');
  const response = await fetch(`${url}/auth/v1/user`, {
    method: 'PUT', headers: { apikey: key, authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ password }), cache: 'no-store'
  });
  if (!response.ok) throw new Error('Não foi possível redefinir a senha');
}

async function fetchUser(token: string): Promise<AuthUser | null> {
  const { url, key } = config();
  const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, authorization: `Bearer ${token}` }, cache: 'no-store' });
  return response.ok ? response.json() : null;
}

const userCache = new WeakMap<Request, Promise<AuthUser | null>>();

async function loadAuthUser(req: Request): Promise<AuthUser | null> {
  const access = cookieValue(req, ACCESS_COOKIE);
  if (access) {
    const user = await fetchUser(access);
    if (user) return user;
  }
  const refresh = cookieValue(req, REFRESH_COOKIE);
  if (!refresh) return null;
  const { url, key } = config();
  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: { apikey: key, 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: refresh }), cache: 'no-store'
  });
  if (!response.ok) return null;
  const tokens: AuthTokens = await response.json();
  if (!tokens.access_token || !tokens.refresh_token) return null;
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, tokens.access_token, cookieOptions(Math.max(60, Number(tokens.expires_in || 3600))));
  jar.set(REFRESH_COOKIE, tokens.refresh_token, cookieOptions(30 * 86400));
  return fetchUser(tokens.access_token);
}

export function getAuthUser(req: Request): Promise<AuthUser | null> {
  let cached = userCache.get(req);
  if (!cached) { cached = loadAuthUser(req); userCache.set(req, cached); }
  return cached;
}
