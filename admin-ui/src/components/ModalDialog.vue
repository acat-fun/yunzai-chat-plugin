<script setup lang="ts">
defineProps<{ title: string }>()
defineEmits<{ close: [] }>()
</script>

<template>
  <div class="cp-overlay" @click.self="$emit('close')">
    <section class="cp-dialog" role="dialog" aria-modal="true">
      <header class="cp-dialog-head">
        <h3>{{ title }}</h3>
        <button type="button" class="cp-btn cp-link" aria-label="关闭弹窗" @click="$emit('close')">×</button>
      </header>
      <div class="cp-dialog-body">
        <slot />
      </div>
      <footer v-if="$slots.footer" class="cp-dialog-footer">
        <slot name="footer" />
      </footer>
    </section>
  </div>
</template>
