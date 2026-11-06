<script setup>
import { reactive, ref, watch } from 'vue';
import { createProject, updateProject, deleteProject } from '../store/workspace';
import { ui, closeModal, toast, askConfirm } from '../store/ui';

const STATUSES = ['进行中', '等待处理', '已完成', '已暂停'];
const form = reactive({ name: '', goal: '', status: '进行中' });
const isEdit = ref(false);

watch(() => [ui.modal, ui.projectDraft], () => {
  if (ui.modal === 'project-new' || ui.modal === 'project-edit') {
    const d = ui.projectDraft || {};
    isEdit.value = ui.modal === 'project-edit';
    form.name = d.name || '';
    form.goal = d.goal || '';
    form.status = d.status || '进行中';
  }
}, { immediate: true });

function save() {
  const name = form.name.trim();
  if (!name) return toast('请填写项目名称', 'warn');
  if (isEdit.value && ui.projectDraft?.id) {
    updateProject(ui.projectDraft.id, { name, goal: form.goal.trim(), status: form.status });
    toast('项目已更新', 'success');
  } else {
    createProject({ name, goal: form.goal.trim() });
  }
  closeModal();
}

function askDelete() {
  const id = ui.projectDraft?.id;
  if (!id) return;
  askConfirm({
    title: '删除项目',
    body: `将永久删除该项目及其全部本地历史（建议先导出备份）。`,
    confirmLabel: '确认删除',
    danger: true,
    onOk: () => { deleteProject(id); toast('项目已删除', 'info'); },
  });
}
</script>

<template>
  <div class="dialog">
    <h2>{{ isEdit ? '编辑项目' : '新建项目' }}</h2>
    <label class="field">项目名称<input v-model="form.name" placeholder="例如：官网改版" autofocus /></label>
    <label class="field">项目目标<input v-model="form.goal" placeholder="这个项目希望达成什么？（一句话即可）" /></label>
    <label class="field" v-if="isEdit">项目状态
      <select v-model="form.status"><option v-for="s in STATUSES" :key="s">{{ s }}</option></select>
    </label>

    <div class="footrow">
      <button class="btn danger" v-if="isEdit" @click="askDelete">删除项目…</button>
      <span v-else></span>
      <div class="right">
        <button class="btn" @click="closeModal()">取消</button>
        <button class="btn primary" @click="save">{{ isEdit ? '保存' : '创建并开始' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.footrow { display: flex; justify-content: space-between; align-items: center; margin-top: 20px; }
.right { display: flex; gap: 8px; }
</style>
