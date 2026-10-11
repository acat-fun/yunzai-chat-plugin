<script setup lang="ts">
import { ref } from 'vue'
import type { ModelConfig, ProtocolId, ProviderConfig, PublicConfig } from '../types'
import { formatTokens, parseTokens } from '../utils/tokens'
import { api } from '../api'
import { discoverDraftModels } from '../utils/discover-models'
import { useToast } from '../composables/toast'
import DiscoverDialog from '../components/DiscoverDialog.vue'
import ModalDialog from '../components/ModalDialog.vue'
import ModelFeatures from '../components/ModelFeatures.vue'

const props = defineProps<{ config: PublicConfig }>()
const emit = defineEmits<{ saved: [PublicConfig] }>()
const { toast } = useToast()

const protocols: Record<ProtocolId, string> = {
  'openai-responses': 'OpenAI Responses',
  'openai-chat-completions': 'OpenAI Chat Completions',
  'anthropic-messages': 'Anthropic Messages',
}

const draft = ref<(ProviderConfig & { _pendingKey?: string }) | null>(null)
const creating = ref(false)
const showDiscover = ref(false)
const discoverLoading = ref(false)
const discovered = ref<Array<{ id: string; displayName: string }>>([])
const confirmDeleteId = ref('')

function cloneProvider(p: ProviderConfig) {
  return JSON.parse(JSON.stringify(p)) as ProviderConfig
}

function emptyProvider(): ProviderConfig {
  return {
    id: '',
    displayName: '',
    enabled: true,
    baseUrl: '',
    protocol: 'openai-chat-completions',
    auth: { mode: 'api-key', configured: false, maskedHint: '' },
    models: [],
  }
}

function editProvider(p: ProviderConfig) {
  if (draft.value && draft.value.id !== p.id) {
    toast('请先保存或取消当前草稿。', true)
    return
  }
  draft.value = draft.value?.id === p.id ? null : cloneProvider(p)
  creating.value = false

}

function cancelEdit() {
  draft.value = null
  creating.value = false

}

function startCreate() {
  if (draft.value) {
    toast('请先保存或取消当前草稿。', true)
    return
  }
  draft.value = emptyProvider()
  creating.value = true

}

function modelContext(m: ModelConfig) {
  return formatTokens(m.contextWindowTokens)
}
function modelOutput(m: ModelConfig) {
  return formatTokens(m.maxOutputTokens)
}

function setModelContext(m: ModelConfig, raw: string) {
  const parsed = parseTokens(raw)
  if (parsed === null) return
  m.contextWindowTokens = parsed
}
function setModelOutput(m: ModelConfig, raw: string) {
  const parsed = parseTokens(raw)
  if (parsed === null) return
  m.maxOutputTokens = parsed
}

function addModel() {
  if (!draft.value) return
  draft.value.models.push({
    id: '',
    displayName: '',
    inputTypes: ['text'],
    open: true,
  })
}

function removeModel(index: number) {
  if (!draft.value) return
  const m = draft.value.models[index]
  if (props.config.defaults.route === `${draft.value.id}|${m.id}` || props.config.defaults.fallbackRoutes.includes(`${draft.value.id}|${m.id}`)) {
    toast('模型正在使用，先移除默认或后备模型引用再删除。', true)
    return
  }
  draft.value.models.splice(index, 1)
}

function toggleInput(m: ModelConfig, type: 'image' | 'file', on: boolean) {
  const set = new Set(m.inputTypes.includes('text') ? m.inputTypes : ['text', ...m.inputTypes])
  set.add('text')
  if (on) set.add(type)
  else set.delete(type)
  m.inputTypes = [...set] as ModelConfig['inputTypes']
}

function validateDraft(): boolean {
  const d = draft.value
  if (!d) return false

  if (!/^[a-z][a-z0-9-]{0,63}$/.test(d.id)) {
    toast('Provider ID 需以小写字母开头，仅含小写字母、数字和连字符。', true)
    return false
  }
  if (creating.value && props.config.providers.some((p) => p.id === d.id)) {
    toast('Provider ID 已存在。', true)
    return false
  }
  if (!d.displayName.trim()) {
    toast('显示名称不能为空。', true)
    return false
  }
  try {
    const u = new URL(d.baseUrl.trim())
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error()
    // 保留路径前缀（如 /v1），去掉末尾多余斜杠
    d.baseUrl = `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}`
  } catch {
    toast('请输入有效的 HTTP(S) API 基础地址。', true)
    return false
  }
  const ids = new Set<string>()
  for (let i = 0; i < d.models.length; i++) {
    const m = d.models[i]
    if (!m.id.trim()) {
      toast(`模型 ${i + 1}：模型 ID 不能为空。`, true)
      return false
    }
    if (ids.has(m.id)) {
      toast(`模型 ${i + 1}：模型 ID 重复。`, true)
      return false
    }
    ids.add(m.id)
    m.displayName = m.displayName.trim() || m.id
    if (!m.inputTypes.includes('text')) m.inputTypes = ['text', ...m.inputTypes]
  }
  return true
}

