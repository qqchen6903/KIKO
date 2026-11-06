<script setup>
import { computed, nextTick, ref } from 'vue';
import S from '../../shared-bridge';
import { current, addTodo, updateTodo, toggleTodo, removeTodo } from '../../store/workspace';
import AppIcon from '../AppIcon.vue';

const todos = computed(() => current.value?.state.todos ?? []);
/* 待办41：未完成为主列表；已完成近一周收进可展开区，每条带完成时间 */
const undone = computed(() => todos.value.map((t, i) => ({ t, i })).filter(x => !x.t.done));
const weekDone = computed(() => {
  const cut = Date.now() - 7 * 864e5;
  return todos.value.map((t, i) => ({ t, i }))
    .filter(x => x.t.done && (!x.t.doneAt || Date.parse(x.t.doneAt) >= cut))
    .sort((a, b) => (Date.parse(b.t.doneAt) || 0) - (Date.parse(a.t.doneAt) || 0));
});
const showDone = ref(false);
const adding = ref(false);
const nTitle = ref('');
const nDue = ref('');
const nPriority = ref('普通');
const editIdx = ref(-1);
const eTitle = ref('');
const eDue = ref('');
const ePriority = ref('普通');
/* 待办39：阻塞点 / 关联 / 下一步 三属性 */
const eBlocked = ref('');
const eRelated = ref('');
const eNext = ref('');

function isOverdue(t) { return !t.done && t.due && Date.parse(t.due) < Date.now(); }
async function startAdd() {
  adding.value = true; editIdx.value = -1;
  await nextTick();
  document.getElementById('todo-new-title')?.focus();
}
function submitAdd() {
  if (!nTitle.value.trim()) { adding.value = false; return; }
  if (addTodo({ title: nTitle.value, dueRaw: nDue.value, priority: nPriority.value })) {
    nTitle.value = ''; nDue.value = ''; nPriority.value = '普通';
  }
}
function startEdit(i) {
  editIdx.value = i;
  const t = todos.value[i];
  eTitle.value = t.title;
  eDue.value = t.due ? new Date(t.due).toLocaleString('zh-CN', { hour12: false }) : '';
  ePriority.value = t.priority;
  eBlocked.value = t.blocked || '';
  eRelated.value = t.related || '';
  eNext.value = t.next || '';
}
function submitEdit() {
  if (editIdx.value >= 0) updateTodo(editIdx.value, {
    title: eTitle.value, dueRaw: eDue.value, priority: ePriority.value,
    blocked: eBlocked.value, related: eRelated.value, next: eNext.value,
  });
  editIdx.value = -1;
}
</script>

