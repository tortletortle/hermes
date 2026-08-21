// Scene Script - 运行在场景进程，可直接调用引擎 API
import { join } from 'path';

// 添加引擎模块搜索路径
module.paths.push(join(Editor.App.path, 'node_modules'));

// 引擎 API
import { director, Node, UITransform, Vec3, game, Color, Sprite, Label, Button, UIOpacity, Widget, Layout, ScrollView, EditBox, ProgressBar, Slider, Toggle, RichText, Animation, AnimationClip, AudioSource, RigidBody, BoxCollider, SphereCollider, Collider, ParticleSystem, Prefab, instantiate, resources, Camera, Light, DirectionalLight, SpotLight, PointLight, MeshRenderer, SkinnedMeshRenderer, Material, Texture2D, SpriteFrame } from 'cc';
// @ts-ignore
import type { Node as CCNode } from 'cc';

// ========== 工具函数 ==========

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
        
        return new Promise((resolve, reject) => {
            resources.load(prefabPath, Prefab, (err, prefab) => {
                if (err) {
                    reject(new Error('Failed to load prefab: ' + err.message));
                    return;
                }
                
                const node = instantiate(prefab);
                if (name) node.name = name;
                
                const parentNode = parent ? findNodeByPath(parent) : director.getScene();
                if (!parentNode) {
                    reject(new Error('Parent node ' + parent + ' not found'));
                    return;
                }
                
                node.parent = parentNode;
                resolve(getNodeInfo(node));
            });
        });
    },

    // ==================== 摄像机控制 ====================

    addCamera(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        let camera = node.getComponent(Camera);
        if (!camera) camera = node.addComponent(Camera);
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
        const eventName = body.event || 'TOUCH_END';
        const key = '__hermesInputListeners';
        const listeners: any = (node as any)[key] || {};
        if (listeners[eventName]) node.off(eventName as any, listeners[eventName], node);
        const callback = () => console.log('[hermes-game-maker] event:' + eventName + ' node:' + node.name);
        node.on(eventName as any, callback, node);
        listeners[eventName] = callback;
        (node as any)[key] = listeners;
        return { listening: true, event: eventName, node: node.name };
    },

    removeInputListener(body: any): any {
        body = body || {};
        const node = findNodeByPath(body.path);
        if (!node) throw new Error('Node ' + body.path + ' not found');
        const eventName = body.event || 'TOUCH_END';
        const listeners = (node as any).__hermesInputListeners || {};
        if (listeners[eventName]) {
            node.off(eventName as any, listeners[eventName], node);
            delete listeners[eventName];
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
};

export function load() {
    console.log('[hermes-game-maker] Scene script loaded');
}

export function unload() {
    console.log('[hermes-game-maker] Scene script unloaded');
}