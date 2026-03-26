import { useMemo } from "react";
import { marked } from "marked";

// Configure marked for safe rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

const markdownStyles = `
  .markdown-content h1,
  .markdown-content h2,
  .markdown-content h3,
  .markdown-content h4 {
    color: var(--text);
    margin: 16px 0 8px 0;
    font-family: var(--font-mono);
    line-height: 1.4;
  }
  .markdown-content h1 { font-size: 16px; font-weight: 700; }
  .markdown-content h2 { font-size: 14px; font-weight: 600; }
  .markdown-content h3 { font-size: 13px; font-weight: 600; }
  .markdown-content h4 { font-size: 12px; font-weight: 600; }

  .markdown-content p {
    margin: 8px 0;
    line-height: 1.6;
  }

  .markdown-content ul,
  .markdown-content ol {
    margin: 8px 0;
    padding-left: 20px;
  }
  .markdown-content li {
    margin: 4px 0;
    line-height: 1.5;
  }

  .markdown-content strong { font-weight: 600; color: var(--text); }
  .markdown-content em { font-style: italic; }

  .markdown-content code {
    font-family: var(--font-mono);
    font-size: 11px;
    background: var(--bg-muted);
    padding: 2px 5px;
    border-radius: 3px;
    color: var(--text);
  }

  .markdown-content pre {
    background: var(--bg-muted);
    border: 1px solid var(--border-light);
    border-radius: 4px;
    padding: 12px;
    margin: 10px 0;
    overflow-x: auto;
  }
  .markdown-content pre code {
    background: none;
    padding: 0;
    font-size: 11px;
    line-height: 1.5;
  }

  .markdown-content blockquote {
    margin: 8px 0;
    padding: 4px 12px;
    border-left: 3px solid var(--border);
    color: var(--text-muted);
  }

  .markdown-content hr {
    border: none;
    border-top: 1px solid var(--border-light);
    margin: 12px 0;
  }

  .markdown-content a {
    color: var(--dot-planning);
    text-decoration: underline;
  }

  .markdown-content table {
    border-collapse: collapse;
    margin: 8px 0;
    width: 100%;
  }
  .markdown-content th,
  .markdown-content td {
    border: 1px solid var(--border-light);
    padding: 6px 10px;
    font-size: 11px;
    text-align: left;
  }
  .markdown-content th {
    background: var(--bg-muted);
    font-weight: 600;
  }
`;

/**
 * Renders markdown content as compiled HTML with themed styling.
 * @param {{ markdown: string }} props
 */
export function MarkdownContent({ markdown }) {
  const html = useMemo(() => {
    if (!markdown) return "";
    return marked.parse(markdown);
  }, [markdown]);

  return (
    <>
      <style>{markdownStyles}</style>
      <div
        className="markdown-content"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          lineHeight: 1.6,
          color: "var(--text)",
          wordBreak: "break-word",
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}
