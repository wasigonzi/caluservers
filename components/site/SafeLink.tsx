"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { resolveHref } from "@/lib/safe-links";

type Props = {
  href: string;
  whmcs?: string;
  className?: string;
  children: ReactNode;
  target?: string;
  rel?: string;
  onClick?: ComponentProps<"a">["onClick"];
};

/** Enlace seguro: Next Link para rutas internas; <a> para https/whmcs. */
export default function SafeLink({
  href,
  whmcs = "",
  className,
  children,
  target,
  rel,
  onClick,
}: Props) {
  const resolved = resolveHref(href, whmcs || href);
  const external =
    href === "whmcs" ||
    resolved.startsWith("http://") ||
    resolved.startsWith("https://");
  if (external) {
    return (
      <a
        className={className}
        href={resolved}
        target={target ?? "_blank"}
        rel={rel ?? "noopener noreferrer"}
        onClick={onClick}
      >
        {children}
      </a>
    );
  }
  return (
    <Link className={className} href={resolved} onClick={onClick}>
      {children}
    </Link>
  );
}
