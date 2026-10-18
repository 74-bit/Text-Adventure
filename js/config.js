/* ============================================================
   叙事框架 · 世界配置
   ------------------------------------------------------------
   这里放的是“世界怎么运转”的配置，不是剧情正文：

   1. meta.start            指定剧本文件中的开场节点 id
   2. meta.stats            人物属性定义（生命、法力、攻击等）
   3. meta.sharedStats      队伍共享属性（金币等）
   4. chapters              章节信息
   5. characters            人物与初始属性
   6. flags                 剧情标记的显示名称

   剧情、对白、选项和结局请写在 story/chapters/ 下的场景文件。
   语法见 README.md 的「剧本语法」章节。
   ============================================================ */

window.STORY = {
  meta: {
    title: "叙事框架",
    titleEn: "BRANCHING NARRATIVE",
    titleAccent: "框架",
    tagline: ["把故事写进选择里。", "只保留结构，其余交给你。"],
    version: "0.3.0",
    start: "scene_01",
    saveKey: "narrative-framework.save.v3",
    initialRelationships: {
      character_a: 0,
      character_b: 0
    },

    // 人物属性定义。type 为 bar 时显示进度条，value 时显示数值。
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
      },
      defense: {
        label: "防御",
        short: "DEF",
        type: "value"
      },
      speed: {
        label: "速度",
        short: "SPD",
        type: "value"
      }
    },

    // 队伍共享属性，所有人物共用。
    sharedStats: {
      gold: {
        label: "金币",
        short: "GOLD",
        initial: 120,
        color: "#8b6d3f"
      }
    },

    relationship: {
      min: -5,
      max: 5,
      levels: [
        { min: 4, label: "信赖", color: "#315a49" },
        { min: 2, label: "亲近", color: "#4d745f" },
        { min: 0, label: "平静", color: "#77766e" },
        { min: -2, label: "疏远", color: "#96715b" },
        { min: -5, label: "冲突", color: "#9e5c51" }
      ],
      note: "人物关系会随着你的选择变化。"
    }
  },

  chapters: {
    1: {
      number: "01",
      title: "未命名章节",
      en: "UNTITLED CHAPTER",
      location: "场景地点",
      detail: "SCENE / PLACEHOLDER",
      summary: "在这里填写章节简介。"
    }
  },

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
    },

    character_a: {
      name: "角色 A",
      initial: "A",
      en: "CHARACTER A",
      serial: "02",
      role: "角色定位 · 待填写",
      status: "正常",
      accent: "#8a6750",
      stats: {
        hp: 72,
        mp: 24,
        attack: 16,
        defense: 6,
        speed: 13
      }
    },

    character_b: {
      name: "角色 B",
      initial: "B",
      en: "CHARACTER B",
      serial: "03",
      role: "角色定位 · 待填写",
      status: "正常",
      accent: "#5e6475",
      stats: {
        hp: 64,
        mp: 36,
        attack: 9,
        defense: 11,
        speed: 8
      }
    }
  },

  flags: {
    example_flag: {
      label: "示例标记",
      description: "用来演示 flags 的结构，替换成你自己的剧情标记即可。"
    }
  }
};
