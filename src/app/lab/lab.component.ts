import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as monaco from 'monaco-editor';

import { CitationEngineService } from '../citation-engine.service';
import { MonacoEditorDirective } from '../shared/monaco-editor.directive';

/** Row shape used by the Combinations tester view */
interface ComboRow {
  label: string;                 // human label of which args are present in this combination
  inputs: (string | null)[];     // inputs that were fed to the engine (nulls for the excluded ones)
  output: string;                // rendered citation
}

@Component({
  selector: 'app-lab',
  standalone: true,
  imports: [CommonModule, FormsModule, MonacoEditorDirective],
  templateUrl: './lab.component.html',
  styleUrls: ['./lab.component.scss'],
})
export class LabComponent {
  // ---------------------------------------------------------------------------
  // View state / routing
  // ---------------------------------------------------------------------------

  /** Simple in-component view switcher */
  // View switch
  view: 'builder' | 'combos' = 'builder';

  // ---------------------------------------------------------------------------
  // Core template + arguments state
  // ---------------------------------------------------------------------------
  // Start EMPTY
  template = '';
  argNames: string[] = [];
  argValues: string[] = [];
  nullMask: boolean[] = [];
  comboSelectMask: boolean[] = [];

  specText = '';
  showHTML = false;
  diag: { name: string; got: string; want: string; pass: boolean }[] | null = null;
  newArgName = '';



  // ---------------------------------------------------------------------------
  // Derived getters (kept as getters so UI stays in sync automatically)
  // ---------------------------------------------------------------------------

  /** Lint issues on the current template (brackets, braces, doubled +, etc.) */
  get issues(): string[] {
    return this.engine.lintTemplate(this.template);
  }

  /** Argument names as a clean array (source of truth for lengths and labels) */
  get args(): string[] {
    return this.argNames.join(',').split(',').map(s => s.trim()).filter(Boolean);
  }

  /** Values after applying the null mask (this is what the engine actually sees) */
  get preparedValues(): (string | null)[] {
    return this.argValues.map((v, i) => (this.nullMask[i] ? null : v));
  }

