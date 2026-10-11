<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Boxes, ShieldCheck, SlidersHorizontal } from 'lucide-vue-next'
import { api } from './api'
import { useToast } from './composables/toast'
import type { PageId, PublicConfig } from './types'
import LoginView from './views/LoginView.vue'
import ApiPage from './views/ApiPage.vue'
import BasicPage from './views/BasicPage.vue'
import AccessPage from './views/AccessPage.vue'
import GlobalMessage from './components/GlobalMessage.vue'

const authed = ref(false)
const booting = ref(true)
const page = ref<PageId>('api')
const config = ref<PublicConfig | null>(null)
const { toast } = useToast()

async function loadConfig() {
  config.value = await api.getConfig()
}

async function onLogin() {
  try {
    await loadConfig()
    authed.value = true
  } catch (e) {
    toast(e instanceof Error ? e.message : '加载配置失败', true)
  }
}

async function logout() {
  try {
    await api.logout()
    authed.value = false
    config.value = null
  } catch (e) {
    toast(e instanceof Error ? e.message : '退出失败', true)
  }
}

onMounted(async () => {
  try {
    await api.status()
    authed.value = true
    await loadConfig()
  } catch (e) {
    authed.value = false
    if ((e as { status?: number })?.status !== 401) toast(e instanceof Error ? e.message : '加载面板失败', true)
  } finally {
    booting.value = false
  }
})
</script>

<template>
  <GlobalMessage />
  <LoginView v-if="!booting && !authed" @success="onLogin" />

  <div v-else-if="authed && config" class="cp">
    <div class="cp-window">
      <header class="cp-top">
        <div class="cp-brand"><span class="cp-logo">c</span>chat-plugin</div>
        <span class="cp-tag">管理面板</span>
        <div class="cp-row" style="margin-left: auto">
          <button type="button" class="cp-btn" @click="loadConfig().catch((e) => toast(e.message, true))">刷新</button>
          <button type="button" class="cp-btn" @click="logout">退出</button>
        </div>
      </header>
      <div class="cp-layout">
        <nav class="cp-side" aria-label="管理页面">
          <div class="cp-side-label">配置中心</div>
          <button class="cp-nav" :aria-selected="page === 'api'" @click="page = 'api'">
            <Boxes :size="16" aria-hidden="true" />API 配置
          </button>
          <button class="cp-nav" :aria-selected="page === 'basic'" @click="page = 'basic'">
            <SlidersHorizontal :size="16" aria-hidden="true" />基本配置
          </button>
          <button class="cp-nav" :aria-selected="page === 'access'" @click="page = 'access'">
            <ShieldCheck :size="16" aria-hidden="true" />权限与启用
          </button>
          <div class="cp-side-footer">
            <p>消息管理</p>
            <code class="cp-code">#chat帮助</code>
          </div>
        </nav>
        <main class="cp-main">
          <ApiPage v-if="page === 'api'" :config="config" @saved="config = $event" />
          <BasicPage v-else-if="page === 'basic'" :config="config" @saved="config = $event" />
          <AccessPage v-else :config="config" @saved="config = $event" />
        </main>
      </div>
    </div>
  </div>
</template>
