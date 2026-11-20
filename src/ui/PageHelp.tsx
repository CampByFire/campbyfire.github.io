import type { ComponentChildren } from 'preact';

/** Короткая справка рядом с заголовком: текст появляется по запросу. */
export function PageHelp({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <details class="page-help">
      <summary aria-label={`Справка: ${title}`}>?</summary>
      <div class="note">{children}</div>
    </details>
  );
}
