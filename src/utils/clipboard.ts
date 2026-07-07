/**
 * clipboard — 剪贴板写入工具
 *
 * 优先使用 navigator.clipboard.writeText（需安全上下文 / HTTPS）。
 * 在本地 HTTP、非安全上下文或权限被拒时，回退到临时 textarea + execCommand，
 * 保证「复制」按钮在开发环境也能工作。
 */

export async function copyToClipboard(text: string): Promise<boolean> {
  // 主路径：现代 API（HTTPS / localhost 等安全上下文）
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 落到 fallback
  }

  // 回退路径：临时 textarea + execCommand
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.top = '-1000px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
