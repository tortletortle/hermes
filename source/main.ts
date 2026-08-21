// @ts-ignore
import packageJSON from '../package.json';
import * as http from 'http';
import * as url from 'url';
import * as fs from 'fs';
import * as path from 'path';

const PORT = 8899;
const PACKAGE_NAME = packageJSON.name;

function projectPath(): string {
    const editorAny: any = Editor as any;
    const project = editorAny.Project;
    if (project && project.path) return project.path;
    if (editorAny.ProjectManager && editorAny.ProjectManager.path) return editorAny.ProjectManager.path;
    throw new Error('Project path unavailable');
}

function safeProjectFile(relativePath: string): string {
    const root = path.resolve(projectPath());
    const target = path.resolve(root, relativePath);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error('Path escapes project root');
    return target;
}

// 记录日志供面板显示
const logs: string[] = [];

function log(msg: string) {
    const t = new Date().toLocaleTimeString();
    const line = `[${t}] ${msg}`;
    logs.push(line);
    console.log(`[${PACKAGE_NAME}] ${msg}`);
    if (logs.length > 500) logs.shift();
}

function getLogs() { return logs; }

// ========== HTTP 服务器 ==========

function sendJSON(res: http.ServerResponse, data: any, status = 200) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    });
    res.end(JSON.stringify(data));
}

function sendError(res: http.ServerResponse, msg: string, status = 400) {
    sendJSON(res, { error: msg }, status);
}

function parseBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk: string) => { body += chunk; });
        req.on('end', () => {
            if (!body) return resolve({});
            try { resolve(JSON.parse(body)); }
            catch (e) { reject(new Error('Invalid JSON')); }
        });
        req.on('error', reject);
    });
}

// ========== API 处理器 ==========

