<script setup>
import { computed } from 'vue';
import { store, current, resumeInfo, undoLastUpdate } from '../store/workspace';
import { ui, openModal } from '../store/ui';
import S from '../shared-bridge';
import AppIcon from './AppIcon.vue';
import SummaryCard from './cards/SummaryCard.vue';
import TodoCard from './cards/TodoCard.vue';
import DecisionCard from './cards/DecisionCard.vue';
import HistoryTimeline from './HistoryTimeline.vue';
import WorkComposer from './WorkComposer.vue';

const canUndo = computed(() => !!current.value?.logs.some(l => !l.system && !l.reverted));
/* 待办39：横幅统计改由待办属性驱动 */
const blockedCount = computed(() => (current.value?.state.todos || []).filter(t => !t.done && t.blocked).length);
const nextCount = computed(() => (current.value?.state.todos || []).filter(t => !t.done && t.next).length);

function editProject() {
  const p = current.value;
  if (!p) return;
  ui.projectDraft = { id: p.id, name: p.name, goal: p.goal, status: p.status };
  openModal('project-edit');
}
</script>

<template>
  <main class="main">
    <template v-if="!current">
      <div class="empty-page">
        <img class="mascot" :src="'kiko/mascot.png'" alt="KIKO" />
        <p v-if="!store.db.projects.length">还没有项目。<br />新建一个项目，随时把做了什么、卡在哪、下一步是什么告诉 KIKO。</p>
        <p v-else>从左侧选择一个项目，或新建项目。</p>
        <button class="btn primary" @click="openModal('project-new')"><AppIcon name="plus" :size="14" :stroke-w="2.4" /> 新建项目</button>
      </div>
    </template>

    <template v-else>
      <div class="crumb">工作空间　/　{{ current.name }}</div>
      <div class="heading">
        <div>
          <h1>{{ current.name }}</h1>
          <div class="sub">最近更新 {{ S.fmtLong(current.updatedAt) }}</div>
        </div>
        <button class="btn" @click="editProject">编辑项目</button>
      </div>

      <Transition name="banner">
        <div class="banner resume" v-if="resumeInfo && !ui.bannerClosed.resume">
          <span class="close" @click="ui.bannerClosed.resume = true"><AppIcon name="x" :size="11" /></span>
          <b>👋 时隔 {{ resumeInfo.days }} 天回到这个项目。</b><br />
          <template v-if="resumeInfo.message">上次记录（{{ S.fmtShort(resumeInfo.lastAt) }}）：{{ resumeInfo.message.slice(0, 80) }}<br /></template>
          <span v-if="blockedCount" class="seg red">阻塞 {{ blockedCount }} 项待办</span>
          <span v-if="nextCount" class="seg blue">待推进 {{ nextCount }} 项</span>
          <span v-if="!blockedCount && !nextCount" class="muted">暂无阻塞与待推进事项，可直接继续记录。</span>
        </div>
      </Transition>
      <div class="grid">
        <SummaryCard class="span2" />
        <TodoCard class="span2" />
        <DecisionCard class="span2" />
      </div>

      <HistoryTimeline :can-undo="canUndo" @undo="undoLastUpdate" />
      <WorkComposer />
    </template>
  </main>
</template>

<style scoped>
.main { padding: 6px 34px 44px; overflow: auto; min-width: 0; flex: 1; min-height: 0; }
.crumb { font-size: 11.5px; color: var(--text-3); margin-bottom: 8px; }
.heading { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 22px; gap: 12px; }
.heading h1 { font-size: 22px; margin: 0; font-weight: 700; letter-spacing: -.02em; }
.sub { color: var(--text-3); font-size: 12px; margin-top: 4px; }
.banner { position: relative; border-radius: 14px; padding: 12px 16px; font-size: 12.5px; line-height: 1.75; margin-bottom: 14px; border: 1px solid rgba(255, 255, 255, .6); box-shadow: var(--edge-hi), 0 4px 16px rgba(14, 38, 86, .07); }
.banner.resume { background: rgba(214, 232, 255, .55); color: #1c5aa8; }
.banner .close { position: absolute; top: 11px; right: 12px; cursor: pointer; color: #9db4d0; line-height: 1; padding: 2px; border-radius: 6px; }
.banner .close:hover { color: var(--text-2); background: rgba(255, 255, 255, .7); }
.banner .close:hover { color: var(--text-2); }
.seg { display: inline-block; margin: 6px 8px 0 0; padding: 2px 10px; border-radius: 980px; font-size: 11.5px; background: #fff; }
.seg.red { color: var(--red); }
.seg.blue { color: var(--accent); }
.banner > .btn { margin-left: 10px; vertical-align: 1px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.span2 { grid-column: 1 / -1; }
.empty-page { height: 78%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-3); gap: 16px; text-align: center; line-height: 1.8; font-size: 13px; }
.empty-page .mascot { width: 190px; border-radius: 24px; box-shadow: 0 14px 40px rgba(30, 40, 90, .16); animation: breathe 4s var(--ease) infinite; }
@keyframes breathe { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
.banner-enter-active, .banner-leave-active { transition: all .3s var(--ease); }
.banner-enter-from, .banner-leave-to { opacity: 0; transform: translateY(-8px); }
@media (max-width: 860px) { .grid { grid-template-columns: 1fr; } .span2 { grid-column: auto; } }
</style>
