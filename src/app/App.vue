<script setup>
import { onBeforeUnmount, onMounted } from 'vue';
import { store, load } from './store/workspace';
import { ui, closeModal, openModal } from './store/ui';
import ProjectList from './components/ProjectList.vue';
import WorkspacePanel from './components/WorkspacePanel.vue';
import TodoBoard from './components/TodoBoard.vue';
import SettingsDialog from './components/SettingsDialog.vue';
import ProjectFormDialog from './components/ProjectFormDialog.vue';
import PreviewDialog from './components/PreviewDialog.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import AppToast from './components/AppToast.vue';
import AppIcon from './components/AppIcon.vue';

function onKey(e) {
  if (e.key === 'Escape' && ui.modal) closeModal();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    const el = document.getElementById('sidebar-search');
    if (el) { el.focus(); el.select(); }
  }
}
onMounted(async () => {
  await load();
  window.addEventListener('keydown', onKey);
  window.assistant.onUiEvent('ui:quick-log', () => { ui.quickLogSeq++; });
  window.assistant.onUiEvent('ui:open-settings', () => { openModal('settings'); });
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

/* 待办22：无边框窗口的自绘窗控 */
const winMin = () => window.assistant.minimizeTaskbar();
const winMax = () => window.assistant.maximizeToggle();
const winClose = () => window.assistant.minimize();   /* 关闭=收起进托盘，与旧行为一致 */
</script>

<template>
  <div class="app" v-if="store.loaded">
    <div class="body">
      <ProjectList />
      <div class="main-col">
        <div class="dragbar">
          <div class="winbtns">
            <button class="wb" data-wb="min" title="最小化" @click="winMin"><AppIcon name="minus" :size="12" /></button>
            <button class="wb" data-wb="max" title="最大化 / 还原" @click="winMax"><AppIcon name="square" :size="11" /></button>
            <button class="wb close" data-wb="close" title="关闭（收起进系统托盘）" @click="winClose"><AppIcon name="close" :size="12" /></button>
          </div>
        </div>
        <TodoBoard v-if="ui.view === 'board'" />
        <WorkspacePanel v-else />
      </div>
    </div>
    <Teleport to="body">
      <Transition name="modal">
        <div class="overlay" v-if="ui.modal" @click.self="closeModal()">
          <SettingsDialog v-if="ui.modal === 'settings'" />
          <ProjectFormDialog v-else-if="ui.modal === 'project-new' || ui.modal === 'project-edit'" />
          <PreviewDialog v-else-if="ui.modal === 'preview'" />
          <ConfirmDialog v-else-if="ui.modal === 'confirm'" />
        </div>
      </Transition>
    </Teleport>
    <AppToast />
  </div>
  <div v-else class="boot">载入中…</div>
</template>

<style>
/* ============================================================
   KIKO · Liquid Glass（dsh-ui-ux-pro-max / liquid-glass · light）
   规范要点：材质随底层取色的半透明玻璃 · 边缘镜面折射高光 · 液体形变转场 ·
   内容保持在独立可读层 · 色彩克制使用 · reduced-transparency 退不透明、
   reduced-motion 退静态。令牌：#0071E3 主 / #7C3AED 辅 / #0B1220 文 / #E9F1FF 底。
   ============================================================ */
:root {
  --bg: #e9f1ff;
  --tint-blue: rgba(0, 113, 227, .55); --tint-violet: rgba(124, 58, 237, .42); --tint-cyan: rgba(32, 201, 255, .40);
  --text: #0b1220; --text-2: #4a5568; --text-3: #7c8aa0;
  --accent: #0071e3; --accent-2: #7c3aed; --accent-press: #0058b0;
  --green: #1d9e5a; --orange: #d9820a; --red: #d7373f; --indigo: #5e5ce6;
  --glass: rgba(255, 255, 255, .50);
  --glass-content: rgba(255, 255, 255, .66);
  --glass-strong: rgba(255, 255, 255, .80);
  --panel: var(--glass-content);
  --edge: rgba(255, 255, 255, .62);
  --edge-hi: inset 0 1px 0 rgba(255, 255, 255, .85);
  --line: rgba(11, 18, 32, .08);
  --radius: 18px;
  --blur: blur(24px) saturate(1.8) brightness(1.04);
  --shadow-card: var(--edge-hi), 0 2px 8px rgba(14, 38, 86, .06), 0 12px 36px rgba(14, 38, 86, .10);
  --shadow-pop: var(--edge-hi), 0 32px 88px rgba(8, 24, 60, .32);
  --ease: cubic-bezier(.32, .72, 0, 1);
  --spring: cubic-bezier(.34, 1.32, .44, 1);
}
* { box-sizing: border-box; font-synthesis: none; }
html, body { margin: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI Variable Text", "Segoe UI", "PingFang SC", "Microsoft YaHei UI", sans-serif;
  color: var(--text); font-size: 14px; -webkit-font-smoothing: antialiased;
  background:
    radial-gradient(58% 46% at 16% 12%, var(--tint-cyan) 0%, transparent 62%),
    radial-gradient(50% 44% at 86% 6%, var(--tint-violet) 0%, transparent 60%),
    radial-gradient(64% 52% at 70% 96%, var(--tint-blue) 0%, transparent 58%),
    linear-gradient(160deg, #eef4ff 0%, #e4ecfb 46%, #dde7f9 100%);
  background-attachment: fixed;
}
::selection { background: rgba(0, 113, 227, .18); }
::-webkit-scrollbar { width: 9px; height: 9px; }
::-webkit-scrollbar-thumb { background: rgba(120, 140, 175, .38); border-radius: 8px; border: 2px solid transparent; background-clip: content-box; }
::-webkit-scrollbar-thumb:hover { background-color: rgba(100, 120, 160, .55); }
::-webkit-scrollbar-track { background: transparent; }

.app { height: 100vh; display: flex; flex-direction: column; }
.boot { height: 100vh; display: grid; place-items: center; color: var(--text-3); }
.body { flex: 1; min-height: 0; display: grid; grid-template-columns: 248px 1fr; }
.main-col { display: flex; flex-direction: column; min-width: 0; }

/* 无边框窗口：顶部拖拽条 + 自绘窗控（待办22/23） */
.dragbar { height: 34px; flex-shrink: 0; -webkit-app-region: drag; display: flex; justify-content: flex-end; align-items: flex-start; padding: 6px 8px 0; }
.winbtns { display: flex; gap: 6px; -webkit-app-region: no-drag; }
.wb {
  width: 24px; height: 24px; border-radius: 7px; border: 1px solid rgba(11, 18, 32, .06);
  background: rgba(255, 255, 255, .5); color: #7c8aa0; cursor: pointer;
  display: grid; place-items: center; transition: all .16s var(--spring); padding: 0;
}
.wb:hover { background: #fff; color: var(--text); box-shadow: 0 2px 8px rgba(14, 38, 86, .12); }
.wb:active { transform: scale(.88); }
.wb.close:hover { background: var(--red); border-color: var(--red); color: #fff; }

/* —— 玻璃控件 —— */
.btn {
  border: 1px solid var(--edge); background: var(--glass);
  -webkit-backdrop-filter: blur(14px) saturate(1.7); backdrop-filter: blur(14px) saturate(1.7);
  box-shadow: var(--edge-hi), 0 2px 8px rgba(14, 38, 86, .08);
  color: #33405a; border-radius: 980px; padding: 7px 15px; font-size: 12.5px; cursor: pointer;
  transition: transform .16s var(--spring), background .18s var(--ease), box-shadow .18s var(--ease), filter .18s var(--ease);
  font-family: inherit;
}
.btn { position: relative; overflow: hidden; font-weight: 500; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.btn::after { /* 顶缘薄光：克制，不做成实体键 */
  content: ""; position: absolute; inset: 0 0 auto 0; height: 50%;
  background: linear-gradient(180deg, rgba(255,255,255,.10), transparent); pointer-events: none;
}
.btn:hover { background: var(--glass-strong); filter: brightness(1.02); transform: translateY(-1.5px); box-shadow: var(--edge-hi), 0 7px 18px rgba(14, 38, 86, .14); }
.btn:active { transform: scale(.93); filter: brightness(.97); }
.btn:disabled { opacity: .42; cursor: default; transform: none; filter: none; }
.btn:focus-visible { outline: none; box-shadow: var(--edge-hi), 0 0 0 3px rgba(0, 113, 227, .38), 0 0 0 5px rgba(124, 58, 237, .18); }
.btn.primary {
  background: linear-gradient(180deg, #2b8ef7 0%, var(--accent) 100%);
  border-color: rgba(255, 255, 255, .32); color: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, .3), 0 4px 14px rgba(0, 113, 227, .35);
}
.btn.primary::after { background: linear-gradient(180deg, rgba(255,255,255,.16), transparent); }
.btn.primary:hover { background: linear-gradient(180deg, #3d9bff 0%, #0a7aeb 100%); }
.btn.primary:active { background: var(--accent-press); }
.btn.danger { color: var(--red); }
.btn.danger:focus-visible { box-shadow: var(--edge-hi), 0 0 0 3px rgba(215, 55, 63, .32); }
.btn.link { border: 0; background: transparent; box-shadow: none; color: var(--accent); padding: 4px 8px; font-weight: 500; }
.btn.link::after { display: none; }
.btn.link:hover { background: rgba(0, 113, 227, .10); transform: none; filter: none; box-shadow: none; }

.mini { border: 0; background: transparent; color: #9aa7ba; cursor: pointer; font-size: 12px; padding: 2px 5px; border-radius: 8px; transition: all .16s var(--spring); font-family: inherit; }
.mini:hover { background: rgba(255, 255, 255, .62); color: var(--text-2); box-shadow: 0 2px 6px rgba(14, 38, 86, .10); transform: scale(1.08); }
.mini:active { transform: scale(.9); }
.mini:focus-visible { outline: none; box-shadow: 0 0 0 2.5px rgba(0, 113, 227, .45); }
.mini.danger:hover { color: var(--red); background: rgba(215, 55, 63, .10); }

input, select, textarea { font-family: inherit; }

/* —— 玻璃内容卡 —— */
.card, .banner { border: 1px solid var(--edge); }
.dialog { -webkit-backdrop-filter: var(--blur); backdrop-filter: var(--blur); }

html.no-glass .dialog { background: #ffffff; }
html.no-glass .card, html.no-glass .banner, html.no-glass .dialog, html.no-glass .btn,
html.no-glass .sidebar, html.no-glass .overlay, html.no-glass .composer,
html.no-glass .speech, html.no-glass .wb, html.no-glass .menu-pop { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }
html.no-glass { --glass: #ffffff; --glass-content: #ffffff; --glass-strong: #f2f4f9; }
html.no-glass body { background: #edf2fa; }
html.no-glass .btn::after, html.no-glass .btn.primary::after { display: none; }
html.no-glass .dragbar { background: rgba(255, 255, 255, .6); }
html.no-glass .sidebar { background: rgba(255, 255, 255, .88) !important; }
html.no-glass .log .body { background: rgba(255, 255, 255, .8) !important; }

.overlay {
  position: fixed; inset: 0; background: rgba(9, 18, 40, .30);
  -webkit-backdrop-filter: blur(8px) saturate(1.5); backdrop-filter: blur(8px) saturate(1.5);
  display: flex; align-items: center; justify-content: center; padding: 24px; z-index: 50;
}
.dialog {
  background: rgba(255, 255, 255, .93); border: 1px solid rgba(255, 255, 255, .8);
  border-radius: 26px; box-shadow: var(--shadow-pop);
  padding: 26px; width: min(520px, 100%); max-height: 86vh; overflow: auto;
}
.dialog.wide { width: min(740px, 100%); }
.dialog h2 { font-size: 17px; margin: 0 0 18px; letter-spacing: -.015em; }
.dialogfoot { display: flex; justify-content: flex-end; gap: 9px; margin-top: 24px; }

.modal-enter-active { transition: opacity .26s var(--ease); }
.modal-leave-active { transition: opacity .16s ease-in; }
.modal-enter-from, .modal-leave-to { opacity: 0; }
.modal-enter-active .dialog { animation: lg-morph .42s var(--spring); }
.modal-leave-active .dialog { animation: lg-morph .16s ease-in reverse; }
@keyframes lg-morph { from { transform: scale(.88) translateY(14px); opacity: 0; border-radius: 40px; } to { transform: scale(1) translateY(0); opacity: 1; border-radius: 26px; } }

.field { display: block; font-size: 12px; color: var(--text-2); margin: 15px 0; }
.field input, .field select {
  display: block; width: 100%; padding: 9px 12px; border: 1px solid rgba(11, 18, 32, .12);
  border-radius: 12px; margin-top: 6px; font-size: 13px; outline: none;
  background: rgba(255, 255, 255, .62); box-shadow: inset 0 1px 2px rgba(14, 38, 86, .05);
  transition: border .15s var(--ease), box-shadow .15s var(--ease), background .15s var(--ease);
}
.field input:focus, .field select:focus { background: rgba(255, 255, 255, .9); border-color: var(--accent); box-shadow: 0 0 0 4px rgba(0, 113, 227, .18); }
.field input::placeholder { color: #a9b4c6; }

.check { display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: var(--text-2); margin: 13px 0; cursor: pointer; }
.check input[type=checkbox] {
  appearance: none; -webkit-appearance: none; position: relative; margin: 0; flex-shrink: 0;
  width: 42px; height: 25px; border-radius: 980px; cursor: pointer;
  background: rgba(11, 18, 32, .12); box-shadow: inset 0 1px 3px rgba(14, 38, 86, .16), inset 0 0 0 1px rgba(255, 255, 255, .4);
  transition: background .24s var(--ease), box-shadow .24s var(--ease);
}
.check input[type=checkbox]::after {
  content: ""; position: absolute; top: 2.5px; left: 2.5px; width: 20px; height: 20px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 3px rgba(14, 38, 86, .3); transition: transform .26s var(--spring);
}
.check input[type=checkbox]:checked { background: linear-gradient(180deg, #2b8ef7, var(--accent)); box-shadow: inset 0 1px 2px rgba(0, 40, 90, .2), 0 0 0 1px rgba(255, 255, 255, .3), 0 2px 8px rgba(0, 113, 227, .35); }
.check input[type=checkbox]:checked::after { transform: translateX(17px); }
.check input[type=checkbox]:focus-visible { box-shadow: inset 0 1px 3px rgba(14, 38, 86, .16), 0 0 0 3.5px rgba(0, 113, 227, .35); }
.muted { color: var(--text-3); font-size: 12px; }

/* reduced-transparency / reduced-motion 降级（规范硬要求） */
@media (prefers-reduced-transparency: reduce) {
  :root { --glass: rgba(255,255,255,.94); --glass-content: #fff; --glass-strong: #fff; }
  body { background: #eef3fb; }
  .card, .banner, .dialog, .btn { backdrop-filter: none; -webkit-backdrop-filter: none; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
</style>
