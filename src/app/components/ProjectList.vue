<script setup>
import { computed, ref } from 'vue';
import S from '../shared-bridge';
import { store, visibleProjects, selectProject, exportBackup, restoreBackup } from '../store/workspace';
import { ui, openModal, askConfirm } from '../store/ui';
import AppIcon from './AppIcon.vue';

const searchEl = ref(null);
const menuOpen = ref(false);
const pin = ref(false);
const hasQuery = computed(() => store.search.trim().length > 0);

function dotClass(status) {
  const s = status || '';
  if (s.includes('等待')) return 'wait';
  if (s.includes('完成') || s.includes('暂停') || s.includes('待启动')) return 'idle';
  return 'run';
}
function timeOf(p) { return S.fmtShort(p.lastWorkedAt || p.updatedAt || p.createdAt); }
function onSearchKey(e) {
  if (e.key === 'Enter') {
    const first = visibleProjects.value[0];
    if (first) selectProject(first.id);
  } else if (e.key === 'Escape') {
    store.search = '';
    searchEl.value?.blur();
  }
}
function pick(p) { selectProject(p.id); }
const hideToTray = () => window.assistant.minimize();
const quitApp = () => window.assistant.quitApp();

async function toggleTop() {
  pin.value = !pin.value;
  await window.assistant.toggleTop(pin.value);
}
function askRestore() {
  menuOpen.value = false;
  askConfirm({
    title: '从备份恢复',
    body: '将用所选备份文件覆盖当前全部项目数据。恢复前会自动把现有数据留档（archive/pre-restore-*.json），不会直接丢失。',
    confirmLabel: '选择备份文件',
    onOk: () => { menuOpen.value = false; restoreBackup(); },
  });
}
function closeMenu() { menuOpen.value = false; }
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <img class="bavatar" :src="'kiko/avatar.png'" alt="KIKO" />
      <span class="bname">KIKO</span>
    </div>

    <div class="segctl">
      <button :class="{ on: ui.view === 'board' }" @click="ui.view = 'board'">待办</button>
      <button :class="{ on: ui.view === 'project' }" @click="ui.view = 'project'">项目</button>
    </div>

    <div class="sidehead">
      <span>我的项目</span>
      <button class="btn newbtn" @click="openModal('project-new')"><AppIcon name="plus" :size="12" :stroke-w="2.4" /> 新建</button>
    </div>
    <div class="search">
      <input id="sidebar-search" ref="searchEl" v-model="store.search" placeholder="搜索项目" @keydown="onSearchKey" />
    </div>
    <div class="list">
      <TransitionGroup name="plist">
        <div
          v-for="p in visibleProjects"
          :key="p.id"
          class="project"
          :class="{ active: p.id === store.activeId }"
          @click="pick(p)"
        >
          <div class="pname">{{ p.name }}</div>
          <div class="pmeta">
            <span><i class="dot" :class="dotClass(p.status)"></i>{{ p.status || '进行中' }}</span>
            <span>{{ timeOf(p) }}</span>
          </div>
        </div>
      </TransitionGroup>
      <div v-if="hasQuery && !visibleProjects.length" class="empty">没有匹配「{{ store.search }}」的项目</div>
      <div v-else-if="!store.db.projects.length" class="empty">还没有项目，点「＋ 新建」开始。</div>
    </div>

    <div class="menu-mask" v-if="menuOpen" @click="menuOpen = false"></div>
    <div class="footbar">
        <div class="menu-pop" v-show="menuOpen">
          <button class="mitem" :class="{ on: pin }" @click="toggleTop"><AppIcon name="pin" :size="13" />{{ pin ? '已置顶窗口' : '窗口置顶' }}</button>
          <button class="mitem" @click="closeMenu(); exportBackup()"><AppIcon name="download" :size="13" />导出备份</button>
          <button class="mitem" @click="askRestore"><AppIcon name="upload" :size="13" />恢复备份</button>
          <div class="msep"></div>
          <button class="mitem" @click="closeMenu(); openModal('settings')"><AppIcon name="gear" :size="13" />设置</button>
          <button class="mitem" @click="closeMenu(); hideToTray()"><AppIcon name="minus" :size="13" />收起进托盘</button>
          <button class="mitem danger" @click="closeMenu(); quitApp()"><AppIcon name="close" :size="12" />退出 KIKO</button>
        </div>
      <button class="gearbtn" :class="{ on: menuOpen }" title="功能菜单" @click="menuOpen = !menuOpen"><AppIcon name="gear" :size="15" /></button>
      <Transition name="fade">
        <span class="savedot" :class="{ busy: store.saving }">{{ store.saving ? '保存中…' : store.lastSaved ? '已保存 ' + store.lastSaved : '' }}</span>
      </Transition>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex; flex-direction: column; min-height: 0; position: relative;
  background: rgba(255, 255, 255, .34);
  backdrop-filter: blur(26px) saturate(1.9) brightness(1.05); -webkit-backdrop-filter: blur(26px) saturate(1.9) brightness(1.05);
  border-right: 1px solid rgba(255, 255, 255, .5); padding: 14px 12px 10px;
  -webkit-app-region: drag;
}
.sidebar button, .sidebar input, .sidebar .project, .sidebar .segctl, .sidebar .menu-pop, .sidebar .empty { -webkit-app-region: no-drag; }
.brand { display: flex; align-items: center; gap: 9px; padding: 2px 6px 12px; }
.bavatar { width: 30px; height: 30px; border-radius: 9px; object-fit: cover; box-shadow: 0 2px 6px rgba(10, 132, 255, .35); }
.bname { font-weight: 700; font-size: 15px; letter-spacing: -.01em; }
.segctl { display: flex; background: rgba(11, 18, 32, .05); border-radius: 980px; padding: 3px; margin: 0 4px 12px; position: relative; }
.segctl button { flex: 1; border: 0; background: transparent; border-radius: 980px; padding: 5px 0; font-size: 12px; font-weight: 500; color: var(--text-2); cursor: pointer; transition: all .2s var(--ease); font-family: inherit; position: relative; z-index: 1; }
.segctl button.on { background: #fff; color: var(--text); box-shadow: 0 1px 4px rgba(14, 38, 86, .14), inset 0 0 0 .5px rgba(255,255,255,.6); }
.segctl button:not(.on):hover { color: var(--text); }
.sidehead { display: flex; justify-content: space-between; align-items: center; padding: 0 8px 10px; font-size: 13px; font-weight: 600; color: var(--text-2); }
.newbtn { padding: 4px 11px; font-size: 12px; }
.search { padding: 0 4px 8px; }
.search input {
  width: 100%; padding: 7px 11px; border: 1px solid rgba(255, 255, 255, .5); border-radius: 980px;
  background: rgba(255, 255, 255, .42); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .7);
  font-size: 12.5px; outline: none; color: var(--text); transition: all .18s var(--ease);
}
.search input:focus { background: rgba(255, 255, 255, .8); border-color: var(--accent); box-shadow: 0 0 0 3.5px rgba(0, 113, 227, .16); }
.list { flex: 1; overflow: auto; position: relative; min-height: 0; }
.project { padding: 11px 12px; border-radius: 12px; cursor: pointer; margin: 2px 0; border: 1px solid transparent; transition: background .16s var(--ease), transform .16s var(--ease), box-shadow .16s var(--ease); }
.project:hover { background: rgba(255, 255, 255, .42); }
.project:active { transform: scale(.975); }
.project.active { background: rgba(0, 113, 227, .14); border-color: rgba(0, 113, 227, .22); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .5), 0 3px 10px rgba(0, 113, 227, .14); }
.project.active .pname { color: var(--accent); }
.project.active .pmeta { color: #5c7fb5; }
.pname { font-size: 13px; font-weight: 600; letter-spacing: -.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pmeta { font-size: 11px; color: var(--text-3); margin-top: 5px; display: flex; justify-content: space-between; }
.dot { width: 7px; height: 7px; border-radius: 50%; display: inline-block; margin-right: 6px; vertical-align: 1px; box-shadow: inset 0 -1px 1px rgba(0, 0, 0, .12), inset 0 1px 1px rgba(255, 255, 255, .7); }
.dot.run { background: radial-gradient(circle at 35% 30%, #58c887, var(--green)); box-shadow: inset 0 1px 1px rgba(255, 255, 255, .7), 0 0 0 2.5px rgba(29, 158, 90, .14); }
.dot.wait { background: radial-gradient(circle at 35% 30%, #ffbc57, var(--orange)); box-shadow: inset 0 1px 1px rgba(255, 255, 255, .7), 0 0 0 2.5px rgba(217, 130, 10, .14); }
.dot.idle { background: radial-gradient(circle at 35% 30%, #c7ccd4, #9aa4b1); }
.empty { color: var(--text-3); font-size: 12.5px; padding: 16px 12px; line-height: 1.7; }

/* 左下角功能菜单（待办23） */
.footbar { display: flex; align-items: center; gap: 10px; padding: 8px 4px 0; border-top: 1px solid rgba(11, 18, 32, .06); margin-top: 8px; position: relative; z-index: 42; }
.gearbtn { width: 32px; height: 32px; border-radius: 10px; border: 1px solid var(--edge); background: rgba(255, 255, 255, .5); color: var(--text-2); cursor: pointer; display: grid; place-items: center; transition: all .18s var(--spring); padding: 0; }
.gearbtn:hover { background: #fff; transform: rotate(20deg); }
.gearbtn.on { background: var(--accent); border-color: var(--accent); color: #fff; box-shadow: 0 3px 10px rgba(0, 113, 227, .35); transform: rotate(60deg); }
.savedot { font-size: 11px; color: var(--text-3); }
.savedot.busy { color: var(--orange); }
.menu-mask { position: fixed; inset: 0; z-index: 40; }
.menu-pop {
  position: absolute; bottom: 44px; left: 4px; right: 4px; z-index: 41;
  background: rgba(255, 255, 255, .95); border: 1px solid rgba(255, 255, 255, .8); border-radius: 16px;
  box-shadow: 0 16px 48px rgba(8, 24, 60, .22); padding: 6px;
  -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px);
  display: flex; flex-direction: column; gap: 2px;
}
.mitem {
  display: flex; align-items: center; gap: 9px; text-align: left; border: 0; background: transparent;
  border-radius: 10px; padding: 9px 11px; font-size: 12.5px; color: var(--text-2); cursor: pointer;
  transition: all .14s var(--ease); font-family: inherit;
}
.mitem:hover { background: rgba(0, 113, 227, .08); color: var(--text); }
.mitem.on { color: var(--accent); }
.mitem.danger:hover { background: rgba(215, 55, 63, .08); color: var(--red); }
.mitem .ico { color: currentColor; opacity: .7; }
.msep { height: 1px; background: rgba(11, 18, 32, .07); margin: 4px 8px; }
/* 注意：不加进入动画——本机软件渲染下 CSS/JS 动画都可能因合成帧停摆而卡在 opacity:0，
   交互菜单可见性优先。savedot 等纯展示元素仍用 fade。 */
.fade-enter-active, .fade-leave-active { transition: opacity .3s var(--ease); }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.plist-enter-active { transition: all .26s var(--ease); }
.plist-leave-active { transition: all .18s ease-in; }
.plist-enter-from { opacity: 0; transform: translateX(-8px); }
.plist-leave-to { opacity: 0; transform: translateX(-8px); }
.plist-move { transition: transform .26s var(--ease); }
</style>
