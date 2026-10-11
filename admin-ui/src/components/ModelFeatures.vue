<script setup lang="ts">
import type { ModelConfig } from '../types'
defineProps<{ model: ModelConfig }>()
</script>

<template>
  <div class="cp-row" style="margin-top: 16px; flex-wrap: wrap">
    <label class="cp-toggle" title="模型需支持工具调用；搜索自动复用已保存的 API 配置"><input v-model="model.toolCalling" type="checkbox">联网搜索</label>
    <label class="cp-toggle" title="未设置时沿用供应商默认；点击后显式开启或关闭"><input v-model="model.reasoningEnabled" :indeterminate="model.reasoningEnabled === undefined" type="checkbox">推理</label>
    <select v-if="model.reasoningEnabled" v-model="model.reasoningMode" class="cp-input" aria-label="推理参数模式" style="width: auto">
      <option :value="undefined">协议默认</option>
      <option value="deepseek">DeepSeek 兼容</option>
      <option value="anthropic-adaptive">Messages 自适应</option>
    </select>
  </div>
</template>
