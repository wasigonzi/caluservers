import type { Metadata } from "next";
import Comp from "@/components/site/VpsPage";

export const metadata: Metadata = { title: "VPS Cloud" };

export default function Page() {
  return <Comp />;
}
