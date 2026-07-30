import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { token } = await request.json();

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  // Store the token as an httpOnly cookie (unreadable by JS, mitigating XSS
  // token theft). localStorage would be simpler to wire up but exposes the
  // token to any injected script.
  response.cookies.set('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 30,
  });
  return response;
}