  /** Rendered citation preview (engine output) */
  get result(): string {
    try {
      return this.engine.format(this.template, ...this.preparedValues) || '';
    } catch (e: any) {
      return `Engine error: ${e?.message ?? e}`;
    }
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  constructor(private engine: CitationEngineService) {}

  // ---------------------------------------------------------------------------
  // Builder actions
  // ---------------------------------------------------------------------------

  /**
   * Extract argument labels from `specText` (anything wrapped in [ ... ])
   * and replace the current argument list with the result.
   */
  runExtract(): void {
    const extracted = this.engine.extractBracketArgs(this.specText || '');
    if (!extracted.length) return;

    this.argNames = extracted;
    this.argValues = Array.from({ length: extracted.length }, (_, i) => this.argValues[i] ?? '');
    this.nullMask  = Array.from({ length: extracted.length }, (_, i) => this.nullMask[i] ?? false);

    this.syncComboMask(); // keep combinations checklist aligned
  }

  /** Clear all argument values & null toggles (names remain) */
  clear(): void {
    this.argValues = this.args.map(() => '');
    this.nullMask  = this.args.map(() => false);
  }

  /** Copy current rendered result to clipboard (with fallback for old browsers) */
  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.result || '');
    } catch (err) {
      const ta = document.createElement('textarea');
      ta.value = this.result || '';
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); }
      finally { document.body.removeChild(ta); }
      // eslint-disable-next-line no-console
      console.warn('Clipboard API failed; used execCommand fallback.', err);
    }
  }

  /** Insert a small token (chip button) at the end of the template */
  insertToken(t: string): void {
    this.template += t;
  }

  /** Monaco editor → keep component state in sync */
  onMonacoChange(val: string): void {
    this.template = val; // other computed fields (issues/result) auto-update via getters
  }

  /**
   * Provide Monaco markers (squiggles) for bracket/brace mismatches
   * and a drift warning when `%s` count != argument count.
   */
  getMonacoMarkers = (text: string): monaco.editor.IMarkerData[] => {
    const markers: monaco.editor.IMarkerData[] = [];

    // Structural pass for bracket/brace pairs (single-line model)
    const stack: Array<{ ch: string; i: number }> = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '[' || ch === '{') stack.push({ ch, i });
      if (ch === ']' || ch === '}') {
        const last = stack.pop();
        const mismatch =
          !last ||
          (last.ch === '[' && ch !== ']') ||
          (last.ch === '{' && ch !== '}');

        if (mismatch) {
          markers.push({
            severity: monaco.MarkerSeverity.Error,
            message: `Unmatched ${ch}`,
            startLineNumber: 1,
            startColumn: i + 1,
            endLineNumber: 1,
            endColumn: i + 2,
          });
        }
      }
    }

    // Any unclosed openers left on the stack
    for (const s of stack) {
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: `Unclosed ${s.ch}`,
        startLineNumber: 1,
        startColumn: s.i + 1,
        endLineNumber: 1,
        endColumn: s.i + 2,
      });
    }

    // %s drift warning
    const placeholderCount = (text.match(/%s/g) || []).length;
    const argCount = this.args.length;
    if (placeholderCount !== argCount) {
      markers.push({
        severity: monaco.MarkerSeverity.Warning,
        message: `%s count (${placeholderCount}) differs from Arguments count (${argCount})`,
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 2,
      });
    }

    return markers;
  };

  // ---------------------------------------------------------------------------
  // Arguments list management
  // ---------------------------------------------------------------------------

  /**
   * Add a new argument name to the list.
   * (We keep value/null/mask arrays aligned by index.)
   */
  addArg(alsoInsertPlaceholder = false): void {
    const name = (this.newArgName || `Arg${this.argNames.length + 1}`).trim();
    if (!name) return;

    this.argNames         = [...this.argNames, name];
    this.argValues        = [...this.argValues, ''];
    this.nullMask         = [...this.nullMask, false];
    this.comboSelectMask  = [...this.comboSelectMask, true];

    this.newArgName = '';
    this.syncComboMask();

    if (alsoInsertPlaceholder) {
      this.insertToken('[%s]');
    }
  }

  /** Remove an argument (and its aligned value/masks) by index */
  removeArg(i: number): void {
    if (i < 0 || i >= this.argNames.length) return;
    const rm = <T>(a: T[]) => a.slice(0, i).concat(a.slice(i + 1));

    this.argNames        = rm(this.argNames);
    this.argValues       = rm(this.argValues);
    this.nullMask        = rm(this.nullMask);
    this.comboSelectMask = rm(this.comboSelectMask);

    this.syncComboMask();
  }

  /** Fill each argument value with its display name (handy for punctuation checks) */
  autofillNames(): void {
    this.argValues = this.args.map((n) => n);
    this.nullMask  = this.args.map(() => false);
  }

  // ---------------------------------------------------------------------------
  // Combinations tester
  // ---------------------------------------------------------------------------

  /** Keep combinations selection mask length aligned with current `args` length */
  private syncComboMask(): void {
    this.comboSelectMask = Array.from(
      { length: this.args.length },
      (_, i) => this.comboSelectMask[i] ?? true
    );
  }

  /** Indices of arguments currently selected for the power set */
  private selectedIndices(): number[] {
    return this.args.map((_, i) => i).filter(i => this.comboSelectMask[i]);
  }

  /** Generate all non-empty subsets of a set of indices */
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

  /** Total combination count (for UI) */
  get comboCount(): number {
    const k = this.selectedIndices().length;
    return k ? (1 << k) - 1 : 0;
  }

  /** Rows for the Combinations view (label + rendered output per subset) */
  get comboRows(): ComboRow[] {
    const idxs = this.selectedIndices();
    if (!idxs.length) return [];

    // Soft cap to prevent the UI from rendering huge lists
    const total = (1 << idxs.length) - 1;
    if (total > 350000) {
      return [{
        label: '—',
        inputs: [],
        output: `Too many combinations selected (${total}).`
      }];
    }

    const rows: ComboRow[] = [];
    for (const sub of this.subsets(idxs)) {
      const inputs = this.args.map((_, i) =>
        sub.includes(i) ? (this.nullMask[i] ? null : this.argValues[i]) : null
      );

      let output = '';
      try {
        output = this.engine.format(this.template, ...inputs);
      } catch (e: any) {
        output = `Engine error: ${e?.message ?? e}`;
      }

      const label = sub.map(i => this.args[i]).join(', ');
      rows.push({ label, inputs, output });
    }
    return rows;
  }
}
