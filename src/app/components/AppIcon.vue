<script setup>
/* 线性图标族（feather/iconify 风格 24 网格路径，与 iconfont.cn 线性库同系）。
 * 随 currentColor 着色；离线内置，无字体文件依赖。 */
import { computed } from 'vue';

const ICONS = {
  plus: ['M12 5v14', 'M5 12h14'],
  x: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
  pencil: ['M16.8 3.9a2.05 2.05 0 0 1 2.9 2.9L8.6 17.9l-4 1 1-4z', 'M14.7 6l3 3'],
  check: ['M5 12.5l4.2 4.2L19 7'],
  'check-circle': ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M8.2 12.3l2.6 2.6 5-5.2'],
  'play-circle': ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M10 8.7v6.6L16.2 12z'],
  'alert-circle': ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M12 7.5V12', 'M12 16.2h.01'],
  'arrow-right': ['M4.5 12h14', 'M13 6l6 6-6 6'],
  overview: ['M4.5 6.5h15', 'M4.5 12h15', 'M4.5 17.5h9'],
  'list-checks': ['M10.5 6.5h9', 'M10.5 12h9', 'M10.5 17.5h9', 'M4 6.4l1.3 1.3L8 4.9', 'M4 11.9l1.3 1.3L8 9.9', 'M4 17.4l1.3 1.3L8 15.4'],
  flag: ['M5.5 21V4', 'M5.5 4.5h12l-2.6 3.2 2.6 3.2h-12'],
  sparkle: ['M12 3.6l2.1 6.3 6.3 2.1-6.3 2.1L12 20.4l-2.1-6.3-6.3-2.1 6.3-2.1z'],
  undo: ['M3.5 9.5a8.5 8.5 0 1 1 2.4 8.1', 'M3.5 4.5v5h5'],
  gear: ['M12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z', 'M19.4 13.9l1.9 1.5-2 3.4-2.3-.9a7.6 7.6 0 0 1-1.8 1l-.4 2.4h-4l-.4-2.4a7.6 7.6 0 0 1-1.8-1l-2.3.9-2-3.4 1.9-1.5a7.7 7.7 0 0 1 0-2.2L2.1 8.8l2-3.4 2.3.9a7.6 7.6 0 0 1 1.8-1L8.6 3h4l.4 2.3a7.6 7.6 0 0 1 1.8 1l2.3-.9 2 3.4-1.9 1.5a7.7 7.7 0 0 1 0 2.2z'],
  minus: ['M5 12h14'],
  square: ['M5.5 5.5h13v13h-13z'],
  pin: ['M9 4h6l-1 5.2 2.6 2.8H6.4L9 9.2z', 'M12 12v7.5'],
  download: ['M12 4v11', 'M7 11.5l5 5 5-5', 'M5 20h14'],
  upload: ['M12 20V9', 'M7 12.5l5-5 5 5', 'M5 4h14'],
  close: ['M6.5 6.5l11 11', 'M17.5 6.5l-11 11'],
  'chevron-down': ['M6.5 9.5l5.5 5.5 5.5-5.5'],
  target: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z', 'M12 11.6h.01'],
  link: ['M8.6 13.4a4.2 4.2 0 0 0 6.2.5l2.9-2.9a4.2 4.2 0 0 0-6-6l-1.6 1.6', 'M15.4 10.6a4.2 4.2 0 0 0-6.2-.5l-2.9 2.9a4.2 4.2 0 0 0 6 6l1.6-1.6'],
};

const props = defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 15 },
  strokeW: { type: [Number, String], default: 1.9 },
});
const paths = computed(() => ICONS[props.name] || []);
</script>

<template>
  <svg class="ico" :width="size" :height="size" viewBox="0 0 24 24" fill="none"
       :stroke-width="strokeW" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-for="(d, i) in paths" :key="i" :d="d" />
  </svg>
</template>

<style scoped>
.ico { display: inline-block; vertical-align: -2px; flex-shrink: 0; }
</style>
