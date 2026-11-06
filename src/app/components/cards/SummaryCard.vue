<script setup>
import { current } from '../../store/workspace';
import { ui, openModal } from '../../store/ui';
import AppIcon from '../AppIcon.vue';

function editGoal() {
  const p = current.value;
  ui.projectDraft = { id: p.id, name: p.name, goal: p.goal, status: p.status };
  openModal('project-edit');
}
</script>

<template>
  <section class="card">
    <div class="cardhead">
      <h3><AppIcon name="overview" :size="15" class="hicon" /> 当前概况</h3>
      <button class="mini" @click="editGoal">编辑目标</button>
    </div>
    <p class="summary" :class="{ none: !current.state.summary }">
      {{ current.state.summary || '向下方输入工作进展并让 AI 整理后，这里会显示当前概况。' }}
    </p>
    <p class="goal" v-if="current.goal">目标：{{ current.goal }}</p>
    <p class="goal muted" v-else>还没有填写项目目标，可点右上「编辑目标」。</p>
  </section>
</template>

<style scoped>
.card { background: var(--panel); border-radius: var(--radius); box-shadow: var(--shadow-card); padding: 16px 18px; }
.cardhead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
h3 { font-size: 13px; margin: 0; color: var(--text-2); font-weight: 600; letter-spacing: -.01em; display: flex; align-items: center; gap: 7px; }
.hicon { color: var(--indigo); }
.summary { font-size: 14px; line-height: 1.7; margin: 0; letter-spacing: -.01em; }
.summary.none { color: var(--text-3); font-size: 12.5px; }
.goal { margin: 10px 0 0; font-size: 12px; color: var(--text-2); line-height: 1.6; }
</style>
