/* ============================================================
   第 1 章 · 章节结束
   文件路径：story/chapters/chapter-01/03-ending.js
   只编辑 String.raw`...` 中的内容。
   ============================================================ */

window.STORY_SCRIPTS = window.STORY_SCRIPTS || [];
window.STORY_SCRIPTS.push({
  file: document.currentScript
    ? document.currentScript.src.split("/").slice(-3).join("/")
    : "story/chapters/chapter-01/03-ending.js",
  source: String.raw`

# ─────────────────────────────────────────────
# 章节结束
# ─────────────────────────────────────────────
@node chapter_end
chapter: 1
location: 场景地点
detail: CHAPTER END / PLACEHOLDER
time: 00:00
backdrop: warm
speaker:
focus: protagonist

> 这里是章节结束占位。
> 替换这段文字，或把它接入你自己的下一章。

@end
kicker: CHAPTER TEMPLATE / COMPLETE
title: 章节结束
summary: 这是一个可删除的章节结束示例。
note: 在 story/chapters/ 中继续编写，或添加 next 进入下一章。
variant: flag example_flag | 你选择了会写入剧情标记的分支。可以在后续场景中继续扩展后果。

`
});
