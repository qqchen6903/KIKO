<script setup>
import { computed, nextTick, ref } from 'vue';
import S from '../../shared-bridge';
import { current, addDecision, removeDecision } from '../../store/workspace';
import AppIcon from '../AppIcon.vue';

const decisions = computed(() => current.value?.state.decisions ?? []);
const shown = computed(() => decisions.value.map((d, i) => ({ d, i })).slice().reverse());
const adding = ref(false);
const text = ref('');

async function startAdd() {
  adding.value = true;
  await nextTick();
  document.getElementById('dec-new')?.focus();
}
function submit() {
  if (text.value.trim() && addDecision(text.value)) text.value = '';
  else { adding.value = false; text.value = ''; }
}
function timeOf(d) { return d.at ? S.fmtShort(d.at) : ''; }
</script>

<template>
  <section class="card">
    <div class="cardhead">
      <h3><AppIcon name="flag" :size="15" class="hicon" /> 关键决策 <span class="hint">只追加不覆盖，AI 不会删除旧决策</span></h3>
      <button class="addbtn" @click="startAdd" v-if="!adding" title="添加"><AppIcon name="plus" :size="13" :stroke-w="2.4" /></button>
    </div>
    <TransitionGroup name="rows" tag="div" class="list">
      <div v-for="{ d, i } in shown" :key="i" class="drow">
        <time>{{ timeOf(d) }}</time>
        <span class="txt">{{ d.text }}</span>
        <div class="ops"><button class="mini danger" @click="removeDecision(i)" title="删除"><AppIcon name="x" :size="12" /></button></div>
      </div>
    </TransitionGroup>
    <p v-if="!decisions.length && !adding" class="empty">暂无决策记录。重要取舍（选型、方案、约定）会由 AI 追加到这里。</p>
    <div class="addrow" v-if="adding">
      <input id="dec-new" v-model="text" placeholder="记录一条决策，回车保存" @keyup.enter="submit" @keyup.esc="adding = false; text = ''" />
      <button class="mini danger" @click="adding = false; text = ''"><AppIcon name="x" :size="12" /></button>
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
.drow { display: flex; align-items: baseline; gap: 10px; padding: 5px 2px; font-size: 13px; }
.drow time { font-size: 11px; color: var(--text-3); flex-shrink: 0; width: 74px; }
.txt { flex: 1; line-height: 1.6; word-break: break-word; }
.ops { opacity: 0; transition: opacity .15s var(--ease); }
.drow:hover .ops { opacity: 1; }
.addrow { display: flex; gap: 8px; margin-top: 8px; align-items: center; }
.addrow input { flex: 1; border: 1px solid #dcdce1; border-radius: 9px; padding: 7px 10px; font-size: 12.5px; outline: none; }
.addrow input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(0, 113, 227, .12); }
.empty { color: var(--text-3); font-size: 12.5px; margin: 4px 0; }
.rows-enter-active { transition: all .24s var(--ease); }
.rows-leave-active { transition: all .16s ease-in; }
.rows-enter-from { opacity: 0; transform: translateY(5px); }
.rows-leave-to { opacity: 0; }
.rows-move { transition: transform .24s var(--ease); }
</style>
