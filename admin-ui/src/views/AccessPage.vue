<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import type { AdminEntry, PublicConfig } from '../types'
import { api } from '../api'
import { useToast } from '../composables/toast'
import ModalDialog from '../components/ModalDialog.vue'

const props = defineProps<{ config: PublicConfig }>()
const emit = defineEmits<{ saved: [PublicConfig] }>()
const { toast } = useToast()

const form = reactive({
  enabled: props.config.plugin.enabled,
  guobaEnabled: props.config.admin.guoba.enabled,
  guobaAuthorized: props.config.admin.guoba.trustHostAdministrators,
  ownerUser: props.config.access.owner.userId,
  ownerName: props.config.access.owner.name || '',
  chatWhitelist: props.config.access.chatWhitelist.join(','),
  chatBlacklist: props.config.access.chatBlacklist.join(','),
})
const admins = ref<AdminEntry[]>(props.config.access.admins.map((a) => ({ ...a })))
const adminDialog = ref<AdminEntry | null>(null)
const adminCreating = ref(false)
const deleteAdminId = ref('')

watch(
  () => props.config,
  (c) => {
    form.enabled = c.plugin.enabled
    form.guobaEnabled = c.admin.guoba.enabled
    form.guobaAuthorized = c.admin.guoba.trustHostAdministrators
    form.ownerUser = c.access.owner.userId
    form.ownerName = c.access.owner.name || ''
    form.chatWhitelist = c.access.chatWhitelist.join(',')
    form.chatBlacklist = c.access.chatBlacklist.join(',')
    admins.value = c.access.admins.map((a) => ({ ...a }))
  },
  { deep: true },
)

function parseList(text: string) {
  return text.split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean)
}

function openAdmin(a?: AdminEntry) {
  adminCreating.value = !a
  adminDialog.value = a
    ? { ...a, groupIds: [...a.groupIds], blacklistUsers: [...a.blacklistUsers] }
    : {
        id: `admin-${Date.now()}`,
        enabled: true,
        userId: '',
        name: '',
        kind: 'all',
        groupIds: [],
        blacklistUsers: [],
      }

}

function saveAdminLocal() {
  const a = adminDialog.value
  if (!a) return
  if (!a.userId.trim() || !a.name.trim()) {
    toast('用户 ID 与名称不能为空。', true)
    return
  }
  if (a.kind === 'group' && !a.groupIds.length) {
    toast('指定群聊需填写群 ID。', true)
    return
  }
  if (a.userId === form.ownerUser) {
    toast('主人不能同时添加为管理员。', true)
    return
  }
  if (adminCreating.value) admins.value.push(a)
  else {
    const idx = admins.value.findIndex((x) => x.id === a.id)
    if (idx >= 0) admins.value[idx] = a
  }
  adminDialog.value = null
}

function toggleAdmin(id: string) {
  const a = admins.value.find((x) => x.id === id)
  if (a) a.enabled = !a.enabled
}

async function saveAll() {

  if (!form.ownerUser.trim() || !form.ownerName.trim()) {
    toast('主人用户 ID 与显示名称不能为空。', true)
    return
  }
  if (admins.value.some((x) => x.enabled && x.userId === form.ownerUser.trim())) {
    toast('主人不能同时是管理员，请先调整管理员列表。', true)
    return
  }
  try {
    const data = await api.putConfig({
      expectedRevision: props.config.revision,
      config: {
        plugin: { enabled: form.enabled },
        admin: { ...props.config.admin, guoba: { enabled: form.guobaEnabled, trustHostAdministrators: form.guobaAuthorized } },
        access: {
          owner: {
            platform: props.config.access.owner.platform || 'qq',
            userId: form.ownerUser.trim(),
            name: form.ownerName.trim(),
          },
          admins: admins.value,
          chatWhitelist: parseList(form.chatWhitelist),
          chatBlacklist: parseList(form.chatBlacklist),
        },
      },
    })
    emit('saved', data)
    toast('权限与启用已保存')
  } catch (e) {
    toast(e instanceof Error ? e.message : '保存失败', true)
  }
}
</script>

