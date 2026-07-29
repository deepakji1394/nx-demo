import './global.css';

export const metadata = {
  title: 'Login Demo',
  description: 'Nx monorepo login demo',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
