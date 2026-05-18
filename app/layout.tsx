import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'فۆرمی جیاوازییەکانی جەرد',
  description: 'تۆمارکردنی کەل و پەلی زیادە و کەمبوو بە Supabase و چاپی A4.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ku" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
