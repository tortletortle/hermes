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

// SSE 客户端列表（日志实时推送）
const sseClients: http.ServerResponse[] = [];

function log(msg: string) {
    const t = new Date().toLocaleTimeString();
    const line = `[${t}] ${msg}`;
    logs.push(line);
    console.log(`[${PACKAGE_NAME}] ${msg}`);
    if (logs.length > 500) logs.shift();
    // 广播给 SSE 订阅者
    const payload = `data: ${JSON.stringify({ t, msg })}\n\n`;
    for (let i = sseClients.length - 1; i >= 0; i--) {
        try {
            sseClients[i].write(payload);
        } catch {
            sseClients.splice(i, 1);
        }
    }
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
    // SSE 实时日志流：curl -N http://127.0.0.1:8899/api/logs/stream
    async 'GET /api/logs/stream'(body, res) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
        });
        res.write(`data: ${JSON.stringify({ hello: true, ts: Date.now() })}\n\n`);
        sseClients.push(res);
        // 客户端断开时清理
        res.on('close', () => {
            const idx = sseClients.indexOf(res);
            if (idx >= 0) sseClients.splice(idx, 1);
        });
    },

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

    // 执行场景脚本方法（带卡死超时自愈）
    async 'POST /api/scene/execute'(body, res) {
        const { method, args } = body;
        if (!method) return sendError(res, 'method is required');
        try {
            log(`execute-scene-script: ${method}`);
            const scriptArgs = Array.isArray(args) ? args : (args !== undefined ? [args] : []);
            const timeoutMs = Number(body.timeout || 30000);
            const result = await Promise.race([
                Editor.Message.request('scene', 'execute-scene-script', {
                    name: PACKAGE_NAME,
                    method,
                    args: scriptArgs,
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`scene script timeout after ${timeoutMs}ms (method: ${method})`)), timeoutMs)
                ),
            ]);
            sendJSON(res, { result });
        } catch (e: any) {
            log(`ERROR execute-scene-script: ${e.message}`);
            if (/timeout/.test(e.message)) {
                // 场景进程疑似卡死：自动尝试重开场景
                try {
                    const info = await Editor.Message.request('asset-db', 'query-asset-info', 'db://assets/');
                    void info; // 探活
                    log('Scene process may be hung, attempting scene reopen...');
                } catch { /* ignore */ }
            }
            sendError(res, e.message + ' | hint: scene process may be hung, retry POST /api/scene/open to recover', 504);
        }
    },

    /**
     * 幂等游戏启动：开场景 → setupUICanvas → bootGameScript 三合一
     * body: { sceneUuid?, gamePath, script, orthoHeight?, backgroundColor? }
     */
    async 'POST /api/game/boot'(body, res) {
        const callScene = async (method: string, args: any[]) => {
            const r = await Editor.Message.request('scene', 'execute-scene-script', {
                name: PACKAGE_NAME, method, args,
            });
            return r;
        };
        try {
            // 1. 开场景（可选）
            if (body.sceneUuid) {
                await Editor.Message.request('scene', 'open-scene', body.sceneUuid);
                await new Promise(r2 => setTimeout(r2, 2000));
            }
            // 2. 一键相机
            const camResult = await callScene('setupUICanvas', [{
                path: '/Canvas',
                orthoHeight: body.orthoHeight,
                backgroundColor: body.backgroundColor,
            }]);
            // 3. 幂等启动脚本
            const bootResult = await callScene('bootGameScript', [{
                path: body.gamePath || '/Canvas/GameNode',
                script: body.script,
            }]);
            sendJSON(res, { booted: true, camera: camResult, game: bootResult });
        } catch (e: any) {
            log(`ERROR game/boot: ${e.message}`);
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

    // 探测 electron 能力
    async 'GET /api/debug/electron'(body, res) {
        try {
            const electron = require('electron');
            const info: any = {
                hasElectron: !!electron,
                keys: Object.keys(electron).slice(0, 20),
            };
            sendJSON(res, info);
        } catch (e: any) {
            sendJSON(res, { hasElectron: false, err: e.message });
        }
    },
    // 列出项目所有场景资产
    async 'GET /api/scene/list'(body, res) {
        try {
            const assets = await Editor.Message.request('asset-db', 'query-assets', { pattern: '**/*.scene' });
            const scenes = (assets || []).map((a: any) => ({
                uuid: a.uuid,
                name: a.name,
                path: a.url,
            }));
            sendJSON(res, { scenes, count: scenes.length });
        } catch (e: any) {
            log(`ERROR scene/list: ${e.message}`);
            sendError(res, e.message, 500);
        }
    },

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
            // save-scene 返回 Scene 对象（循环引用），不能 await 其结果进 JSON —— 用 .then 丢弃
            Editor.Message.request('scene', 'save-scene').then(() => {}, () => {});
            // 给 asset-db 一点落盘时间
            await new Promise((r2: any) => setTimeout(r2, 1500));
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

    /**
     * 预览截图：隐藏 Electron 窗口加载预览 URL → capturePage() → 返回 base64 PNG
     * body: { url?: string (默认 http://localhost:7456), width?, height?, waitMs?: 加载后等待毫秒(引擎启动需要时间，默认 8000) }
     */
    async 'POST /api/preview/screenshot'(body, res) {
        let win: any = null;
        try {
            const electron = require('electron');
            const BrowserWindow = electron.BrowserWindow || (electron.remote && electron.remote.BrowserWindow);
            const w = Number(body.width || 960);
            const h = Number(body.height || 640);
            win = new BrowserWindow({
                width: w, height: h,
                show: false,
                webPreferences: {
                    offscreen: true,
                    nodeIntegration: false,
                    backgroundThrottling: false,
                },
            });
            win.webContents.setBackgroundThrottling(false);
            const urlToLoad = body.url || `http://localhost:7456/`;
            await win.loadURL(urlToLoad);
            // 引擎渲染需要时间（WebGL 初始化 + 场景加载）
            const waitMs = Number(body.waitMs ?? 8000);
            // 定时 invalidate 强制合成器出帧
            const invalTimer = setInterval(() => { try { win.webContents.invalidate(); } catch {} }, 500);
            await new Promise((r2: any) => setTimeout(r2, waitMs));
            clearInterval(invalTimer);
            try { win.webContents.invalidate(); } catch {}
            await new Promise((r2: any) => setTimeout(r2, 300));
            let image = await win.webContents.capturePage();
            // WebGL 黑屏检测：全图过暗则重试一次（GPU 状态恢复后可能成功）
            for (let retry = 0; retry < 2 && image.isEmpty(); retry++) {
                await new Promise((r2: any) => setTimeout(r2, 2000));
                try { win.webContents.invalidate(); } catch {}
                image = await win.webContents.capturePage();
            }
            const buf = image.toPNG();
            let savedPath: string | null = null;
            if (body.path) {
                fs.writeFileSync(String(body.path), buf);
                savedPath = String(body.path);
            }
            sendJSON(res, {
                ok: true,
                size: buf.length,
                width: image.getSize().width,
                height: image.getSize().height,
                base64: buf.toString('base64'),
                path: savedPath,
            });
        } catch (e: any) {
            log(`ERROR screenshot: ${e.message}`);
            sendError(res, e.message, 500);
        } finally {
            if (win) { try { win.destroy(); } catch {} }
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

    /**
     * 抖音小游戏一键打包（预设参数封装）
     * body: { title?, outDir? }  → 实际调 builder build platform=bytedance-mini-game
     */
    async 'POST /api/build/douyin'(body, res) {
        try {
            log('Starting Douyin mini-game build...');
            const options: any = {
                title: body.title || 'game',
                packageName: body.packageName || 'game',
                buildPath: body.outDir ? String(body.outDir).replace(/\\/g, '/') : undefined,
            };
            // 清理 undefined
            Object.keys(options).forEach(k => options[k] === undefined && delete options[k]);
            const result = await Editor.Message.request('builder', 'build', {
                platform: 'bytedance-mini-game',
                options,
            });
            sendJSON(res, { started: true, platform: 'bytedance-mini-game', result });
        } catch (e: any) {
            log(`ERROR douyin build: ${e.message}`);
            sendError(res, e.message + ' | hint: bytedance-mini-game platform requires the minigame package installed', 500);
        }
    },
    async 'POST /api/build/wechat'(body, res) {
        try {
            log('Starting WeChat mini-game build...');
            const options: any = {
                title: body.title || 'game',
                packageName: body.packageName || 'game',
                buildPath: body.outDir ? String(body.outDir).replace(/\\/g, '/') : undefined,
            };
            // 清理 undefined
            Object.keys(options).forEach(k => options[k] === undefined && delete options[k]);
            const result = await Editor.Message.request('builder', 'build', {
                platform: 'wechat-mini-game',
                options,
            });
            sendJSON(res, { started: true, platform: 'wechat-mini-game', result });
        } catch (e: any) {
            log(`ERROR wechat build: ${e.message}`);
            sendError(res, e.message + ' | hint: wechat-mini-game platform requires the minigame package installed', 500);
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