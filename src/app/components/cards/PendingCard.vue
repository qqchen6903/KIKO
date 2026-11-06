<script setup>
/* 待办44 · 待定池：管理「暂定/待确认」类未定需求。转正=补截止日期与优先级转为正式待办（留系统痕迹）；
 * 作废=置灰留档不删；跟进日期到期由主进程弹系统通知并在总览「待确认」区提醒。 */
import { computed, nextTick, ref } from 'vue';
import S from '../../shared-bridge';
import { current, addPending, updatePending, removePending, togglePendingDiscard, promotePending } from '../../store/workspace';
import AppIcon from '../AppIcon.vue';

const items = computed(() => current.value?.state.pending ?? []);
const adding = ref(false);
const nText = ref(''); const nWait = ref(''); const nFollow = ref('');
const editIdx = ref(-1);
const eText = ref(''); const eWait = ref(''); const eSource = ref(''); const eFollow = ref('');
const promoteIdx = ref(-1);
const pDue = ref(''); const pPri = ref('普通');

const isPast = x => x.state === 'open' && x.followUp && Date.parse(x.followUp) < Date.now();

async function startAdd() {
  adding.value = true; editIdx.value = -1; promoteIdx.value = -1;
  await nextTick();
  document.getElementById('pend-new-text')?.focus();
}
function submitAdd() {
  if (!nText.value.trim()) { adding.value = false; return; }
  if (addPending({ text: nText.value, waiting: nWait.value, followUpRaw: nFollow.value })) {
    nText.value = ''; nWait.value = ''; nFollow.value = '';
  }
}
function startEdit(i) {
  promoteIdx.value = -1; editIdx.value = i;
  const x = items.value[i];
  eText.value = x.text; eWait.value = x.waiting || '';
  eSource.value = x.source || '';
  eFollow.value = x.followUp ? new Date(x.followUp).toLocaleString('zh-CN', { hour12: false }) : '';
}
function submitEdit() {
  if (editIdx.value >= 0) updatePending(editIdx.value, { text: eText.value, waiting: eWait.value, source: eSource.value, followUpRaw: eFollow.value });
  editIdx.value = -1;
}
function startPromote(i) { editIdx.value = -1; promoteIdx.value = i; pDue.value = ''; pPri.value = '普通'; }
function submitPromote() {
  if (promoteIdx.value >= 0 && pDue.value.trim()) promotePending(promoteIdx.value, { dueRaw: pDue.value, priority: pPri.value });
  promoteIdx.value = -1;
}
</script>

<template>
  <section class="card">
    <div class="cardhead">
      <h3><AppIcon name="target" :size="16" class="hicon" /> 待定池 <span class="hint">暂定 / 待确认的需求先进这里，确认后一键转正</span></h3>
      <button class="addbtn" @click="startAdd" v-if="!adding" title="添加"><AppIcon name="plus" :size="13" :stroke-w="2.4" /></button>
    </div>

    <TransitionGroup name="rows" tag="div" class="list">
      <div v-for="(x, i) in items" :key="x.text + i" class="prow" :class="{ discarded: x.state === 'discarded' }">
        <template v-if="editIdx === i">
          <span class="editform">
            <input class="fte" v-model="eText" placeholder="内容" />
            <input class="fte" v-model="eWait" placeholder="在等谁确认什么" />
            <input class="fte" v-model="eFollow" placeholder="跟进日期，如 2026-11-15 / 下周一 10:00" />
            <input class="fte" v-model="eSource" placeholder="来源原话（可选）" />
            <button class="mini ok" @click="submitEdit" title="保存"><AppIcon name="check" :size="13" /></button>
            <button class="mini danger" @click="editIdx = -1" title="取消"><AppIcon name="x" :size="12" /></button>
          </span>
        </template>
        <template v-else-if="promoteIdx === i">
          <span class="editform">
            <span class="ptitle">转正为待办：{{ x.text }}</span>
            <input class="fte" v-model="pDue" placeholder="截止日期时间，如 2026-11-20 18:00 *" />
            <select class="fte pri" v-model="pPri"><option v-for="p in S.PRIORITIES" :key="p">{{ p }}</option></select>
            <button class="mini ok" @click="submitPromote" :disabled="!pDue.trim()" title="确认转正"><AppIcon name="check" :size="13" /></button>
            <button class="mini danger" @click="promoteIdx = -1" title="取消"><AppIcon name="x" :size="12" /></button>
          </span>
        </template>
        <template v-else>
          <span class="pdot" :class="x.state === 'discarded' ? 'off' : (isPast(x) ? 'due' : 'open')"></span>
          <div class="pbody">
            <div class="pline">
              <span class="ptext">{{ x.text }}</span>
              <span class="pfollow" :class="{ past: isPast(x) }" v-if="x.followUp">{{ isPast(x) ? '该跟进 · ' : '跟进 ' }}{{ S.dueLabel(x.followUp) }}</span>
            </div>
            <div class="psub" v-if="x.waiting || x.source">
              <span class="pwait" v-if="x.waiting">在等：{{ x.waiting }}</span>
              <span class="psrc" v-if="x.source">来源：“{{ x.source }}”</span>
            </div>
          </div>
          <div class="ops">
            <button class="mini" v-if="x.state !== 'discarded'" @click="startPromote(i)" title="转正为待办"><AppIcon name="arrow-right" :size="12" /></button>
            <button class="mini" v-if="x.state !== 'discarded'" @click="togglePendingDiscard(i)" title="作废（留档）"><AppIcon name="minus" :size="12" /></button>
            <button class="mini" v-else @click="togglePendingDiscard(i)" title="恢复"><AppIcon name="undo" :size="12" /></button>
            <button class="mini" @click="startEdit(i)" title="编辑"><AppIcon name="pencil" :size="12" /></button>
            <button class="mini danger" @click="removePending(i)" title="删除"><AppIcon name="x" :size="12" /></button>
          </div>
        </template>
      </div>
    </TransitionGroup>
    <p v-if="!items.length && !adding" class="empty">待定池是空的。遇到「时间暂定、等客户确认」这类事，直接告诉 KIKO，AI 整理会把它们放进这里。</p>

    <div class="addrow" v-if="adding">
      <input id="pend-new-text" v-model="nText" placeholder="待定内容，回车保存" @keyup.enter="submitAdd" @keyup.esc="adding = false" />
      <input v-model="nWait" placeholder="在等谁确认什么（可选）" @keyup.enter="submitAdd" />
      <input v-model="nFollow" placeholder="跟进日期（可选）" @keyup.enter="submitAdd" />
      <button class="mini danger" @click="adding = false"><AppIcon name="x" :size="12" /></button>
    </div>
  </section>
