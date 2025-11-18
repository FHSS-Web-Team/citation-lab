import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as monaco from 'monaco-editor';

import { CitationEngineService } from '../citation-engine.service';
import { MonacoEditorDirective } from '../shared/monaco-editor.directive';

interface ComboRow {
  label: string;
  inputs: (string | null)[];
  output: string;
}

interface ExprRange {
  start: number; // offsets in the CURRENT (folded) visual text
  end: number;
}

@Component({
  selector: 'app-lab',
  standalone: true,
  imports: [CommonModule, FormsModule, MonacoEditorDirective],
  templateUrl: './lab.component.html',
  styleUrls: ['./lab.component.scss'],
})
export class LabComponent {
  // ---------------------------------------------------------
  // View state
  // ---------------------------------------------------------
  view: 'builder' | 'combos' = 'builder';

  // ---------------------------------------------------------
  // Core visual builder state
  // ---------------------------------------------------------

  /** What the user actually types/sees in Monaco (may contain [*] folds). */
  visualText = '';

  /** Generated backend template like [[%s]+{, }+[%s]] */
  template = '';

  /** Expression ranges (in the current folded visualText). */
  private exprRanges: ExprRange[] = [];

  /** Stored pieces for folds; N-th [*] token → foldPieces[N]. */
  private foldPieces: string[] = [];

  /** Monaco decoration ids for expression highlighting. */
  private exprDecorationIds: string[] = [];

  // ---------------------------------------------------------
  // Arguments / combinations state
  // ---------------------------------------------------------
  specText = '';
  showHTML = false;
  diag: { name: string; got: string; want: string; pass: boolean }[] | null = null;
  newArgName = '';

  argNames: string[] = [];
  argValues: string[] = [];
  nullMask: boolean[] = [];
  comboSelectMask: boolean[] = [];

  @ViewChild(MonacoEditorDirective) monacoDir?: MonacoEditorDirective;

  constructor(private engine: CitationEngineService) {}

  // ---------------------------------------------------------
  // Derived getters
  // ---------------------------------------------------------

  /** Expanded visual text with all [*] replaced by their full content. */
  get expandedVisual(): string {
    const { expanded } = this.expandWithIndexMap(this.visualText);
    return expanded;
  }

  /** Lint the current template for bracket / %s issues. */
  get issues(): string[] {
    if (!this.template.trim()) return [];
    return this.engine.lintTemplate(this.template);
  }

  /** Normalized argument names. */
  get args(): string[] {
    return this.argNames.join(',').split(',').map(s => s.trim()).filter(Boolean);
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
  // Spec → arguments
  // ---------------------------------------------------------

  runExtract(): void {
    const extracted = this.engine.extractBracketArgs(this.specText || '');
    if (!extracted.length) return;

    this.argNames = extracted;
    this.argValues = Array.from({ length: extracted.length }, (_, i) => this.argValues[i] ?? '');
    this.nullMask  = Array.from({ length: extracted.length }, (_, i) => this.nullMask[i] ?? false);
    this.syncComboMask();
  }

  clear(): void {
    this.argValues = this.args.map(() => '');
    this.nullMask  = this.args.map(() => false);
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

  // ---------------------------------------------------------
  // Monaco binding (visual text)
  // ---------------------------------------------------------

  onMonacoChange(val: string): void {
    this.visualText = val;
  }

  // ---------------------------------------------------------
  // Folding helpers
  // ---------------------------------------------------------

  /** Expand all [*] in `text` using foldPieces. */
  private expandAllFolds(text: string): string {
    let idx = 0;
    return text.replace(/\[\*\]/g, () => this.foldPieces[idx++] ?? '');
  }

  /**
   * Expand folded text and build a mapping:
   * foldToExp[i] = index in expanded string corresponding to folded index i.
   */
  private expandWithIndexMap(folded: string): { expanded: string; foldToExp: number[] } {
    const foldToExp: number[] = [];
    let expanded = '';
    let i = 0;
    let pieceIdx = 0;

    while (true) {
      foldToExp.push(expanded.length);
      if (i >= folded.length) break;

      if (folded.startsWith('[*]', i)) {
        const piece = this.foldPieces[pieceIdx++] ?? '';
        expanded += piece;
        i += 3;
      } else {
        expanded += folded[i];
        i++;
      }
    }

    return { expanded, foldToExp };
  }

  /** Count how many [*] tokens appear before a given offset in folded text. */
  private countTokensBefore(text: string, offset: number): number {
    return (text.slice(0, offset).match(/\[\*\]/g) || []).length;
  }

  /** Validate that the selection is a single balanced [ ... ] expression. */
  private isBalancedBracketedExpr(s: string): boolean {
    if (!s || s[0] !== '[' || s[s.length - 1] !== ']') return false;
    let b = 0, c = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === '\\') { i++; continue; }
      if (ch === '[') b++;
      if (ch === ']') b--;
      if (ch === '{') c++;
      if (ch === '}') c--;
      if (b < 0 || c < 0) return false;
    }
    return b === 0 && c === 0;
  }

