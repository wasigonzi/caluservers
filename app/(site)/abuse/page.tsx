import type { Metadata } from "next";
import Comp from "@/components/site/AbusePage";

export const metadata: Metadata = { title: "Abuso" };

export default function Page() {
  return <Comp />;
}