async function saveDraft() {
  if (!draft.value || !validateDraft()) return
  const nextProviders = props.config.providers.map((p) => cloneProvider(p))
  const pendingKey = draft.value._pendingKey?.trim() || ''
  const cleaned = cloneProvider(draft.value)
  delete (cleaned as { _pendingKey?: string })._pendingKey
  cleaned.models.forEach((m) => {
    delete m.open
  })
  cleaned.auth = {
    mode: cleaned.auth.mode || 'api-key',
    configured: cleaned.auth.configured || Boolean(pendingKey),
    maskedHint: cleaned.auth.maskedHint || '',
    ...(pendingKey ? { replaceSecret: pendingKey } : {}),
  }
  if (creating.value) nextProviders.push(cleaned)
  else {
    const idx = nextProviders.findIndex((p) => p.id === cleaned.id)
    if (idx >= 0) nextProviders[idx] = cleaned
  }
  try {
    const data = await api.putConfig({
      expectedRevision: props.config.revision,
      config: { providers: nextProviders },
    })
    draft.value = null
    creating.value = false
    emit('saved', data)
    toast('提供商配置已保存')
  } catch (e) {
    toast(e instanceof Error ? e.message : '保存失败', true)
  }
}

async function deleteProvider(id: string) {
  if (props.config.defaults.route.startsWith(`${id}|`) || props.config.defaults.fallbackRoutes.some(route => route.startsWith(`${id}|`))) {
    toast('该配置正在被引用，请先修改默认配置。', true)
    confirmDeleteId.value = ''
    return
  }
  const next = props.config.providers.filter((p) => p.id !== id)
  try {
    const data = await api.putConfig({
      expectedRevision: props.config.revision,
      config: { providers: next },
    })
    confirmDeleteId.value = ''
    draft.value = null
    emit('saved', data)
    toast('已删除供应商')
  } catch (e) {
    toast(e instanceof Error ? e.message : '删除失败', true)
  }
}

async function openDiscover() {
  if (!draft.value) return
  showDiscover.value = true
  discoverLoading.value = true

  discovered.value = []
  try {
    const current = draft.value
    const saved = creating.value ? undefined : props.config.providers.find(p => p.id === current.id)
    const key = (current._pendingKey || current.auth.replaceSecret || '').trim()
    const unchanged = saved && !key && saved.baseUrl === current.baseUrl && saved.protocol === current.protocol && saved.auth.mode === current.auth.mode
    const result = unchanged
      ? await api.discover(saved.id)
      : await discoverDraftModels({ baseUrl: current.baseUrl, protocol: current.protocol, apiKey: current.auth.mode === 'api-key' ? key : undefined, needsKey: current.auth.mode === 'api-key' })
    discovered.value = result.models
    if (!result.models.length) toast('供应商返回空模型列表，可手动添加。', true)
  } catch (e) {
    toast(e instanceof Error ? e.message : '获取模型失败', true)
  } finally {
    discoverLoading.value = false
  }
}

function addDiscovered(ids: string[]) {
  if (!draft.value) return
  for (const id of ids) {
    if (draft.value.models.some((m) => m.id === id)) continue
    const found = discovered.value.find((m) => m.id === id)
    draft.value.models.push({
      id,
      displayName: found?.displayName || id,
      inputTypes: ['text'],
      open: false,
    })
  }
  showDiscover.value = false
}
</script>

