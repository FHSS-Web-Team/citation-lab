import { Component, ElementRef, HostListener, computed, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CitationTemplate } from './../CitationTemplate/citation-template';
import { CitationTemplateAddend } from './../CitationTemplate/citation-template-addend';
import { CitationTemplateExpression } from './../CitationTemplate/citation-template-expression';
import { CitationTemplateLiteral } from './../CitationTemplate/citation-template-literal';
import { CitationTemplateVariable } from './../CitationTemplate/citation-template-variable';
import { TemplateSyncService } from '../template-sync.service';

@Component({
  selector: 'app-template-builder',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './template-builder.html',
  styleUrl: './template-builder.scss',
})
export class TemplateBuilder {
@ViewChild('templateEditor') private templateEditor?: ElementRef<HTMLTextAreaElement>;

  protected readonly template = new CitationTemplate();
  protected readonly parts = signal<CitationTemplateAddend[]>([]);
  protected readonly textInput = signal('');
  protected readonly selectedIndices = signal<Set<number>>(new Set());
  protected readonly templateOutput = signal('');
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly undoAvailable = signal(false);
  protected readonly shortcutLabels = {
    literal: 'Ctrl+Alt+Q',
    variable: 'Ctrl+Alt+W',
    wrap: 'Ctrl+Alt+E',
    undo: 'Ctrl+Alt+Z',
    clear: 'Ctrl+Alt+A',
  } as const;
  protected readonly inputLocked = signal(false);
  private readonly shortcutHandlers: Record<string, () => void>;
  protected readonly canWrapSelection = computed(() => {
    const ordered = [...this.selectedIndices()].sort((a, b) => a - b);
    if (ordered.length < 2) {
      return false;
    }
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    return last - first === ordered.length - 1;
  });
  protected readonly hasSelection = computed(() => this.selectedIndices().size > 0);

  constructor(private sync: TemplateSyncService) {
    this.shortcutHandlers = {
      keyq: () => this.convertSelectionToLiteral(),
      keyw: () => this.convertSelectionToVariable(),
      keye: () => this.wrapSelection(),
      keyz: () => this.undoLastChange(),
      keya: () => this.clearSelection(),
    };
    this.refreshTemplateState();
  }

  getVariables(): string[] {
    return this.template.getVariables();
  }

  getTemplate(): string {
    return this.template.stringify()
  }

  protected toggleSelection(index: number) {
    const selection = new Set(this.selectedIndices());
    if (selection.has(index)) {
      selection.delete(index);
    } else {
      selection.add(index);
    }
    this.selectedIndices.set(selection);
  }

  protected clearSelection() {
    this.selectedIndices.set(new Set());
  }

  protected isSelected(index: number) {
    return this.selectedIndices().has(index);
  }

  protected wrapSelection() {
    if (!this.canWrapSelection()) {
      return;
    }
    try {
      const ordered = [...this.selectedIndices()].sort((a, b) => a - b);
      this.template.wrapExpression(ordered[0], ordered[ordered.length - 1]);
      this.clearSelection();
      this.setError(null);
      this.refreshTemplateState();
    } catch (error) {
      this.setError((error as Error)?.toString());
    }
  }

  protected getParts() {
    return this.parts();
  }

  protected getAddendType(addend: CitationTemplateAddend): 'literal' | 'variable' | 'expression' {
    if (addend instanceof CitationTemplateLiteral) {
      return 'literal';
    }
    if (addend instanceof CitationTemplateVariable) {
      return 'variable';
    }
    if (addend instanceof CitationTemplateExpression) {
      return 'expression';
    }
    return 'literal';
  }

  protected trackByIndex(index: number) {
    return index;
  }

  protected getOutput() {
    return this.templateOutput();
  }

  protected canUndo() {
    return this.undoAvailable();
  }

  protected undoLastChange() {
    if (!this.template.undo()) {
      return;
    }
    this.clearSelection();
    this.setError(null);
    this.refreshTemplateState();
  }

  @HostListener('window:keydown', ['$event'])
  protected handleShortcut(event: KeyboardEvent) {
    if (!event.ctrlKey || !event.altKey || event.metaKey) {
      return;
    }
    const handler = this.shortcutHandlers[event.code?.toLowerCase()];
    if (!handler) {
      return;
    }
    event.preventDefault();
    handler();
  }

  protected copyOutput() {
    const output = this.getOutput();
    if (!output) {
      this.setError('Nothing to copy yet.');
      return;
    }
    if (navigator?.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard
        .writeText(output)
        .then(() => this.setError(null))
        .catch(() => {
          this.setError('Failed to copy to clipboard. Please try again.');
        });
      return;
    }
    this.setError('Clipboard API not available in this browser.');
  }

