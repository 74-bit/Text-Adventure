/* ============================================================
   第 1 章 · 开场
   文件路径：story/chapters/chapter-01/01-opening.js
   只编辑 String.raw`...` 中的内容。
   ============================================================ */

window.STORY_SCRIPTS = window.STORY_SCRIPTS || [];
window.STORY_SCRIPTS.push({
  file: document.currentScript
    ? document.currentScript.src.split("/").slice(-3).join("/")
    : "story/chapters/chapter-01/01-opening.js",
  source: String.raw`

# ─────────────────────────────────────────────
# 开场
# ─────────────────────────────────────────────
@node scene_01
chapter: 1
location: 场景地点
detail: SCENE 01 / PLACEHOLDER
time: 00:00
backdrop: neutral
speaker:
focus: protagonist

> 这里是开场旁白占位。打开 story/chapters/ 中的场景文件，把这段文字替换成你的故事。
> {highlight} 这一整段会带高亮底色；其中的 ==关键词== 还可以单独高亮。
> {shake} 这一行每个字都会持续、缓慢地抖动。
> {drop} 这一行会以逐字掉落的方式出现，像一台老打字机。

next: choice_01

`
});
