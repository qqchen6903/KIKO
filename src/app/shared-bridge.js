// shared.js 是 UMD 单文件（主进程 require / node 测试 / 渲染层三方共用）。
// 在浏览器侧它以副作用方式把实现挂到 globalThis.Shared，这里做一层 ESM 桥接供组件 import。
import '../shared.js';
export default globalThis.Shared;
