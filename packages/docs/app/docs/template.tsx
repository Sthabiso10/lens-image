/**
 * Remounts on every docs navigation (a layout would persist), so each page's
 * content eases in while the sidebar, whose marker slides to the new page,
 * stays put. Deliberately small and quick: this plays on every click, and a
 * reader moving between reference pages should never feel they are waiting.
 */
export default function DocsTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