const handlers: Record<string, (body: any, res: http.ServerResponse) => Promise<void>> = {
    // ==================== 基础 API ====================
    
    // 健康检查
    async 'GET /'(body, res) {
        sendJSON(res, { 
            status: 'ok', 
            name: PACKAGE_NAME, 
            version: '2.0.0',
            features: [
                'node-operations',
                'ui-components', 
                'asset-management',
                'scene-management',
                'preview-control'
            ]
        });
    },

    // 获取日志
    async 'GET /api/logs'(body, res) {
        sendJSON(res, { logs: getLogs() });
    },

    // 获取版本信息
    async 'GET /api/version'(body, res) {
        sendJSON(res, { 
            version: '2.0.0',
            name: PACKAGE_NAME,
            description: 'Hermes Game Maker - Cocos Creator 编程接口'
        });
    },

    // ==================== 编辑器消息 API ====================

    // 调用 Editor.Message.request（请求-响应模式）
    async 'POST /api/editor/request'(body, res) {
        const { message, args } = body;
        if (!message) return sendError(res, 'message is required');
        try {
            log(`Editor.Message.request: ${message}`);
            const [module, ...msgParts] = message.split(':');
            const msgName = msgParts.join(':') || module;
            const result = args && args.length > 0
                ? await Editor.Message.request(module, msgName, ...args)
                : await Editor.Message.request(module, msgName);
            sendJSON(res, { result });
        } catch (e: any) {
            log(`ERROR Editor.Message.request: ${e.message}`);
            sendError(res, e.message, 500);
        }
    },

    // 调用 Editor.Message.send（发送后不等待返回）
    async 'POST /api/editor/send'(body, res) {
        const { message, args } = body;
        if (!message) return sendError(res, 'message is required');
        try {
            log(`Editor.Message.send: ${message}`);
            Editor.Message.send(message, args);
            sendJSON(res, { sent: true });
        } catch (e: any) {
            log(`ERROR Editor.Message.send: ${e.message}`);
            sendError(res, e.message, 500);
        }
    },

    // 直接调用 Editor 全局 API
    async 'POST /api/editor/call'(body, res) {
        const { path, args } = body;
        if (!path) return sendError(res, 'path is required');
        try {
            const parts = path.split('.');
            let obj: any = globalThis;
            for (const p of parts) {
                if (obj == null) throw new Error(`Cannot read '${p}' of null`);
                obj = obj[p];
            }
            if (typeof obj !== 'function') throw new Error(`'${path}' is not a function`);
            const result = await obj(...(args || []));
            sendJSON(res, { result });
        } catch (e: any) {
            log(`ERROR Editor.call ${path}: ${e.message}`);
            sendError(res, e.message, 500);
        }
    },

    // ==================== 场景脚本 API ====================

    // 执行场景脚本方法
    async 'POST /api/scene/execute'(body, res) {
        const { method, args } = body;
        if (!method) return sendError(res, 'method is required');
        try {
            log(`execute-scene-script: ${method}`);
            const scriptArgs = Array.isArray(args) ? args : (args !== undefined ? [args] : []);
            const result = await Editor.Message.request('scene', 'execute-scene-script', {
                name: PACKAGE_NAME,
                method,
                args: scriptArgs,
            });
            sendJSON(res, { result });
        } catch (e: any) {
            log(`ERROR execute-scene-script: ${e.message}`);
            sendError(res, e.message, 500);
        }
    },

    // ==================== 游戏脚本文件 API ====================

    async 'POST /api/script/create'(body, res) {
        const { file, className, content } = body;
        if (!file) return sendError(res, 'file is required');
        try {
            const target = safeProjectFile(file);
            fs.mkdirSync(path.dirname(target), { recursive: true });
            const cls = className || path.basename(file, path.extname(file));
            const source = content || `import { _decorator, Component } from 'cc';\nconst { ccclass } = _decorator;\n\n@ccclass('${cls}')\nexport class ${cls} extends Component {\n    start() {}\n    update(deltaTime: number) {}\n}\n`;
            fs.writeFileSync(target, source, 'utf8');
            log(`script created: ${file}`);
            sendJSON(res, { success: true, file, bytes: Buffer.byteLength(source) });
        } catch (e: any) {
            sendError(res, e.message, 500);
        }
    },

    async 'POST /api/script/read'(body, res) {
        const { file } = body;
        if (!file) return sendError(res, 'file is required');
        try {
            const target = safeProjectFile(file);
            const content = fs.readFileSync(target, 'utf8');
            sendJSON(res, { file, content });
        } catch (e: any) {
            sendError(res, e.message, 404);
        }
    },

    async 'POST /api/script/list'(body, res) {
        const dir = body.dir || 'assets';
        try {
            const root = safeProjectFile(dir);
            const result: string[] = [];
            const walk = (current: string) => {
                if (!fs.existsSync(current)) return;
                for (const name of fs.readdirSync(current)) {
                    const full = path.join(current, name);
                    if (fs.statSync(full).isDirectory()) walk(full);
                    else if (/\.(ts|js)$/.test(name)) result.push(path.relative(projectPath(), full).replace(/\\/g, '/'));
                }
            };
            walk(root);
            sendJSON(res, { files: result });
        } catch (e: any) {
            sendError(res, e.message, 500);
        }
    },

    // ==================== 资源管理 API ====================

    // 查询资源列表
    async 'POST /api/asset/query'(body, res) {
        try {
            const result = await Editor.Message.request('asset-db', 'query-assets');
            sendJSON(res, { result });
        } catch (e: any) {
            sendError(res, e.message, 500);
        }
    },

    // 查询单个资源详情
    async 'POST /api/asset/info'(body, res) {
        const { uuid } = body;
        if (!uuid) return sendError(res, 'uuid is required');
        try {
            const result = await Editor.Message.request('asset-db', 'query-asset-info', uuid);
            sendJSON(res, { result });
        } catch (e: any) {
            sendError(res, e.message, 500);
        }
    },

    // 创建资源（场景、脚本、预制体等）
    async 'POST /api/asset/create'(body, res) {
        const { type, name, path: assetPath, content } = body;
        if (!type || !name) return sendError(res, 'type and name are required');
        try {
            let result;
            switch (type) {
                case 'scene':
                    result = await Editor.Message.request('scene', 'create-scene', assetPath || `assets/${name}.scene`);
                    break;
                case 'script':
                    result = await Editor.Message.request('asset-db', 'create-asset', {
                        name: name,
                        ext: '.ts',
                        content: content || `import { _decorator, Component } from 'cc';\nconst { ccclass, property } = _decorator;\n\n@ccclass('${name}')\nexport class ${name} extends Component {\n    start() {\n    }\n    update(deltaTime: number) {\n    }\n}\n`
                    });
                    break;
                case 'prefab':
                    result = await Editor.Message.request('asset-db', 'create-asset', {
                        name: name,
                        ext: '.prefab',
                        content: content || '{}'
                    });
                    break;
                case 'material':
                    result = await Editor.Message.request('asset-db', 'create-asset', {
                        name: name,
                        ext: '.mtl',
                        content: content || '{}'
                    });
                    break;
                default:
                    throw new Error(`Unsupported asset type: ${type}`);
            }
            sendJSON(res, { result });
        } catch (e: any) {
            log(`ERROR create asset: ${e.message}`);
            sendError(res, e.message, 500);
        }
    },

    // 导入资源（从外部路径）
    async 'POST /api/asset/import'(body, res) {
        const { sourcePath, targetPath } = body;
        if (!sourcePath) return sendError(res, 'sourcePath is required');
        try {
            const result = await Editor.Message.request('asset-db', 'import-assets', [sourcePath], targetPath || 'assets/');
            sendJSON(res, { result });
        } catch (e: any) {
            log(`ERROR import asset: ${e.message}`);
            sendError(res, e.message, 500);
        }
    },

    // 删除资源
    async 'POST /api/asset/delete'(body, res) {
        const { uuid } = body;
        if (!uuid) return sendError(res, 'uuid is required');
        try {
            const result = await Editor.Message.request('asset-db', 'delete-assets', [uuid]);
            sendJSON(res, { result });
        } catch (e: any) {
            log(`ERROR delete asset: ${e.message}`);
            sendError(res, e.message, 500);
        }
    },

    // 复制资源
    async 'POST /api/asset/copy'(body, res) {
        const { uuid, targetPath } = body;
        if (!uuid) return sendError(res, 'uuid is required');
        try {
            const result = await Editor.Message.request('asset-db', 'copy-asset', uuid, targetPath);
            sendJSON(res, { result });
        } catch (e: any) {
            log(`ERROR copy asset: ${e.message}`);
            sendError(res, e.message, 500);
        }
    },

    // 移动/重命名资源
    async 'POST /api/asset/move'(body, res) {
        const { uuid, targetPath } = body;
        if (!uuid || !targetPath) return sendError(res, 'uuid and targetPath are required');
        try {
            const result = await Editor.Message.request('asset-db', 'move-asset', uuid, targetPath);
            sendJSON(res, { result });
        } catch (e: any) {
            log(`ERROR move asset: ${e.message}`);
            sendError(res, e.message, 500);
        }
    },

    // 保存资源
    async 'POST /api/asset/save'(body, res) {
        const { uuid } = body;
        if (!uuid) return sendError(res, 'uuid is required');
        try {
            const result = await Editor.Message.request('asset-db', 'save-asset', uuid);
            sendJSON(res, { result });
        } catch (e: any) {
            log(`ERROR save asset: ${e.message}`);
            sendError(res, e.message, 500);
        }
    },

    // ==================== 场景管理 API ====================

    // 获取当前场景信息
    async 'GET /api/scene/info'(body, res) {
        try {
            const result = await Editor.Message.request('scene', 'query-scene');
            sendJSON(res, { result });
        } catch (e: any) {
            sendError(res, e.message, 500);
        }
    },

    // 创建新场景
    async 'POST /api/scene/create'(body, res) {
        const { name } = body;
        try {
            const result = await Editor.Message.request('scene', 'create-scene', name);
            sendJSON(res, { result });
        } catch (e: any) {
            log(`ERROR create scene: ${e.message}`);
            sendError(res, e.message, 500);
        }
    },

    // 打开场景
    async 'POST /api/scene/open'(body, res) {
        const { uuid } = body;
        if (!uuid) return sendError(res, 'uuid is required');
        try {
            await Editor.Message.request('scene', 'open-scene', uuid);
            sendJSON(res, { success: true });
        } catch (e: any) {
            log(`ERROR open scene: ${e.message}`);
            sendError(res, e.message, 500);
        }
    },

    // 保存场景
    async 'POST /api/scene/save'(body, res) {
        try {
            await Editor.Message.request('scene', 'save-scene');
            sendJSON(res, { success: true });
        } catch (e: any) {
            log(`ERROR save scene: ${e.message}`);
            sendError(res, e.message, 500);
        }
    },

    // 撤销操作
    async 'POST /api/scene/undo'(body, res) {
        try {
            await Editor.Message.request('scene', 'undo');
            sendJSON(res, { success: true });
        } catch (e: any) {
            log(`ERROR undo: ${e.message}`);
            sendError(res, e.message, 500);
        }
    },

    // 重做操作
    async 'POST /api/scene/redo'(body, res) {
        try {
            await Editor.Message.request('scene', 'redo');
            sendJSON(res, { success: true });
        } catch (e: any) {
            log(`ERROR redo: ${e.message}`);
            sendError(res, e.message, 500);
        }
    },

    // ==================== 预览控制 API ====================

    // 启动预览
    async 'POST /api/preview/start'(body, res) {
        const { platform } = body; // 'browser', 'simulator', etc.
        try {
            await Editor.Message.request('preview', 'start', platform || 'browser');
            sendJSON(res, { success: true, platform: platform || 'browser' });
        } catch (e: any) {
            log(`ERROR start preview: ${e.message}`);
            sendError(res, e.message, 500);
        }
    },

    // 停止预览
    async 'POST /api/preview/stop'(body, res) {
        try {
            await Editor.Message.request('preview', 'stop');
            sendJSON(res, { success: true });
        } catch (e: any) {
            log(`ERROR stop preview: ${e.message}`);
            sendError(res, e.message, 500);
        }
    },

    // 刷新预览
    async 'POST /api/preview/refresh'(body, res) {
        try {
            await Editor.Message.request('preview', 'refresh');
            sendJSON(res, { success: true });
        } catch (e: any) {
            log(`ERROR refresh preview: ${e.message}`);
            sendError(res, e.message, 500);
        }
    },

    // ==================== 构建控制 API ====================

    // 触发构建
    async 'POST /api/build/start'(body, res) {
        const { platform, options } = body;
        try {
            log(`Starting build for platform: ${platform}`);
            const result = await Editor.Message.request('builder', 'build', {
                platform: platform || 'web-mobile',
                options: options || {}
            });
            sendJSON(res, { result });
        } catch (e: any) {
            log(`ERROR build: ${e.message}`);
            sendError(res, e.message, 500);
        }
    },

    // 获取构建状态
    async 'GET /api/build/status'(body, res) {
        try {
            const result = await Editor.Message.request('builder', 'query-status');
            sendJSON(res, { result });
        } catch (e: any) {
            sendError(res, e.message, 500);
        }
    },

    // ==================== 面板 API ====================

    // 打开面板
    async 'POST /api/panel/open'(body, res) {
        const { name } = body;
        try {
            Editor.Panel.open(name || PACKAGE_NAME);
            sendJSON(res, { success: true });
        } catch (e: any) {
            log(`ERROR open panel: ${e.message}`);
            sendError(res, e.message, 500);
        }
    },

    // 关闭面板
    async 'POST /api/panel/close'(body, res) {
        const { name } = body;
        try {
            Editor.Panel.close(name || PACKAGE_NAME);
            sendJSON(res, { success: true });
        } catch (e: any) {
            log(`ERROR close panel: ${e.message}`);
            sendError(res, e.message, 500);
        }
    },
};

