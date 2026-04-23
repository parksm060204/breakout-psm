import './globals.css';

export const metadata = {
  title: 'INU 벽돌깨기',
  description: 'INU 벽돌깨기 웹 게임',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="bg-slate-900 text-white min-h-screen">
        {children}
      </body>
    </html>
  );
}