<template>
  <div>
    <div class="cp-head">
      <div>
        <h2>模型供应商</h2>
        <p class="cp-muted">配置 API 接口与模型目录，让每次对话使用合适的模型。</p>
      </div>
    </div>

    <section
      v-for="p in config.providers"
      :key="p.id"
      class="cp-provider"
    >
      <div class="cp-row cp-between">
        <div class="cp-row">
          <h3>{{ p.displayName }}</h3>
          <span v-if="p.id !== 'deepseek'" class="cp-tag">自定义</span>
          <span class="cp-dot" :style="p.enabled ? '' : 'background:var(--cp-sub)'" />
          <span class="cp-muted">{{ p.enabled ? '已启用' : '已停用' }}</span>
          <span v-if="p.auth.maskedHint" class="cp-code">{{ p.auth.maskedHint }}</span>
          <span v-else class="cp-muted">{{ p.auth.configured ? '已配置密钥' : '未配置密钥' }}</span>
        </div>
        <div class="cp-row">
          <button type="button" class="cp-btn" @click="editProvider(p)">
            {{ draft?.id === p.id && !creating ? '收起' : '编辑' }}
          </button>
          <button
            v-if="draft?.id === p.id && !creating"
            type="button"
            class="cp-btn cp-danger cp-link"
            @click="confirmDeleteId = p.id"
          >
            删除
          </button>
        </div>
      </div>

      <div v-if="draft && draft.id === p.id && !creating" class="cp-form">
        <label class="cp-field">
          <span>API 密钥</span>
          <input
            class="cp-input"
            type="password"
            autocomplete="off"
            :placeholder="draft.auth.configured ? '已配置，输入新值可替换' : '输入 API 密钥'"
            @input="draft._pendingKey = ($event.target as HTMLInputElement).value"
          >
        </label>
        <p v-if="draft.auth.configured && draft.auth.maskedHint" class="cp-note">
          脱敏回显：<code class="cp-code">{{ draft.auth.maskedHint }}</code>
        </p>
        <hr class="cp-divider">
        <details open class="cp-custom">
          <summary>自定义设置</summary>
          <div style="margin-top: 16px">
            <label class="cp-field"><span>显示名称</span><input v-model="draft.displayName" class="cp-input"></label>
            <label class="cp-field"><span>API 地址</span><input v-model="draft.baseUrl" class="cp-input" type="url" placeholder="https://gateway.example/v1"></label>
            <label class="cp-field">
              <span>API 协议</span>
              <select v-model="draft.protocol" class="cp-input">
                <option v-for="(label, key) in protocols" :key="key" :value="key">{{ label }}</option>
              </select>
            </label>
            <label class="cp-toggle"><input v-model="draft.enabled" type="checkbox">启用此提供商</label>
            <hr class="cp-divider">
            <div class="cp-row cp-between">
              <div>
                <h3>模型目录</h3>
                <span class="cp-muted">{{ draft.models.length }} 个模型</span>
              </div>
              <button type="button" class="cp-btn cp-link" :disabled="discoverLoading" @click="openDiscover">{{ discoverLoading ? '正在获取…' : '获取可用模型' }}</button>
            </div>
            <div
              v-for="(m, i) in draft.models"
              :key="i"
              class="cp-model"
            >
              <div class="cp-model-top">
                <input v-model="m.id" class="cp-input" aria-label="模型 ID" placeholder="模型 ID">
                <input v-model="m.displayName" class="cp-input" aria-label="模型显示名称" placeholder="显示名称">
                <button type="button" class="cp-btn cp-link" @click="m.open = !m.open">{{ m.open ? '⌄' : '›' }}</button>
                <button type="button" class="cp-btn cp-danger cp-link" @click="removeModel(i)">×</button>
              </div>
              <div v-show="m.open" class="cp-model-options">
                <ModelFeatures :model="m" />
                <div class="cp-grid">
                  <label class="cp-field">
                    <span>上下文窗口</span>
                    <input
                      class="cp-input"
                      :value="modelContext(m)"
                      placeholder="未知可留空，例如 128K"
                      @change="setModelContext(m, ($event.target as HTMLInputElement).value)"
                    >
                  </label>
                  <label class="cp-field">
                    <span>最大输出 token 数</span>
                    <input
                      class="cp-input"
                      :value="modelOutput(m)"
                      placeholder="例如 8K"
                      @change="setModelOutput(m, ($event.target as HTMLInputElement).value)"
                    >
                  </label>
                </div>
                <span class="cp-muted">输入类型</span>
                <div class="cp-row" style="margin-top: 8px">
                  <label><input type="checkbox" checked disabled> 文本</label>
                  <label>
                    <input
                      type="checkbox"
                      :checked="m.inputTypes.includes('image')"
                      @change="toggleInput(m, 'image', ($event.target as HTMLInputElement).checked)"
                    >
                    图片
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      :checked="m.inputTypes.includes('file')"
                      @change="toggleInput(m, 'file', ($event.target as HTMLInputElement).checked)"
                    >
                    文件
                  </label>
                </div>
              </div>
            </div>
            <button type="button" class="cp-btn" @click="addModel">＋ 添加模型</button>
          </div>
        </details>

        <div class="cp-actions">
          <button type="button" class="cp-btn" @click="cancelEdit">取消</button>
          <button type="button" class="cp-btn cp-primary" @click="saveDraft">保存</button>
        </div>
      </div>
    </section>

    <button type="button" class="cp-add" @click="startCreate">＋ 添加模型供应商</button>

    <ModalDialog v-if="creating && draft" title="添加模型供应商" @close="cancelEdit">
      <label class="cp-field"><span>Provider ID</span><input v-model="draft.id" class="cp-input" placeholder="例如 acme-gateway"></label>
      <label class="cp-field">
        <span>API 密钥</span>
        <input
          class="cp-input"
          type="password"
          autocomplete="off"
          placeholder="输入 API 密钥"
          @input="draft._pendingKey = ($event.target as HTMLInputElement).value"
        >
      </label>
      <hr class="cp-divider">
      <label class="cp-field"><span>显示名称</span><input v-model="draft.displayName" class="cp-input"></label>
      <label class="cp-field"><span>API 地址</span><input v-model="draft.baseUrl" class="cp-input" placeholder="https://gateway.example/v1"></label>
      <label class="cp-field">
        <span>API 协议</span>
        <select v-model="draft.protocol" class="cp-input">
          <option v-for="(label, key) in protocols" :key="key" :value="key">{{ label }}</option>
        </select>
      </label>
      <label class="cp-toggle"><input v-model="draft.enabled" type="checkbox">启用此提供商</label>
      <hr class="cp-divider">
      <div class="cp-row cp-between">
        <div><h3>模型目录</h3><span class="cp-muted">{{ draft.models.length }} 个模型</span></div>
        <button type="button" class="cp-btn cp-link" :disabled="discoverLoading" @click="openDiscover">{{ discoverLoading ? '正在获取…' : '获取可用模型' }}</button>
      </div>
      <div v-for="(m, i) in draft.models" :key="i" class="cp-model">
        <div class="cp-model-top">
          <input v-model="m.id" class="cp-input" placeholder="模型 ID">
          <input v-model="m.displayName" class="cp-input" placeholder="显示名称">
          <button type="button" class="cp-btn cp-link" @click="m.open = !m.open">{{ m.open ? '⌄' : '›' }}</button>
          <button type="button" class="cp-btn cp-danger cp-link" @click="removeModel(i)">×</button>
        </div>
              <div v-show="m.open" class="cp-model-options">
                <ModelFeatures :model="m" />
                <div class="cp-grid">
                  <label class="cp-field">
                    <span>上下文窗口</span>
                    <input
                      class="cp-input"
                      :value="modelContext(m)"
                      placeholder="未知可留空，例如 128K"
                      @change="setModelContext(m, ($event.target as HTMLInputElement).value)"
                    >
                  </label>
                  <label class="cp-field">
                    <span>最大输出 token 数</span>
                    <input
                      class="cp-input"
                      :value="modelOutput(m)"
                      placeholder="例如 8K"
                      @change="setModelOutput(m, ($event.target as HTMLInputElement).value)"
                    >
                  </label>
                </div>
                <span class="cp-muted">输入类型</span>
                <div class="cp-row" style="margin-top: 8px">
                  <label><input type="checkbox" checked disabled> 文本</label>
                  <label>
                    <input
                      type="checkbox"
                      :checked="m.inputTypes.includes('image')"
                      @change="toggleInput(m, 'image', ($event.target as HTMLInputElement).checked)"
                    >
                    图片
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      :checked="m.inputTypes.includes('file')"
                      @change="toggleInput(m, 'file', ($event.target as HTMLInputElement).checked)"
                    >
                    文件
                  </label>
                </div>
              </div>
      </div>
      <button type="button" class="cp-btn" style="margin-top: 8px" @click="addModel">＋ 添加模型</button>

      <template #footer>
        <button type="button" class="cp-btn" @click="cancelEdit">取消</button>
        <button type="button" class="cp-btn cp-primary" @click="saveDraft">创建提供商</button>
      </template>
    </ModalDialog>

    <DiscoverDialog
      v-if="showDiscover && draft"
      :models="discovered"
      :existing-ids="draft.models.map((m) => m.id)"
      :loading="discoverLoading"

      @close="showDiscover = false"
      @add="addDiscovered"
    />

    <ModalDialog v-if="confirmDeleteId" title="确认删除" @close="confirmDeleteId = ''">
      <p>删除 {{ confirmDeleteId }}？</p>
      <template #footer>
        <button type="button" class="cp-btn" @click="confirmDeleteId = ''">取消</button>
        <button type="button" class="cp-btn cp-danger" @click="deleteProvider(confirmDeleteId)">确认删除</button>
      </template>
    </ModalDialog>
  </div>
</template>
