import { pageMetadata } from "@/lib/seo";
import EarningsPage from "@/components/earnings/EarningsPage";

export const metadata = pageMetadata({
  title: "درآمد از ریمیکس — تبلیغ چطور به هنرمندان پول می‌دهد",
  description: "پول تبلیغ روی هر ریمیکس بین ریمیکسرها، هنرمندانِ آهنگ‌ها و ریمیکست تقسیم می‌شود. سهم‌ها را ببینید، آهنگتان را ادعا کنید و به تومان دریافت کنید.",
  path: "/fa/earnings",
  languages: { en: "/earnings", fa: "/fa/earnings" },
});

export default function Page() {
  return <EarningsPage lang="fa" />;
}
