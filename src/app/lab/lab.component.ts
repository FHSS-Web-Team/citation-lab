import { Component, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { CitationEngineService } from '../citation-engine.service';
import { TemplateSyncService } from '../template-sync.service';
import { TemplateBuilder } from '../template-builder/template-builder';

interface ComboRow {
  label: string;
  inputs: (string | null)[];
  output: string;
}

@Component({
  selector: 'app-lab',
  standalone: true,
  imports: [CommonModule, FormsModule, TemplateBuilder],
  templateUrl: './lab.component.html',
  styleUrls: ['./lab.component.scss'],
})
export class LabComponent {
  // Template + rendering
  view: 'lab' | 'combos' = 'lab';
  template = '';
  comboRowsCache: ComboRow[] = [];

  // Argument state
  argNames: string[] = [];
  comboSelectMask: boolean[] = [];

  constructor(
    private engine: CitationEngineService,
    private templateSync: TemplateSyncService
  ) {
    effect(() => {
      const vars = this.templateSync.variables();
      const tmpl = this.templateSync.template();
      this.setArguments(vars);
      this.template = tmpl;
    });
  }

  setView(next: 'lab' | 'combos'): void {
    this.view = next;
    if (next === 'combos') {
      this.computeComboRows();
    }
  }

  /** Prepared values always mirror argument names now. */
  get preparedValues(): (string | null)[] {
    return this.argNames.map((name) => name);
  }

  /** Final rendered citation from template + args. */
  get result(): string {
    if (!this.template.trim()) return '';
    try {
      return this.engine.format(this.template, ...this.preparedValues) || '';
    } catch (e: any) {
      return `Engine error: ${e?.message ?? e}`;
    }
  }

  // ---------------------------------------------------------
  // Argument helpers
  // ---------------------------------------------------------

  /** Accept an external list of argument names. */
  loadArguments(names: string[]): void {
    this.setArguments(names);
  }

  /** Insert or replace arguments with a clean list. */
  private setArguments(names: string[]): void {
    const clean = names.map((n) => `${n}`.trim()).filter(Boolean);
    this.argNames = clean;
    this.syncComboMask();
  }

  private syncComboMask(): void {
    this.comboSelectMask = Array.from(
      { length: this.argNames.length },
      (_, i) => this.comboSelectMask[i] ?? true
    );
  }

  // ---------------------------------------------------------
  // Combinations
  // ---------------------------------------------------------

  private selectedIndices(): number[] {
    return this.argNames.map((_, i) => i).filter(i => this.comboSelectMask[i]);
  }

  private subsets(idxs: number[]): number[][] {
    const out: number[][] = [];
    const n = idxs.length;
    for (let mask = 1; mask < (1 << n); mask++) {
      const sub: number[] = [];
      for (let b = 0; b < n; b++) if (mask & (1 << b)) sub.push(idxs[b]);
      out.push(sub);
    }
    return out;
  }

  get comboCount(): number {
    const k = this.selectedIndices().length;
    return k ? (1 << k) - 1 : 0;
  }

  private computeComboRows(): void {
    if (!this.template.trim()) {
      this.comboRowsCache = [];
      return;
    }

    const idxs = this.selectedIndices();
    if (!idxs.length) {
      this.comboRowsCache = [];
      return;
    }

    const total = (1 << idxs.length) - 1;
    if (total > 300000) {
      this.comboRowsCache = [{
        label: '—',
        inputs: [],
        output: `Too many combinations selected (${total}). Reduce selection to ≤ 300000.`,
      }];
      return;
    }

    const rows: ComboRow[] = [];
    for (const sub of this.subsets(idxs)) {
      const inputs = this.argNames.map((_, i) =>
        sub.includes(i) ? this.argNames[i] : null
      );

      let output = '';
      try {
        output = this.engine.format(this.template, ...inputs);
      } catch (e: any) {
        output = `Engine error: ${e?.message ?? e}`;
      }

      const label = sub.map(i => this.argNames[i]).join(', ');
      rows.push({ label, inputs, output });
    }
    this.comboRowsCache = rows;
  }

  // ---------------------------------------------------------
  // Markdown render + clipboard helper
  // ---------------------------------------------------------

  /** Minimal markdown-to-HTML renderer for bold/italic/code/links + line breaks. */
  renderMarkdownText(text: string): string {
    const escape = (s: string) =>
      s.replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;');

    let html = escape(text);
    html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre><code>${code}</code></pre>`);
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    // Collapse newlines to spaces so each result renders on one line.
    html = html.replace(/\s*\n+\s*/g, ' ');
    return html;
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.result || '');
    } catch (err) {
      const ta = document.createElement('textarea');
      ta.value = this.result || '';
      ta.style.position = 'fixed';
      ta.style.opacity  = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
      console.warn('Clipboard API failed; used execCommand fallback.', err);
    }
  }
}