<template>
  <section class="card">
    <div class="cardhead">
      <h3><AppIcon name="list-checks" :size="16" class="hicon" /> 待办事项 <span class="hint">到期会弹 Windows 通知提醒</span></h3>
      <button class="addbtn" @click="startAdd" v-if="!adding" title="添加"><AppIcon name="plus" :size="13" :stroke-w="2.4" /></button>
    </div>

    <TransitionGroup name="rows" tag="div" class="list">
      <div v-for="{ t, i } in undone" :key="t.title + i" class="trow">
        <template v-if="editIdx === i">
          <span class="editform">
            <input class="fte" v-model="eTitle" placeholder="任务" />
            <input class="fte due" v-model="eDue" placeholder="到期，如 2026-11-10 14:00 / 明天 18:00，留空不提醒" />
            <select class="fte pri" v-model="ePriority"><option v-for="p in S.PRIORITIES" :key="p">{{ p }}</option></select>
            <input class="fte attr bl" v-model="eBlocked" placeholder="阻塞点：卡在哪里（留空清除）" />
            <input class="fte attr rl" v-model="eRelated" placeholder="关联：链接/文件/人/事项（留空清除）" />
            <input class="fte attr nx" v-model="eNext" placeholder="下一步：接下来要做的动作（留空清除）" />
            <button class="mini ok" @click="submitEdit" title="保存"><AppIcon name="check" :size="13" /></button>
            <button class="mini danger" @click="editIdx = -1" title="取消"><AppIcon name="x" :size="12" /></button>
          </span>
        </template>
        <template v-else>
          <input type="checkbox" class="chk" :checked="t.done" @change="toggleTodo(i)" />
          <div class="tbody">
            <div class="tline">
              <span class="title">{{ t.title }}</span>
              <span class="tag" :class="{ hi: t.priority === '高', lo: t.priority === '低' }" v-if="t.priority !== '普通'">{{ t.priority }}</span>
              <span class="due" :class="{ over: isOverdue(t) }" v-if="t.due">{{ isOverdue(t) ? '已过期 · ' : '' }}{{ S.dueLabel(t.due) }}</span>
            </div>
            <div class="attrs" v-if="t.blocked || t.related || t.next">
              <span class="attr bl" v-if="t.blocked" title="阻塞点"><AppIcon name="alert-circle" :size="10" />{{ t.blocked }}</span>
              <span class="attr rl" v-if="t.related" title="关联"><AppIcon name="link" :size="10" />{{ t.related }}</span>
              <span class="attr nx" v-if="t.next" title="下一步"><AppIcon name="arrow-right" :size="10" />{{ t.next }}</span>
            </div>
          </div>
          <div class="ops">
            <button class="mini" @click="startEdit(i)" title="编辑"><AppIcon name="pencil" :size="12" /></button>
            <button class="mini danger" @click="removeTodo(i)" title="删除"><AppIcon name="x" :size="12" /></button>
          </div>
        </template>
      </div>
    </TransitionGroup>
    <div class="weekwrap" v-if="weekDone.length">
      <button class="weekbtn" @click="showDone = !showDone">
        <AppIcon name="chevron-down" :size="11" class="chev" :class="{ open: showDone }" />
        最近一周的工作（{{ weekDone.length }}）
      </button>
      <TransitionGroup name="rows" tag="div" class="list" v-if="showDone">
        <div v-for="{ t, i } in weekDone" :key="'w' + t.title + i" class="trow done">
          <input type="checkbox" class="chk" checked title="取消勾选可重新打开" @change="toggleTodo(i)" />
          <div class="tbody">
            <div class="tline">
              <span class="title">{{ t.title }}</span>
              <span class="ftime">{{ t.doneAt ? '完成于 ' + S.fmtShort(t.doneAt) : '已完成' }}</span>
            </div>
          </div>
        </div>
      </TransitionGroup>
    </div>
    <p v-if="!todos.length && !adding" class="empty">暂无待办。让 AI 整理时说出「明天下午前完成××」，确认后会自动进入这里。</p>

    <div class="addrow" v-if="adding">
      <input id="todo-new-title" v-model="nTitle" placeholder="任务内容，回车保存" @keyup.enter="submitAdd" @keyup.esc="adding = false" />
      <input v-model="nDue" placeholder="到期（可选）" @keyup.enter="submitAdd" />
      <select v-model="nPriority"><option v-for="p in S.PRIORITIES" :key="p">{{ p }}</option></select>
      <button class="mini danger" @click="adding = false"><AppIcon name="x" :size="12" /></button>
    </div>
  </section>
</template>

