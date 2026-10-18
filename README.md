# 叙事框架 · BRANCHING NARRATIVE

> 第一次使用？先看 **[草履虫级新手指南](新手教程.md)**。这份 README 是完整参考手册。

一个零依赖、数据驱动的分支叙事网页框架。它只提供结构与交互，不预置任何剧情。

剧情正文已经从 JS 对象中拆出，并按“章节目录 → 场景文件”分层保存：

```text
story/chapters/    ← 写剧情、对白、选项、结局
js/config.js       ← 设置人物、属性、章节等世界配置
```

每个章节一个文件夹，每个场景一个独立的剧本文件。节点之间通过 id 连接，不要求写在同一个文件里。

![叙事框架标题页](docs/preview-title.png)

## 已实现功能

- 独立剧本文件与专用剧本语法
- 分支节点、条件选项与多结局
- 人物状态面板：生命、法力、金币、攻击、防御、速度等
- 属性支持实时增减与自动存档
- 人物关系、剧情标记（flags）
- 文字抖动、高亮、逐字掉落等可编辑特效
- 对话回看、章节结束卡片
- 自动存档、标题页续玩
- 响应式布局与键盘操作

![对话与选择界面](docs/preview-choice.png)

## 运行

直接双击 `index.html` 即可运行。

也可以启动本地静态服务器：

```bash
python -m http.server 4173
```

打开 `http://127.0.0.1:4173`。

项目不需要构建，也没有第三方依赖。

> 每个场景文件的外层是一段 JavaScript 注册包装。这是为了让它能在双击 `index.html` 的情况下被浏览器直接读取。你只需要编辑 `String.raw` 反引号里面的剧本内容，不需要理解外层代码。

## 目录

```text
Text-Adventure/
├─ index.html
├─ story/
│  └─ chapters/
│     └─ chapter-01/
│        ├─ 01-opening.js   ★ 开场场景
│        ├─ 02-choice.js    ★ 选择场景
│        └─ 03-ending.js    ★ 章节结束
├─ js/
│  ├─ config.js             世界配置：人物、属性、章节、flags
│  ├─ story-parser.js       剧本语法解析器（不用修改）
│  ├─ app.js                游戏逻辑、存档、状态面板、回看
│  └─ portraits.js          默认人物视觉占位
├─ css/
│  └─ style.css             视觉、配色与特效
├─ docs/                    界面预览图
└─ README.md
```

## 修改入口总览

| 想修改的内容 | 文件 |
| --- | --- |
| 对白、旁白、选项、分支、结局 | `story/chapters/` 下的场景文件 |
| 故事标题、开场节点、章节名 | `js/config.js` |
| 人物名字、初始属性、金币初始值 | `js/config.js` |
| 属性名称、血条最大值、颜色 | `js/config.js` 的 `meta.stats` |
| 界面配色、字体、动效强度 | `css/style.css` |
| 游戏逻辑本身 | `js/app.js`（通常不需要改） |

## 如何新增场景文件

推荐按下面的方式组织：

```text
story/chapters/
├─ chapter-01/
│  ├─ 01-opening.js
│  ├─ 02-choice.js
│  └─ 03-ending.js
└─ chapter-02/
   ├─ 01-arrival.js
   └─ 02-ending.js
```

每个文件只包含一个或多个完整节点。剧本解析器会按文件重置节点上下文，因此不要在 A 文件写 `@node` 的一半，再到 B 文件续写。

新增场景时：

1. 在对应章节目录里新建一个 `.js` 文件。
2. 复制任意现有场景文件的注册包装。
3. 在 `index.html` 的剧本脚本区域增加一行：

```html
<script src="story/chapters/chapter-02/01-arrival.js" defer></script>
```

4. 把该脚本放在 `js/story-parser.js` 之前即可。

文件加载顺序不影响节点连接逻辑，节点之间通过 id 关联。新章节可以沿用任意数量的场景文件。

---

# 剧本语法

每个场景文件使用相同的注册包装：

```js
window.STORY_SCRIPTS = window.STORY_SCRIPTS || [];
window.STORY_SCRIPTS.push({
  file: document.currentScript
    ? document.currentScript.src.split("/").slice(-3).join("/")
    : "chapter-01/01-opening.js",
  source: String.raw`