  /** Expand a slice that may contain [*], starting at a given piece index. */
  private expandSliceUsingPieces(
    slice: string,
    startPieceIndex: number
  ): { expanded: string; consumed: number } {
    let idx = startPieceIndex;
    const expanded = slice.replace(/\[\*\]/g, () => this.foldPieces[idx++] ?? '');
    return { expanded, consumed: idx - startPieceIndex };
  }

  /** Fold the current visual selection into a single [*] token. */
  foldSelection(): void {
    const ed = this.monacoDir?.getEditor();
    const model = ed?.getModel();
    if (!ed || !model) return;

    const sel = ed.getSelection();
    if (!sel) return;

    const foldedText = model.getValue();
    const startOff   = model.getOffsetAt(sel.getStartPosition());
    const endOff     = model.getOffsetAt(sel.getEndPosition());
    const selected   = foldedText.slice(startOff, endOff);

    if (!this.isBalancedBracketedExpr(selected)) return;

    const startPieceIndex = this.countTokensBefore(foldedText, startOff);
    const { expanded, consumed } = this.expandSliceUsingPieces(selected, startPieceIndex);

    // Replace those pieces with a single combined piece
    this.foldPieces.splice(startPieceIndex, consumed, expanded);

    // Replace selection with [*]
    ed.executeEdits('fold', [{ range: sel, text: '[*]' }]);
    this.visualText = model.getValue();
  }

  /** Unfold everything and reset foldPieces. */
  unfoldAll(): void {
    const ed = this.monacoDir?.getEditor();
    const model = ed?.getModel();
    const current = model?.getValue() ?? this.visualText;

    const expanded = this.expandAllFolds(current);

    if (ed && model) {
      const fullRange = model.getFullModelRange();
      ed.executeEdits('unfold-all', [{ range: fullRange, text: expanded }]);
    }

    this.visualText = expanded;
    this.foldPieces = [];
  }

  /** Hover callback for [*] tokens. */
  getFoldHover = (ordinal: number): string | undefined => {
    return this.foldPieces[ordinal];
  };

  // ---------------------------------------------------------
  // Marking expressions in visual text
  // ---------------------------------------------------------

  /** Merge overlapping/adjacent ranges into a canonical list. */
  private mergeRanges(ranges: ExprRange[]): ExprRange[] {
    if (!ranges.length) return [];
    const sorted = [...ranges].sort((a, b) => a.start - b.start);
    const out: ExprRange[] = [];
    let cur = { ...sorted[0] };

    for (let i = 1; i < sorted.length; i++) {
      const r = sorted[i];
      if (r.start <= cur.end) {
        cur.end = Math.max(cur.end, r.end);
      } else {
        out.push(cur);
        cur = { ...r };
      }
    }
    out.push(cur);
    return out;
  }

  /** Mark current selection as an expression and highlight it. */
  markSelectionAsExpr(): void {
    const ed = this.monacoDir?.getEditor();
    const model = ed?.getModel();
    if (!ed || !model) return;

    const sel = ed.getSelection();
    if (!sel || sel.isEmpty()) return;

    const start = model.getOffsetAt(sel.getStartPosition());
    const end   = model.getOffsetAt(sel.getEndPosition());
    if (start >= end) return;

    // keep visualText synced
    this.visualText = model.getValue();

    this.exprRanges.push({ start, end });
    this.exprRanges = this.mergeRanges(this.exprRanges);
    this.refreshExprDecorations();
  }

