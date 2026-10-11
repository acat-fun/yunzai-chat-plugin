<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { BasicTab, DefaultsConfig, PolicyConfig, PromptConfig, PublicConfig } from '../types'
import { api } from '../api'
import { useToast } from '../composables/toast'
import ModalDialog from '../components/ModalDialog.vue'

const props = defineProps<{ config: PublicConfig }>()
const emit = defineEmits<{ saved: [PublicConfig] }>()
const { toast } = useToast()

const tab = ref<BasicTab>('defaults')
const defaults = reactive<DefaultsConfig>({ ...props.config.defaults, fallbackRoutes: [...props.config.defaults.fallbackRoutes] })

watch(
  () => props.config.defaults,
  (v) => Object.assign(defaults, { ...v, fallbackRoutes: [...v.fallbackRoutes] }),
  { deep: true },
)

const routeOptions = computed(() =>
  props.config.providers
    .filter((p) => p.enabled)
    .flatMap((p) =>
      p.models.map((m) => ({
        value: `${p.id}|${m.id}`,
        label: `${p.displayName} / ${m.displayName || m.id}`,
      })),
    ),
)

function addFallback() {
  const next = routeOptions.value.find(opt => opt.value !== defaults.route && !defaults.fallbackRoutes.includes(opt.value))
  if (next && defaults.fallbackRoutes.length < 10) defaults.fallbackRoutes.push(next.value)
}
function moveFallback(index: number) {
  if (index < 1) return
  const routes = defaults.fallbackRoutes
  ;[routes[index - 1], routes[index]] = [routes[index], routes[index - 1]]
}

const promptOptions = computed(() =>
  props.config.prompts.filter((p) => p.enabled).map((p) => ({ value: p.id, label: p.name })),
)

/** 策略可覆盖字段，与原型顺序一致 */
const overrideFields = [
  { key: 'prompt', label: '提示词', type: 'prompt' },
  { key: 'regex', label: '正则触发', type: 'text' },
  { key: 'alwaysPrivate', label: '私聊始终回复', type: 'bool' },
  { key: 'reasoning', label: '思考强度', type: 'reasoning' },
  { key: 'replyImages', label: '回复图片', type: 'bool' },
  { key: 'replyFiles', label: '回复文件', type: 'bool' },
  { key: 'contextCount', label: '上下文条数', type: 'number' },
  { key: 'contextAgeMinutes', label: '历史时限（分钟）', type: 'number' },
  { key: 'groupRandom', label: '群随机回复', type: 'bool' },
  { key: 'replyProbability', label: '回复概率（%）', type: 'number' },
] as const

type OverrideKey = (typeof overrideFields)[number]['key']

const promptDialog = ref<PromptConfig | null>(null)
const promptCreating = ref(false)
const policyDialog = ref<PolicyConfig | null>(null)
const policyCreating = ref(false)
const overrideOn = reactive<Record<OverrideKey, boolean>>({
  prompt: false,
  regex: false,
  alwaysPrivate: false,
  reasoning: false,
  replyImages: false,
  replyFiles: false,
  contextCount: false,
  contextAgeMinutes: false,
  groupRandom: false,
  replyProbability: false,
})
const overrideDraft = reactive<DefaultsConfig>({ ...props.config.defaults, fallbackRoutes: [...props.config.defaults.fallbackRoutes] })
const deleteTarget = ref<{ kind: 'prompt' | 'policy'; id: string } | null>(null)

async function saveDefaults() {

  if (defaults.contextCount < 0 || defaults.contextCount > 200 || defaults.contextAgeMinutes < 0 || defaults.contextAgeMinutes > 10080) {
    toast('上下文条数需为 0–200，时限需为 0–10080 分钟。', true)
    return
  }
  if (defaults.replyProbability < 0 || defaults.replyProbability > 100) {
    toast('回复概率需为 0–100%。', true)
    return
  }
  try {
    if (defaults.regex) new RegExp(defaults.regex)
  } catch {
    toast('正则表达式无效，请检查。', true)
    return
  }
  try {
    const data = await api.putConfig({
      expectedRevision: props.config.revision,
      config: { defaults: { ...defaults } },
    })
    emit('saved', data)
    toast('默认配置已保存')
  } catch (e) {
    toast(e instanceof Error ? e.message : '保存失败', true)
  }
}

