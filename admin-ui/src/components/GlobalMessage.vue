<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import { CircleAlert, CircleCheck, X } from 'lucide-vue-next'
import { useToast } from '../composables/toast'

const { message, isError, visible, dismiss } = useToast()
const position = ref<CSSProperties>({})
let viewport: VisualViewport | null = null

// 手机缩放和键盘会改变可见视口，固定定位需跟随该区域，而不是布局视口。
function updatePosition() {
  const width = viewport?.width ?? window.innerWidth
  const height = viewport?.height ?? window.innerHeight
  position.value = {
    top: `calc(${viewport?.offsetTop ?? 0}px + max(16px, env(safe-area-inset-top, 0px)))`,
    left: `${(viewport?.offsetLeft ?? 0) + width / 2}px`,
    maxWidth: `${Math.max(0, Math.min(560, width - 32))}px`,
    maxHeight: `${Math.max(0, height - 48)}px`,
  }
}

onMounted(() => {
  viewport = window.visualViewport
  updatePosition()
  viewport?.addEventListener('scroll', updatePosition)
  viewport?.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', updatePosition, { passive: true })
  window.addEventListener('resize', updatePosition)
})
watch(visible, shown => { if (shown) updatePosition() })
onBeforeUnmount(() => {
  viewport?.removeEventListener('scroll', updatePosition)
  viewport?.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition)
  window.removeEventListener('resize', updatePosition)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="cp-message">
      <div v-if="visible" class="cp-message" :style="position" :class="{ 'is-error': isError }" :role="isError ? 'alert' : 'status'">
        <CircleAlert v-if="isError" :size="18" aria-hidden="true" />
        <CircleCheck v-else :size="18" aria-hidden="true" />
        <span>{{ message }}</span>
        <button type="button" class="cp-message-close" aria-label="关闭提示" @click="dismiss">
          <X :size="16" aria-hidden="true" />
        </button>
      </div>
    </Transition>
  </Teleport>
</template>
