/**
 * Render mínimo y seguro de markdown de la KB: encabezados, párrafos,
 * listas y **negrita**. No se interpreta HTML: todo el texto se renderiza
 * como nodos de React (nunca dangerouslySetInnerHTML).
 */
import type { ReactNode } from "react";

function inline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>;
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

export default function MarkdownText({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let key = 0;
  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={key++}>
        {list.map((item, i) => (
          <li key={i}>{inline(item, `li-${key}-${i}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      blocks.push(<h2 key={key++}>{inline(line.slice(3), `h2-${key}`)}</h2>);
    } else if (line.startsWith("# ")) {
      flushList();
      blocks.push(<h2 key={key++}>{inline(line.slice(2), `h1-${key}`)}</h2>);
    } else if (line.startsWith("- ")) {
      list.push(line.slice(2));
    } else {
      flushList();
      blocks.push(<p key={key++}>{inline(line, `p-${key}`)}</p>);
    }
  }
  flushList();
  return <>{blocks}</>;
}