</template>

<style scoped>
.card { background: var(--panel); border-radius: var(--radius); box-shadow: var(--shadow-card); padding: 16px 18px; }
.cardhead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 11px; }
h3 { font-size: 13px; margin: 0; color: var(--text-2); font-weight: 600; display: flex; align-items: center; }
.hint { font-size: 11px; color: var(--text-3); font-weight: 400; margin-left: 8px; }
.hicon { color: var(--indigo); }
.addbtn { border: 1px solid rgba(11, 18, 32, .12); color: var(--text-3); background: rgba(255, 255, 255, .4); border-radius: 980px; width: 23px; height: 23px; display: grid; place-items: center; cursor: pointer; transition: all .16s var(--spring); }
.addbtn:hover { color: var(--accent); border-color: rgba(0, 113, 227, .5); background: rgba(255, 255, 255, .8); transform: scale(1.08); }
.list { position: relative; }
.prow { display: flex; align-items: center; gap: 9px; padding: 7px 2px; font-size: 13px; border-radius: 9px; }
.prow.discarded .ptext { text-decoration: line-through; color: var(--text-3); }
.prow.discarded { opacity: .5; }
.pdot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; box-shadow: inset 0 -1px 1px rgba(0,0,0,.12), inset 0 1px 1px rgba(255,255,255,.7); }
.pdot.open { background: var(--indigo); }
.pdot.due { background: var(--orange); }
.pdot.off { background: #b8c2d4; }
.pbody { flex: 1; min-width: 0; }
.pline { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.ptext { flex: 0 1 auto; word-break: break-word; line-height: 1.5; }
.pfollow { font-size: 11.5px; color: var(--accent); flex-shrink: 0; }
.pfollow.past { color: var(--red); font-weight: 600; }
.psub { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 2px; }
.pwait { font-size: 11px; color: #1c5aa8; }
.psrc { font-size: 11px; color: var(--text-3); font-style: italic; }
.ops { margin-left: auto; opacity: 0; transition: opacity .15s var(--ease); display: flex; }
.prow:hover .ops { opacity: 1; }
.editform { display: flex; align-items: center; gap: 7px; flex: 1; flex-wrap: wrap; }
.ptitle { font-size: 12.5px; color: var(--text-2); font-weight: 600; }
.fte { border: 1px solid #dcdce1; border-radius: 8px; padding: 5px 9px; font-size: 12.5px; outline: none; flex: 1; min-width: 140px; }
.fte:focus { border-color: var(--accent); }
.fte.pri { flex: 0 0 auto; min-width: 0; }
.addrow { display: flex; gap: 8px; margin-top: 10px; }
.addrow input { border: 1px solid rgba(11, 18, 32, .12); border-radius: 10px; padding: 7px 11px; font-size: 12.5px; outline: none; background: rgba(255, 255, 255, .62); box-shadow: inset 0 1px 2px rgba(14, 38, 86, .05); }
.addrow input:first-child { flex: 2; }
.addrow input:nth-child(2) { flex: 1.4; }
.addrow input:focus { background: rgba(255, 255, 255, .88); border-color: var(--accent); box-shadow: 0 0 0 3px rgba(0, 113, 227, .14); }
.empty { color: var(--text-3); font-size: 12.5px; margin: 4px 0; line-height: 1.6; }
.rows-enter-active { transition: all .24s var(--ease); }
.rows-leave-active { transition: all .16s ease-in; }
.rows-enter-from { opacity: 0; transform: translateY(5px); }
.rows-leave-to { opacity: 0; }
.rows-move { transition: transform .24s var(--ease); }
</style>
