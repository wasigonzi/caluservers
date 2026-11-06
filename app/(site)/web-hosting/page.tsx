import type { Metadata } from "next";
import Comp from "@/components/site/WebHostingPage";

export const metadata: Metadata = { title: "Web Hosting" };

export default function Page() {
  return <Comp />;
}
