export function textContent(content) {
    return typeof content === 'string' ? content : content.filter(c => c.type === 'text').map(c => c.text).join('\n');
}
export function encodeContent(content, protocol, assistant = false) {
    if (typeof content === 'string')
        return content;
    return content.map(c => {
        if (c.type === 'text')
            return { type: protocol === 'responses' ? (assistant ? 'output_text' : 'input_text') : 'text', text: c.text };
        if (protocol === 'chat')
            return { type: 'image_url', image_url: { url: c.url } };
        if (protocol === 'responses')
            return { type: 'input_image', image_url: c.url };
        const data = /^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/.exec(c.url);
        return { type: 'image', source: data ? { type: 'base64', media_type: data[1], data: data[2] } : { type: 'url', url: c.url } };
    });
}
//# sourceMappingURL=content.js.map