<style scoped>
.card { background: var(--panel); border-radius: var(--radius); box-shadow: var(--shadow-card); padding: 16px 18px; }
.cardhead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 11px; }
h3 { font-size: 13px; margin: 0; color: var(--text-2); font-weight: 600; display: flex; align-items: center; }
.hint { font-size: 11px; color: var(--text-3); font-weight: 400; margin-left: 8px; }
.hicon { color: var(--orange); }
.mini.ok:hover { color: var(--green); background: rgba(29, 158, 90, .10); }
.addbtn { border: 1px solid rgba(11, 18, 32, .12); color: var(--text-3); background: rgba(255, 255, 255, .4); border-radius: 980px; width: 23px; height: 23px; display: grid; place-items: center; cursor: pointer; transition: all .16s var(--spring); }
.addbtn:hover { color: var(--accent); border-color: rgba(0, 113, 227, .5); background: rgba(255, 255, 255, .8); transform: scale(1.08); }
.list { position: relative; }
.trow { display: flex; align-items: center; gap: 9px; padding: 6px 2px; font-size: 13px; border-radius: 9px; transition: opacity .2s var(--ease); }
.trow.done { opacity: .5; }
.trow.done .title { text-decoration: line-through; color: var(--text-3); }
.chk {
  appearance: none; -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; margin: 0; flex-shrink: 0; cursor: pointer;
  border: 1.5px solid rgba(11, 18, 32, .22); background: rgba(255, 255, 255, .75);
  box-shadow: inset 0 1px 2px rgba(14, 38, 86, .08); transition: all .22s var(--spring);
}
.chk:hover { border-color: rgba(29, 158, 90, .6); background: #fff; }
.chk:checked {
  border-color: transparent;
  background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 13l5 5L20 6'/%3E%3C/svg%3E") center / 10px 9px no-repeat,
              linear-gradient(180deg, #3fcf75, var(--green));
  box-shadow: 0 0 0 1px rgba(255, 255, 255, .5), 0 2px 6px rgba(29, 158, 90, .35);
}
.chk:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(0, 113, 227, .35); }
.tbody { flex: 1; min-width: 0; }
.tline { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
.title { flex: 0 1 auto; word-break: break-word; line-height: 1.5; }
/* 待办39：三属性徽标 */
.attrs { display: flex; flex-direction: column; gap: 3px; margin-top: 4px; }
.attr { font-size: 11px; border-radius: 8px; padding: 1.5px 8px; display: inline-flex; align-items: center; gap: 5px; line-height: 1.5; word-break: break-word; align-self: flex-start; }
.attr .ico { flex-shrink: 0; }
.attr.bl { background: rgba(255, 214, 210, .55); color: #b02a31; }
.attr.rl { background: rgba(228, 232, 241, .65); color: var(--text-2); }
.attr.nx { background: rgba(214, 232, 255, .6); color: #1c5aa8; }
.tag { font-size: 10.5px; border-radius: 980px; padding: 1px 8px; flex-shrink: 0; border: 1px solid rgba(255, 255, 255, .6); box-shadow: inset 0 1px 0 rgba(255, 255, 255, .7); }
.tag.hi { background: rgba(255, 214, 210, .65); color: #b02a31; }
.tag.lo { background: rgba(228, 232, 241, .7); color: var(--text-2); }
.due { font-size: 11.5px; color: var(--accent); flex-shrink: 0; }
.due.over { color: var(--red); font-weight: 600; }
.ops { margin-left: auto; opacity: 0; transition: opacity .15s var(--ease); display: flex; }
.trow:hover .ops { opacity: 1; }
.editform { display: flex; align-items: center; gap: 7px; flex: 1; flex-wrap: wrap; }
.fte { border: 1px solid #dcdce1; border-radius: 8px; padding: 5px 9px; font-size: 12.5px; outline: none; }
.fte:focus { border-color: var(--accent); }
.fte.due { flex: 1; min-width: 180px; }
.fte.attr { flex: 1; min-width: 150px; }
.fte.attr.bl:focus { border-color: var(--red); }
.fte.attr.nx:focus { border-color: var(--indigo, #5e5ce6); }
.addrow { display: flex; gap: 8px; margin-top: 10px; }
.addrow input { border: 1px solid rgba(11, 18, 32, .12); border-radius: 10px; padding: 7px 11px; font-size: 12.5px; outline: none; background: rgba(255, 255, 255, .62); box-shadow: inset 0 1px 2px rgba(14, 38, 86, .05); }
.addrow input:first-child { flex: 2; }
.addrow input:nth-child(2) { flex: 1.4; }
.addrow select, .pri { border: 1px solid rgba(11, 18, 32, .12); border-radius: 10px; padding: 6px 9px; font-size: 12.5px; outline: none; background: rgba(255, 255, 255, .62); }
.addrow input:focus, .addrow select:focus { background: rgba(255, 255, 255, .88); border-color: var(--accent); box-shadow: 0 0 0 3px rgba(0, 113, 227, .14); }
.empty { color: var(--text-3); font-size: 12.5px; margin: 4px 0; line-height: 1.6; }
/* 待办41：近一周已完成展开区 */
.weekwrap { margin-top: 8px; }
.weekbtn { border: 0; background: rgba(11, 18, 32, .045); color: var(--text-2); font-size: 11.5px; font-family: inherit; border-radius: 8px; padding: 4px 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; transition: background .16s var(--ease); }
.weekbtn:hover { background: rgba(11, 18, 32, .08); }
.chev { transition: transform .2s var(--ease); }
.chev.open { transform: rotate(180deg); }
.ftime { font-size: 11px; color: var(--text-3); flex-shrink: 0; }
.rows-enter-active { transition: all .24s var(--ease); }
.rows-leave-active { transition: all .16s ease-in; }
.rows-enter-from { opacity: 0; transform: translateY(5px); }
.rows-leave-to { opacity: 0; }
.rows-move { transition: transform .24s var(--ease); }
</style>
