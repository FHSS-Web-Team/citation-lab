import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Doc, Segment, SegmentType, uid } from '../shared/visual-builder.types';

@Component({
  selector: 'app-visual-builder',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './visual-builder.component.html',
  styleUrls: ['./visual-builder.component.scss'],
})
export class VisualBuilderComponent {
  /** Optional starting text (will be a single literal segment) */
  @Input() seedText = '';

  /** Emit compiled template + auto arg names when user clicks “Send to Builder” */
  @Output() apply = new EventEmitter<{ template: string; argNames: string[] }>();

  @ViewChild('editor', { static: true }) editor!: ElementRef<HTMLDivElement>;

  doc: Doc = [{ id: uid(), type: 'literal', text: '' }];

  ngOnInit() {
    this.doc = this.normalize([{ id: uid(), type: 'literal', text: this.seedText || '' }]);
  }

  // ------------------ Rendering helpers ------------------
  get plainText(): string { return this.doc.map(s => s.text).join(''); }

  // Highlight spans
  isExpr(seg: Segment) { return seg.type === 'expr'; }
  isLit(seg: Segment)  { return seg.type === 'literal'; }

  // ------------------ Core ops ------------------
  private normalize(d: Doc): Doc {
    const out: Doc = [];
    for (const s of d) {
      if (!s.text) continue;
      const last = out[out.length - 1];
      if (last && last.type === s.type) last.text += s.text;
      else out.push({ ...s });
    }
    return out;
  }

  private locate(d: Doc, abs: number) {
    let acc = 0;
    for (let i = 0; i < d.length; i++) {
      const len = d[i].text.length;
      if (abs <= acc + len) {
        return { segIndex: i, offsetInSeg: abs - acc };
      }
      acc += len;
    }
    return { segIndex: d.length - 1, offsetInSeg: d.at(-1)?.text.length ?? 0 };
  }

  private splitAt(d: Doc, segIndex: number, offsetInSeg: number): Doc {
    const seg = d[segIndex];
    if (!seg) return d;
    if (offsetInSeg <= 0 || offsetInSeg >= seg.text.length) return d;
    const a: Segment = { id: uid(), type: seg.type, text: seg.text.slice(0, offsetInSeg) };
    const b: Segment = { id: uid(), type: seg.type, text: seg.text.slice(offsetInSeg) };
    return this.normalize([...d.slice(0, segIndex), a, b, ...d.slice(segIndex + 1)]);
  }

  private markRange(start: number, end: number, type: SegmentType) {
    if (end < start) [start, end] = [end, start];
    let d = this.doc;

    const bStart = this.locate(d, start);
    d = this.splitAt(d, bStart.segIndex, bStart.offsetInSeg);

    const bEnd = this.locate(d, end);
    d = this.splitAt(d, bEnd.segIndex, bEnd.offsetInSeg);

    const i = this.locate(d, start).segIndex;
    const j = this.locate(d, end).segIndex; // inclusive end; we’ll map below

    const next = d.map((seg, idx) =>
      (idx >= i && idx < j) ? { ...seg, type } :
      (idx === j ? { ...seg, type } : seg)
    );
    this.doc = this.normalize(next);
  }

  // ------------------ Selection utilities ------------------
  private getSelectionOffsets(): { start: number; end: number } | null {
    const root = this.editor.nativeElement;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);

    const r0 = document.createRange();
    r0.selectNodeContents(root);
    r0.setEnd(range.startContainer, range.startOffset);
    const start = r0.toString().length;

    const r1 = document.createRange();
    r1.selectNodeContents(root);
    r1.setEnd(range.endContainer, range.endOffset);
    const end = r1.toString().length;

    return { start, end };
  }

  // ------------------ Toolbar actions ------------------
  toExpr() {
    const off = this.getSelectionOffsets();
    if (!off || off.start === off.end) return;
    this.markRange(off.start, off.end, 'expr');
  }
  toLit() {
    const off = this.getSelectionOffsets();
    if (!off || off.start === off.end) return;
    this.markRange(off.start, off.end, 'literal');
  }
  clearAll() {
    this.doc = this.normalize([{ id: uid(), type: 'literal', text: '' }]);
  }

  // ------------------ Typing (simple, predictable) ------------------
  // For MVP: typing rewrites as one literal segment. Then users mark expressions.
  onInputText() {
    const t = this.editor.nativeElement.innerText;
    this.doc = this.normalize([{ id: uid(), type: 'literal', text: t }]);
  }

  // ------------------ Compile to your language ------------------
  get compiledTemplate(): string {
    const parts = this.doc.map(seg =>
      seg.type === 'expr' ? '[%s]' : '{' + seg.text.replace(/}/g, ')') + '}'
    );
    return '[' + parts.join('+') + ']';
  }

  get argNames(): string[] {
    const count = this.doc.filter(s => s.type === 'expr').length;
    return Array.from({ length: count }, (_, i) => `Arg${i + 1}`);
  }

  sendToBuilder() {
    this.apply.emit({ template: this.compiledTemplate, argNames: this.argNames });
  }

  trackById = (_: number, seg: Segment) => seg.id;

}