<template>
  <div>
    <div class="cp-head">
      <div>
        <h2>权限与启用</h2>
        <p class="cp-muted">配置消息管理角色和聊天使用范围。</p>
      </div>
    </div>

    <div class="cp-section cp-settings">
      <div>
        <h3>全局启用</h3>
        <p class="cp-muted">关闭后停止自动聊天，不影响面板访问与配置命令。</p>
      </div>
      <div>
        <label class="cp-toggle"><input v-model="form.enabled" type="checkbox">启用自动聊天</label>
      </div>
    </div>

    <div class="cp-section cp-settings">
      <div><h3>锅巴管理</h3><p class="cp-muted">允许锅巴及其管理员读取和修改联网配置，保存后立即生效。</p></div>
      <div>
        <label class="cp-toggle"><input v-model="form.guobaEnabled" type="checkbox">启用锅巴入口</label>
        <label class="cp-toggle"><input v-model="form.guobaAuthorized" type="checkbox">授权锅巴管理员</label>
      </div>
    </div>

    <div class="cp-section">
      <h3>主人</h3>
      <p class="cp-muted">全局唯一，可使用全部消息配置命令。</p>
      <div class="cp-grid" style="margin-top: 14px">
        <label class="cp-field"><span>主人用户 ID · QQ</span><input v-model="form.ownerUser" class="cp-input"></label>
        <label class="cp-field"><span>显示名称</span><input v-model="form.ownerName" class="cp-input"></label>
      </div>
    </div>

    <div class="cp-section">
      <div class="cp-row cp-between">
        <h3>管理员</h3>
        <button type="button" class="cp-btn" @click="openAdmin()">＋ 添加管理员</button>
      </div>
      <div v-for="a in admins" :key="a.id" class="cp-entity cp-row cp-between">
        <div>
          <h3>{{ a.name }} <span class="cp-pill">{{ a.userId }}</span></h3>
          <p class="cp-muted">
            QQ · {{ a.kind === 'group' ? `群 ${a.groupIds.join(',')}` : '全部会话' }} ·
            {{ a.enabled ? '已启用' : '已停用' }}
          </p>
        </div>
        <div class="cp-row">
          <button type="button" class="cp-btn" @click="toggleAdmin(a.id)">{{ a.enabled ? '停用' : '启用' }}</button>
          <button type="button" class="cp-btn" @click="openAdmin(a)">编辑</button>
          <button type="button" class="cp-btn cp-danger cp-link" @click="deleteAdminId = a.id">删除</button>
        </div>
      </div>
      <p v-if="!admins.length" class="cp-note">暂无管理员。</p>
    </div>

    <div class="cp-section">
      <h3>聊天使用范围</h3>
      <p class="cp-muted">白名单为空表示不额外限制，黑名单命中始终拒绝。</p>
      <div class="cp-grid" style="margin-top: 16px">
        <label class="cp-field"><span>白名单用户 ID · 逗号分隔</span><input v-model="form.chatWhitelist" class="cp-input"></label>
        <label class="cp-field"><span>黑名单用户 ID · 逗号分隔</span><input v-model="form.chatBlacklist" class="cp-input"></label>
      </div>
    </div>

    <div class="cp-actions">
      <button type="button" class="cp-btn cp-primary" @click="saveAll">保存权限与启用</button>
    </div>

    <ModalDialog v-if="adminDialog" :title="adminCreating ? '添加管理员' : '编辑管理员'" @close="adminDialog = null">
      <label class="cp-field"><span>授权名称</span><input v-model="adminDialog.name" class="cp-input"></label>
      <label class="cp-field"><span>用户 ID · QQ</span><input v-model="adminDialog.userId" class="cp-input"></label>
      <div class="cp-grid">
        <label class="cp-field">
          <span>会话范围</span>
          <select v-model="adminDialog.kind" class="cp-input">
            <option value="all">全部会话</option>
            <option value="private">私聊</option>
            <option value="group">指定群聊</option>
          </select>
        </label>
        <label class="cp-field">
          <span>群 ID · 逗号分隔</span>
          <input
            class="cp-input"
            :value="adminDialog.groupIds.join(',')"
            @change="adminDialog.groupIds = parseList(($event.target as HTMLInputElement).value)"
          >
        </label>
      </div>
      <label class="cp-toggle"><input v-model="adminDialog.enabled" type="checkbox">启用授权</label>

      <template #footer>
        <button type="button" class="cp-btn" @click="adminDialog = null">取消</button>
        <button type="button" class="cp-btn cp-primary" @click="saveAdminLocal">保存授权</button>
      </template>
    </ModalDialog>

    <ModalDialog v-if="deleteAdminId" title="确认删除" @close="deleteAdminId = ''">
      <p>删除该管理员？</p>
      <template #footer>
        <button type="button" class="cp-btn" @click="deleteAdminId = ''">取消</button>
        <button
          type="button"
          class="cp-btn cp-danger"
          @click="admins = admins.filter((a) => a.id !== deleteAdminId); deleteAdminId = ''"
        >
          确认删除
        </button>
      </template>
    </ModalDialog>
  </div>
</template>
