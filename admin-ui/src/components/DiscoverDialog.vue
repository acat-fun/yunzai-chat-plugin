<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ModalDialog from './ModalDialog.vue'

const props = defineProps<{
  models: Array<{ id: string; displayName: string }>
  existingIds: string[]
  loading?: boolean
}>()

const emit = defineEmits<{
  close: []
  add: [ids: string[]]
}>()

const query = ref('')
const selected = ref(new Set<string>())

watch(
  () => props.models,
  () => {
    selected.value = new Set()
  },
)

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return props.models.filter(
    (m) => !q || m.id.toLowerCase().includes(q) || m.displayName.toLowerCase().includes(q),
  )
})

function isAdded(id: string) {
  return props.existingIds.includes(id)
}

function toggle(id: string, checked: boolean) {
  const next = new Set(selected.value)
  if (checked) next.add(id)
  else next.delete(id)
  selected.value = next
}

function selectVisible() {
  const visible = filtered.value.filter((m) => !isAdded(m.id))
  const all = visible.every((m) => selected.value.has(m.id))
  const next = new Set(selected.value)
  for (const m of visible) {
    if (all) next.delete(m.id)
    else next.add(m.id)
  }
  selected.value = next
}
</script>

<template>
  <ModalDialog title="选择要添加的模型" @close="emit('close')">
    <p class="cp-muted">选择后加入编辑草稿，外层保存才写入配置。</p>
    <div class="cp-row" style="margin-top: 18px">
      <label class="cp-field" style="flex: 1; margin: 0">
        <span>搜索模型</span>
        <input v-model="query" class="cp-input" type="text" placeholder="搜索模型 ID">
      </label>
      <button type="button" class="cp-btn" :disabled="loading" @click="selectVisible">全选当前结果</button>
    </div>
    <div :aria-busy="loading">
      <label v-for="m in filtered" :key="m.id" class="cp-model-choice">
        <input
          type="checkbox"
          :disabled="isAdded(m.id)"
          :checked="selected.has(m.id)"
          @change="toggle(m.id, ($event.target as HTMLInputElement).checked)"
        >
        <span>{{ m.id }}</span>
        <span v-if="m.displayName !== m.id" class="cp-muted">{{ m.displayName }}</span>
        <span v-if="isAdded(m.id)" class="cp-pill">已添加</span>
      </label>
      <p v-if="!loading && !filtered.length" class="cp-note">无匹配模型</p>
    </div>
    <template #footer>
      <button type="button" class="cp-btn" @click="emit('close')">取消</button>
      <button
        type="button"
        class="cp-btn cp-primary"
        :disabled="!selected.size"
        @click="emit('add', [...selected])"
      >
        {{ loading ? '正在获取…' : `添加所选（${selected.size}）` }}
      </button>
    </template>
  </ModalDialog>
</template>