// ========== 服务器 ==========

let server: http.Server | null = null;

function startServer() {
    if (server) return;

    server = http.createServer(async (req, res) => {
        // CORS 预检
        if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            });
            res.end();
            return;
        }

        const parsed = url.parse(req.url || '/', true);
        const path = parsed.pathname || '/';
        const key = `${req.method} ${path}`;

        try {
            const body = ['GET', 'DELETE'].includes(req.method || '')
                ? parsed.query
                : await parseBody(req);

            const handler = handlers[key];
            if (handler) {
                await handler(body, res);
            } else {
                sendJSON(res, { error: 'Not found', path: key }, 404);
            }
        } catch (e: any) {
            log(`ERROR ${key}: ${e.message}`);
            if (!res.headersSent) {
                sendError(res, 'Internal server error: ' + e.message, 500);
            }
        }
    });

    server.listen(PORT, '127.0.0.1', () => {
        log(`HTTP server started on http://127.0.0.1:${PORT}`);
    });

    server.on('error', (e: any) => {
        log(`HTTP server error: ${e.message}`);
    });
}

function stopServer() {
    if (server) {
        server.close();
        server = null;
        log('HTTP server stopped');
    }
}

// ========== 扩展生命周期 ==========

export const methods: { [key: string]: (...any: any) => any } = {
    openPanel() {
        Editor.Panel.open(PACKAGE_NAME);
    },

    async executeScene(body: any) {
        return await Editor.Message.request('scene', 'execute-scene-script', body);
    },

    getServerPort() {
        return PORT;
    },

    getLogs() {
        return getLogs();
    },
};

export function load() {
    log('Extension loaded');
    startServer();
}

export function unload() {
    log('Extension unloaded');
    stopServer();
}