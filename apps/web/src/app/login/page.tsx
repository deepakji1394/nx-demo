'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    const loginRes = await fetch('/api/py/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!loginRes.ok) {
      setError('Invalid username or password');
      return;
    }

    const { access_token: accessToken } = await loginRes.json();

    // The token is handed to a same-origin route so it can be stored as an
    // httpOnly cookie (unreadable by JS, mitigating XSS token theft).
    // localStorage would be simpler to wire up but exposes the token to any
    // injected script.
    await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: accessToken }),
    });

    router.push('/');
    router.refresh();
  }

  return (
    <main className="page-center">
      <form onSubmit={handleSubmit} className="card">
        <h1>Log in</h1>
        {error && <p className="error">{error}</p>}
        <label>
          Username
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <button type="submit">Log in</button>
      </form>
    </main>
  );
}
