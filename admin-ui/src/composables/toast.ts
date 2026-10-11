import { ref } from 'vue'

const message = ref('')
const isError = ref(false)
const visible = ref(false)
let timer = 0

function dismiss() {
  window.clearTimeout(timer)
  visible.value = false
}

export function useToast() {
  function toast(msg: string, error = false) {
    message.value = msg
    isError.value = error
    visible.value = true
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      visible.value = false
    }, error ? 6000 : 3000)
  }
  return { message, isError, visible, toast, dismiss }
}