# 在这里写剧本
`
});
```

`file` 只用于控制台报错时显示文件名；`source` 内部才是剧本正文。

一个文件可以放多个 `@node`，但每个节点都要在同一个文件内完整结束。

## 一个节点的最小结构

```text
@node scene_01
chapter: 1
location: 场景地点
time: 00:00
backdrop: neutral
speaker:
focus: protagonist

> 这是一段旁白。

next: next_node_id
```

- `@node` 开始一个新节点。
- 顶格写 `字段: 值`。
- 以 `>` 开头的行是对话或旁白，一行就是一个段落。
- 空行和以 `#` 开头的整行注释会被忽略。
- `speaker:` 留空表示旁白；也可以填写人物 id。
- `next:` 指向下一个节点 id。

## 节点字段

| 字段 | 说明 |
| --- | --- |
| `chapter` | 章节编号，对应 `js/config.js` 的 `chapters` |
| `location` | 场景地点 |
| `detail` | 地点下方的补充信息 |
| `time` | 场景内时间，例如 `23:40` |
| `backdrop` | 背景样式：`neutral / warm / cool / mono` |
| `speaker` | 说话人物的 id；留空为旁白 |
| `focus` | 舞台右侧显示的人物 id；留空可清空 |
| `textFx` | 整个节点默认的文本特效：`shake / highlight / drop` |
| `next` | 线性推进到的下一个节点 id |

节点可以有 `next`，也可以有若干选项，或者使用 `@end` 结束。不要同时依赖 `next` 和 `choices`。

## 多段文本

```text
> 第一段旁白。
> 第二段旁白，会依次显示。
> 这一句里可以用 ==局部高亮== 和 *斜体强调*。
```

## 文本特效

在段落开头加大括号：

```text
> {highlight} 这一整段会持续高亮。
> {shake} 这一行会逐字持续抖动。
> {drop} 这一行会以逐字掉落的方式出现。
> {shake,highlight} 这一行会同时抖动和高亮。
```

可用值：

| 值 | 效果 |
| --- | --- |
| `shake` | 每个字独立、持续、无停顿地抖动 |
| `highlight` | 持续保留高亮底色，入场时有扫入动画 |
| `drop` | 每个字像打字机一样落下；只播放一次，不循环 |

也可以给整个节点设置默认效果：

```text
@node scene_01
textFx: shake
```

单个段落自己的 `{...}` 会覆盖节点默认设置。

### 行内格式

```text
> 这是普通文字，==这一小段会被单独高亮==，*这一小段会变成强调色斜体*。
```

## 选项

选项以顶格的 `+` 开始，选项的属性必须缩进两个空格：

```text
+ 选项文字
  detail: 选项的补充说明。
  tone: 示例
  toneColor: #355e4d
  fx: highlight
  next: next_node_id
  stats: hp -8, mp -6, gold +25
  relation: character_a +1
  flags: example_flag
```

### 选项字段

| 字段 | 说明 |
| --- | --- |
| `next` | 必填，选择后进入的节点 id |
| `detail` | 选项下方的补充文字 |
| `tone` | 选项类型标签，例如“共情”“风险” |
| `toneColor` | 标签与悬停强调色 |
| `fx` | 选项特效：`shake / highlight / drop`，可组合 |
| `when` | 显示条件；不满足时默认隐藏 |
| `lock` | 填写后，条件不满足时显示为禁用选项，并展示这段文字 |
| `stats` | 选择后增减属性 |
| `relation` | 选择后改变人物关系 |
| `flags` | 选择后写入或清除剧情标记 |

### 选项特效

```text
+ 这个选项会持续高亮
  fx: highlight
  next: next_node

+ 这个选项会逐字抖动，并且高亮
  fx: shake,highlight
  next: next_node

+ 这个选项会以掉落方式出现
  fx: drop
  next: next_node
```

- `shake`、`highlight` 会持续保留。
- `drop` 只在选项入场时播放一次。

## 条件

在选项中使用 `when:`，多个条件用英文逗号分隔：

```text
when: flag example_flag, stat hp >= 20, relationship character_a >= 1
```

支持的写法：

