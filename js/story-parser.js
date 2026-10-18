/* ============================================================
   叙事框架 · 剧本语法解析器
   ------------------------------------------------------------
   将 story/chapters/ 中每个场景文件提交的 DSL 转成 STORY.nodes。
   每个文件通过 window.STORY_SCRIPTS 注册自己的源码。
   这个文件负责“读取语法”，写剧情时不需要修改它。
   ============================================================ */

(function () {
  "use strict";

  const story = window.STORY;
  const errors = [];

  if (!story) {
    console.error("[叙事框架] 找不到 window.STORY，请先加载 js/config.js。");
    return;
  }

  const rawEntries = Array.isArray(window.STORY_SCRIPTS)
    ? window.STORY_SCRIPTS
    : typeof window.STORY_SCRIPT === "string"
      ? [{ file: "story/script.js", source: window.STORY_SCRIPT }]
      : [];

  const sourceEntries = rawEntries
    .map((entry, index) => {
      if (typeof entry === "string") {
        return { file: `剧本 ${index + 1}`, source: entry };
      }
      return {
        file: (entry && (entry.file || entry.label)) || `剧本 ${index + 1}`,
        source: String(entry && (entry.source !== undefined ? entry.source : entry.text) || "")
      };
    })
    .filter((entry) => entry.source.trim());

  if (!sourceEntries.length) {
    console.error("[叙事框架] 找不到剧本内容，请检查 story/chapters/ 下的场景文件。");
    story.nodes = {};
    window.STORY_PARSE_ERRORS = [{ file: "", line: 0, message: "未加载任何剧本文件。" }];
    return;
  }

  const nodes = {};
  const nodeSources = {};
  let currentNode = null;
  let currentNodeId = null;
  let currentChoice = null;
  let endingMode = false;
  let lineNumber = 0;
  let currentFileLabel = "";

  function fail(message) {
    errors.push({ file: currentFileLabel, line: lineNumber, message });
  }

  function normalizeFx(value) {
    return String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item === "shake" || item === "highlight" || item === "drop");
  }

  function parseKeyValue(line) {
    const separator = line.indexOf(":");
    if (separator === -1) return null;
    return {
      key: line.slice(0, separator).trim(),
      value: line.slice(separator + 1).trim()
    };
  }

  function parseNumber(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      fail(`${label} 需要一个数字，收到“${value}”。`);
      return 0;
    }
    return number;
  }

  function parseStatEffects(value) {
    const stats = {};
    value.split(",").forEach((item) => {
      const match = item.trim().match(/^([A-Za-z0-9_.]+)\s+([+-]?\d+(?:\.\d+)?)$/);
      if (!match) {
        fail(`stats 写法错误：“${item.trim()}”。应为 hp -8 或 character_a.hp -5。`);
        return;
      }
      const target = match[1];
      const delta = Number(match[2]);
      if (target.includes(".")) {
        const [owner, statKey] = target.split(".");
        if (!stats[owner] || typeof stats[owner] !== "object") stats[owner] = {};
        stats[owner][statKey] = (stats[owner][statKey] || 0) + delta;
      } else {
        stats[target] = (stats[target] || 0) + delta;
      }
    });
    return stats;
  }

  function parseRelationshipEffects(value) {
    const relationships = {};
    value.split(",").forEach((item) => {
      const match = item.trim().match(/^([A-Za-z0-9_]+)\s+([+-]?\d+)$/);
      if (!match) {
        fail(`relation 写法错误：“${item.trim()}”。应为 character_a +1。`);
        return;
      }
      relationships[match[1]] = (relationships[match[1]] || 0) + Number(match[2]);
    });
    return relationships;
  }

  function parseFlagEffects(value) {
    const flags = {};
    value.split(",").forEach((item) => {
      const [name, rawValue] = item.trim().split("=");
      const flagName = (name || "").trim();
      if (!flagName) return;
      if (rawValue === undefined) {
        flags[flagName] = true;
      } else {
        const normalized = rawValue.trim().toLowerCase();
        flags[flagName] = !(normalized === "false" || normalized === "0" || normalized === "no");
      }
    });
    return flags;
  }

  function ensureConditionGroup(conditions, key) {
    if (!conditions[key]) conditions[key] = {};
    return conditions[key];
  }

  function addFlagCondition(conditions, group, flag) {
    if (!conditions[group]) conditions[group] = [];
    conditions[group].push(flag);
  }

  function parseConditions(value) {
    const conditions = {};
    value.split(",").forEach((item) => {
      const clause = item.trim();
      if (!clause) return;

      let match = clause.match(/^(flag|notflag|anyflag)\s+([A-Za-z0-9_]+)$/);
      if (match) {
        const group = match[1] === "flag" ? "flags" : match[1] === "notflag" ? "notFlags" : "anyFlags";
        addFlagCondition(conditions, group, match[2]);
        return;
      }

      match = clause.match(/^relationship\s+([A-Za-z0-9_]+)\s*(>=|<=|=)\s*(-?\d+)$/);
      if (match) {
        const [, characterId, operator, rawValue] = match;
        const number = Number(rawValue);
        if (operator === ">=") ensureConditionGroup(conditions, "minRelationships")[characterId] = number;
        else if (operator === "<=") ensureConditionGroup(conditions, "maxRelationships")[characterId] = number;
        else {
          ensureConditionGroup(conditions, "minRelationships")[characterId] = number;
          ensureConditionGroup(conditions, "maxRelationships")[characterId] = number;
        }
        return;
      }

      match = clause.match(/^stat\s+([A-Za-z0-9_.]+)\s*(>=|<=|=)\s*(-?\d+(?:\.\d+)?)$/);
      if (match) {
        const [, statKey, operator, rawValue] = match;
        const number = Number(rawValue);
        if (operator === ">=") ensureConditionGroup(conditions, "minStats")[statKey] = number;
        else if (operator === "<=") ensureConditionGroup(conditions, "maxStats")[statKey] = number;
        else {
          ensureConditionGroup(conditions, "minStats")[statKey] = number;
          ensureConditionGroup(conditions, "maxStats")[statKey] = number;
        }
        return;
      }

      fail(`when 条件无法识别：“${clause}”。`);
    });
    return conditions;
  }

  function parseTextLine(value) {
    const match = value.match(/^\{([^}]+)\}\s*(.*)$/);
    if (!match) return value.trim();
    const effects = normalizeFx(match[1]);
    if (!effects.length) {
      fail(`文本特效无法识别：“{${match[1]}}”。可用：shake / highlight / drop。`);
      return match[2].trim();
    }
    return {
      text: match[2].trim(),
      fx: effects.length === 1 ? effects[0] : effects
    };
  }

  function setNodeField(key, value) {
    if (!currentNode) return;

    switch (key) {
      case "chapter":
        currentNode.chapter = parseNumber(value, "chapter");
        break;
      case "location":
        currentNode.location = value;
        break;
      case "detail":
        currentNode.detail = value;
        break;
      case "time":
        currentNode.time = value;
        break;
      case "backdrop":
        currentNode.backdrop = value;
        break;
      case "speaker":
        currentNode.speaker = value || null;
        break;
      case "focus":
        currentNode.focus = value || null;
        break;
      case "next":
        currentNode.next = value;
        break;
      case "textFx": {
        const effects = normalizeFx(value);
        if (!effects.length) {
          fail(`textFx 无法识别：“${value}”。可用：shake / highlight / drop。`);
        } else {
          currentNode.textFx = effects.length === 1 ? effects[0] : effects;
        }
        break;
      }
      default:
        fail(`节点字段无法识别：“${key}”。请检查是否拼错，或选项属性是否少缩进了两个空格。`);
    }
  }

  function setChoiceField(key, value) {
    if (!currentChoice) return;
    switch (key) {
      case "next":
        currentChoice.next = value;
        break;
      case "detail":
        currentChoice.detail = value;
        break;
      case "tone":
        currentChoice.tone = value;
        break;
      case "toneColor":
        currentChoice.toneColor = value;
        break;
      case "fx": {
        const effects = normalizeFx(value);
        if (!effects.length) {
          fail(`选项 fx 无法识别：“${value}”。可用：shake / highlight / drop。`);
        } else {
          currentChoice.fx = effects.length === 1 ? effects[0] : effects;
        }
        break;
      }
      case "when":
        currentChoice.conditions = parseConditions(value);
        break;
      case "lock":
        currentChoice.lockedText = value;
        break;
      case "stats":
        currentChoice.effects = currentChoice.effects || {};
        currentChoice.effects.stats = parseStatEffects(value);
        break;
      case "relation":
        currentChoice.effects = currentChoice.effects || {};
        currentChoice.effects.relationships = parseRelationshipEffects(value);
        break;
      case "flags":
        currentChoice.effects = currentChoice.effects || {};
        currentChoice.effects.flags = parseFlagEffects(value);
        break;
      default:
        fail(`选项字段无法识别：“${key}”。可用字段：next、detail、tone、toneColor、fx、when、lock、stats、relation、flags。`);
    }
  }

  function setEndingField(key, value) {
    if (!currentNode || !currentNode.ending) return;
    switch (key) {
      case "kicker":
        currentNode.ending.kicker = value;
        break;
      case "title":
        currentNode.ending.title = value;
        break;
      case "summary":
        currentNode.ending.summary = value;
        break;
      case "note":
        currentNode.ending.note = value;
        break;
      case "variant": {
        const separator = value.indexOf("|");
        if (separator === -1) {
          fail("variant 写法错误。应为：variant: flag example_flag | 结局文字。");
          return;
        }
        const conditionText = value.slice(0, separator).trim();
        const text = value.slice(separator + 1).trim();
        if (!conditionText || !text) {
          fail("variant 的条件和文字都不能为空。");
          return;
        }
        currentNode.ending.variants.push({
          when: parseConditions(conditionText),
          text
        });
        break;
      }
      default:
        fail(`结局字段无法识别：“${key}”。可用字段：kicker、title、summary、note、variant。`);
    }
  }

  function parseSource(sourceText, fileLabel) {
    currentFileLabel = fileLabel;
    lineNumber = 0;
    currentNode = null;
    currentNodeId = null;
    currentChoice = null;
    endingMode = false;

    const lines = String(sourceText).replace(/\r\n?/g, "\n").split("\n");

    lines.forEach((rawLine) => {
    lineNumber += 1;
    const line = rawLine.replace(/\t/g, "  ");
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) return;

    if (trimmed.startsWith("@node ")) {
      const nodeId = trimmed.slice("@node ".length).trim();
      if (!nodeId) {
        fail("@node 后面需要写节点 id。");
        return;
      }
      if (nodes[nodeId]) {
        fail(`节点 id 重复：“${nodeId}”。`);
        return;
      }
      currentNodeId = nodeId;
      currentNode = {
        chapter: 1,
        speaker: null,
        focus: null,
        text: []
      };
      nodes[nodeId] = currentNode;
      nodeSources[nodeId] = currentFileLabel;
      currentChoice = null;
      endingMode = false;
      return;
    }

    if (trimmed === "@end") {
      if (!currentNode) {
        fail("@end 必须出现在某个 @node 之内。");
        return;
      }
      currentNode.ending = { variants: [] };
      currentChoice = null;
      endingMode = true;
      return;
    }

    if (trimmed.startsWith("@")) {
      fail(`无法识别的指令：“${trimmed}”。`);
      return;
    }

    if (!currentNode) {
      fail("文本必须写在某个 @node 下面。");
      return;
    }

    if (trimmed.startsWith(">")) {
      if (endingMode) {
        fail("结局块里不能再写对白，请把对白放在 @end 之前。");
        return;
      }
      currentChoice = null;
      const text = trimmed.slice(1).trim();
      if (text) currentNode.text.push(parseTextLine(text));
      return;
    }

    if (trimmed.startsWith("+ ")) {
      if (endingMode) {
        fail("结局块里不能再写选项。");
        return;
      }
      const choiceText = trimmed.slice(2).trim();
      if (!choiceText) {
        fail("选项的 + 后面需要写选项文字。");
        return;
      }
      currentChoice = { text: choiceText };
      if (!currentNode.choices) currentNode.choices = [];
      currentNode.choices.push(currentChoice);
      return;
    }

    const pair = parseKeyValue(trimmed);
    if (!pair) {
      fail(`无法识别这一行：“${trimmed}”。`);
      return;
    }

    const indent = line.length - line.replace(/^ +/, "").length;

    if (endingMode) {
      setEndingField(pair.key, pair.value);
    } else if (currentChoice && indent > 0) {
      setChoiceField(pair.key, pair.value);
    } else {
      setNodeField(pair.key, pair.value);
    }
    });
  }

  sourceEntries.forEach((entry) => parseSource(entry.source, entry.file));

  if (!Object.keys(nodes).length) {
    errors.push({ file: "", line: 0, message: "没有解析出任何节点。" });
  }

  Object.entries(nodes).forEach(([nodeId, node]) => {
    if (!node.text || !node.text.length) {
      // 不算错误：允许用 onEnter 或纯选项节点，但这里暂时只提示。
      console.info(`[叙事框架] 节点 ${nodeId} 没有对白文本。`);
    }
    (node.choices || []).forEach((choice, index) => {
      if (!choice.next) {
        errors.push({
          file: nodeSources[nodeId] || "",
          line: 0,
          message: `节点 ${nodeId} 的第 ${index + 1} 个选项缺少 next。`
        });
      }
    });
  });

  story.nodes = nodes;
  window.STORY_PARSE_ERRORS = errors;

  if (errors.length) {
    console.groupCollapsed(`%c[叙事框架] 剧本语法有 ${errors.length} 个问题`, "color:#e8a38e");
    errors.forEach((error) => {
      const location = [error.file, error.line ? `第 ${error.line} 行` : ""].filter(Boolean).join(" ");
      console.error(`${location ? location + "：" : ""}${error.message}`);
    });
    console.groupEnd();
  } else {
    console.info(
      `%c[叙事框架] 剧本读取完成：${sourceEntries.length} 个文件，${Object.keys(nodes).length} 个节点。`,
      "color:#355e4d"
    );
  }
})();
