<script setup>
import { ref, watch } from 'vue';
import { ui } from '../store/ui';

const visible = ref(false);
let timer = null;

watch(() => ui.toast.seq, () => {
  visible.value = true;
  clearTimeout(timer);
  timer = setTimeout(() => { visible.value = false; }, 2600);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="tst">
      <div v-if="visible && ui.toast.text" class="toast" :class="ui.toast.type">{{ ui.toast.text }}</div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.toast {
  position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%);
  background: rgba(24, 32, 54, .78); color: #fff; padding: 10px 18px; border-radius: 980px;
  font-size: 12.5px; max-width: 76%; box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 10px 32px rgba(8, 24, 60, .35);
  border: 1px solid rgba(255, 255, 255, .22);
  backdrop-filter: blur(20px) saturate(1.6); -webkit-backdrop-filter: blur(20px) saturate(1.6); z-index: 99; line-height: 1.5;
}
.toast.success { background: rgba(28, 122, 75, .94); }
.toast.error { background: rgba(180, 35, 24, .94); }
.toast.warn { background: rgba(150, 100, 10, .94); }
.tst-enter-active { transition: all .3s var(--ease); }
.tst-leave-active { transition: all .22s ease-in; }
.tst-enter-from, .tst-leave-to { opacity: 0; transform: translateX(-50%) translateY(12px); }
</style>
