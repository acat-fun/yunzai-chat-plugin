import { getHelpContent, getHelpText } from '../../../application/admin/help.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { paths } from '../../storage/paths.js';
export async function sendYunzaiHelp(event) {
    const installName = path.basename(paths.root);
    if (!event.runtime?.render) {
        console.warn('[chat-plugin] 图片帮助不可用：消息事件缺少 runtime.render，已回退文字。');
        return event.reply(getHelpText(installName));
    }
    let image;
    const templateFile = path.join(paths.root, 'resources/help/index.html');
    try {
        await fs.access(templateFile, fs.constants.R_OK);
        image = await event.runtime.render(installName, 'help/index', { ...getHelpContent(installName), tplFile: templateFile }, {
            retType: 'base64',
            // 宿主会重建相对 tplFile，须在 beforeRender 中改为实际安装路径。
            beforeRender: ({ data }) => ({ ...data, tplFile: templateFile }),
        });
    }
    catch (error) {
        console.warn(`[chat-plugin] 帮助页渲染失败，模板：${templateFile}，${error instanceof Error ? error.message : '未知错误'}`);
        image = null;
    }
    if (image && typeof image !== 'boolean')
        return event.reply(image);
    console.warn(`[chat-plugin] 图片帮助未生成：宿主渲染器未返回图片，模板：${templateFile}。请检查上方渲染器/浏览器日志。`);
    return event.reply(getHelpText(installName));
}
//# sourceMappingURL=help.js.map