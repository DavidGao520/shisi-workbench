import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '中华食肆 · 厨房工作台',
  description: '从游戏的一餐，到生活的一餐。',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
