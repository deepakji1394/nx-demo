import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import LogoutButton from './components/LogoutButton';

const API_URL = process.env.API_URL ?? 'http://localhost:8000';

export default async function HomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  if (!token) {
    redirect('/login');
  }

  const meRes = await fetch(`${API_URL}/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!meRes.ok) {
    redirect('/login');
  }

  const { username } = await meRes.json();

  return (
    <main className="page-center">
      <div className="card">
        <h1>Hello, {username}</h1>
        <LogoutButton />
      </div>
    </main>
  );
}
