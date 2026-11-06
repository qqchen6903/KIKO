<script setup>
import { ui, closeModal } from '../store/ui';

async function ok() {
  const fn = ui.confirm?.onOk;
  closeModal();
  await fn?.();
}
</script>

<template>
  <div class="dialog" v-if="ui.confirm">
    <h2>{{ ui.confirm.title }}</h2>
    <p class="body">{{ ui.confirm.body }}</p>
    <div class="dialogfoot">
      <button class="btn" @click="closeModal()">取消</button>
      <button class="btn" :class="ui.confirm.danger ? 'danger' : 'primary'" @click="ok">{{ ui.confirm.confirmLabel }}</button>
    </div>
  </div>
</template>

<style scoped>
.body { font-size: 13px; line-height: 1.75; color: var(--text-2); margin: 0; }
.btn.danger { background: var(--red); border-color: var(--red); color: #fff; }
</style>