function openPrompt(p?: PromptConfig) {
  promptCreating.value = !p
  promptDialog.value = p
    ? { ...p }
    : { id: '', name: '', content: '', enabled: true }

}

async function savePrompt() {
  const p = promptDialog.value
  if (!p) return
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(p.id) || !p.name.trim() || !p.content.trim()) {
    toast('请填写合法 ID、显示名称和提示词正文。', true)
    return
  }
  const prompts = props.config.prompts.map((x) => ({ ...x }))
  if (promptCreating.value) {
    if (prompts.some((x) => x.id === p.id)) {
      toast('提示词 ID 已存在。', true)
      return
    }
    prompts.push({ ...p })
  } else {
    const idx = prompts.findIndex((x) => x.id === p.id)
    if (idx >= 0) prompts[idx] = { ...p }
  }
  try {
    const data = await api.putConfig({
      expectedRevision: props.config.revision,
      config: { prompts },
    })
    promptDialog.value = null
    emit('saved', data)
    toast('提示词已保存')
  } catch (e) {
    toast(e instanceof Error ? e.message : '保存失败', true)
  }
}

function openPolicy(p?: PolicyConfig) {
  policyCreating.value = !p
  const base = p
    ? (JSON.parse(JSON.stringify(p)) as PolicyConfig)
    : {
        id: '',
        name: '',
        enabled: true,
        priority: 100,
        bindUsers: [],
        whitelistUsers: [],
        blacklistUsers: [],
        kind: 'all' as const,
        groupIds: [],
        overrides: {},
      }
  policyDialog.value = base
  Object.assign(overrideDraft, props.config.defaults, base.overrides)
  for (const field of overrideFields) {
    overrideOn[field.key] = Object.prototype.hasOwnProperty.call(base.overrides, field.key)
  }

}

function listText(arr: string[]) {
  return arr.join(',')
}
function parseList(text: string) {
  return text.split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean)
}

async function savePolicy() {
  const p = policyDialog.value
  if (!p) return
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(p.id) || !p.name.trim()) {
    toast('请填写合法策略 ID 与显示名称。', true)
    return
  }
  const overrides: Partial<DefaultsConfig> = {}
  for (const field of overrideFields) {
    if (!overrideOn[field.key]) continue
    const value = overrideDraft[field.key]
    ;(overrides as Record<string, unknown>)[field.key] = value
  }
  if (overrides.replyProbability !== undefined) {
    const n = Number(overrides.replyProbability)
    if (n < 0 || n > 100) {
      toast('回复概率需为 0–100%。', true)
      return
    }
  }
  p.overrides = overrides

  const policies = props.config.policies.map((x) => JSON.parse(JSON.stringify(x)) as PolicyConfig)
  if (policyCreating.value) {
    if (policies.some((x) => x.id === p.id)) {
      toast('策略 ID 已存在。', true)
      return
    }
    policies.push(p)
  } else {
    const idx = policies.findIndex((x) => x.id === p.id)
    if (idx >= 0) policies[idx] = p
  }
  try {
    const data = await api.putConfig({
      expectedRevision: props.config.revision,
      config: { policies },
    })
    policyDialog.value = null
    emit('saved', data)
    toast('用户策略已保存')
  } catch (e) {
    toast(e instanceof Error ? e.message : '保存失败', true)
  }
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  try {
    if (deleteTarget.value.kind === 'prompt') {
      if (
        props.config.defaults.prompt === deleteTarget.value.id ||
        props.config.policies.some((p) => p.overrides.prompt === deleteTarget.value!.id)
      ) {
        toast('该配置正在被引用，请先修改默认配置或策略。', true)
        deleteTarget.value = null
        return
      }
      const data = await api.putConfig({
        expectedRevision: props.config.revision,
        config: { prompts: props.config.prompts.filter((p) => p.id !== deleteTarget.value!.id) },
      })
      emit('saved', data)
    } else {
      const data = await api.putConfig({
        expectedRevision: props.config.revision,
        config: { policies: props.config.policies.filter((p) => p.id !== deleteTarget.value!.id) },
      })
      emit('saved', data)
    }
    toast('已删除')
  } catch (e) {
    toast(e instanceof Error ? e.message : '删除失败', true)
  } finally {
    deleteTarget.value = null
  }
}
</script>