```text
flag 标记名
notflag 标记名
anyflag 标记名
relationship 人物id >= 数字
relationship 人物id <= 数字
stat 属性名 >= 数字
stat 属性名 <= 数字
stat 人物id.属性名 >= 数字
```

例子：

```text
when: flag met_a, notflag betrayed_a, stat hp >= 20, relation character_a >= 1
```

注意条件是 `relationship character_a >= 1`，不是 `relation`。

当条件不满足时：

- 如果填写了 `lock:`，选项会显示为灰色锁定状态。
- 没有 `lock:`，选项会直接隐藏。

```text
+ 只有关系足够时才能选择
  next: next_node
  when: relationship character_a >= 2
  lock: 需要：角色 A 关系 ≥ 2
```

## 属性变化

`stats:` 使用“键 + 增量”的写法：

```text
stats: hp -8, mp -6, gold +25
```

- 不写人物 id 时，普通属性默认作用于主角。
- `gold` 这类共享资源会自动作用于队伍。
- 要修改其他人物，用 `人物id.属性名`：

```text
stats: character_a.hp -10, protagonist.mp -5, shared.gold +30
```

多个变化用英文逗号分隔。

## 关系变化

```text
relation: character_a +1, character_b -1
```

数值范围默认是 `-5 ~ 5`，可在 `js/config.js` 的 `meta.relationship` 中修改。

## 剧情标记

```text
flags: met_a, found_key
```

设置某个标记为 `false`：

```text
flags: met_a=false
```

## 章节结束

在节点中加入 `@end`：

```text
@node chapter_end
chapter: 1
location: 场景地点
time: 00:00
speaker:

> 章节结束前的最后一段话。

@end
kicker: CHAPTER 01 / COMPLETE
title: 章节结束
summary: 默认结束语。
note: 在 story/chapters/ 中继续编写。
variant: flag met_a | 满足条件时使用的结束语。
```

结局字段：

| 字段 | 说明 |
| --- | --- |
| `kicker` | 小标题，例如 `CHAPTER 01 / COMPLETE` |
| `title` | 章节结束标题 |
| `summary` | 默认结束语 |
| `note` | 底部补充文字 |
| `variant` | 条件变体，格式为 `variant: 条件 | 文本` |

可以有多个 `variant`，引擎取第一个满足条件的。条件写法与选项的 `when` 相同。

## 完整示例

```text
# 开场
@node scene_01
chapter: 1
location: 雨港码头
time: 23:40
backdrop: cool
speaker:
focus: protagonist

> 这里的雨像是从另一个世界落下来的。
> {highlight} 你注意到地上的 ==半枚铜币==。
> {shake} 有人正在暗处看着你。

next: choice_01


# 选择
@node choice_01
chapter: 1
location: 雨港码头
time: 23:42
backdrop: cool
speaker: character_a
focus: character_a

> “你终于来了。”

+ 把铜币捡起来
  detail: 可能会看到一段不该存在的记忆。
  tone: 行动
  toneColor: #355e4d
  fx: highlight
  next: scene_02
  stats: mp -5, gold +1
  relation: character_a +1
  flags: found_coin

+ 假装没有看见
  next: scene_02
  stats: hp +2

+ 把铜币踢进河里
  next: scene_02
  when: relationship character_a >= 1
  lock: 需要：角色 A 关系 ≥ 1
  fx: shake,highlight
  stats: character_a.hp -3
  relation: character_a -1


# 下一幕
@node scene_02
chapter: 1
location: 雨港码头
time: 23:45
backdrop: warm
speaker:
focus: protagonist

> 雨还在下。

next: chapter_end


# 结束
@node chapter_end
chapter: 1
location: 雨港码头
time: 00:00
speaker:

> 第一夜结束了。

@end
kicker: CHAPTER 01 / COMPLETE
title: 第一夜
summary: 雨还没有停。
variant: flag found_coin | 那枚铜币在你口袋里，微微发热。
```

## 语法限制

