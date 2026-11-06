import type { Metadata } from "next";
import Comp from "@/components/site/HomePage";

export const metadata: Metadata = { title: "Web Hosting • VPS • Dedicated Servers" };

export default function Page() {
  return <Comp />;
}