<template>
  <div>
    <div class="cp-head">
      <div>
        <h2>基本配置</h2>
        <p class="cp-muted">配置默认行为，也可以按用户独立覆盖。</p>
      </div>
    </div>

    <div class="cp-tabs" role="tablist" aria-label="基本配置分类">
      <button class="cp-subtab" :aria-selected="tab === 'defaults'" @click="tab = 'defaults'">默认配置</button>
      <button class="cp-subtab" :aria-selected="tab === 'prompts'" @click="tab = 'prompts'">提示词</button>
      <button class="cp-subtab" :aria-selected="tab === 'policies'" @click="tab = 'policies'">用户策略</button>
    </div>

    <form v-if="tab === 'defaults'" @submit.prevent="saveDefaults">
      <div class="cp-section cp-settings">
        <div><h3>模型与提示词</h3><p class="cp-muted">默认对话配置</p></div>
        <div>
          <label class="cp-field">
            <span>默认模型</span>
            <select v-model="defaults.route" class="cp-input">
              <option v-for="opt in routeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </label>
          <div class="cp-field">
            <span>余额不足时切换的后备模型（按顺序）</span>
            <div v-for="(_, index) in defaults.fallbackRoutes" :key="index" style="display:flex;gap:8px;margin-top:8px">
              <select v-model="defaults.fallbackRoutes[index]" class="cp-input" style="flex:1;min-width:0" aria-label="后备模型">
                <option v-for="opt in routeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
              <button type="button" class="cp-btn" :disabled="index === 0" @click="moveFallback(index)">上移</button>
              <button type="button" class="cp-btn" @click="defaults.fallbackRoutes.splice(index, 1)">移除</button>
            </div>
            <button type="button" class="cp-btn" :disabled="defaults.fallbackRoutes.length >= 10 || !routeOptions.some(opt => opt.value !== defaults.route && !defaults.fallbackRoutes.includes(opt.value))" @click="addFallback">＋ 添加后备模型</button>
            <small class="cp-muted">仅余额/额度不足时切换；跳过同一账户及不支持当前图片、联网能力的模型。</small>
          </div>
          <label class="cp-field">
            <span>默认提示词</span>
            <select v-model="defaults.prompt" class="cp-input">
              <option v-for="opt in promptOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </label>
        </div>
      </div>
      <div class="cp-section cp-settings">
        <div><h3>回复触发</h3><p class="cp-muted">匹配任一关键词规则</p></div>
        <div>
          <label class="cp-field"><span>正则表达式</span><input v-model="defaults.regex" class="cp-input"></label>
          <label class="cp-toggle"><input v-model="defaults.alwaysPrivate" type="checkbox">私聊始终回复</label>
          <p class="cp-note">关闭后，私聊需匹配触发规则或显式对话。</p>
        </div>
      </div>
      <div class="cp-section cp-settings">
        <div><h3>模型思考</h3><p class="cp-muted">由模型支持能力决定</p></div>
        <div>
          <label class="cp-field">
            <span>思考强度</span>
            <select v-model="defaults.reasoning" class="cp-input">
              <option value="auto">自动 · 使用模型默认</option>
              <option value="off">关闭</option>
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
              <option value="max">最高</option>
            </select>
          </label>
        </div>
      </div>
      <div class="cp-section cp-settings">
        <div><h3>图片与文件</h3><p class="cp-muted">理解输入，生成文本回复</p></div>
        <div class="cp-row">
          <label class="cp-toggle"><input v-model="defaults.replyImages" type="checkbox">回复图片</label>
          <label class="cp-toggle"><input v-model="defaults.replyFiles" type="checkbox">回复文件</label>
        </div>
      </div>
      <div class="cp-section cp-settings">
        <div><h3>上下文窗口</h3><p class="cp-muted">数量与时间同时限制</p></div>
        <div class="cp-grid">
          <label class="cp-field"><span>历史消息条数</span><input v-model.number="defaults.contextCount" class="cp-input" type="number" min="0" max="200"></label>
          <label class="cp-field"><span>最大年龄（分钟）</span><input v-model.number="defaults.contextAgeMinutes" class="cp-input" type="number" min="0" max="10080"></label>
        </div>
      </div>
      <div class="cp-section cp-settings">
        <div><h3>群随机回复</h3><p class="cp-muted">其他触发未命中时接话</p></div>
        <div class="cp-row" style="align-items: center; gap: 16px">
          <label class="cp-toggle"><input v-model="defaults.groupRandom" type="checkbox">开启群随机回复</label>
          <label class="cp-row" style="gap: 8px; margin: 0">
            <span class="cp-muted">回复概率</span>
            <input
              v-model.number="defaults.replyProbability"
              class="cp-input"
              type="number"
              min="0"
              max="100"
              style="width: 88px"
            >
            <span class="cp-muted">%</span>
          </label>
        </div>
      </div>

      <div class="cp-actions">
        <button type="submit" class="cp-btn cp-primary">保存默认配置</button>
      </div>
    </form>

    <div v-else-if="tab === 'prompts'">
      <div v-for="p in config.prompts" :key="p.id" class="cp-entity">
        <div class="cp-row cp-between">
          <div>
            <h3>
              {{ p.name }}
              <span v-if="config.defaults.prompt === p.id" class="cp-pill">默认</span>
            </h3>
            <span class="cp-muted">{{ p.id }} · {{ p.enabled ? '已启用' : '已停用' }}</span>
          </div>
          <div class="cp-row">
            <button type="button" class="cp-btn" @click="openPrompt(p)">编辑</button>
            <button type="button" class="cp-btn cp-danger cp-link" @click="deleteTarget = { kind: 'prompt', id: p.id }">删除</button>
          </div>
        </div>
        <p class="cp-muted">{{ p.content.slice(0, 85) }}</p>
      </div>
      <div class="cp-actions">
        <button type="button" class="cp-btn cp-primary" @click="openPrompt()">＋ 新增提示词</button>
      </div>
    </div>

    <div v-else>
      <div v-for="p in config.policies" :key="p.id" class="cp-entity">
        <div class="cp-row cp-between">
          <div>
            <h3>{{ p.name }} <span class="cp-pill">优先级 {{ p.priority }}</span></h3>
            <p class="cp-muted">
              {{ p.enabled ? '已启用' : '已停用' }} ·
              {{ p.kind === 'private' ? '私聊' : p.kind === 'group' ? '群聊' : '私聊与群聊' }}
            </p>
          </div>
          <div class="cp-row">
            <button type="button" class="cp-btn" @click="openPolicy(p)">编辑</button>
            <button type="button" class="cp-btn cp-danger cp-link" @click="deleteTarget = { kind: 'policy', id: p.id }">删除</button>
          </div>
        </div>
        <div class="cp-row">
          <span v-for="id in p.bindUsers" :key="id" class="cp-pill">用户 {{ id }}</span>
          <span v-if="!p.bindUsers.length" class="cp-muted">所有符合筛选条件的用户</span>
          <span class="cp-muted">覆盖 {{ Object.keys(p.overrides || {}).length }} 项配置</span>
        </div>
      </div>
      <div class="cp-actions">
        <button type="button" class="cp-btn cp-primary" @click="openPolicy()">＋ 新增策略</button>
      </div>
      <p class="cp-note">同一用户可以匹配多条策略；高优先级覆盖，未设置的字段继承默认。</p>
    </div>

    <ModalDialog v-if="promptDialog" :title="promptCreating ? '新增提示词' : '编辑提示词'" @close="promptDialog = null">
      <label class="cp-field"><span>提示词 ID</span><input v-model="promptDialog.id" class="cp-input" :disabled="!promptCreating"></label>
      <label class="cp-field"><span>显示名称</span><input v-model="promptDialog.name" class="cp-input"></label>
      <label class="cp-field"><span>提示词正文</span><textarea v-model="promptDialog.content" class="cp-input" rows="6" /></label>
      <label class="cp-toggle"><input v-model="promptDialog.enabled" type="checkbox">启用提示词</label>

      <template #footer>
        <button type="button" class="cp-btn" @click="promptDialog = null">取消</button>
        <button type="button" class="cp-btn cp-primary" @click="savePrompt">保存提示词</button>
      </template>
    </ModalDialog>

    <ModalDialog v-if="policyDialog" :title="policyCreating ? '新增用户策略' : '编辑用户策略'" @close="policyDialog = null">
      <div class="cp-grid">
        <label class="cp-field"><span>策略 ID</span><input v-model="policyDialog.id" class="cp-input" :disabled="!policyCreating"></label>
        <label class="cp-field"><span>显示名称</span><input v-model="policyDialog.name" class="cp-input"></label>
        <label class="cp-field"><span>优先级</span><input v-model.number="policyDialog.priority" class="cp-input" type="number"></label>
        <label class="cp-field">
          <span>会话范围</span>
          <select v-model="policyDialog.kind" class="cp-input">
            <option value="all">私聊与群聊</option>
            <option value="private">仅私聊</option>
            <option value="group">仅群聊</option>
          </select>
        </label>
      </div>
      <label class="cp-toggle"><input v-model="policyDialog.enabled" type="checkbox">启用该策略</label>

      <details open style="margin-top: 18px">
        <summary>适用用户</summary>
        <div style="margin-top: 14px">
          <label class="cp-field">
            <span>绑定用户 ID · 逗号分隔，空表示不限</span>
            <input
              class="cp-input"
              :value="listText(policyDialog.bindUsers)"
              @change="policyDialog.bindUsers = parseList(($event.target as HTMLInputElement).value)"
            >
          </label>
          <div class="cp-grid">
            <label class="cp-field">
              <span>白名单 ID</span>
              <input
                class="cp-input"
                :value="listText(policyDialog.whitelistUsers)"
                @change="policyDialog.whitelistUsers = parseList(($event.target as HTMLInputElement).value)"
              >
            </label>
            <label class="cp-field">
              <span>黑名单 ID · 优先排除</span>
              <input
                class="cp-input"
                :value="listText(policyDialog.blacklistUsers)"
                @change="policyDialog.blacklistUsers = parseList(($event.target as HTMLInputElement).value)"
              >
            </label>
          </div>
          <label class="cp-field">
            <span>适用群 ID · 空表示不限</span>
            <input
              class="cp-input"
              :value="listText(policyDialog.groupIds)"
              @change="policyDialog.groupIds = parseList(($event.target as HTMLInputElement).value)"
            >
          </label>
        </div>
      </details>

      <hr class="cp-divider">
      <details open>
        <summary>字段覆盖</summary>
        <p class="cp-note">未勾选的字段继承默认配置。</p>
        <div
          v-for="field in overrideFields"
          :key="field.key"
          class="cp-grid"
          style="align-items: center; margin: 11px 0"
        >
          <label class="cp-toggle">
            <input v-model="overrideOn[field.key]" type="checkbox">覆盖{{ field.label }}
          </label>
          <div>
            <select
              v-if="field.type === 'prompt'"
              v-model="overrideDraft.prompt"
              class="cp-input"
              :disabled="!overrideOn.prompt"
            >
              <option v-for="opt in promptOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <select
              v-else-if="field.type === 'reasoning'"
              v-model="overrideDraft.reasoning"
              class="cp-input"
              :disabled="!overrideOn.reasoning"
            >
              <option value="auto">自动</option>
              <option value="off">关闭</option>
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
              <option value="max">最高</option>
            </select>
            <select
              v-else-if="field.type === 'bool'"
              class="cp-input"
              :disabled="!overrideOn[field.key]"
              :value="String(overrideDraft[field.key])"
              @change="(overrideDraft as any)[field.key] = ($event.target as HTMLSelectElement).value === 'true'"
            >
              <option value="true">开启</option>
              <option value="false">关闭</option>
            </select>
            <input
              v-else-if="field.type === 'number'"
              v-model.number="(overrideDraft as any)[field.key]"
              class="cp-input"
              type="number"
              :disabled="!overrideOn[field.key]"
            >
            <input
              v-else
              v-model="(overrideDraft as any)[field.key]"
              class="cp-input"
              type="text"
              :disabled="!overrideOn[field.key]"
            >
          </div>
        </div>
      </details>

      <template #footer>
        <button type="button" class="cp-btn" @click="policyDialog = null">取消</button>
        <button type="button" class="cp-btn cp-primary" @click="savePolicy">保存策略</button>
      </template>
    </ModalDialog>

    <ModalDialog v-if="deleteTarget" title="确认删除" @close="deleteTarget = null">
      <p>删除 {{ deleteTarget.id }}？</p>
      <template #footer>
        <button type="button" class="cp-btn" @click="deleteTarget = null">取消</button>
        <button type="button" class="cp-btn cp-danger" @click="confirmDelete">确认删除</button>
      </template>
    </ModalDialog>
  </div>
</template>