- 选项属性必须缩进两个空格。
- 节点字段和对话必须顶格。
- `when`、`stats`、`relation`、`flags`、`fx` 的多项之间用英文逗号分隔。
- 以 `#` 开头的整行是注释；不支持行尾注释，因为颜色值也以 `#` 开头。
- 剧本正文不要包含反引号 `` ` `` 或 `${`，否则会破坏外层 JavaScript 包装。
- 节点 id 必须唯一。
- 每个选项必须有 `next`。

**注意：** 上面示例里的“雨港码头”等内容仅用于演示语法，并非内置剧情。

---

# 世界配置

以下内容不属于剧情正文，放在 `js/config.js`。

## 标题与开场

```js
meta: {
  title: "叙事框架",
  titleEn: "BRANCHING NARRATIVE",
  titleAccent: "框架",
  tagline: ["把故事写进选择里。", "只保留结构，其余交给你。"],
  version: "0.3.0",
  start: "scene_01",
  saveKey: "narrative-framework.save.v3"
}
```

注意 `meta.start` 的值必须与剧本文件中某个 `@node` 的 id 一致。

## 属性定义

```js
meta: {
  stats: {
    hp: {
      label: "生命",
      short: "HP",
      type: "bar",
      max: 100,
      color: "#a45348"
    },
    mp: {
      label: "法力",
      short: "MP",
      type: "bar",
      max: 60,
      color: "#4b708c"
    },
    attack: {
      label: "攻击",
      short: "ATK",
      type: "value"
    }
  },

  sharedStats: {
    gold: {
      label: "金币",
      short: "GOLD",
      initial: 120,
      color: "#8b6d3f"
    }
  }
}
```

- `bar` 显示进度条，`value` 显示数字。
- 进度条属性会自动限制在 `0 ~ max`。
- 共享属性由全队共用，适合金币、声望、钥匙数量等。

## 人物与初始属性

```js
characters: {
  protagonist: {
    name: "主角",
    initial: "主",
    en: "PROTAGONIST",
    serial: "01",
    role: "角色定位 · 待填写",
    status: "正常",
    accent: "#355e4d",
    self: true,
    stats: {
      hp: 86,
      mp: 42,
      attack: 12,
      defense: 8,
      speed: 10
    }
  }
}
```

主角用 `self: true` 标记。人物 id 会在剧本的 `speaker`、`focus`、`stats`、`relation` 中使用。

需要舞台立绘时，在人物配置中加入：

```js
image: "assets/character-a.png"
```

人物状态面板不显示人物小传，只显示属性和关系。

## 章节

```js
chapters: {
  1: {
    number: "01",
    title: "未命名章节",
    en: "UNTITLED CHAPTER",
    location: "场景地点",
    detail: "SCENE / PLACEHOLDER",
    summary: "在这里填写章节简介。"
  }
}
```

剧本节点的 `chapter` 对应这里的键。

## 剧情标记说明

```js
flags: {
  example_flag: {
    label: "示例标记",
    description: "显示在界面提示中的名称。"
  }
}
```

---

# 自动存档

- 存档 key 在 `js/config.js` 的 `meta.saveKey` 中设置。
- 每次进入新节点或做出选择后自动保存。
- 属性、关系、flags、当前节点和回看记录都会保存。
- 刷新页面后标题页显示“继续叙事”。

清空存档：

```js
localStorage.removeItem("narrative-framework.save.v3");
location.reload();
```

修改剧本后如果删除了旧节点，建议顺便更换 `meta.saveKey`，避免旧存档恢复到不存在的节点。

# 调试

打开浏览器控制台：

```js
Game.getState()
Game.getStats()
Game.getCurrentNode()
Game.goTo("scene_02")
Game.choose(0)
Game.openStatus("character_a")
Game.restart()
Game.validateStory()
Game.story
```

如果剧本语法有错，控制台会打印具体行号和原因。

# 键盘操作

| 操作 | 按键 |
| --- | --- |
| 显示全文 / 继续 | `Space` / `Enter` |
| 选择选项 | `1—9` |
| 打开人物状态 | `C` |
| 打开对话回看 | `H` |
| 关闭弹层 | `Esc` |

# 视觉与特效

配色变量位于 `css/style.css` 的 `:root`：

```css
:root {
  --bg: #f2eee6;
  --paper: #23251f;
  --accent: #355e4d;
  --accent-rgb: 53, 94, 77;
  --line: rgba(35, 37, 31, 0.16);
}
```

文本特效强度与速度也在 `css/style.css` 的 `Narrative text effects` 区域。

系统开启“减弱动态效果”时，动画会自动关闭，文字仍会完整显示。
