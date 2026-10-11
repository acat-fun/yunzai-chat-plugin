<script setup lang="ts">
import { ref } from 'vue'
import { api } from '../api'
import { useToast } from '../composables/toast'

const emit = defineEmits<{ success: [] }>()
const password = ref('')
const { toast } = useToast()
const loading = ref(false)
const requesting = ref(false)
async function requestCode() {
  requesting.value = true
  try {
    await api.requestCode()
    toast('64 位动态密码已发送到机器人控制台，5 分钟有效')
  } catch (e) { toast(e instanceof Error ? e.message : '获取失败', true) }
  finally { requesting.value = false }
}

async function submit() {
  loading.value = true

  try {
    await api.login(password.value)
    password.value = ''
    emit('success')
  } catch (e) {
    toast(e instanceof Error ? e.message : '登录失败', true)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="cp">
    <div class="cp-login">
      <div class="cp-row" style="margin-bottom: 18px">
        <span class="cp-logo">c</span>
        <strong>chat-plugin</strong>
        <span class="cp-tag">管理面板</span>
      </div>
      <label class="cp-field">
        <span>登录验证码</span>
        <input
          v-model="password"
          class="cp-input"
          type="password"
          autocomplete="one-time-code"
          placeholder="输入 QQ 六位验证码或控制台 64 位动态密码" maxlength="64"
          @keydown.enter="submit"
        >
      </label>

      <p class="cp-muted">主人私聊机器人发送 #chat登录 获取六位验证码；也可点击下方按钮，将动态密码输出到机器人控制台。</p>
      <div class="cp-actions">
        <button type="button" class="cp-btn" :disabled="requesting" @click="requestCode">获取验证码</button>
        <button type="button" class="cp-btn cp-primary" :disabled="loading" @click="submit">登录</button>
      </div>
    </div>
  </div>
</template>
