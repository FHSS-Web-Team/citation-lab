import { CitationTemplateAddend } from "./citation-template-addend";

export class CitationTemplateVariable extends CitationTemplateAddend {
    constructor(value: string) {
        super(value, '[%s]')
    }

    override getVariables(): string[] {
      return [this.toString()];
    }
}
