// 全局 Editor 类型声明（简化版）
declare namespace Editor {
    const App: {
        path: string;
        version: string;
    };
    namespace Message {
        function request(module: string, message: string, ...args: any[]): Promise<any>;
        function send(module: string, message: string, ...args: any[]): void;
        function broadcast(module: string, message: string, ...args: any[]): void;
    }
    namespace Panel {
        function open(name: string, ...args: any[]): void;
        function define(options: any): any;
        function close(name: string): void;
    }
    namespace Utils {
        namespace Url {
            function getDocUrl(path: string): string;
        }
    }
}

// cc 引擎模块声明（场景脚本中使用）
declare module 'cc' {
    export const director: any;
    export const game: any;
    export const resources: any;
    export const instantiate: any;
    
    export class Node {
        constructor(name?: string);
        name: string;
        uuid: string;
        active: boolean;
        parent: Node | null;
        children: Node[];
        components: any[];
        position: any;
        scale: any;
        eulerAngles: any;
        worldPosition: any;
        setPosition(x: number, y: number, z?: number): void;
        setScale(x: number, y: number, z?: number): void;
        setWorldPosition(x: number, y: number, z?: number): void;
        setRotationFromEuler(x: number, y: number, z?: number): void;
        setActive(active: boolean): void;
        on(event: string, callback: (...args: any[]) => void, target?: any): void;
        off(event: string, callback?: (...args: any[]) => void, target?: any): void;
        addComponent(type: any): any;
        getComponent(type: any): any;
        getComponentInChildren(type: any): any;
        getComponentsInChildren(type: any): any[];
        removeComponent(type: any): void;
        addChild(child: Node): void;
        removeFromParent(): void;
        destroy(): void;
        getChildByName(name: string): Node | null;
        getChildByPath(path: string): Node | null;
    }

    export const input: any;
    
    export class Scene extends Node {}
    
    export class Component {
        enabled: boolean;
        node: Node;
        getComponent(type: any): any;
    }
    
    export class Vec3 {
        constructor(x?: number, y?: number, z?: number);
        x: number;
        y: number;
        z: number;
    }
    
    export class Color {
        constructor(r?: number, g?: number, b?: number, a?: number);
        r: number;
        g: number;
        b: number;
        a: number;
    }
    
    // UI 组件
    export const UITransform: any;
    export const Sprite: any;
    export const SpriteFrame: any;
    export const Label: any;
    export const RichText: any;
    export const Button: any;
    export const UIOpacity: any;
    export const Widget: any;
    export const Layout: any;
    export const ScrollView: any;
    export const EditBox: any;
    export const ProgressBar: any;
    export const Slider: any;
    export const Toggle: any;
    export const Prefab: any;
    
    // 动画组件
    export const Animation: any;
    export const AnimationClip: any;
    
    // 音频组件
    export const AudioSource: any;
    
    // 物理组件
    export const RigidBody: any;
    export const BoxCollider: any;
    export const SphereCollider: any;
    export const Collider: any;
    
    // 粒子系统
    export const ParticleSystem: any;
    
    // 摄像机和光照
    export const Camera: any;
    export const Light: any;
    export const DirectionalLight: any;
    export const SpotLight: any;
    export const PointLight: any;
    
    // 渲染器
    export const MeshRenderer: any;
    export const SkinnedMeshRenderer: any;
    
    // 材质和纹理
    export const Material: any;
    export const Texture2D: any;
    
    export function find(path: string): Node | null;
}

// module.paths 扩展声明
declare namespace NodeJS {
    interface Module {
        paths: string[];
    }
}