  protected hasParts() {
    return this.getParts().length > 0;
  }

  protected getError() {
    return this.errorMessage();
  }

  protected handleTextInput(event: Event) {
    if (this.isInputLocked()) {
      (event.target as HTMLTextAreaElement | null)?.blur();
      return;
    }
    const value = (event.target as HTMLTextAreaElement | null)?.value ?? '';
    this.applyTextInputValue(value);
  }

  protected toggleInputLock() {
    this.inputLocked.set(!this.inputLocked());
    if (this.isInputLocked()) {
      this.templateEditor?.nativeElement?.blur();
    }
  }

  protected isInputLocked() {
    return this.inputLocked();
  }

  protected removeBracketsFromInput() {
    if (this.isInputLocked()) {
      return;
    }
    const current = this.textInput();
    if (!current) {
      return;
    }
    const cleaned = current.replace(/[\[\]]/g, '');
    if (cleaned === current) {
      return;
    }
    this.applyTextInputValue(cleaned);
  }

  protected convertSelectionToLiteral() {
    this.convertSelection('literal');
  }

  protected convertSelectionToVariable() {
    this.convertSelection('variable');
  }

  private refreshTemplateState() {
    this.parts.set([...this.template.getParts()]);
    this.templateOutput.set(this.template.stringify());
    this.undoAvailable.set(this.template.canUndo());
    this.sync.setData(this.getVariables(), this.getTemplate());
  }

  private setError(message: string | null) {
    this.errorMessage.set(message);
  }

  private convertSelection(type: 'literal' | 'variable') {
    const selection = this.getCurrentSelection();
    if (!selection) {
      this.setError('Highlight text in the editor above before converting.');
      return;
    }
    const { start, end } = selection;
    if (start === end) {
      this.setError('Please select at least one character.');
      return;
    }

    const preview = this.textInput();
    if (!preview) {
      this.setError('Type a citation above before tagging parts.');
      return;
    }

    if (start < 0 || end > preview.length) {
      this.setError('Selection is out of bounds.');
      return;
    }

    const currentParts = this.template.getParts();
    const nextParts: CitationTemplateAddend[] = [];
    let cursor = 0;
    let collectingSelection = false;
    let selectionBuffer = '';
    let applied = false;

    for (const addend of currentParts) {
      const text = addend.toString();
      const partStart = cursor;
      const partEnd = cursor + text.length;

      const overlapsSelection = end > partStart && start < partEnd;

      if (!overlapsSelection) {
        nextParts.push(addend);
        cursor = partEnd;
        continue;
      }

      if (!(addend instanceof CitationTemplateLiteral)) {
        this.setError('Selection can only include literal text. Adjust your highlight and try again.');
        return;
      }

      const localStart = Math.max(start, partStart) - partStart;
      const localEnd = Math.min(end, partEnd) - partStart;

      if (!collectingSelection && localStart > 0) {
        const prefix = text.slice(0, localStart);
        if (prefix) {
          nextParts.push(new CitationTemplateLiteral(prefix));
        }
      }

      collectingSelection = true;
      selectionBuffer += text.slice(localStart, localEnd);
      const selectionEndsHere = end <= partEnd;

      if (selectionEndsHere) {
        nextParts.push(this.createAddend(type, selectionBuffer));
        selectionBuffer = '';
        applied = true;
        collectingSelection = false;
        if (localEnd < text.length) {
          const suffix = text.slice(localEnd);
          if (suffix) {
            nextParts.push(new CitationTemplateLiteral(suffix));
          }
        }
      }

      cursor = partEnd;
    }

    if (!applied) {
      this.setError('Selection must overlap literal text.');
      return;
    }

    this.template.replaceParts(nextParts);
    this.clearSelection();
    this.setError(null);
    this.refreshTemplateState();
  }

  private createAddend(type: 'literal' | 'variable', value: string) {
    if (type === 'literal') {
      return new CitationTemplateLiteral(value);
    }
    return new CitationTemplateVariable(value);
  }

  private getCurrentSelection() {
    const element = this.templateEditor?.nativeElement;
    if (!element) {
      return null;
    }
    return { start: element.selectionStart ?? 0, end: element.selectionEnd ?? 0 };
  }

  private applyTextInputValue(value: string) {
    this.textInput.set(value);
    if (value.trim().length === 0) {
      this.template.replaceParts([], { recordHistory: false, resetHistory: true });
      this.clearSelection();
      this.setError(null);
      this.refreshTemplateState();
      return;
    }
    this.template.replaceParts(
      [new CitationTemplateLiteral(value)],
      { recordHistory: false, resetHistory: true }
    );
    this.clearSelection();
    this.setError(null);
    this.refreshTemplateState();
  }
}
