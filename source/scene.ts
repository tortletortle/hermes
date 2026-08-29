// Scene Script - 运行在场景进程，可直接调用引擎 API
import { join } from 'path';

// 添加引擎模块搜索路径
module.paths.push(join(Editor.App.path, 'node_modules'));

// 引擎 API
import { director, Node, UITransform, Vec3, game, Color, Sprite, Label, Button, UIOpacity, Widget, Layout, ScrollView, EditBox, ProgressBar, Slider, Toggle, RichText, Animation, AnimationClip, AudioSource, RigidBody, BoxCollider, SphereCollider, Collider, ParticleSystem, Prefab, instantiate, resources, Camera, Light, DirectionalLight, SpotLight, PointLight, MeshRenderer, SkinnedMeshRenderer, Material, Texture2D, SpriteFrame } from 'cc';
// @ts-ignore
import type { Node as CCNode } from 'cc';

// ========== 工具函数 ==========

function countNodes(t: any): number {
    return 1 + (t.children || []).reduce((s: number, c: any) => s + countNodes(c), 0);
}

const COMPONENT_PROPS_MAP: any = {
    Label: ['string', 'fontSize', 'lineHeight', 'color'],
    Sprite: ['color'],
    UITransform: [],
};

function buildFromTemplate(cc: any, t: any, parent: any): any {
    const node = new cc.Node(t.name);
    node.active = t.active !== false;
    if (t.position) node.setPosition(t.position[0], t.position[1], t.position[2] || 0);
    if (t.scale) node.setScale(t.scale[0], t.scale[1], t.scale[2] || 1);
    for (const comp of (t.components || [])) {
        try {
            const inst = node.addComponent(comp.type);
            // 常用属性回填
            for (const k of Object.keys(comp.props || {})) {
                const v = comp.props[k];
                try {
                    if (k === 'contentSize' && inst.setContentSize) inst.setContentSize(v.w, v.h);
                    else if (k === 'color' && inst.color && Array.isArray(v)) inst.color = new cc.Color(v[0], v[1], v[2], v[3] === undefined ? 255 : v[3]);
                    else if (k === 'string' && 'string' in (inst as any)) (inst as any).string = v;
                    else (inst as any)[k] = v;
                } catch { /* 属性不存在则跳过 */ }
            }
        } catch { /* 组件类型缺失跳过 */ }
    }
    parent.addChild(node);
    for (const child of (t.children || [])) buildFromTemplate(cc, child, node);
    return node;
}

function findNodeByPath(path: string): CCNode | null {
    const scene = director.getScene();
    if (!scene) return null;
    if (path === '/' || path === '') return scene;
    const parts = path.split('/').filter(Boolean);
    let current: CCNode | null = scene;
    for (const p of parts) {
        if (!current) return null;
        current = current.getChildByName(p);
    }
    return current;
}

function getNodeInfo(node: CCNode): any {
    const components: any[] = [];
    for (const comp of node.components) {
        if (comp && comp.constructor) {
            components.push({
                name: comp.constructor.name,
                enabled: (comp as any).enabled ?? true,
            });
        }
    }
    const uiTransform = node.getComponent(UITransform);
    const uiOpacity = node.getComponent(UIOpacity);
    return {
        name: node.name,
        uuid: node.uuid,
        position: { x: node.position.x, y: node.position.y, z: node.position.z },
        scale: { x: node.scale.x, y: node.scale.y, z: node.scale.z },
        rotation: { x: node.eulerAngles.x, y: node.eulerAngles.y, z: node.eulerAngles.z },
        children: node.children.map(c => c.name),
        components,
        active: node.active,
        parent: node.parent?.name || null,
        size: uiTransform ? {
            width: uiTransform.width,
            height: uiTransform.height,
        } : null,
        anchorPoint: uiTransform ? {
            x: uiTransform.anchorX,
            y: uiTransform.anchorY,
        } : null,
        opacity: uiOpacity ? uiOpacity.opacity : 255,
    };
}

// ========== 导出方法 ==========

