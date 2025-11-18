import { CitationTemplateAddend } from "./citation-template-addend";
import { CitationTemplateExpression } from "./citation-template-expression";
import { CitationTemplateLiteral } from "./citation-template-literal";
import { CitationTemplateVariable } from "./citation-template-variable";

export class CitationTemplate {
    private template: CitationTemplateAddend[];
    private history: CitationTemplateAddend[][];

    constructor() {
        this.template = [];
        this.history = [];
    }

    addVariable(input: string) {
        this.updateTemplate(parts => {
            parts.push(new CitationTemplateVariable(input));
            return parts;
        });
    }

    addLiteral(input: string) {
        this.updateTemplate(parts => {
            parts.push(new CitationTemplateLiteral(input));
            return parts;
        });
    }

    replaceParts(addends: CitationTemplateAddend[], options?: TemplateUpdateOptions) {
        this.setTemplate(addends, options);
    }

    private wrapExpressionValidation(startIndex: number, endIndex: number) {
        // indices must be integers
        if (!Number.isInteger(startIndex)) {
            throw 'Start index must be integer.'
        }
        if (!Number.isInteger(endIndex)) {
            throw 'End index must be integer.'
        }
    
        // must be a proper bound (at least 2 range)
        if (endIndex - startIndex < 1) {
            throw 'End index must be at least one more than the start index.'
        }
        
        // must be within the bounds of the template array
        if (startIndex < 0 || endIndex >= this.template.length) {
            throw 'Start and end index must be within the range of the template size.'
        }
    }

    wrapExpression(startIndex: number, endIndex: number) {
        // check inputs
        this.wrapExpressionValidation(startIndex, endIndex);

        this.updateTemplate(parts => {
            const replacement = new CitationTemplateExpression(parts.slice(startIndex, endIndex + 1));
            parts.splice(startIndex, endIndex - startIndex + 1, replacement);
            return parts;
        });
    }

    getParts() {
        return [...this.template];
    }

    getVariables(): string[] {
      return this.template.flatMap(addend => addend.getVariables())
    }

    toString() {
        return this.template.map(addend => addend.toString()).join('');
    }

    stringify() {
        return this.template.map(addend => addend.stringify()).join('');
    }

    undo() {
        const previous = this.history.pop();
        if (!previous) {
            return false;
        }
        this.template = [...previous];
        return true;
    }

    canUndo() {
        return this.history.length > 0;
    }

    private updateTemplate(mutator: (parts: CitationTemplateAddend[]) => CitationTemplateAddend[], options?: TemplateUpdateOptions) {
        const nextParts = mutator([...this.template]);
        this.setTemplate(nextParts, options);
    }

    private setTemplate(nextParts: CitationTemplateAddend[], options?: TemplateUpdateOptions) {
        const recordHistory = options?.recordHistory ?? true;
        const resetHistory = options?.resetHistory ?? false;

        if (this.arePartsEqual(nextParts)) {
            if (resetHistory) {
                this.history = [];
            }
            return;
        }

        if (resetHistory) {
            this.history = [];
        } else if (recordHistory) {
            this.history.push(this.snapshot());
        }

        this.template = [...nextParts];
    }

    private arePartsEqual(nextParts: CitationTemplateAddend[]) {
        if (nextParts.length !== this.template.length) {
            return false;
        }
        return nextParts.every((addend, index) => addend === this.template[index]);
    }

    private snapshot() {
        return [...this.template];
    }

}

type TemplateUpdateOptions = {
    recordHistory?: boolean;
    resetHistory?: boolean;
}
