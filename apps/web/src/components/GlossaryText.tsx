import { useMemo } from "react";
import { Link } from "react-router";
import { tokenizeGlossary } from "../lib/glossary.js";

/**
 * 用語にリンクを付けた本文(S-041)。問題文・ヒントに使う。
 *
 * 用語は薄い点線の下線で、押すと用語集の該当箇所へ飛ぶ。
 * 本文の意味を変えないよう、1 つの本文につき最初の 1 回だけ。`**...**` は強調。
 */
export function GlossaryText({
  text,
  className = "",
  ...rest
}: React.HTMLAttributes<HTMLParagraphElement> & { text: string }) {
  const tokens = useMemo(() => tokenizeGlossary(text), [text]);
  let offset = 0;
  return (
    <p {...rest} className={className}>
      {tokens.map((token) => {
        // 文字位置を key にする(同じ語が複数回出ても重ならない)
        const key = `${offset}`;
        offset += token.text.length;
        if (token.kind === "strong") return <strong key={key}>{token.text}</strong>;
        if (token.kind === "term") {
          return (
            <Link
              key={key}
              to={`/glossary#${token.entry.id}`}
              data-testid="glossary-term"
              data-term={token.entry.id}
              title={token.entry.short}
              className="rounded-sm underline decoration-slate-400 decoration-dotted decoration-[1.5px] underline-offset-[3px] transition-colors hover:text-slate-950 hover:decoration-amber-500"
            >
              {token.text}
            </Link>
          );
        }
        return token.text;
      })}
    </p>
  );
}
