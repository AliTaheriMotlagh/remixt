// Pages in Persian (/fa/…): right to left and marked as Persian for screen
// readers, search engines and the browser's line breaking. The root layout
// owns <html lang="en">, so the language is set on this wrapper. The
// Persian typeface (Vazirmatn) is in the site-wide font stack (layout.tsx).
export default function PersianLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="fa" dir="rtl" className="flex flex-1 flex-col">
      {children}
    </div>
  );
}
