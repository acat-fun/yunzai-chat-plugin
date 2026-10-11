export class WebError extends Error {
    code;
    diagnostic;
    constructor(code, message, diagnostic) {
        super(message);
        this.code = code;
        this.diagnostic = diagnostic;
    }
}
//# sourceMappingURL=web.js.map