<script setup>
import { computed, nextTick, ref } from 'vue';
import { current, addListItem, updateListItem, removeListItem } from '../../store/workspace';
import AppIcon from '../AppIcon.vue';

const props = defineProps({
  field: { type: String, required: true },
  label: { type: String, required: true },
  icon: { type: String, required: true },
  tone: { type: String, default: '' },
});

const items = computed(() => current.value?.state[props.field] ?? []);
const adding = ref(false);
const addText = ref('');
const addEl = ref(null);
const editIdx = ref(-1);
const editText = ref('');

async function startAdd() {
  adding.value = true;
  editIdx.value = -1;
  await nextTick();
  addEl.value?.focus();
}
function submitAdd() {
  const t = addText.value.trim();
  if (t && addListItem(props.field, t)) { addText.value = ''; }
  else { adding.value = false; addText.value = ''; }
}
function startEdit(i) {
  editIdx.value = i;
  editText.value = items.value[i];
  nextTick(() => document.getElementById(`edit-${props.field}-${i}`)?.focus());
}
function submitEdit() {
  if (editIdx.value >= 0) updateListItem(props.field, editIdx.value, editText.value);
  editIdx.value = -1;
}
function onKey(e) {
  if (e.key === 'Escape') { adding.value = false; addText.value = ''; editIdx.value = -1; }
}
</script>

<template>
  <section class="card">
    <div class="cardhead">
      <h3 :class="'tone-' + tone"><AppIcon :name="icon" :size="16" /> {{ label }}</h3>
      <button class="addbtn" @click="startAdd" v-if="!adding" title="添加"><AppIcon name="plus" :size="13" :stroke-w="2.4" /></button>
    </div>
    <TransitionGroup name="rows" tag="ul" class="list">
      <li v-for="(t, i) in items" :key="t + i" class="row">
        <template v-if="editIdx === i">
          <input
            :id="`edit-${field}-${i}`"
            class="inl"
            v-model="editText"
            @keyup.enter="submitEdit"
            @keyup.esc="editIdx = -1"
            @blur="submitEdit"
          />
        </template>
        <template v-else>
          <span class="txt">{{ t }}</span>
          <div class="ops">
            <button class="mini" @click="startEdit(i)" title="修改"><AppIcon name="pencil" :size="12" /></button>
            <button class="mini danger" @click="removeListItem(field, i)" title="删除"><AppIcon name="x" :size="12" /></button>
          </div>
        </template>
      </li>
    </TransitionGroup>
    <p v-if="!items.length && !adding" class="empty">暂无记录</p>
    <div class="addrow" v-if="adding" @keydown="onKey">
      <input ref="addEl" v-model="addText" :placeholder="`输入内容，回车添加`" @keyup.enter="submitAdd" @keyup.esc="adding = false" />
      <button class="mini danger" @click="adding = false; addText = ''"><AppIcon name="x" :size="12" /></button>
    </div>
  </section>
</template>

<style scoped>
.card { background: var(--panel); border-radius: var(--radius); box-shadow: var(--shadow-card); padding: 16px 18px; min-height: 128px; }
.cardhead { display: flex; justify-content: space-between; align-items: center; margin-bottom: 11px; }
h3 { font-size: 13px; margin: 0; color: var(--text-2); font-weight: 600; letter-spacing: -.01em; display: flex; align-items: center; gap: 7px; }
h3 .ico { color: var(--text-3); }
h3.tone-green .ico { color: var(--green); }
h3.tone-blue .ico { color: var(--accent); }
h3.tone-red .ico { color: var(--red); }
h3.tone-indigo .ico { color: var(--indigo); }
.list { list-style: none; margin: 0; padding: 0; position: relative; }
.row { display: flex; align-items: flex-start; gap: 8px; padding: 4px 0; font-size: 13px; line-height: 1.65; }
.txt { flex: 1; word-break: break-word; }
.ops { opacity: 0; transition: opacity .15s var(--ease); }
.row:hover .ops { opacity: 1; }
.inl { flex: 1; border: 1px solid rgba(0, 113, 227, .55); border-radius: 9px; padding: 3px 9px; font-size: 13px; outline: none; background: rgba(255, 255, 255, .85); box-shadow: 0 0 0 3px rgba(0, 113, 227, .13); }
.addbtn { border: 1px solid rgba(11, 18, 32, .12); color: var(--text-3); background: rgba(255, 255, 255, .4); border-radius: 980px; width: 23px; height: 23px; display: grid; place-items: center; cursor: pointer; transition: all .16s var(--spring); }
.addbtn .ico { vertical-align: 0; }
.addbtn:hover { color: var(--accent); border-color: rgba(0, 113, 227, .5); background: rgba(255, 255, 255, .8); transform: scale(1.08); }
.addrow { display: flex; gap: 6px; margin-top: 8px; align-items: center; }
.addrow input { flex: 1; border: 1px solid #dcdce1; border-radius: 8px; padding: 6px 9px; font-size: 12.5px; outline: none; }
.addrow input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(0, 113, 227, .12); }
.empty { color: var(--text-3); font-size: 12.5px; margin: 4px 0; }
.rows-enter-active { transition: all .24s var(--ease); }
.rows-leave-active { transition: all .16s ease-in; }
.rows-enter-from { opacity: 0; transform: translateY(5px); }
.rows-leave-to { opacity: 0; }
.rows-move { transition: transform .24s var(--ease); }
</style>
