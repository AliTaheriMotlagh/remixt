import { Suspense } from "react";
import { pageMetadata } from "@/lib/seo";
import MemberPage from "@/components/earnings/MemberPage";
import AdvertiserPage from "@/components/earnings/AdvertiserPage";

export const metadata = pageMetadata({
  title: "تبلیغ در ریمیکست — تصویری، صوتی و معرفی ویژهٔ ریمیکس",
  description: "به کسانی برسید که موسیقی می‌سازند و گوش می‌دهند. تبلیغ تصویری، صوتی پیش از ریمیکس و در رادیو، یا معرفی ویژهٔ ریمیکس خودتان. فقط برای بازدید واقعی پول بدهید.",
  path: "/fa/advertise",
  languages: { en: "/advertise", fa: "/fa/advertise" },
});

export default function Page() {
  return (
    <MemberPage lang="fa" path="/advertise">
      {() => (
        <Suspense>
          <AdvertiserPage lang="fa" />
        </Suspense>
      )}
    </MemberPage>
  );
}
