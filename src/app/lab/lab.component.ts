import { Component, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { CitationEngineService } from '../citation-engine.service';
import { TemplateBuilder } from "../template-builder/template-builder";

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
  templateBuilderRef = viewChild.required(TemplateBuilder);

  // Template + rendering
  template = '';
  renderMarkdown = true;

  // Argument intake (external string array)
  newArgName = '';

  // Argument state
  argNames: string[] = [];
  argValues: string[] = [];
  nullMask: boolean[] = [];
  comboSelectMask: boolean[] = [];

  constructor(private engine: CitationEngineService) {}

  /** Lint the current template for bracket / %s issues. */
  get issues(): string[] {
    if (!this.template.trim()) return [];
    return this.engine.lintTemplate(this.template);
  }

  /** Apply nullMask to arg values. */
  get preparedValues(): (string | null)[] {
    return this.argValues.map((v, i) => (this.nullMask[i] ? null : v));
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
    this.argValues = clean.map((_, i) => this.argValues[i] ?? '');
    this.nullMask  = clean.map((_, i) => this.nullMask[i] ?? false);
    this.syncComboMask();
  }

  addArg(): void {
    const name = (this.newArgName || `Arg${this.argNames.length + 1}`).trim();
    if (!name) return;

    this.argNames        = [...this.argNames, name];
    this.argValues       = [...this.argValues, ''];
    this.nullMask        = [...this.nullMask, false];
    this.comboSelectMask = [...this.comboSelectMask, true];

    this.newArgName = '';
    this.syncComboMask();
  }

  removeArg(i: number): void {
    if (i < 0 || i >= this.argNames.length) return;
    const rm = <T>(a: T[]) => a.slice(0, i).concat(a.slice(i + 1));

    this.argNames        = rm(this.argNames);
    this.argValues       = rm(this.argValues);
    this.nullMask        = rm(this.nullMask);
    this.comboSelectMask = rm(this.comboSelectMask);
    this.syncComboMask();
  }

  autofillNames(): void {
    this.argValues = this.argNames.map((n) => n);
    this.nullMask  = this.argNames.map(() => false);
  }

  clearValues(): void {
    this.argValues = this.argNames.map(() => '');
    this.nullMask  = this.argNames.map(() => false);
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

  get comboRows(): ComboRow[] {
    if (!this.template.trim()) return [];

    const idxs = this.selectedIndices();
    if (!idxs.length) return [];

    const total = (1 << idxs.length) - 1;
    if (total > 4096) {
      return [{
        label: '—',
        inputs: [],
        output: `Too many combinations selected (${total}). Reduce selection to ≤ 4096.`,
      }];
    }

    const rows: ComboRow[] = [];
    for (const sub of this.subsets(idxs)) {
      const inputs = this.argNames.map((_, i) =>
        sub.includes(i) ? (this.nullMask[i] ? null : this.argValues[i]) : null
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
    return rows;
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
    // Convert blank lines to paragraphs and single newlines to <br>
    const paragraphs = html.split(/\n{2,}/).map(p => p.replace(/\n/g, '<br>'));
    return paragraphs.map(p => `<p>${p}</p>`).join('');
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