export const methods = {

    // ==================== 节点操作 ====================

    createNode(body: any): any {
        body = body || {};
        const { name, parent } = body;
        const scene = director.getScene();
        if (!scene) throw new Error('No active scene');

        const node = new Node(name);
        const parentNode = parent ? findNodeByPath(parent) : scene;
        if (!parentNode) throw new Error('Parent node ' + parent + ' not found');
        node.parent = parentNode;

        return getNodeInfo(node);
    },

    getNode(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        return getNodeInfo(node);
    },

    findNodes(body: any): any[] {
        body = body || {};
        const scene = director.getScene();
        if (!scene) return [];
        const results: any[] = [];
        const walk = (node: any) => {
            if (node.name === body.name) results.push(getNodeInfo(node));
            for (const child of node.children) walk(child);
        };
        walk(scene);
        return results;
    },

    removeNode(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        node.removeFromParent();
        node.destroy();
        return { success: true };
    },

    renameNode(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        const oldName = node.name;
        node.name = body.name;
        return { oldName, newName: node.name };
    },

    duplicateNode(body: any): any {
        body = body || {};
        const sourceNode = findNodeByPath(body.path);
        if (!sourceNode) throw new Error('Node ' + body.path + ' not found');
        
        const newNode = new Node(body.newName || sourceNode.name + '_copy');
        const parentNode = body.parent ? findNodeByPath(body.parent) : sourceNode.parent;
        if (!parentNode) throw new Error('Parent node not found');
        newNode.parent = parentNode;
        
        // 复制变换属性
        newNode.setPosition(sourceNode.position.x, sourceNode.position.y, sourceNode.position.z);
        newNode.setScale(sourceNode.scale.x, sourceNode.scale.y, sourceNode.scale.z);
        newNode.setRotationFromEuler(sourceNode.eulerAngles.x, sourceNode.eulerAngles.y, sourceNode.eulerAngles.z);
        
        return getNodeInfo(newNode);
    },

    // ==================== 属性设置 ====================

    setPosition(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        node.setPosition(body.x, body.y, body.z ?? 0);
        return { x: node.position.x, y: node.position.y, z: node.position.z };
    },

    setScale(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        const sx = body.x ?? body.scale ?? 1;
        const sy = body.y ?? body.scale ?? 1;
        const sz = body.z ?? 1;
        node.setScale(sx, sy, sz);
        return { x: node.scale.x, y: node.scale.y, z: node.scale.z };
    },

    setRotation(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        node.setRotationFromEuler(body.x ?? 0, body.y ?? 0, body.z ?? 0);
        return { x: node.eulerAngles.x, y: node.eulerAngles.y, z: node.eulerAngles.z };
    },

    setActive(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        node.active = body.active;
        return { active: node.active };
    },

    // ==================== UI 组件操作 ====================

    addUITransform(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        let uiTransform = node.getComponent(UITransform);
        if (!uiTransform) {
            uiTransform = node.addComponent(UITransform);
        }
        
        if (body.width !== undefined) uiTransform.width = body.width;
        if (body.height !== undefined) uiTransform.height = body.height;
        if (body.anchorX !== undefined) uiTransform.anchorX = body.anchorX;
        if (body.anchorY !== undefined) uiTransform.anchorY = body.anchorY;
        
        return {
            width: uiTransform.width,
            height: uiTransform.height,
            anchorX: uiTransform.anchorX,
            anchorY: uiTransform.anchorY,
        };
    },

    setSize(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        let uiTransform = node.getComponent(UITransform);
        if (!uiTransform) {
            uiTransform = node.addComponent(UITransform);
        }
        
        uiTransform.setContentSize(body.width, body.height);
        return { width: uiTransform.width, height: uiTransform.height };
    },

    setAnchorPoint(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        let uiTransform = node.getComponent(UITransform);
        if (!uiTransform) {
            uiTransform = node.addComponent(UITransform);
        }
        
        uiTransform.anchorX = body.x ?? 0.5;
        uiTransform.anchorY = body.y ?? 0.5;
        return { anchorX: uiTransform.anchorX, anchorY: uiTransform.anchorY };
    },

    addSprite(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        // 确保有 UITransform
        if (!node.getComponent(UITransform)) {
            node.addComponent(UITransform);
        }
        
        let sprite = node.getComponent(Sprite);
        if (!sprite) {
            sprite = node.addComponent(Sprite);
        }
        
        // 设置颜色
        if (body.color) {
            sprite.color = new Color(
                body.color.r ?? 255,
                body.color.g ?? 255,
                body.color.b ?? 255,
                body.color.a ?? 255
            );
        }
        
        // 设置尺寸
        if (body.width || body.height) {
            const uiTransform = node.getComponent(UITransform)!;
            if (body.width) uiTransform.width = body.width;
            if (body.height) uiTransform.height = body.height;
        }
        
        return { added: true, component: 'Sprite' };
    },

    addLabel(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        // 确保有 UITransform
        if (!node.getComponent(UITransform)) {
            node.addComponent(UITransform);
        }
        
        let label = node.getComponent(Label);
        if (!label) {
            label = node.addComponent(Label);
        }
        
        if (body.string !== undefined) label.string = body.string;
        if (body.fontSize !== undefined) label.fontSize = body.fontSize;
        if (body.color) {
            label.color = new Color(
                body.color.r ?? 255,
                body.color.g ?? 255,
                body.color.b ?? 255,
                body.color.a ?? 255
            );
        }
        if (body.alignH !== undefined) label.horizontalAlign = body.alignH;
        if (body.alignV !== undefined) label.verticalAlign = body.alignV;
        if (body.overflow !== undefined) label.overflow = body.overflow;
        
        return { added: true, component: 'Label', string: label.string };
    },

    addRichText(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        if (!node.getComponent(UITransform)) {
            node.addComponent(UITransform);
        }
        
        let richText = node.getComponent(RichText);
        if (!richText) {
            richText = node.addComponent(RichText);
        }
        
        if (body.string !== undefined) richText.string = body.string;
        if (body.fontSize !== undefined) richText.fontSize = body.fontSize;
        if (body.maxWidth !== undefined) richText.maxWidth = body.maxWidth;
        
        return { added: true, component: 'RichText', string: richText.string };
    },

    addButton(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        if (!node.getComponent(UITransform)) {
            node.addComponent(UITransform);
        }
        
        let button = node.getComponent(Button);
        if (!button) {
            button = node.addComponent(Button);
        }
        
        if (body.interactable !== undefined) button.interactable = body.interactable;
        if (body.transition !== undefined) button.transition = body.transition;
        
        return { added: true, component: 'Button' };
    },

    addUIOpacity(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        let opacity = node.getComponent(UIOpacity);
        if (!opacity) {
            opacity = node.addComponent(UIOpacity);
        }
        
        if (body.opacity !== undefined) opacity.opacity = body.opacity;
        
        return { opacity: opacity.opacity };
    },

    /** 滚动视图：content 自动带 Layout 可选 */
    addScrollView(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        if (!node.getComponent(UITransform)) node.addComponent(UITransform);

        // 结构: view > content
        const view = node.getChildByName('view') || (() => { const n = new Node('view'); node.addChild(n); return n; })();
        if (!view.getComponent(UITransform)) {
            view.addComponent(UITransform).setContentSize(body.width || 400, body.height || 300);
        }
        const content = view.getChildByName('content') || (() => { const n = new Node('content'); view.addChild(n); return n; })();
        if (!content.getComponent(UITransform)) {
            content.addComponent(UITransform).setAnchorPoint(0.5, 1);
        }

        const sv: any = node.getComponent(ScrollView) || node.addComponent(ScrollView);
        sv.content = content;

        if (body.layout) {
            content.addComponent(Layout).type = Layout.Type.VERTICAL;
        }
        return { added: true, component: 'ScrollView', structure: ['view', 'view/content'] };
    },

    /** 进度条：bar 子节点自动创建，mode=HORIZONTAL */
    addProgressBar(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        if (!node.getComponent(UITransform)) {
            node.addComponent(UITransform).setContentSize(body.width || 300, body.height || 24);
        }
        const bar = node.getChildByName('bar') || (() => { const n = new Node('bar'); node.addChild(n); return n; })();
        if (!bar.getComponent(UITransform)) {
            bar.addComponent(UITransform).setAnchorPoint(0, 0.5);
            bar.setPosition(-(body.width || 300) / 2, 0, 0);
        }
        const pb: any = node.getComponent(ProgressBar) || node.addComponent(ProgressBar);
        pb.barSprite = bar.getComponent(Sprite) || null;
        pb.mode = ProgressBar.Mode.HORIZONTAL;
        if (body.progress !== undefined) pb.progress = Math.min(1, Math.max(0, Number(body.progress)));
        return { added: true, component: 'ProgressBar', progress: pb.progress };
    },

    /** 滑动条：handle 子节点自动创建 */
    addSlider(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        if (!node.getComponent(UITransform)) {
            node.addComponent(UITransform).setContentSize(body.width || 300, body.height || 20);
        }
        const handle = node.getChildByName('handle') || (() => { const n = new Node('handle'); node.addChild(n); return n; })();
        if (!handle.getComponent(UITransform)) {
            handle.addComponent(UITransform).setContentSize(24, 24);
            handle.addComponent(Sprite);
        }
        const slider: any = node.getComponent(Slider) || node.addComponent(Slider);
        // 引擎期望 UITransform 组件而非节点（3.8.8 实测）
        slider.handle = handle.getComponent(UITransform);
        if (body.progress !== undefined) slider.progress = Math.min(1, Math.max(0, Number(body.progress)));
        return { added: true, component: 'Slider', progress: slider.progress };
    },

    /** 开关：checkMark 子节点自动创建 */
    addToggle(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        if (!node.getComponent(UITransform)) {
            node.addComponent(UITransform).setContentSize(body.width || 40, body.height || 40);
        }
        const checkMark = node.getChildByName('checkmark') || (() => { const n = new Node('checkmark'); node.addChild(n); return n; })();
        const t: any = node.getComponent(Toggle) || node.addComponent(Toggle);
        t.checkMark = checkMark;
        if (body.isChecked !== undefined) t.isChecked = !!body.isChecked;
        return { added: true, component: 'Toggle', isChecked: t.isChecked };
    },

    /** 输入框：TEXT_LABEL/PLACEHOLDER_LABEL 子节点自动创建 */
    addEditBox(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        if (!node.getComponent(UITransform)) {
            node.addComponent(UITransform).setContentSize(body.width || 260, body.height || 48);
        }
        const mkLabel = (name: string) => {
            let n = node.getChildByName(name);
            if (!n) { n = new Node(name); node.addChild(n); }
            if (!n.getComponent(UITransform)) n.addComponent(UITransform);
            if (!n.getComponent(Label)) n.addComponent(Label);
            return n;
        };
        const textLabel = mkLabel('TEXT_LABEL');
        const phLabel = mkLabel('PLACEHOLDER_LABEL');
        const eb: any = node.getComponent(EditBox) || node.addComponent(EditBox);
        // 引擎期望 Label 组件而非节点（3.8.8 实测）
        eb.textLabel = textLabel.getComponent(Label);
        eb.placeholderLabel = phLabel.getComponent(Label);
        if (body.placeholder !== undefined) eb.placeholder = String(body.placeholder);
        if (body.string !== undefined) eb.string = String(body.string);
        if (body.maxLength !== undefined) eb.maxLength = Number(body.maxLength);
        return { added: true, component: 'EditBox', string: eb.string };
    },

    setOpacity(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        let opacity = node.getComponent(UIOpacity);
        if (!opacity) {
            opacity = node.addComponent(UIOpacity);
        }
        
        opacity.opacity = body.opacity ?? 255;
        return { opacity: opacity.opacity };
    },

    addLayout(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        if (!node.getComponent(UITransform)) {
            node.addComponent(UITransform);
        }
        
        let layout = node.getComponent(Layout);
        if (!layout) {
            layout = node.addComponent(Layout);
        }
        
        if (body.type !== undefined) layout.type = body.type;
        if (body.spacingX !== undefined) layout.spacingX = body.spacingX;
        if (body.spacingY !== undefined) layout.spacingY = body.spacingY;
        if (body.paddingLeft !== undefined) layout.paddingLeft = body.paddingLeft;
        if (body.paddingRight !== undefined) layout.paddingRight = body.paddingRight;
        if (body.paddingTop !== undefined) layout.paddingTop = body.paddingTop;
        if (body.paddingBottom !== undefined) layout.paddingBottom = body.paddingBottom;
        
        return { added: true, component: 'Layout' };
    },

    addWidget(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        if (!node.getComponent(UITransform)) {
            node.addComponent(UITransform);
        }
        
        let widget = node.getComponent(Widget);
        if (!widget) {
            widget = node.addComponent(Widget);
        }
        
        if (body.top !== undefined) { widget.isAlignTop = true; widget.top = body.top; }
        if (body.bottom !== undefined) { widget.isAlignBottom = true; widget.bottom = body.bottom; }
        if (body.left !== undefined) { widget.isAlignLeft = true; widget.left = body.left; }
        if (body.right !== undefined) { widget.isAlignRight = true; widget.right = body.right; }
        if (body.horizontalCenter !== undefined) { widget.isAlignHorizontalCenter = true; widget.horizontalCenter = body.horizontalCenter; }
        if (body.verticalCenter !== undefined) { widget.isAlignVerticalCenter = true; widget.verticalCenter = body.verticalCenter; }
        
        return { added: true, component: 'Widget' };
    },

    // ==================== 组件操作 ====================

    getComponents(body: any): any[] {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        return node.components.map((c: any) => ({
            name: c.constructor?.name || 'unknown',
            enabled: (c as any).enabled ?? true,
        }));
    },

    removeComponent(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        const comp = node.getComponent(body.component);
        if (!comp) throw new Error('Component ' + body.component + ' not found');
        
        node.removeComponent(comp);
        return { removed: true, component: body.component };
    },

    // ==================== 动画系统 ====================

    addAnimation(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        let animation = node.getComponent(Animation);
        if (!animation) {
            animation = node.addComponent(Animation);
        }
        
        return { added: true, component: 'Animation' };
    },

    playAnimation(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        const animation = node.getComponent(Animation);
        if (!animation) throw new Error('Node has no Animation component');
        
        const clipName = body.clip || 'default';
        animation.play(clipName);
        
        return { playing: true, clip: clipName };
    },

    stopAnimation(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        const animation = node.getComponent(Animation);
        if (!animation) throw new Error('Node has no Animation component');
        
        animation.stop();
        
        return { stopped: true };
    },

    pauseAnimation(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        const animation = node.getComponent(Animation);
        if (!animation) throw new Error('Node has no Animation component');
        
        animation.pause();
        
        return { paused: true };
    },

    resumeAnimation(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        const animation = node.getComponent(Animation);
        if (!animation) throw new Error('Node has no Animation component');
        
        animation.resume();
        
        return { resumed: true };
    },

    // ==================== 音频系统 ====================

    addAudioSource(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        let audioSource = node.getComponent(AudioSource);
        if (!audioSource) {
            audioSource = node.addComponent(AudioSource);
        }
        
        if (body.clip !== undefined) audioSource.clip = body.clip;
        if (body.loop !== undefined) audioSource.loop = body.loop;
        if (body.volume !== undefined) audioSource.volume = body.volume;
        if (body.playOnAwake !== undefined) audioSource.playOnAwake = body.playOnAwake;
        
        return { added: true, component: 'AudioSource' };
    },

    playAudio(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        const audioSource = node.getComponent(AudioSource);
        if (!audioSource) throw new Error('Node has no AudioSource component');
        
        audioSource.play();
        
        return { playing: true };
    },

    stopAudio(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        const audioSource = node.getComponent(AudioSource);
        if (!audioSource) throw new Error('Node has no AudioSource component');
        
        audioSource.stop();
        
        return { stopped: true };
    },

    pauseAudio(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        const audioSource = node.getComponent(AudioSource);
        if (!audioSource) throw new Error('Node has no AudioSource component');
        
        audioSource.pause();
        
        return { paused: true };
    },

    // ==================== 物理系统 ====================

    addRigidBody(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        let rigidBody = node.getComponent(RigidBody);
        if (!rigidBody) {
            rigidBody = node.addComponent(RigidBody);
        }
        
        if (body.type !== undefined) rigidBody.type = body.type;
        if (body.mass !== undefined) rigidBody.mass = body.mass;
        if (body.linearDamping !== undefined) rigidBody.linearDamping = body.linearDamping;
        if (body.angularDamping !== undefined) rigidBody.angularDamping = body.angularDamping;
        
        return { added: true, component: 'RigidBody' };
    },

    addBoxCollider(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        let collider = node.getComponent(BoxCollider);
        if (!collider) {
            collider = node.addComponent(BoxCollider);
        }
        
        if (body.size !== undefined) {
            collider.size = body.size;
        }
        if (body.center !== undefined) {
            collider.center = body.center;
        }
        if (body.isTrigger !== undefined) {
            collider.isTrigger = body.isTrigger;
        }
        
        return { added: true, component: 'BoxCollider' };
    },

    addSphereCollider(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        let collider = node.getComponent(SphereCollider);
        if (!collider) {
            collider = node.addComponent(SphereCollider);
        }
        
        if (body.radius !== undefined) {
            collider.radius = body.radius;
        }
        if (body.center !== undefined) {
            collider.center = body.center;
        }
        if (body.isTrigger !== undefined) {
            collider.isTrigger = body.isTrigger;
        }
        
        return { added: true, component: 'SphereCollider' };
    },

    // ==================== 粒子系统 ====================

    addParticleSystem(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        let particleSystem = node.getComponent(ParticleSystem);
        if (!particleSystem) {
            particleSystem = node.addComponent(ParticleSystem);
        }
        
        if (body.duration !== undefined) particleSystem.duration = body.duration;
        if (body.loop !== undefined) particleSystem.loop = body.loop;
        if (body.startLifetime !== undefined) particleSystem.startLifetime = body.startLifetime;
        if (body.startSpeed !== undefined) particleSystem.startSpeed = body.startSpeed;
        if (body.startSize !== undefined) particleSystem.startSize = body.startSize;
        if (body.startColor !== undefined) {
            particleSystem.startColor = body.startColor;
        }
        
        return { added: true, component: 'ParticleSystem' };
    },

    playParticleSystem(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        const particleSystem = node.getComponent(ParticleSystem);
        if (!particleSystem) throw new Error('Node has no ParticleSystem component');
        
        particleSystem.play();
        
        return { playing: true };
    },

    stopParticleSystem(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        
        const particleSystem = node.getComponent(ParticleSystem);
        if (!particleSystem) throw new Error('Node has no ParticleSystem component');
        
        particleSystem.stop();
        
        return { stopped: true };
    },

    // ==================== 预制体管理 ====================

    instantiatePrefab(body: any): any {
        body = body || {};
        const { prefabPath, parent, name } = body;

        return new Promise(async (resolve, reject) => {
            try {
                const fs = require('fs');
                let prefabData: any = null;

                if (body.uuid) {
                    // 用 asset-db 拿到文件路径再反序列化（支持任意 db:// 位置）
                    const info = await Editor.Message.request('asset-db', 'query-asset-info', 'db://assets/' + (body.assetPath || ''));
                    void info;
                }
                if (body.file) {
                    // 直接读 .prefab JSON 文件（编辑器场景进程有 Node 环境）
                    const jsonText = fs.readFileSync(body.file, 'utf-8');
                    const cc: any = require('cc');
                    prefabData = cc.deserialize(jsonText);
                } else if (prefabPath) {
                    resources.load(prefabPath, Prefab, (err: any, prefab: any) => {
                        if (err) { reject(new Error('Failed to load prefab: ' + err.message)); return; }
                        const node2 = instantiate(prefab);
                        if (name) node2.name = name;
                        const parentNode = parent ? findNodeByPath(parent) : director.getScene();
                        if (!parentNode) { reject(new Error('Parent node ' + parent + ' not found')); return; }
                        parentNode.addChild(node2);
                        resolve(getNodeInfo(node2));
                    });
                    return;
                }

                if (!prefabData) {
                    reject(new Error('Provide file (absolute path to .prefab) or prefabPath (resources/)'));
                    return;
                }
                const node = instantiate(prefabData instanceof Prefab ? prefabData.data : prefabData);
                if (name) node.name = name;
                const parentNode = parent ? findNodeByPath(parent) : director.getScene();
                if (!parentNode) {
                    reject(new Error('Parent node ' + parent + ' not found'));
                    return;
                }
                parentNode.addChild(node);
                resolve(getNodeInfo(node));
            } catch (e: any) {
                reject(new Error('instantiatePrefab failed: ' + e.message));
            }
        });
    },

    // ==================== 摄像机控制 ====================

    addCamera(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        let camera = node.getComponent('cc.Camera');
        if (!camera) camera = node.addComponent('cc.Camera');
        if (!camera) {
            // fallback: 用 cc.Camera 类
            const cc = require('cc');
            const CamClass = cc.Camera;
            if (CamClass) {
                camera = node.getComponent(CamClass);
                if (!camera) camera = node.addComponent(CamClass);
            }
        }
        if (!camera) throw new Error('Failed to create Camera component');
        if (body.orthoHeight !== undefined) camera.orthoHeight = body.orthoHeight;
        if (body.priority !== undefined) camera.priority = body.priority;
        if (body.projection !== undefined) camera.projection = body.projection;
        if (body.far !== undefined) camera.far = body.far;
        if (body.near !== undefined) camera.near = body.near;
        if (body.clearFlags !== undefined) camera.clearFlags = body.clearFlags;
        if (body.color) camera.color = new Color(body.color.r, body.color.g, body.color.b, body.color.a ?? 255);
        return { added: true, component: 'Camera', orthoHeight: camera.orthoHeight, priority: camera.priority };
    },

    getCameraInfo(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path || '/Main Camera');
        if (!node) throw new Error('Camera node not found');
        
        const camera = node.getComponent(Camera);
        if (!camera) throw new Error('Node has no Camera component');
        
        return {
            name: node.name,
            position: { x: node.position.x, y: node.position.y, z: node.position.z },
            rotation: { x: node.eulerAngles.x, y: node.eulerAngles.y, z: node.eulerAngles.z },
            fov: camera.fov,
            near: camera.near,
            far: camera.far,
            orthoHeight: camera.orthoHeight,
        };
    },

    setCameraPosition(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path || '/Main Camera');
        if (!node) throw new Error('Camera node not found');
        
        node.setPosition(body.x ?? 0, body.y ?? 0, body.z ?? 0);
        
        return { x: node.position.x, y: node.position.y, z: node.position.z };
    },

    setCameraRotation(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path || '/Main Camera');
        if (!node) throw new Error('Camera node not found');
        
        node.setRotationFromEuler(body.x ?? 0, body.y ?? 0, body.z ?? 0);
        
        return { x: node.eulerAngles.x, y: node.eulerAngles.y, z: node.eulerAngles.z };
    },

    // ==================== 光照控制 ====================

    getLightInfo(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path || '/Main Light');
        if (!node) throw new Error('Light node not found');
        
        const light = node.getComponent(Light) || node.getComponent(DirectionalLight) || node.getComponent(SpotLight) || node.getComponent(PointLight);
        if (!light) throw new Error('Node has no Light component');
        
        return {
            name: node.name,
            type: light.constructor.name,
            color: light.color,
            intensity: light.intensity,
            position: { x: node.position.x, y: node.position.y, z: node.position.z },
            rotation: { x: node.eulerAngles.x, y: node.eulerAngles.y, z: node.eulerAngles.z },
        };
    },

    setLightColor(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path || '/Main Light');
        if (!node) throw new Error('Light node not found');
        
        const light = node.getComponent(Light) || node.getComponent(DirectionalLight) || node.getComponent(SpotLight) || node.getComponent(PointLight);
        if (!light) throw new Error('Node has no Light component');
        
        if (body.color) {
            light.color = new Color(body.color.r ?? 255, body.color.g ?? 255, body.color.b ?? 255, body.color.a ?? 255);
        }
        if (body.intensity !== undefined) {
            light.intensity = body.intensity;
        }
        
        return { color: light.color, intensity: light.intensity };
    },

    // ==================== 游戏脚本/事件/定时器 ====================

    setSpriteFrame(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        const sprite = node.getComponent(Sprite);
        if (!sprite) throw new Error('Node has no Sprite component');
        if (!body.uuid) throw new Error('uuid is required');
        sprite.spriteFrame = body.uuid;
        return { bound: true, component: 'Sprite', uuid: body.uuid };
    },

    addInputListener(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        const eventName = String(body.event || 'TOUCH_END').toUpperCase();
        // 节点事件用小写（touch-end），全局 input 才用大写常量
        const NODE_EVENT_MAP: any = { TOUCH_START: 'touch-start', TOUCH_END: 'touch-end', TOUCH_MOVE: 'touch-move', TOUCH_CANCEL: 'touch-cancel', MOUSE_DOWN: 'mousedown', MOUSE_UP: 'mouseup', MOUSE_MOVE: 'mousemove', MOUSE_ENTER: 'mouseenter', MOUSE_LEAVE: 'mouseleave' };
        const nodeEvent = NODE_EVENT_MAP[eventName] || eventName.toLowerCase();
        const key = '__hermesInputListeners';
        const listeners: any = (node as any)[key] || {};
        if (listeners[nodeEvent]) node.off(nodeEvent as any, listeners[nodeEvent], node);
        // 回调写入全局事件缓冲区（供 pollEvents 取走）
        const callback = (ev?: any) => {
            const g: any = globalThis as any;
            g.__hermesEventBuffer = g.__hermesEventBuffer || [];
            g.__hermesEventBuffer.push({
                node: node.name,
                path: body.path,
                event: eventName,
                t: Date.now(),
            });
            // 环形缓冲：最多 100 条
            if (g.__hermesEventBuffer.length > 100) g.__hermesEventBuffer.shift();
            console.log('[hermes-game-maker] event:' + eventName + ' node:' + node.name);
        };
        node.on(nodeEvent as any, callback, node);
        listeners[eventName] = callback;
        (node as any)[key] = listeners;
        return { listening: true, event: eventName, node: node.name };
    },

    /**
     * 运行时创建关键帧动画并挂到节点（编辑器场景进程可创建但不会 tick 播放，
     * 真实播放需在预览/构建后的运行时。此方法同时写入 __hermesAnimClips 供预览脚本取用）
     * body: { path: 节点路径, name: clip名, duration: 秒, loop: bool,
     *         tracks: [{ property: 'position'|'scale'|'euler'|'uiOpacity.opacity',
     *                    keys: [[t, x, y, z], ...] }] }
     */
    createAnimationClip(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        const cc: any = require('cc');
        const g: any = globalThis as any;

        const tracks = (body.tracks || []).map((spec: any) => {
            const track = new cc.animation.VectorTrack();
            track._binding.path = new cc.animation.TrackPath('/' + spec.property);
            const keys: any[] = spec.keys || [];
            for (let ch = 0; ch < 3; ch++) {
                track.channels()[ch].curve.assignSorted(
                    keys.map((k: any) => [k[0], k[ch + 1]])
                );
            }
            return track;
        });

        const clip = new cc.AnimationClip();
        clip.name = body.name || 'clip_' + Date.now();
        Object.getOwnPropertyDescriptor(cc.AnimationClip.prototype, 'duration').set.call(clip, Number(body.duration || 1));
        for (const t of tracks) clip.tracks.push(t);
        clip.wrapMode = body.loop ? 2 : 1;

        let anim = node.getComponent(cc.Animation);
        if (!anim) anim = node.addComponent(cc.Animation);
        anim.addClip(clip);

        // 存入全局缓冲供预览端使用
        g.__hermesAnimClips = g.__hermesAnimClips || {};
        g.__hermesAnimClips[node.uuid] = g.__hermesAnimClips[node.uuid] || {};
        g.__hermesAnimClips[node.uuid][clip.name] = { duration: clip.duration, wrapMode: clip.wrapMode };

        return { created: true, node: node.name, clip: clip.name, duration: clip.duration, tracks: tracks.length };
    },

    /** 播放节点上的动画（返回 state 信息；在预览运行时会真实播放） */

    /**
     * 加载并播放音频（正式 API）
     * body: { audioUuid: 资产uuid | audioPath: db://assets/xxx.wav, loop?: bool, volume?: 0-1, nodePath?: 可选挂载节点 }
     * 返回 { playing, duration }。编辑器场景进程无音频设备，playing 仅表示播放调用成功；真实出声在预览/构建端。
     */

    /**
     * 把当前场景结构保存为模板 JSON（节点树+组件类型+常用属性）
     * body: { name: 模板名, rootPath?: 从哪个节点开始（默认整个 Canvas 子树） }
     * 存到 <项目>/template/<name>.json
     */
    saveSceneTemplate(body: any): any {
        body = body || {};
        const root = body.rootPath ? findNodeByPath(body.rootPath) : findNodeByPath('/Canvas');
        if (!root) throw new Error('Root node not found');

        const serialize = (node: any): any => ({
            name: node.name,
            active: node.active,
            position: [node.position.x, node.position.y, node.position.z],
            scale: [node.scale.x, node.scale.y, node.scale.z],
            components: (node.components || []).map((c: any) => ({
                type: c.constructor.name,
                props: c instanceof Object.getPrototypeOf(node).constructor ? {} : (() => {
                    try {
                        const out: any = {};
                        if (c.__values__ !== undefined && false) {}
                        if (c.string !== undefined) out.string = c.string;
                        if (c.contentSize !== undefined) out.contentSize = { w: c.contentSize.width, h: c.contentSize.height };
                        if (c.string === undefined && c.progress !== undefined) out.progress = c.progress;
                        if (c.isChecked !== undefined) out.isChecked = c.isChecked;
                        return out;
                    } catch { return {}; }
                })(),
            })),
            children: node.children.map(serialize),
        });

        const tree = serialize(root);
        const fs = require('fs');
        const pathMod = require('path');
        const dir = pathMod.join(((Editor as any).Project && ((globalThis as any).Editor && (globalThis as any).Editor.Project && (globalThis as any).Editor.Project.path) || process.cwd()) || process.cwd(), 'template');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const file = pathMod.join(dir, (body.name || 'template') + '.json');
        fs.writeFileSync(file, JSON.stringify(tree, null, 2), 'utf-8');
        return { saved: true, file, nodes: countNodes(tree) };
    },

    /**
     * 加载模板并在当前场景重建结构
     * body: { name: 模板名, parent?: 挂载父路径（默认 /Canvas/GameNode，不存在则建） }
     */
    loadSceneTemplate(body: any): any {
        body = body || {};
        const fs = require('fs');
        const pathMod = require('path');
        const file = pathMod.join(((Editor as any).Project && ((globalThis as any).Editor && (globalThis as any).Editor.Project && (globalThis as any).Editor.Project.path) || process.cwd()) || process.cwd(), 'template', (body.name || 'template') + '.json');
        if (!fs.existsSync(file)) throw new Error('Template not found: ' + file);
        const tree = JSON.parse(fs.readFileSync(file, 'utf-8'));

        const cc: any = require('cc');
        let parent = body.parent ? findNodeByPath(body.parent) : findNodeByPath('/Canvas/GameNode');
        if (!parent) {
            parent = findNodeByPath('/Canvas');
            const gn = new (cc.Node)('GameNode');
            gn.addComponent(cc.UITransform);
            parent.addChild(gn);
            parent = gn;
        }

        // 若模板根与父节点同名（如 Canvas→Canvas），合并 children 而不是嵌套
        if (tree.name === parent.name) {
            for (const child of (tree.children || [])) buildFromTemplate(cc, child, parent);
            return { loaded: true, merged: true, file };
        }
        const built = buildFromTemplate(cc, tree, parent);
        return { loaded: true, root: built.name, file };
    },

    /**
     * 加载并播放音频（正式 API）
     * body: { audioUuid: 资产uuid | audioPath: db://assets/xxx.wav, loop?: bool, volume?: 0-1, nodePath?: 可选挂载节点 }
     * 返回 { playing, duration }。编辑器场景进程无音频设备，playing 仅表示播放调用成功；真实出声在预览/构建端。
     */
    playAudioAsset(body: any): any {
        return new Promise(async (resolve, reject) => {
            try {
                let uuid: string = body.audioUuid || '';
                if (!uuid && body.audioPath) {
                    const info = await Editor.Message.request('asset-db', 'query-asset-info', body.audioPath);
                    if (!info) { reject(new Error('Audio asset not found: ' + body.audioPath)); return; }
                    uuid = info.uuid;
                }
                if (!uuid) { reject(new Error('audioUuid or audioPath required')); return; }

                const cc: any = require('cc');
                const scene = cc.director.getScene();
                let host = null as any;
                if (body.nodePath) {
                    host = findNodeByPath(body.nodePath);
                }
                if (!host) {
                    host = scene.getChildByName('__hermesAudioHost');
                    if (!host) {
                        host = new (cc.Node)('__hermesAudioHost');
                        scene.addChild(host);
                    }
                }
                let src2 = host.getComponent(cc.AudioSource);
                if (!src2) src2 = host.addComponent(cc.AudioSource);

                cc.assetManager.loadAny({ uuid }, (err: any, clip: any) => {
                    if (err) { reject(new Error('Load audio failed: ' + err.message)); return; }
                    src2.clip = clip;
                    src2.loop = !!body.loop;
                    if (typeof body.volume === 'number') src2.volume = Math.max(0, Math.min(1, body.volume));
                    src2.play();
                    resolve({
                        playing: true,
                        duration: clip.getDuration ? clip.getDuration() : -1,
                        loop: src2.loop,
                        volume: src2.volume,
                        note: 'editor scene process has no audio device; verify sound in preview/build'
                    });
                });
            } catch (e: any) {
                reject(new Error('playAudio failed: ' + e.message));
            }
        });
    },

    /**
     * 创建 .anim 动画资源文件（持久化，编辑器可复用）
     * body: { name, duration, wrapMode?: 1=normal/2=loop, sample?: int,
     *         tracks: [{ path?: 节点名(留空则全局属性), property: 属性名,
     *                    keys: [{ frame: 秒, value: number|bool, curve?: 贝塞尔数组| easing名 }] }] }
     * 输出: <项目>/animations/<name>.anim + .meta
     */
    createAnimationAsset(body: any): any {
        body = body || {};
        const fs = require('fs');
        const pathMod = require('path');
        const name = String(body.name || 'clip_' + Date.now());
        const dir = pathMod.join(((globalThis as any).Editor && (globalThis as any).Editor.Project && (globalThis as any).Editor.Project.path) || process.cwd() || process.cwd(), 'animations');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const tracks = (body.tracks || []).map((spec: any) => {
            const nodeName = spec.path || '';
            const propName = spec.property;
            const keys = (spec.keys || []).map((k: any) => {
                const out: any = { frame: Number(k.frame), value: k.value };
                if (k.curve !== undefined) out.curve = k.curve;
                return out;
            });
            if (nodeName) {
                // paths 格式：按节点分组
                return { [nodeName]: { props: { [propName]: keys } } };
            } else {
                // props 格式：全局属性
                return { props: { [propName]: keys } };
            }
        });

        // 合并 paths 格式的轨道
        const curveData: any = { props: {}, paths: {} };
        for (const t of tracks) {
            if (t.props) curveData.props = { ...curveData.props, ...t.props };
            if (t.paths) {
                for (const [nodeName, nodeData] of Object.entries(t as any)) {
                    if (nodeName === 'props' || nodeName === 'paths') continue;
                    curveData.paths[nodeName] = { props: { ...curveData.paths[nodeName]?.props, ...(nodeData as any).props } };
                }
            }
        }

        const clip: any = {
            __type__: 'cc.AnimationClip',
            _name: name,
            _objFlags: 0,
            _rawFiles: [],
            _duration: Number(body.duration || 1),
            sample: Number(body.sample || 0),
            speed: 1,
            wrapMode: Number(body.wrapMode || 1),
            curveData,
            events: [],
        };

        const file = pathMod.join(dir, name + '.anim');
        fs.writeFileSync(file, JSON.stringify(clip, null, 2), 'utf-8');

        // .meta 文件
        const meta = {
            ver: '1.1.50',
            importer: 'animation',
            imported: true,
            uuid: require('crypto').randomUUID ? require('crypto').randomUUID() : (require('crypto').getRandomValues(new Uint8Array(16)).join('')),
            files: ['.json'],
            subMetas: {},
            userData: {},
        };
        fs.writeFileSync(file + '.meta', JSON.stringify(meta, null, 2), 'utf-8');

        try {
                fs.writeFileSync(file, JSON.stringify(clip, null, 2), 'utf-8');
                fs.writeFileSync(file + '.meta', JSON.stringify(meta, null, 2), 'utf-8');
                return { created: true, file, duration: clip._duration, wrapMode: clip.wrapMode, tracks: tracks.length };
            } catch (e: any) {
                return { created: false, error: e.message, file };
            }
    },

    /** 取走事件缓冲区（读后即清），返回触摸/键盘等交互事件列表 */
    pollEvents(): any {
        const g: any = globalThis as any;
        const events = g.__hermesEventBuffer || [];
        g.__hermesEventBuffer = [];
        return { events, count: events.length };
    },

    removeInputListener(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        const eventName = String(body.event || 'TOUCH_END').toUpperCase();
        const NODE_EVENT_MAP2: any = { TOUCH_START: 'touch-start', TOUCH_END: 'touch-end', TOUCH_MOVE: 'touch-move', TOUCH_CANCEL: 'touch-cancel' };
        const nodeEvent = NODE_EVENT_MAP2[eventName] || eventName.toLowerCase();
        const listeners = (node as any).__hermesInputListeners || {};
        if (listeners[nodeEvent]) {
            node.off(nodeEvent as any, listeners[nodeEvent], node);
            delete listeners[nodeEvent];
        }
        return { removed: true, event: eventName };
    },

    scheduleOnce(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path || '/');
        if (!node) throw new Error('Node not found');
        const delay = Math.max(0, Number(body.delay || 0));
        const timer = setTimeout(() => console.log('[hermes-game-maker] timer:' + (body.id || 'once')), delay * 1000);
        const timers = (node as any).__hermesTimers || {};
        timers[body.id || String(timer)] = timer;
        (node as any).__hermesTimers = timers;
        return { scheduled: true, id: body.id || String(timer), delay };
    },

    cancelTimer(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path || '/');
        if (!node) throw new Error('Node not found');
        const timers = (node as any).__hermesTimers || {};
        if (timers[body.id]) {
            clearTimeout(timers[body.id]);
            clearInterval(timers[body.id]);
            delete timers[body.id];
        }
        return { cancelled: true, id: body.id };
    },

    // ==================== 场景操作 ====================

    getSceneInfo(): any {
        const scene = director.getScene();
        if (!scene) throw new Error('No active scene');
        return {
            name: scene.name,
            uuid: scene.uuid,
            children: scene.children.map((c: any) => getNodeInfo(c)),
            childCount: scene.children.length,
        };
    },

    getSceneTree(): any {
        const scene = director.getScene();
        if (!scene) return { name: 'No Scene', children: [] };

        const walk = (node: any, depth: number): any => ({
            name: node.name,
            uuid: node.uuid,
            active: node.active,
            depth,
            children: node.children.map((c: any) => walk(c, depth + 1)),
        });

        return walk(scene, 0);
    },

    // ==================== 调试 ====================

    getStats(): any {
        const scene = director.getScene();
        if (!scene) return {};

        let nodeCount = 0;
        let componentCount = 0;
        const walk = (node: any) => {
            nodeCount++;
            componentCount += node.components.length;
            for (const child of node.children) walk(child);
        };
        walk(scene);

        return {
            nodeCount,
            componentCount,
            sceneName: scene.name,
            fps: game.frameRate,
        };
    },

    // ==================== 执行代码 ====================

    eval(body: any): any {
        body = body || {};
        const result = eval(body.code);
        return { result };
    },

    // ==================== P0 新增 API ====================

    /**
     * 一键搭建 2D UI 画布：重建相机 + visibility=ALL + 世界坐标对齐 + 禁 Main Camera
     * 解决 Cocos 3.8.8 序列化相机失效的四连坑（详见 skill: cocos-creator-ai-control）
     */
    setupUICanvas(body: any): any {
        body = body || {};
        const scene = director.getScene();
        if (!scene) throw new Error('No active scene');

        // 找 Canvas（默认 /Canvas，可传 path 指定）
        const canvasNode = findNodeByPath(body.path || '/Canvas');
        if (!canvasNode) throw new Error('Canvas not found at ' + (body.path || '/Canvas'));

        // 1. 禁用场景级 Main Camera（避免天空盒盖 UI）
        let mcDisabled = false;
        for (const child of scene.children) {
            if (child.name === 'Main Camera') { child.active = false; mcDisabled = true; }
        }

        // 2. 销毁 Canvas 下所有旧相机及相机节点
        canvasNode.getComponentsInChildren(Camera).forEach((c: any) => c.destroy());
        const leftover = canvasNode.getChildByName('CameraNode');
        if (leftover) leftover.destroy();

        // 3. 全新创建相机节点（世界坐标对齐 Canvas，z=1000 在 UI 前方）
        const camNode = new Node('CameraNode');
        canvasNode.addChild(camNode);
        camNode.setWorldPosition(canvasNode.worldPosition.x, canvasNode.worldPosition.y, 1000);

        // 用字符串形式加组件（import 的类在场景进程可能 undefined）
        const cam: any = camNode.addComponent('cc.Camera');
        cam.projection = Camera.ProjectionType ? Camera.ProjectionType.ORTHO : 0;
        cam.orthoHeight = Number(body.orthoHeight || 320);
        cam.visibility = 0xFFFFFFFF;   // 渲染所有层（UI_2D 位掩码在预览环境不可靠）
        cam.clearFlags = Camera.ClearFlag ? Camera.ClearFlag.SOLID_COLOR : 7;
        const bg = body.backgroundColor;
        cam.color = bg ? new Color(bg[0], bg[1], bg[2], bg.length > 3 ? bg[3] : 255) : new Color(250, 248, 239, 255);
        cam.near = 1; cam.far = 2000;
        cam.priority = Number(body.priority ?? 100);

        // 4. 绑定 Canvas 组件
        let canvasComp: any = canvasNode.getComponent('cc.Canvas');
        if (!canvasComp) canvasComp = canvasNode.addComponent('cc.Canvas');
        canvasComp.cameraComponent = cam;

        return {
            done: true,
            cameraNode: 'CameraNode',
            worldPos: [canvasNode.worldPosition.x, canvasNode.worldPosition.y, 1000],
            orthoHeight: cam.orthoHeight,
            mainCameraDisabled: mcDisabled,
            canvasBound: true,
        };
    },

    /** 幂等启动游戏脚本：清残留子节点 → 移除旧组件 → 重挂 → 触发 onLoad */
    bootGameScript(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        const scriptName = body.script;
        if (!scriptName) throw new Error('script is required');

        // 1. 清掉全部子节点（防重复 Board/Label）
        node.children.slice().forEach((c: any) => c.destroy());

        // 2. 移除同名旧组件再重挂
        const cls = (globalThis as any).cc && (globalThis as any).cc.js
            ? (globalThis as any).cc.js.getClassByName(scriptName)
            : null;
        if (!cls) throw new Error('Class not found: ' + scriptName);
        const old = node.getComponent(cls);
        if (old) old.destroy();
        const comp: any = node.addComponent(cls);

        // 3. 手动触发 onLoad（编辑器开场景不自动跑）
        comp.onLoad();

        return {
            booted: true,
            script: scriptName,
            childCount: node.children.filter((c: any) => c.isValid).length,
        };
    },

    /** 通用属性读：path + component + property */
    getProp(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        let comp: any;
        if (body.component === 'node' || !body.component) {
            comp = node;
        } else {
            comp = node.getComponent('cc.' + body.component) || node.getComponent(body.component);
        }
        if (!comp) throw new Error('Component not found: ' + body.component);
        const val = (comp as any)[body.property];
        if (val === undefined) throw new Error('Property not found: ' + body.property);
        if (val && typeof val === 'object' && typeof val.toString === 'function') {
            try { return { value: JSON.parse(JSON.stringify(val)) }; } catch { /* fallthrough */ }
        }
        return { value: val ?? null };
    },

    /** 通用属性写：path + component + property + value（支持 Vec3/Color 数组简写） */
    setProp(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        let comp: any;
        if (body.component === 'node' || !body.component) {
            comp = node;
        } else {
            comp = node.getComponent('cc.' + body.component) || node.getComponent(body.component);
        }
        if (!comp) throw new Error('Component not found: ' + body.component);
        const prop = body.property;
        if (!(prop in comp)) throw new Error('Property not found: ' + prop);
        let v = body.value;
        // 数组 → 引擎对象简写
        if (Array.isArray(v)) {
            if (/position|anchor|size|euler|worldPosition|contentSize/.test(prop) || v.length === 3) {
                v = new Vec3(v[0], v[1], v[2]);
            } else if (v.length >= 3) {
                v = new Color(v[0], v[1], v[2], v[3] ?? 255);
            }
        }
        (comp as any)[prop] = v;
        return { set: true, property: prop };
    },

    /** 键盘监听：keydown/keyup 记录到节点上供查询 */
    addKeyboardListener(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path || '/');
        if (!node) throw new Error('Node not found');
        const store: any = (globalThis as any).__hermesKeys || ((globalThis as any).__hermesKeys = { down: {}, pressed: [] });
        const handler = (e: any) => {
            const code = e.keyCode !== undefined ? e.keyCode : e.key;
            if (e.type === 'keydown') {
                if (!store.down[code]) store.pressed.push({ key: code, t: Date.now() });
                store.down[code] = true;
            } else {
                delete store.down[code];
            }
            console.log('[hermes-game-maker] keyboard:' + e.type + ':' + code);
        };
        // input 是 cc 单例（场景进程 import 可能失败，从 globalThis.cc 上取）
        const g: any = (globalThis as any).cc || {};
        const inp: any = g.input;
        inp.on(inp.EventType.KEY_DOWN, handler);
        inp.on(inp.EventType.KEY_UP, handler);
        (node as any).__hermesKeyHandler = handler;
        return { listening: true, events: ['KEY_DOWN', 'KEY_UP'] };
    },

    /** 查询按键状态：返回按下中的键 + 最近按下事件 */
    getKeyState(): any {
        const store: any = (globalThis as any).__hermesKeys;
        if (!store) return { down: [], pressed: [] };
        return { down: Object.keys(store.down), pressed: store.pressed.splice(-50) };
    },
};

export function load() {
    console.log('[hermes-game-maker] Scene script loaded');
}

export function unload() {
    console.log('[hermes-game-maker] Scene script unloaded');
}