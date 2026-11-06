<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import { store, current, requestAiUpdate, plain } from '../store/workspace';
import { ui, toast } from '../store/ui';
import AppIcon from './AppIcon.vue';

const msg = ref('');
const busy = ref(false);
const status = ref('');
const statusKind = ref('');
const areaEl = ref(null);

const stopWatch = watch(() => ui.quickLogSeq, () => {
  areaEl.value?.focus();
});
onBeforeUnmount(stopWatch);

async function submit() {
  if (busy.value) return;
  const p = current.value;
  if (!p) return toast('请先选择项目', 'warn');
  if (!msg.value.trim()) { status.value = '先写下本次工作进展'; statusKind.value = 'warn'; return; }
  busy.value = true;
  status.value = '正在整理项目记录…';
  statusKind.value = '';
  window.assistant.setPetState('working');
  try {
    const r = await requestAiUpdate(msg.value);
    if (!r.ok) {
      status.value = r.message || '整理失败';
      statusKind.value = 'err';
      window.assistant.setPetState('thinking');
      return;
    }
    window.assistant.setPetState('idle');
    ui.preview = {
      message: msg.value.trim(),
      ai: r.ai,
      errors: r.errors,
      oldState: plain(p.state),
      merged: r.merged,
      diff: r.diff,
      onApplied: () => { msg.value = ''; status.value = '已更新项目记录，历史已保留（可撤销）'; statusKind.value = 'ok'; },
    };
    ui.modal = 'preview';
    status.value = '';
  } catch (e) {
    status.value = '更新失败：' + (e?.message || e);
    statusKind.value = 'err';
    window.assistant.setPetState('thinking');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="composer">
    <textarea
      ref="areaEl"
      v-model="msg"
      placeholder="告诉 KIKO 你刚才做了什么、遇到了什么问题、接下来准备做什么……（Ctrl+Enter 快速整理）"
      @keydown.ctrl.enter.prevent="submit"
      @keydown.meta.enter.prevent="submit"
    ></textarea>
    <div class="foot">
      <span class="hint">AI 整理后先生成预览，你确认才会写入；历史只追加不覆盖</span>
      <button class="btn primary" :disabled="busy" @click="submit">
        <span v-if="busy" class="spin"></span>
        <AppIcon v-else name="sparkle" :size="14" :stroke-w="1.6" />
        {{ busy ? '整理中…' : 'AI 整理并更新' }}
      </button>
    </div>
    <Transition name="fade">
      <p v-if="status" class="status" :class="statusKind">{{ status }}</p>
    </Transition>
  </section>
</template>

<style scoped>
.composer { margin-top: 18px; background: var(--glass-content); border: 1px solid var(--edge); border-radius: 20px; box-shadow: var(--shadow-card); padding: 15px 18px; }
textarea { width: 100%; border: 0; outline: 0; resize: vertical; min-height: 80px; font: inherit; font-size: 13.5px; color: var(--text); background: transparent; line-height: 1.7; }
.foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 8px; }
.hint { font-size: 11px; color: var(--text-3); }
.status { font-size: 12px; color: var(--text-2); margin: 9px 0 0; white-space: pre-wrap; line-height: 1.6; }
.status.err { color: var(--red); }
.status.ok { color: #1d7a4f; }
.status.warn { color: #8a5a00; }
.spin { display: inline-block; width: 11px; height: 11px; border: 2px solid rgba(255, 255, 255, .4); border-top-color: #fff; border-radius: 50%; margin-right: 7px; vertical-align: -1.5px; animation: rot .7s linear infinite; }
@keyframes rot { to { transform: rotate(360deg); } }
.fade-enter-active, .fade-leave-active { transition: opacity .25s var(--ease); }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
