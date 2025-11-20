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
  private readonly RANDOM_COMBO_LIMIT = 1000;

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
    return k ? Math.pow(2, k) - 1 : 0;
  }

  private buildRowFromSubset(subset: number[]): ComboRow {
    const active = new Set(subset);
    const inputs = this.argNames.map((_, i) =>
      active.has(i) ? this.argNames[i] : null
    );

    let output = '';
    try {
      output = this.engine.format(this.template, ...inputs);
    } catch (e: any) {
      output = `Engine error: ${e?.message ?? e}`;
    }

    const labelRaw = subset.map(i => this.argNames[i]).filter(Boolean).join(', ');
    const label = labelRaw || '—';
    return { label, inputs, output };
  }

  private randomSubset(idxs: number[]): number[] {
    let subset: number[] = [];
    while (!subset.length) {
      subset = [];
      for (const idx of idxs) {
        if (Math.random() < 0.5) subset.push(idx);
      }
    }
    return subset;
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

    const total = Math.pow(2, idxs.length) - 1;
    const sampleCount = Math.min(this.RANDOM_COMBO_LIMIT, total);
    if (!Number.isFinite(sampleCount) || sampleCount <= 0) {
      this.comboRowsCache = [];
      return;
    }

    const rows: ComboRow[] = [];
    if (total <= this.RANDOM_COMBO_LIMIT) {
      for (const sub of this.subsets(idxs)) {
        rows.push(this.buildRowFromSubset(sub));
      }
      this.comboRowsCache = rows;
      return;
    }

    const seen = new Set<string>();
    while (rows.length < sampleCount) {
      const subset = this.randomSubset(idxs);
      const key = subset.join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(this.buildRowFromSubset(subset));
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
