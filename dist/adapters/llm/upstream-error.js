/** 只提取供应商的错误分类和参数名，不回显可能包含凭据或请求正文的 message。 */
export async function upstreamErrorDetail(response) {
    const reader = response.body?.getReader();
    if (!reader)
        return '';
    const chunks = [];
    let bytes = 0;
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done)
                break;
            bytes += value.byteLength;
            if (bytes > 16384) {
                await reader.cancel();
                return '';
            }
            chunks.push(value);
        }
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const error = payload?.error;
        const billingCode = String(error?.code ?? payload?.code ?? '').toLowerCase();
        const message = typeof error?.message === 'string'
            ? error.message
            : typeof payload?.message === 'string'
                ? payload.message
                : typeof payload?.msg === 'string'
                    ? payload.msg
                    : '';
        if (response.status === 402 ||
            [
                'insufficient_quota',
                'insufficient_balance',
                'balance_not_enough',
                'credit_balance_too_low',
                '1113',
                'arrearage',
                'insufficient_user_quota',
                'insufficientquota',
            ].includes(billingCode) ||
            /(?:余额不足|额度不足|余额已耗尽|insufficient (?:balance|credits|funds)|credit balance is too low|exceeded your current quota)/i.test(message))
            return '；billing=insufficient_balance';
        if (!error || typeof error !== 'object')
            return '';
        const fields = ['type', 'code', 'param'].flatMap((key) => {
            const value = error[key];
            return typeof value === 'string' &&
                /^[a-z][a-z0-9_.\[\]-]{0,79}$/i.test(value) &&
                !/^(?:sk-|bearer|api[_-]?key)/i.test(value)
                ? [`${key}=${value}`]
                : [];
        });
        return fields.length ? `；${fields.join('，')}` : '';
    }
    catch {
        return '';
    }
    finally {
        reader.releaseLock();
    }
}
//# sourceMappingURL=upstream-error.js.map