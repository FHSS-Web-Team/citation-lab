import { CitationTemplateVariable } from "./citation-template-variable";

export class CitationTemplateAddend {
    private displayValue: string;
    private templateValue: string;

    constructor(displayValue: string, templateValue: string) {
        this.displayValue = displayValue;
        this.templateValue = templateValue;
    }

    toString() {
        return this.displayValue;
    }

    stringify() {
        return this.templateValue;
    }

    getVariables(): string[] {
      throw 'Needs implementation'
    }
}