  /** Clear all expression marks & highlighting. */
  clearExprMarks(): void {
    this.exprRanges = [];
    this.refreshExprDecorations();
  }

  /** Apply Monaco decorations based on exprRanges. */
  private refreshExprDecorations(): void {
    const ed = this.monacoDir?.getEditor();
    const model = ed?.getModel();
    if (!ed || !model) return;

    const newDecos: monaco.editor.IModelDeltaDecoration[] = this.exprRanges.map(r => {
      const startPos = model.getPositionAt(r.start);
      const endPos   = model.getPositionAt(r.end);

      return {
        range: new monaco.Range(
          startPos.lineNumber, startPos.column,
          endPos.lineNumber,   endPos.column
        ),
        options: {
          inlineClassName: 'vb-expr',
        },
      };
    });

    this.exprDecorationIds = ed.deltaDecorations(this.exprDecorationIds, newDecos);
  }

  // ---------------------------------------------------------
  // Template compilation from visual + marks
  // ---------------------------------------------------------

  /**
   * Compile current visualText + exprRanges into a backend template.
   * Literals → { ... }, expression runs → [%s].
   */
  buildTemplateFromVisual(): void {
    const { expanded, foldToExp } = this.expandWithIndexMap(this.visualText);
    const indexMap = foldToExp;

    if (!expanded.trim()) {
      this.template = '';
      return;
    }

    // Map expr ranges from folded indices → expanded indices
    const expandedRanges = this.exprRanges
      .map(r => {
        let startE = -1;
        let endE   = -1;

        for (let i = 0; i < indexMap.length; i++) {
          if (startE === -1 && indexMap[i] >= r.start) {
            startE = i;
          }
          if (indexMap[i] >= r.end) {
            endE = i;
            break;
          }
        }

        if (startE === -1) return null;
        if (endE === -1) endE = expanded.length;
        return { start: startE, end: endE };
      })
      .filter((x): x is { start: number; end: number } => !!x)
      .sort((a, b) => a.start - b.start);

    // Helper: is index inside any expression range?
    const isExprIndex = (i: number): boolean => {
      for (const r of expandedRanges) {
        if (i >= r.start && i < r.end) return true;
        if (i < r.start) break;
      }
      return false;
    };

    // Build segments: contiguous expr or literal runs
    type Seg = { expr: boolean; text: string };
    const segments: Seg[] = [];
    let current: Seg | null = null;

    for (let i = 0; i < expanded.length; i++) {
      const ch = expanded[i];
      const expr = isExprIndex(i);

      if (!current || current.expr !== expr) {
        if (current) segments.push(current);
        current = { expr, text: ch };
      } else {
        current.text += ch;
      }
    }
    if (current) segments.push(current);

    // Turn segments into template parts
    const parts: string[] = [];

    for (const seg of segments) {
      if (seg.expr) {
        parts.push('[%s]');
      } else {
        const lit = seg.text.replace(/}/g, ')');
        if (lit.length) parts.push('{' + lit + '}');
      }
    }

    this.template = parts.length ? '[' + parts.join('+') + ']' : '';
  }

  // ---------------------------------------------------------
  // Argument list & combinations (unchanged logic)
  // ---------------------------------------------------------

  addArg(alsoInsertPlaceholder = false): void {
    const name = (this.newArgName || `Arg${this.argNames.length + 1}`).trim();
    if (!name) return;

    this.argNames        = [...this.argNames, name];
    this.argValues       = [...this.argValues, ''];
    this.nullMask        = [...this.nullMask, false];
    this.comboSelectMask = [...this.comboSelectMask, true];

    this.newArgName = '';
    this.syncComboMask();

    // template is built from visual, so we don't touch it here
    if (alsoInsertPlaceholder && this.template) {
      this.template += '+[%s]';
    }
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
    this.argValues = this.args.map((n) => n);
    this.nullMask  = this.args.map(() => false);
  }

  private syncComboMask(): void {
    this.comboSelectMask = Array.from(
      { length: this.args.length },
      (_, i) => this.comboSelectMask[i] ?? true
    );
  }

  private selectedIndices(): number[] {
    return this.args.map((_, i) => i).filter(i => this.comboSelectMask[i]);
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
