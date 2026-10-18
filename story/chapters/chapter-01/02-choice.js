/* ============================================================
   第 1 章 · 选择
   文件路径：story/chapters/chapter-01/02-choice.js
   只编辑 String.raw`...` 中的内容。
   ============================================================ */

window.STORY_SCRIPTS = window.STORY_SCRIPTS || [];
window.STORY_SCRIPTS.push({
  file: document.currentScript
    ? document.currentScript.src.split("/").slice(-3).join("/")
    : "story/chapters/chapter-01/02-choice.js",
  source: String.raw`

# ─────────────────────────────────────────────
# 选择
# ─────────────────────────────────────────────
@node choice_01
chapter: 1
location: 场景地点
detail: SCENE 02 / CHOICE
time: 00:00
backdrop: neutral
speaker:
focus: protagonist

> 这里是选择节点占位。
> 下方是可自由替换的选项示例。

+ 选项 A：消耗生命与法力，换取金币
  detail: 演示 hp / mp / gold 的属性变化。
  tone: 示例
  toneColor: #355e4d
  fx: highlight
  next: chapter_end
  stats: hp -8, mp -6, gold +25
  relation: character_a +1
  flags: example_flag

+ 选项 B：小幅消耗生命，恢复法力
  detail: 演示不同方向的属性变化。
  tone: 示例
  toneColor: #8a6750
  fx: drop
  next: chapter_end
  stats: hp -3, mp +4, gold +12
  relation: character_b +1

+ 条件选项示例
  detail: 需要人物关系与当前生命值都满足条件。
  tone: 条件
  toneColor: #9e756a
  fx: shake,highlight
  next: chapter_end
  when: relationship character_a >= 1, stat hp >= 20
  lock: 示例条件：角色 A 关系 ≥ 1，且生命 ≥ 20
  stats: hp -16, mp -12, gold +40
  relation: character_a +1, character_b -1
  flags: example_flag

`
});
