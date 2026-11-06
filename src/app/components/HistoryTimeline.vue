<script setup>
import { computed, ref } from 'vue';
import S from '../shared-bridge';
import { current } from '../store/workspace';
import AppIcon from './AppIcon.vue';

defineProps({ canUndo: Boolean });
defineEmits(['undo']);

const open = ref(true);

const logs = computed(() => (current.value?.logs ?? []).map((l, i) => ({ l, i })).slice().reverse());
function countOf(l, k) { return Array.isArray(l.applied?.[k]) ? l.applied[k].length : 0; }
</script>

<template>
  <section class="timeline" v-if="logs.length">
    <div class="tlhead" @click="open = !open" :title="open ? '点击收起' : '点击展开'">
      <h3><AppIcon name="chevron-down" :size="15" class="hicon" :class="{ closed: !open }" /> 历史时间线 <span class="muted">{{ open ? `共 ${logs.filter(x => !x.l.system).length} 次记录，可追溯可撤销` : '已收起，点击展开' }}</span></h3>
      <button class="btn" :disabled="!canUndo" @click.stop="$emit('undo')"><AppIcon name="undo" :size="13" /> 撤销上次更新</button>
    </div>
    <Transition name="tlopen">
      <div class="tl-collapse" v-show="open">
        <div class="tl-inner">
    <TransitionGroup name="tl" tag="div">
      <div v-for="{ l, i } in logs" :key="i" class="log" :class="{ system: l.system, revoked: l.reverted }">
        <span class="node"></span>
        <div class="body">
          <div class="meta">
            <time>{{ S.fmtLong(l.at) }}</time>
            <span class="rvt" v-if="l.reverted">已撤销</span>
            <span class="sys" v-if="l.system">系统操作</span>
          </div>
          <template v-if="!l.system">
            <p class="msg">{{ l.message }}</p>
            <p class="sum" v-if="l.aiSummary">→ {{ l.aiSummary }}</p>
            <p class="stat" v-if="!l.reverted">
              <span v-if="countOf(l, 'completed')"><AppIcon name="check-circle" :size="11" /> 已完成 {{ countOf(l, 'completed') }}</span>
              <span v-if="countOf(l, 'inProgress')"><AppIcon name="play-circle" :size="11" /> 进行中 {{ countOf(l, 'inProgress') }}</span>
              <span v-if="countOf(l, 'blockers')"><AppIcon name="alert-circle" :size="11" /> 卡点 {{ countOf(l, 'blockers') }}</span>
              <span v-if="countOf(l, 'nextSteps')"><AppIcon name="arrow-right" :size="11" /> 下一步 {{ countOf(l, 'nextSteps') }}</span>
              <span v-if="countOf(l, 'todos')"><AppIcon name="list-checks" :size="11" /> 待办 {{ countOf(l, 'todos') }}</span>
              <span v-if="countOf(l, 'decisions')"><AppIcon name="flag" :size="11" /> 决策 {{ countOf(l, 'decisions') }}</span>
            </p>
            <p class="conf" v-if="l.conflicts?.length"><AppIcon name="alert-circle" :size="12" style="vertical-align:-2px" /> 有 {{ l.conflicts.length }} 处新旧信息冲突，请人工核对</p>
          </template>
          <p class="msg sysmsg" v-else>{{ l.message }}</p>
        </div>
      </div>
    </TransitionGroup>
        </div>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.timeline { margin-top: 18px; }
.tlhead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; cursor: pointer; user-select: none; border-radius: 10px; padding: 4px 8px; margin-left: -8px; margin-right: -8px; transition: background .18s var(--ease); }
.tlhead:hover { background: rgba(255, 255, 255, .4); }
.tl-collapse { display: grid; grid-template-rows: 1fr; }
.tl-inner { min-height: 0; overflow: hidden; }
.tlopen-enter-active, .tlopen-leave-active { transition: grid-template-rows .34s var(--ease); }
.tlopen-enter-from, .tlopen-leave-to { grid-template-rows: 0fr; }
h3 { font-size: 13px; margin: 0; color: var(--text-2); font-weight: 600; display: flex; align-items: center; gap: 7px; }
.hicon { color: var(--text-3); transition: transform .28s var(--spring); }
.hicon.closed { transform: rotate(-90deg); }
.muted { font-size: 11px; font-weight: 400; margin-left: 6px; }
.log { display: flex; gap: 12px; padding: 2px 0; }
.node { width: 8px; height: 8px; border-radius: 50%; background: #d3d3d9; margin: 12px 0 0 4px; flex-shrink: 0; position: relative; }
.log:not(:last-child) .node::after { content: ''; position: absolute; left: 3px; top: 10px; width: 2px; height: calc(100% + 16px); background: #e8e8ed; }
.body { flex: 1; min-width: 0; background: rgba(255, 255, 255, .48); border: 1px solid rgba(255, 255, 255, .55); border-radius: 16px; padding: 11px 15px; margin-bottom: 8px; box-shadow: var(--edge-hi), 0 3px 12px rgba(14, 38, 86, .05); }
.log.revoked .body { opacity: .5; }
.meta { display: flex; gap: 10px; align-items: baseline; }
time { font-size: 11px; color: var(--text-3); }
.rvt { font-size: 10px; color: var(--red); background: rgba(255, 59, 48, .08); padding: 1px 8px; border-radius: 980px; }
.sys { font-size: 10px; color: var(--text-3); }
.msg { font-size: 12.5px; margin: 7px 0 0; line-height: 1.65; word-break: break-word; }
.sum { font-size: 12px; color: var(--text-2); margin: 5px 0 0; }
.stat { margin: 7px 0 0; display: flex; flex-wrap: wrap; gap: 6px; }
.stat span { font-size: 10.5px; color: var(--text-2); background: rgba(255, 255, 255, .6); border: 1px solid rgba(255, 255, 255, .7); border-radius: 980px; padding: 2px 9px; box-shadow: inset 0 1px 0 rgba(255, 255, 255, .8); display: inline-flex; align-items: center; gap: 4px; }
.conf { display: flex; align-items: center; gap: 6px; }
.conf { font-size: 11.5px; color: #8a5a00; background: rgba(255, 159, 10, .1); border-radius: 8px; padding: 5px 10px; margin: 7px 0 0; }
.sysmsg { color: var(--text-3); }
.tl-enter-active { transition: all .26s var(--ease); }
.tl-leave-active { transition: all .16s; }
.tl-enter-from { opacity: 0; transform: translateY(6px); }
.tl-leave-to { opacity: 0; }
.tl-move { transition: transform .26s var(--ease); }
</style>
