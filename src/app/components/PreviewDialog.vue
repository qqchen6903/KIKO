<script setup>
import { computed } from 'vue';
import { ui, closeModal, toast } from '../store/ui';
import { applyAiUpdate } from '../store/workspace';
import AppIcon from './AppIcon.vue';

const p = computed(() => ui.preview);
/* 待办39：AI 预览按 新模型 diff 展示（待办三属性变化取代旧四列表差异） */
const FIELD_LABEL = { blocked: '阻塞点', related: '关联', next: '下一步' };
const sections = computed(() => {
  if (!p.value) return [];
  const d = p.value.diff;
  const attrLines = (d.attrsChanged || []).map(a => {
    const lab = FIELD_LABEL[a.field] || a.field;
    if (a.from && !a.to) return `${a.title} · ${lab} 解除（原：${a.from}）`;
    if (!a.from && a.to) return `${a.title} · ${lab} 新增：${a.to}`;
    return `${a.title} · ${lab}：${a.from} → ${a.to}`;
  });
  return [
    { icon: 'list-checks', label: '新待办', added: d.todosAdded, removed: [] },
    { icon: 'check', label: '完成待办', added: d.todosDone, removed: [] },
    { icon: 'flag', label: '新决策', added: d.decisionsAdded, removed: [] },
    { icon: 'pencil', label: '属性更新', added: attrLines, removed: [] },
  ].filter(s => s.added.length || s.removed.length);
});

async function apply() {
  const pv = p.value;
  if (!pv) return;
  await applyAiUpdate(pv.ai, pv.message, pv.errors);
  pv.onApplied?.();
  closeModal();
  window.assistant.setPetState('done');
  toast('已写入项目记录，可在时间线撤销', 'success');
}
</script>

<template>
  <div class="dialog wide" v-if="p">
    <h2>AI 整理预览 <span class="muted">确认后才会写入</span></h2>

    <div class="srcline">原始输入：<i>{{ p.message }}</i></div>

    <div class="dv-sec" v-if="p.diff.summaryChanged">
      <h4><AppIcon name="overview" :size="13" /> 概况</h4>
      <p class="dv-line dv-chg">{{ p.merged.summary }}</p>
    </div>

    <div class="dv-sec" v-for="s in sections" :key="s.label">
      <h4><AppIcon :name="s.icon" :size="13" /> {{ s.label }}</h4>
      <p class="dv-line dv-add" v-for="x in s.added" :key="'a' + x">＋ {{ x }}</p>
      <p class="dv-line dv-del" v-for="x in s.removed" :key="'r' + x">－ {{ x }}</p>
    </div>

    <div class="dv-warn" v-if="p.ai.conflicts.length">
      <b>⚠ 新旧信息冲突 {{ p.ai.conflicts.length }} 处</b>（AI 已按规则未擅自覆盖，请核对）
      <p v-for="c in p.ai.conflicts" :key="c" style="margin:5px 0 0">· {{ c }}</p>
    </div>
    <div class="dv-note" v-if="p.errors.length">
      {{ p.errors.join(' ') }}
    </div>
    <p class="dv-none" v-if="!p.diff.summaryChanged && !sections.length">
      本次输入没有产生字段变化，仅会在历史中记录这条原始输入。
    </p>

    <div class="dialogfoot">
      <button class="btn" @click="closeModal()">取消（不写入）</button>
      <button class="btn primary" @click="apply">确认更新</button>
    </div>
  </div>
</template>

<style scoped>
.srcline { font-size: 12px; color: #33405a; background: rgba(255, 255, 255, .78); border: 1px solid rgba(255, 255, 255, .8); border-radius: 12px; padding: 9px 13px; margin-bottom: 14px; line-height: 1.6; box-shadow: inset 0 1px 0 rgba(255, 255, 255, .7); }
.srcline i { color: var(--text); }
.dv-sec { margin: 12px 0; }
.dv-sec h4 { font-size: 12px; color: var(--text-3); margin: 0 0 5px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.dv-line { font-size: 13px; line-height: 1.7; margin: 2px 0; word-break: break-word; }
.dv-add { color: #1d7a4f; }
.dv-del { color: var(--red); text-decoration: line-through; opacity: .75; }
.dv-chg { color: #1c5aa8; }
.dv-warn { background: rgba(255, 159, 10, .1); border-radius: 10px; padding: 10px 13px; font-size: 12px; color: #7a4f00; margin: 12px 0; line-height: 1.65; }
.dv-note { font-size: 11.5px; color: #8a5a00; margin: 10px 0 0; }
.dv-none { font-size: 12.5px; color: var(--text-3); }
</style>
