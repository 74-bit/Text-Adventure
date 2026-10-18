/* ============================================================
   叙事框架 · 文字冒险引擎
   ------------------------------------------------------------
   引擎保持无依赖，负责：
   - 节点渲染 / 打字机效果 / 分支选择
   - 条件判断 / 关系变化 / 标记（flags）
   - 人物状态 / 对话回看 / 自动存档
   - 键盘操作 / 模态框焦点管理
   ============================================================ */

(function () {
  "use strict";

  const STORY = window.STORY;
  const SAVE_VERSION = 2;
  const SAVE_KEY = (STORY && STORY.meta && STORY.meta.saveKey) || "narrative-framework.save.v3";
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const $ = (selector) => document.querySelector(selector);

  const dom = {
    gameShell: $("#gameShell"),
    titleScreen: $("#titleScreen"),
    titleFigure: $("#titleFigure"),
    titleMain: $("#titleMain"),
    titleAccent: $("#titleAccent"),
    titleEn: $("#titleEn"),
    titleTagline: $("#titleTagline"),
    backdrop: $("#backdrop"),
    stage: $("#stage"),
    menuToggle: $("#menuToggle"),
    menuPopover: $("#menuPopover"),
    menuProgress: $("#menuProgress"),
    menuSaveText: $("#menuSaveText"),
    menuTitleBtn: $("#menuTitleBtn"),
    menuRestartBtn: $("#menuRestartBtn"),
    chapterChip: $("#chapterChip"),
    locationText: $("#locationText"),
    sceneDetail: $("#sceneDetail"),
    timecode: $("#timecode"),
    stageWatermark: $("#stageWatermark"),
    characterStage: $("#characterStage"),
    storyConsole: $("#storyConsole"),
    dialogueColumn: $("#dialogueColumn"),
    speakerRow: $("#speakerRow"),
    speakerAvatar: $("#speakerAvatar"),
    speakerName: $("#speakerName"),
    speakerRole: $("#speakerRole"),
    speakerEn: $("#speakerEn"),
    dialogueText: $("#dialogueText"),
    advanceBtn: $("#advanceBtn"),
    advanceLabel: $("#advanceLabel"),
    choicePanel: $("#choicePanel"),
    choices: $("#choices"),
    choiceCount: $("#choiceCount"),
    endingHost: $("#endingHost"),
    castButtons: $("#castButtons"),
    saveIndicator: $("#saveIndicator"),
    saveText: $("#saveText"),
    primaryStart: $("#primaryStart"),
    primaryStartLabel: $("#primaryStartLabel"),
    primaryStartMeta: $("#primaryStartMeta"),
    newGameStart: $("#newGameStart"),
    statusModal: $("#statusModal"),
    statusIndex: $("#statusIndex"),
    statusDetail: $("#statusDetail"),
    historyModal: $("#historyModal"),
    historyList: $("#historyList"),
    historyCount: $("#historyCount"),
    confirmModal: $("#confirmModal"),
    confirmTitle: $("#confirmTitle"),
    confirmText: $("#confirmText"),
    confirmAccept: $("#confirmAccept"),
    confirmCancel: $("#confirmCancel"),
    toastStack: $("#toastStack")
  };

  const state = {
    game: null,
    currentNode: null,
    currentChoices: [],
    typing: null,
    lastSpeaker: null,
    statusSelection: null,
    modalStack: [],
    modalReturnFocus: null,
    confirmAction: null,
    backdropTimer: null,
    saveFlashTimer: null,
    storageWarningShown: false
  };

  /* ============================================================
     Small helpers
     ============================================================ */

  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatClock(timestamp) {
    const date = timestamp ? new Date(timestamp) : new Date();
    return String(date.getHours()).padStart(2, "0") + ":" + String(date.getMinutes()).padStart(2, "0");
  }

  function protagonistId() {
    if (STORY.meta && STORY.meta.protagonist && STORY.characters[STORY.meta.protagonist]) {
      return STORY.meta.protagonist;
    }
    const selfId = Object.keys(STORY.characters).find((id) => STORY.characters[id].self);
    return selfId || Object.keys(STORY.characters)[0];
  }

  const TEXT_EFFECTS = ["shake", "highlight", "drop"];

  function normalizeFx(fx) {
    if (fx == null) return [];
    const values = Array.isArray(fx) ? fx : [fx];
    return Array.from(
      new Set(
        values
          .map((effect) => String(effect || "").trim())
          .filter((effect) => TEXT_EFFECTS.includes(effect))
      )
    );
  }

  function normalizeTextItems(text, defaultFx) {
    if (text == null) return [];
    const values = Array.isArray(text) ? text : [text];
    const items = [];
    values.forEach((part) => {
      if (part && typeof part === "object" && !Array.isArray(part)) {
        const effects = normalizeFx(part.fx !== undefined ? part.fx : defaultFx);
        String(part.text == null ? "" : part.text)
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .forEach((line) => items.push({ text: line, fx: effects }));
      } else {
        const effects = normalizeFx(defaultFx);
        String(part == null ? "" : part)
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .forEach((line) => items.push({ text: line, fx: effects }));
      }
    });
    return items;
  }

  function normalizeParagraphs(text) {
    return normalizeTextItems(text).map((item) => item.text);
  }

  function stripTextMarkers(text) {
    return String(text)
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/==([^=]+)==/g, "$1");
  }

  function getRelationshipLevel(value) {
    const config = STORY.meta.relationship || {};
    const levels = (config.levels || [{ min: -5, label: "未知" }]).slice().sort((a, b) => b.min - a.min);
    return levels.find((level) => value >= level.min) || levels[levels.length - 1];
  }

  function getRelationshipValue(characterId) {
    if (!state.game) return 0;
    return Number(state.game.relationships[characterId] || 0);
  }

  function getCharacter(id) {
    return STORY.characters[id] || null;
  }

  function getStatDefinition(statKey) {
    return (STORY.meta.stats && STORY.meta.stats[statKey]) || null;
  }

  function getSharedStatDefinition(statKey) {
    return (STORY.meta.sharedStats && STORY.meta.sharedStats[statKey]) || null;
  }

  function clampStatValue(statKey, value) {
    const definition = getStatDefinition(statKey);
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const min = Number.isFinite(Number(definition && definition.min)) ? Number(definition.min) : 0;
    const max = definition && Number.isFinite(Number(definition.max)) ? Number(definition.max) : null;
    const clamped = Math.max(min, max === null ? numeric : Math.min(max, numeric));
    return Number.isInteger(numeric) ? Math.round(clamped) : clamped;
  }

  function makeDefaultCharacterStats() {
    const result = {};
    const definitions = STORY.meta.stats || {};
    Object.entries(STORY.characters).forEach(([id, character]) => {
      const values = {};
      Object.entries(definitions).forEach(([statKey, definition]) => {
        const initial = character.stats && character.stats[statKey] !== undefined
          ? character.stats[statKey]
          : definition.initial !== undefined
            ? definition.initial
            : definition.type === "bar" && Number.isFinite(Number(definition.max))
              ? Number(definition.max)
              : 0;
        values[statKey] = clampStatValue(statKey, initial) ?? 0;
      });
      result[id] = values;
    });
    return result;
  }

  function makeDefaultSharedStats() {
    const result = {};
    Object.entries(STORY.meta.sharedStats || {}).forEach(([statKey, definition]) => {
      result[statKey] = Number(definition.initial) || 0;
    });
    return result;
  }

  function makeDefaultStats() {
    return {
      characters: makeDefaultCharacterStats(),
      shared: makeDefaultSharedStats()
    };
  }

  function getCharacterStats(characterId) {
    if (!state.game || !state.game.stats || !state.game.stats.characters) return {};
    return state.game.stats.characters[characterId] || {};
  }

  function getSharedStats() {
    if (!state.game || !state.game.stats || !state.game.stats.shared) return {};
    return state.game.stats.shared;
  }

  function resolveStatTarget(targetKey) {
    if (targetKey === "shared" || getSharedStatDefinition(targetKey)) {
      return { kind: "shared", characterId: null, statKey: targetKey === "shared" ? null : targetKey };
    }
    if (targetKey.includes(".")) {
      const [scope, statKey] = targetKey.split(".", 2);
      if (scope === "shared") return { kind: "shared", characterId: null, statKey };
      if (STORY.characters[scope]) return { kind: "character", characterId: scope, statKey };
    }
    return { kind: "character", characterId: protagonistId(), statKey: targetKey };
  }

  function getStatValue(target) {
    if (!target || !target.statKey) return 0;
    if (target.kind === "shared") {
      return Number(getSharedStats()[target.statKey]) || 0;
    }
    return Number(getCharacterStats(target.characterId)[target.statKey]) || 0;
  }

  function setStatValue(target, value) {
    if (!target || !target.statKey) return 0;
    if (target.kind === "shared") {
      const definition = getSharedStatDefinition(target.statKey);
      if (!definition) return getStatValue(target);
      state.game.stats.shared[target.statKey] = Number(value) || 0;
      return state.game.stats.shared[target.statKey];
    }
    const definition = getStatDefinition(target.statKey);
    if (!definition || !state.game.stats.characters[target.characterId]) return getStatValue(target);
    const nextValue = clampStatValue(target.statKey, value) ?? 0;
    state.game.stats.characters[target.characterId][target.statKey] = nextValue;
    return nextValue;
  }

  function statDisplayValue(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "0";
    return Number.isInteger(numeric) ? String(numeric) : String(Math.round(numeric * 10) / 10);
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function isMobileLayout() {
    return window.matchMedia("(max-width: 820px)").matches;
  }

  /* ============================================================
     Typewriter
     ============================================================ */

  class Typewriter {
    constructor(element) {
      this.element = element;
      this.active = false;
      this.timer = null;
      this.token = 0;
      this.done = null;
      this.textItems = [];
      this.paragraphs = [];
      this.plainParagraphs = [];
      this.paragraphFx = [];
      this.paragraphEls = [];
      this.fxApplied = [];
      this.dropProgress = [];
      this.visible = 0;
      this.total = 0;
    }

    write(items, onDone) {
      this.cancel();
      this.element.innerHTML = "";
      this.element.classList.remove("is-narration");
      this.textItems = items.map((item) =>
        typeof item === "string"
          ? { text: item, fx: [] }
          : { text: String(item.text == null ? "" : item.text), fx: normalizeFx(item.fx) }
      );
      this.paragraphs = this.textItems.map((item) => item.text);
      this.plainParagraphs = this.textItems.map((item) => stripTextMarkers(item.text));
      this.paragraphFx = this.textItems.map((item) => item.fx);
      this.done = typeof onDone === "function" ? onDone : null;
      this.paragraphEls = this.plainParagraphs.map(() => {
        const p = document.createElement("p");
        this.element.appendChild(p);
        return p;
      });
      this.fxApplied = this.plainParagraphs.map(() => false);
      this.dropProgress = this.plainParagraphs.map(() => 0);
      this.visible = 0;
      this.total = this.plainParagraphs.reduce((sum, paragraph) => sum + paragraph.length, 0);
      this.element.setAttribute("aria-live", "off");
      this.active = true;
      const token = ++this.token;

      if (!this.total || prefersReducedMotion) {
        this.renderFull(true);
        this.finish(true);
        return;
      }

      this.renderPartial(0);
      this.timer = window.setTimeout(() => this.tick(token), 55);
    }

    tick(token) {
      if (!this.active || token !== this.token) return;
      const remaining = this.total - this.visible;
      const step = remaining > 220 ? 3 : 2;
      this.visible = Math.min(this.total, this.visible + step);
      this.renderPartial(this.visible);

      if (this.visible < this.total) {
        this.timer = window.setTimeout(() => this.tick(token), 24);
      } else {
        this.finish(false);
      }
    }

    applyParagraphFx(index) {
      const element = this.paragraphEls[index];
      const effects = this.paragraphFx[index] || [];
      if (!element || this.fxApplied[index]) return;
      if (effects.includes("highlight")) element.classList.add("fx-highlight");
      if (effects.includes("drop")) element.classList.add("fx-drop-line");
      this.fxApplied[index] = true;
    }

    renderPartial(count) {
      let remaining = count;
      let activeParagraph = null;
      let cursor = count;

      this.element.querySelectorAll(".caret").forEach((caret) => caret.remove());

      this.plainParagraphs.forEach((paragraph, index) => {
        const element = this.paragraphEls[index];
        const amount = Math.max(0, Math.min(paragraph.length, remaining));
        const effects = this.paragraphFx[index] || [];
        if (amount > 0) this.applyParagraphFx(index);

        if (effects.includes("drop")) {
          while (this.dropProgress[index] < amount) {
            const character = paragraph[this.dropProgress[index]];
            const characterEl = document.createElement("span");
            characterEl.className = "fx-char fx-char--drop";
            if (effects.includes("shake")) {
              characterEl.appendChild(createShakeChar(character));
            } else {
              characterEl.textContent = character;
            }
            element.appendChild(characterEl);
            this.dropProgress[index] += 1;
          }
        } else {
          element.textContent = paragraph.slice(0, amount);
        }

        if (activeParagraph === null && cursor <= paragraph.length) {
          activeParagraph = element;
        }
        remaining -= paragraph.length;
        cursor -= paragraph.length;
      });

      if (activeParagraph && count < this.total) {
        const caret = document.createElement("span");
        caret.className = "caret";
        caret.setAttribute("aria-hidden", "true");
        activeParagraph.appendChild(caret);
      }
    }

    renderFull(force = false) {
      this.paragraphs.forEach((paragraph, index) => {
        const element = this.paragraphEls[index];
        if (!element) return;
        const effects = this.paragraphFx[index] || [];
        this.applyParagraphFx(index);
        const isCompleteDrop =
          effects.includes("drop") &&
          this.dropProgress[index] >= this.plainParagraphs[index].length;
        if (!force && isCompleteDrop) {
          this.element.querySelectorAll(".caret").forEach((caret) => caret.remove());
          return;
        }
        element.textContent = "";
        appendRichText(element, paragraph, { shakeChars: effects.includes("shake") });
      });
    }

    finish(force = false) {
      if (!this.active) return;
      this.active = false;
      window.clearTimeout(this.timer);
      this.timer = null;
      this.renderFull(force);
      this.element.querySelectorAll(".caret").forEach((caret) => caret.remove());
      this.element.setAttribute("aria-live", "polite");
      const callback = this.done;
      this.done = null;
      if (callback) callback();
    }

    skip() {
      if (!this.active) return false;
      this.finish(true);
      return true;
    }

    cancel() {
      this.active = false;
      window.clearTimeout(this.timer);
      this.timer = null;
      this.token += 1;
      this.done = null;
    }
  }

  function createShakeChar(character) {
    const span = document.createElement("span");
    span.className = "fx-char fx-char--shake";
    span.textContent = character;
    const duration = 0.72 + Math.random() * 0.26;
    const delay = -Math.random() * 0.9;
    span.style.setProperty("--shake-duration", duration.toFixed(3) + "s");
    span.style.setProperty("--shake-delay", delay.toFixed(3) + "s");
    return span;
  }

  function appendRichText(element, text, options) {
    const opts = options || {};
    const appendCharacters = (parent, segment) => {
      if (!opts.shakeChars) {
        parent.appendChild(document.createTextNode(segment));
        return;
      }
      Array.from(segment).forEach((character) => {
        parent.appendChild(createShakeChar(character));
      });
    };

    const parts = String(text).split(/(\*[^*]+\*|==[^=]+==)/g);
    parts.forEach((part) => {
      if (!part) return;
      if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
        const emphasis = document.createElement("em");
        appendCharacters(emphasis, part.slice(1, -1));
        element.appendChild(emphasis);
      } else if (part.startsWith("==") && part.endsWith("==") && part.length > 4) {
        const highlight = document.createElement("mark");
        highlight.className = "text-highlight";
        appendCharacters(highlight, part.slice(2, -2));
        element.appendChild(highlight);
      } else {
        appendCharacters(element, part);
      }
    });
  }

  state.typing = new Typewriter(dom.dialogueText);

  /* ============================================================
     Story validation / debugging
     ============================================================ */

  function validateStory() {
    const issues = [];
    const notes = [];
    if (!STORY || !STORY.meta || !STORY.nodes) {
      issues.push("剧本配置缺少 meta 或 nodes。请检查 js/config.js 与 story/chapters/ 下的场景文件。");
      return issues;
    }
    const nodeIds = new Set(Object.keys(STORY.nodes));
    if (!nodeIds.has(STORY.meta.start)) {
      issues.push(`meta.start 指向不存在的节点：“${STORY.meta.start}”。`);
    }

    Object.entries(STORY.nodes).forEach(([nodeId, node]) => {
      if (node.next && !nodeIds.has(node.next)) {
        issues.push(`节点“${nodeId}”的 next 指向不存在的节点“${node.next}”。`);
      }
      if (node.speaker && !STORY.characters[node.speaker]) {
        issues.push(`节点“${nodeId}”的 speaker 使用了不存在的人物“${node.speaker}”。`);
      }
      if (node.focus && !STORY.characters[node.focus]) {
        issues.push(`节点“${nodeId}”的 focus 使用了不存在的人物“${node.focus}”。`);
      }
      if (node.choices) {
        node.choices.forEach((choice, index) => {
          if (!choice.next || !nodeIds.has(choice.next)) {
            issues.push(`节点“${nodeId}”第 ${index + 1} 个选项的 next 指向不存在的节点。`);
          }
        });
      }
      if (!node.next && !node.choices && !node.ending) {
        notes.push(`节点“${nodeId}”没有 next、choices 或 ending，流程会停在这里。`);
      }
    });

    if (nodeIds.has(STORY.meta.start)) {
      const reachable = new Set();
      const queue = [STORY.meta.start];
      while (queue.length) {
        const id = queue.shift();
        if (reachable.has(id) || !STORY.nodes[id]) continue;
        reachable.add(id);
        const node = STORY.nodes[id];
        if (node.next) queue.push(node.next);
        (node.choices || []).forEach((choice) => {
          if (choice.next) queue.push(choice.next);
        });
      }
      nodeIds.forEach((id) => {
        if (!reachable.has(id)) notes.push(`节点“${id}”从开场节点不可达。`);
      });
    }

    if (issues.length || notes.length) {
      console.groupCollapsed("%c[叙事框架] 剧本校验：发现问题", "color:#e8a38e");
      issues.forEach((issue) => console.warn(issue));
      notes.forEach((note) => console.info(note));
      console.groupEnd();
    } else {
      console.info("%c[叙事框架] 剧本校验通过。", "color:#d7b68c");
    }
    return issues;
  }

  /* ============================================================
     Save / load
     ============================================================ */

  function makeDefaultRelationships() {
    const relationships = {};
    Object.entries(STORY.characters).forEach(([id, character]) => {
      if (!character.self) relationships[id] = 0;
    });
    Object.assign(relationships, STORY.meta.initialRelationships || {});
    return relationships;
  }

  function createGameState() {
    return {
      version: SAVE_VERSION,
      nodeId: STORY.meta.start,
      relationships: makeDefaultRelationships(),
      stats: makeDefaultStats(),
      flags: {},
      appliedNodes: [],
      history: [],
      startedAt: Date.now(),
      updatedAt: Date.now(),
      completed: false
    };
  }

  function readSave() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== SAVE_VERSION) return null;
      if (!parsed.nodeId || !STORY.nodes[parsed.nodeId]) return null;

      const config = STORY.meta.relationship || { min: -5, max: 5 };
      const relationships = makeDefaultRelationships();
      if (parsed.relationships && typeof parsed.relationships === "object") {
        Object.entries(parsed.relationships).forEach(([id, value]) => {
          if (!STORY.characters[id] || STORY.characters[id].self) return;
          const numeric = Number(value);
          if (Number.isFinite(numeric)) {
            relationships[id] = clamp(numeric, config.min ?? -5, config.max ?? 5);
          }
        });
      }

      const stats = makeDefaultStats();
      if (parsed.stats && parsed.stats.characters && typeof parsed.stats.characters === "object") {
        Object.entries(parsed.stats.characters).forEach(([characterId, values]) => {
          if (!stats.characters[characterId] || !values || typeof values !== "object") return;
          Object.entries(values).forEach(([statKey, value]) => {
            if (!getStatDefinition(statKey)) return;
            const normalized = clampStatValue(statKey, value);
            if (normalized !== null) stats.characters[characterId][statKey] = normalized;
          });
        });
      }
      if (parsed.stats && parsed.stats.shared && typeof parsed.stats.shared === "object") {
        Object.entries(parsed.stats.shared).forEach(([statKey, value]) => {
          if (!getSharedStatDefinition(statKey)) return;
          const numeric = Number(value);
          if (Number.isFinite(numeric)) stats.shared[statKey] = Math.max(0, numeric);
        });
      }

      return {
        version: SAVE_VERSION,
        nodeId: parsed.nodeId,
        relationships,
        stats,
        flags: parsed.flags && typeof parsed.flags === "object" ? parsed.flags : {},
        appliedNodes: Array.isArray(parsed.appliedNodes) ? parsed.appliedNodes.slice(-300) : [],
        history: Array.isArray(parsed.history)
          ? parsed.history.filter((entry) => entry && (entry.type === "dialogue" || entry.type === "choice")).slice(-300)
          : [],
        startedAt: Number(parsed.startedAt) || Date.now(),
        updatedAt: Number(parsed.updatedAt) || Date.now(),
        completed: Boolean(parsed.completed)
      };
    } catch (error) {
      console.warn("[叙事框架] 无法读取自动存档：", error);
      return null;
    }
  }

  function persist() {
    if (!state.game) return;
    state.game.updatedAt = Date.now();
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(state.game));
      updateSaveIndicator("saved");
    } catch (error) {
      console.warn("[叙事框架] 无法写入自动存档：", error);
      updateSaveIndicator("error");
      if (!state.storageWarningShown) {
        state.storageWarningShown = true;
        showToast("存档不可用", "浏览器阻止了本地存储。本局仍可继续，但刷新后会丢失进度。", "var(--danger)");
      }
    }
  }

  function updateSaveIndicator(mode) {
    if (!dom.saveIndicator) return;
    window.clearTimeout(state.saveFlashTimer);
    dom.saveIndicator.classList.remove("is-saving", "is-error");

    if (mode === "error") {
      dom.saveIndicator.classList.add("is-error");
      dom.saveText.textContent = "自动存档不可用";
      dom.menuSaveText.textContent = "自动存档不可用";
      return;
    }

    const clock = formatClock(state.game ? state.game.updatedAt : Date.now());
    dom.saveIndicator.classList.add("is-saving");
    dom.saveText.textContent = "已自动保存 · " + clock;
    dom.menuSaveText.textContent = "进度已自动保存 · " + clock;
    state.saveFlashTimer = window.setTimeout(() => {
      dom.saveIndicator.classList.remove("is-saving");
    }, 1100);
  }

  /* ============================================================
     Title screen
     ============================================================ */

  function applyStoryMeta() {
    const meta = STORY.meta || {};
    const title = meta.title || "叙事框架";
    const accent = meta.titleAccent || "";
    const main = accent && title.endsWith(accent) ? title.slice(0, -accent.length) : title;
    const tagline = Array.isArray(meta.tagline) ? meta.tagline.join("\n") : meta.tagline || "";

    if (dom.titleMain) dom.titleMain.textContent = main;
    if (dom.titleAccent) dom.titleAccent.textContent = accent;
    if (dom.titleEn) dom.titleEn.textContent = meta.titleEn || "";
    if (dom.titleTagline && tagline) dom.titleTagline.textContent = tagline;

    const brandTitle = document.querySelector(".brand-copy strong");
    const brandEn = document.querySelector(".brand-copy em");
    if (brandTitle) brandTitle.textContent = title;
    if (brandEn) brandEn.textContent = meta.titleEn || "";
    const brand = document.querySelector(".brand");
    if (brand) brand.setAttribute("aria-label", title);
    document.title = title + (meta.titleEn ? " · " + meta.titleEn : "");
  }

  function refreshTitle() {
    const saved = readSave();
    if (saved) {
      dom.primaryStart.dataset.mode = "continue";
      dom.primaryStartLabel.textContent = "继续叙事";
      dom.primaryStartMeta.textContent = "恢复进度 · " + formatClock(saved.updatedAt);
      dom.newGameStart.hidden = false;
    } else {
      dom.primaryStart.dataset.mode = "new";
      dom.primaryStartLabel.textContent = "开始叙事";
      dom.primaryStartMeta.textContent = "OPEN STORY";
      dom.newGameStart.hidden = true;
    }
  }

  function renderTitle() {
    applyStoryMeta();
    dom.titleFigure.innerHTML = window.Portrait.create(protagonistId(), { mode: "title" });
    refreshTitle();
  }

  function clearToasts() {
    if (!dom.toastStack) return;
    dom.toastStack.innerHTML = "";
  }

  function enterGame(mode) {
    const saved = mode === "continue" ? readSave() : null;
    state.game = saved || createGameState();
    state.lastSpeaker = protagonistId();
    state.statusSelection = protagonistId();
    state.typing.cancel();
    closeMenu();
    clearToasts();
    closeAllModals({ instant: true });

    dom.gameShell.classList.remove("is-title");
    dom.gameShell.classList.add("is-playing");
    dom.titleScreen.setAttribute("aria-hidden", "true");
    dom.titleScreen.inert = true;

    renderCastRail();
    renderNode({ record: mode !== "continue" });
    dom.stage.scrollTop = 0;
  }

  function requestNewGame() {
    const saved = readSave();
    if (saved) {
      openConfirm({
        title: "重新开始故事？",
        text: "当前自动存档会被覆盖。已经做出的选择、人物关系与属性都会重置。",
        acceptLabel: "重新开始",
        onAccept: () => enterGame("new")
      });
    } else {
      enterGame("new");
    }
  }

  function returnToTitle() {
    if (state.game) persist();
    state.typing.cancel();
    closeMenu();
    clearToasts();
    closeAllModals({ instant: true });
    dom.gameShell.classList.remove("is-playing");
    dom.gameShell.classList.add("is-title");
    dom.titleScreen.inert = false;
    dom.titleScreen.setAttribute("aria-hidden", "false");
    dom.stage.scrollTop = 0;
    refreshTitle();
    window.setTimeout(() => dom.primaryStart.focus({ preventScroll: true }), 120);
  }

  /* ============================================================
     Scene rendering
     ============================================================ */

  function getNode(id) {
    return STORY.nodes[id] || null;
  }

  function updateHUD(node) {
    const chapter = STORY.chapters[node.chapter] || {};
    const chapterNumber = chapter.number || pad2(node.chapter || 1);
    const location = node.location || chapter.location || "未知地点";
    const detail = node.detail || chapter.detail || "SIGNAL UNSTABLE";
    dom.chapterChip.textContent = "CH." + chapterNumber + " · " + (chapter.title || "未命名章节");
    dom.locationText.textContent = location;
    dom.sceneDetail.textContent = detail;
    dom.timecode.textContent = node.time || "--:--";
    dom.stageWatermark.textContent = chapterNumber;
    dom.menuProgress.textContent = "CH." + chapterNumber + " / " + location;
  }

  function updateBackdrop(node) {
    const scene = node.backdrop || "neutral";
    dom.backdrop.dataset.scene = scene;
    dom.backdrop.classList.remove("is-changing");
    void dom.backdrop.offsetWidth;
    dom.backdrop.classList.add("is-changing");
    window.clearTimeout(state.backdropTimer);
    state.backdropTimer = window.setTimeout(() => dom.backdrop.classList.remove("is-changing"), 1200);
  }

  function renderSpeaker(node) {
    const character = node.speaker ? getCharacter(node.speaker) : null;
    const isNarration = !character;
    const accent = character ? character.accent : "#aebcba";

    dom.dialogueColumn.style.setProperty("--speaker", accent);
    dom.speakerRow.classList.toggle("is-narration", isNarration);
    dom.dialogueText.classList.toggle("is-narration", isNarration);

    if (character) {
      state.lastSpeaker = node.speaker;
      dom.speakerAvatar.textContent = character.initial || Array.from(character.name)[0] || "?";
      dom.speakerName.textContent = character.name;
      dom.speakerRole.textContent = character.role;
      dom.speakerEn.textContent = character.en || character.serial || "";
    } else {
      dom.speakerAvatar.textContent = "◇";
      dom.speakerName.textContent = "旁白";
      dom.speakerRole.textContent = "叙事记录 / NARRATION";
      dom.speakerEn.textContent = "NARRATIVE LOG";
    }
  }

  function renderCharacter(node) {
    const focusId = node.focus !== undefined ? node.focus : node.speaker;
    if (!focusId || !getCharacter(focusId)) {
      dom.characterStage.innerHTML = "";
      dom.characterStage.classList.remove("is-visible");
      dom.characterStage.dataset.character = "";
      return;
    }

    if (dom.characterStage.dataset.character === focusId && dom.characterStage.classList.contains("is-visible")) {
      return;
    }

    const character = getCharacter(focusId);
    const signature = [
      "<div class=\"figure-signature\">",
      "<span>CHARACTER / " + escapeHTML(character.serial || character.en || focusId) + "</span>",
      "<strong>" + escapeHTML(character.name) + "</strong>",
      "<small>" + escapeHTML(character.role) + "</small>",
      "</div>"
    ].join("");

    dom.characterStage.dataset.character = focusId;
    dom.characterStage.style.setProperty("--accent", character.accent);
    dom.characterStage.innerHTML =
      '<div class="figure-wrap">' +
      signature +
      window.Portrait.create(focusId, { mode: "stage" }) +
      "</div>";
    dom.characterStage.classList.remove("is-visible", "is-changing");
    void dom.characterStage.offsetWidth;
    window.requestAnimationFrame(() => {
      dom.characterStage.classList.add("is-visible", "is-changing");
      window.setTimeout(() => dom.characterStage.classList.remove("is-changing"), 800);
    });
  }

  function showAdvance(label) {
    dom.advanceBtn.hidden = false;
    dom.advanceLabel.textContent = label;
    dom.advanceBtn.classList.toggle("is-skipping", label === "显示全文");
    dom.advanceBtn.setAttribute("aria-label", label === "显示全文" ? "显示完整对话" : "继续剧情");
  }

  function hideAdvance() {
    dom.advanceBtn.hidden = true;
  }

  function onNodeTextComplete(node) {
    if (state.currentNode !== node) return;
    if (node.choices && node.choices.length) {
      renderChoices(node);
    } else if (node.ending) {
      renderEnding(node);
    } else if (node.next) {
      showAdvance("继续");
    } else {
      hideAdvance();
    }
  }

  function renderNode(options) {
    if (!state.game) return;
    const opts = options || {};
    const node = getNode(state.game.nodeId);
    if (!node) {
      console.error("[叙事框架] 当前节点不存在：", state.game.nodeId);
      return;
    }

    state.currentNode = node;
    state.currentChoices = [];
    state.typing.cancel();

    dom.choicePanel.hidden = true;
    dom.endingHost.hidden = true;
    dom.endingHost.innerHTML = "";
    dom.choices.innerHTML = "";
    dom.advanceBtn.hidden = true;
    dom.advanceBtn.classList.remove("is-skipping");
    dom.storyConsole.classList.remove("has-choices");
    dom.dialogueText.innerHTML = "";

    const changes = [];
    const appliedNodes = Array.isArray(state.game.appliedNodes) ? state.game.appliedNodes : [];
    if (node.onEnter && !appliedNodes.includes(state.game.nodeId)) {
      changes.push(...applyEffects(node.onEnter));
      appliedNodes.push(state.game.nodeId);
      state.game.appliedNodes = appliedNodes;
      renderCastRail();
    }

    if (node.ending) state.game.completed = true;

    updateHUD(node);
    updateBackdrop(node);
    renderSpeaker(node);
    renderCharacter(node);

    if (opts.record) recordDialogue(node);

    const textItems = normalizeTextItems(node.text, node.textFx);
    if (!textItems.length) {
      onNodeTextComplete(node);
    } else {
      showAdvance("显示全文");
      state.typing.write(textItems, () => onNodeTextComplete(node));
    }

    persist();

    if (changes.length) {
      window.setTimeout(() => showEffectChanges(changes), 380);
    }

    if (opts.record) scrollToStoryOnMobile();
  }

  function goTo(nodeId) {
    if (!state.game) return;
    if (!nodeId || !getNode(nodeId)) {
      console.warn("[叙事框架] 无法跳转到不存在的节点：", nodeId);
      return;
    }
    closeMenu();
    state.game.nodeId = nodeId;
    renderNode({ record: true });
  }

  function advance() {
    const node = state.currentNode;
    if (!node) return;
    if (state.typing.active) {
      state.typing.skip();
      return;
    }
    if (node.choices && node.choices.length) return;
    if (node.ending) return;
    if (node.next) goTo(node.next);
  }

  function scrollToStoryOnMobile() {
    if (!isMobileLayout()) return;
    window.requestAnimationFrame(() => {
      const top = Math.max(0, dom.storyConsole.offsetTop - 12);
      dom.stage.scrollTo({ top: top, behavior: prefersReducedMotion ? "auto" : "smooth" });
    });
  }

  /* ============================================================
     Effects & choices
     ============================================================ */

  function conditionsMet(conditions) {
    if (!conditions) return true;
    if (!state.game) return false;

    if (Array.isArray(conditions.flags) && !conditions.flags.every((flag) => Boolean(state.game.flags[flag]))) {
      return false;
    }
    if (Array.isArray(conditions.anyFlags) && !conditions.anyFlags.some((flag) => Boolean(state.game.flags[flag]))) {
      return false;
    }
    if (Array.isArray(conditions.notFlags) && conditions.notFlags.some((flag) => Boolean(state.game.flags[flag]))) {
      return false;
    }
    if (conditions.minRelationships) {
      const invalid = Object.entries(conditions.minRelationships).some(
        ([id, minimum]) => getRelationshipValue(id) < Number(minimum)
      );
      if (invalid) return false;
    }
    if (conditions.maxRelationships) {
      const invalid = Object.entries(conditions.maxRelationships).some(
        ([id, maximum]) => getRelationshipValue(id) > Number(maximum)
      );
      if (invalid) return false;
    }
    if (conditions.minStats) {
      const invalid = Object.entries(conditions.minStats).some(([statKey, minimum]) => {
        const target = resolveStatTarget(statKey);
        return getStatValue(target) < Number(minimum);
      });
      if (invalid) return false;
    }
    if (conditions.maxStats) {
      const invalid = Object.entries(conditions.maxStats).some(([statKey, maximum]) => {
        const target = resolveStatTarget(statKey);
        return getStatValue(target) > Number(maximum);
      });
      if (invalid) return false;
    }
    return true;
  }

  function applyStatChange(target, delta, changes) {
    if (!target || !target.statKey) return;
    const definition =
      target.kind === "shared"
        ? getSharedStatDefinition(target.statKey)
        : getStatDefinition(target.statKey);
    const numericDelta = Number(delta);
    if (!definition || !Number.isFinite(numericDelta) || numericDelta === 0) return;

    const oldValue = getStatValue(target);
    let newValue = oldValue + numericDelta;
    if (target.kind === "character") {
      newValue = clampStatValue(target.statKey, newValue);
      if (newValue === null) return;
    } else {
      newValue = Math.max(0, newValue);
    }
    if (newValue === oldValue) return;

    setStatValue(target, newValue);
    const character = target.kind === "character" ? getCharacter(target.characterId) : null;
    changes.push({
      kind: "stat",
      scope: target.kind,
      characterId: target.characterId,
      ownerName: character ? character.name : "队伍",
      statKey: target.statKey,
      label: definition.label,
      short: definition.short || "",
      color: definition.color || (character ? character.accent : "#355e4d"),
      delta: newValue - oldValue,
      value: newValue,
      max: Number.isFinite(Number(definition.max)) ? Number(definition.max) : null
    });
  }

  function applyStatsEffects(stats) {
    const changes = [];
    if (!stats || typeof stats !== "object") return changes;

    Object.entries(stats).forEach(([targetKey, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        if (targetKey === "shared") {
          Object.entries(value).forEach(([statKey, delta]) => {
            applyStatChange({ kind: "shared", characterId: null, statKey }, delta, changes);
          });
        } else if (STORY.characters[targetKey]) {
          Object.entries(value).forEach(([statKey, delta]) => {
            applyStatChange({ kind: "character", characterId: targetKey, statKey }, delta, changes);
          });
        }
        return;
      }

      applyStatChange(resolveStatTarget(targetKey), value, changes);
    });

    return changes;
  }

  function applyEffects(effects) {
    const changes = [];
    if (!effects || !state.game) return changes;
    const config = STORY.meta.relationship || { min: -5, max: 5 };

    if (effects.stats) {
      changes.push(...applyStatsEffects(effects.stats));
    }

    if (effects.relationships) {
      Object.entries(effects.relationships).forEach(([characterId, delta]) => {
        const character = getCharacter(characterId);
        if (!character || character.self) return;
        const numericDelta = Number(delta);
        if (!Number.isFinite(numericDelta) || numericDelta === 0) return;
        const oldValue = getRelationshipValue(characterId);
        const newValue = clamp(oldValue + numericDelta, config.min ?? -5, config.max ?? 5);
        state.game.relationships[characterId] = newValue;
        if (newValue !== oldValue) {
          changes.push({
            kind: "relationship",
            characterId,
            name: character.name,
            accent: character.accent,
            delta: newValue - oldValue,
            oldValue,
            newValue,
            newLabel: getRelationshipLevel(newValue).label
          });
        }
      });
    }

    if (effects.flags) {
      Object.entries(effects.flags).forEach(([flagId, value]) => {
        if (value) {
          if (!state.game.flags[flagId]) {
            state.game.flags[flagId] = true;
            changes.push({
              kind: "flag",
              id: flagId,
              label: (STORY.flags[flagId] && STORY.flags[flagId].label) || flagId
            });
          }
        } else {
          delete state.game.flags[flagId];
        }
      });
    }

    return changes;
  }

  function renderChoices(node) {
    const visible = [];
    const fragment = document.createDocumentFragment();

    node.choices.forEach((choice) => {
      const available = conditionsMet(choice.conditions);
      if (!available && !choice.lockedText) return;
      const displayIndex = visible.length;
      const tone = choice.toneColor || "#355e4d";
      const choiceEffects = normalizeFx(choice.fx);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice";
      choiceEffects.forEach((effect) => button.classList.add("choice--" + effect));
      button.style.setProperty("--tone", tone);
      button.style.animationDelay = displayIndex * 55 + "ms";
      if (!available) {
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");
      }

      const index = document.createElement("span");
      index.className = "choice-index";
      index.textContent = pad2(displayIndex + 1);

      const body = document.createElement("span");
      body.className = "choice-body";

      const toneEl = document.createElement("span");
      toneEl.className = "choice-tone";
      toneEl.textContent = choice.tone || "选择";

      const label = document.createElement("span");
      label.className = "choice-label";
      appendRichText(label, choice.text || "未命名选项", {
        shakeChars: choiceEffects.includes("shake")
      });

      const detail = document.createElement("span");
      detail.className = "choice-detail";
      detail.textContent = !available ? choice.lockedText || "条件未满足" : choice.detail || "";

      body.append(toneEl, label);
      if (detail.textContent) body.appendChild(detail);

      const arrow = document.createElement("span");
      arrow.className = "choice-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = available ? "→" : "×";

      button.append(index, body, arrow);
      if (!available) button.classList.add("is-locked");

      if (available) {
        button.addEventListener("click", () => pickChoice(entry));
      }

      const entry = {
        choice,
        button,
        disabled: !available,
        index: displayIndex
      };
      visible.push(entry);
      fragment.appendChild(button);
    });

    dom.choices.appendChild(fragment);
    dom.choiceCount.textContent = pad2(visible.length);

    if (!visible.length) {
      const empty = document.createElement("p");
      empty.className = "choice-note";
      empty.textContent = "当前没有可用回应。请检查剧本条件或补充分支。";
      dom.choices.appendChild(empty);
    }

    dom.choicePanel.hidden = false;
    dom.storyConsole.classList.add("has-choices");
    hideAdvance();
    state.currentChoices = visible;
  }

  function pickChoice(entry) {
    if (!entry || entry.disabled) return;
    if (!state.game || !state.currentChoices.includes(entry)) return;
    if (!getNode(entry.choice.next)) {
      console.warn("[叙事框架] 选项指向不存在的节点：", entry.choice.next);
      return;
    }

    state.currentChoices.forEach((item) => {
      item.button.disabled = true;
    });

    recordChoice(entry.choice);
    const changes = applyEffects(entry.choice.effects);
    if (changes.some((change) => change.kind === "relationship")) renderCastRail();
    goTo(entry.choice.next);

    if (changes.length) {
      window.setTimeout(() => showEffectChanges(changes), 350);
    }
  }

  function chooseByIndex(index) {
    const entry = state.currentChoices[index];
    if (!entry || entry.disabled) return;
    entry.button.click();
  }

  /* ============================================================
     History
     ============================================================ */

  function recordDialogue(node) {
    if (!state.game) return;
    const paragraphs = normalizeParagraphs(node.text);
    if (!paragraphs.length) return;
    const character = node.speaker ? getCharacter(node.speaker) : null;
    state.game.history.push({
      type: "dialogue",
      nodeId: state.game.nodeId,
      speakerId: character ? node.speaker : null,
      speakerName: character ? character.name : "旁白",
      speakerRole: character ? character.role : "叙事记录",
      accent: character ? character.accent : "#aebcba",
      paragraphs,
      at: Date.now()
    });
    trimHistory();
  }

  function recordChoice(choice) {
    if (!state.game) return;
    state.game.history.push({
      type: "choice",
      nodeId: state.game.nodeId,
      text: choice.text || "未命名选项",
      tone: choice.tone || "选择",
      accent: choice.toneColor || "#98e9da",
      at: Date.now()
    });
    trimHistory();
  }

  function trimHistory() {
    if (!state.game) return;
    if (state.game.history.length > 300) {
      state.game.history = state.game.history.slice(-300);
    }
  }

  /* ============================================================
     Ending
     ============================================================ */

  function renderEnding(node) {
    const ending = node.ending || {};
    const variant = (ending.variants || []).find((item) => conditionsMet(item.when));
    const summary = (variant && variant.text) || ending.summary || "故事暂时停在这里。";
    const relationships = Object.entries(STORY.characters)
      .filter(([, character]) => !character.self)
      .map(([id, character]) => {
        const value = getRelationshipValue(id);
        const level = getRelationshipLevel(value);
        return (
          '<div class="ending-relation" style="--char-accent:' +
          escapeHTML(character.accent) +
          '"><span>' +
          escapeHTML(character.name) +
          " / 关系</span><strong>" +
          escapeHTML(level.label) +
          "</strong></div>"
        );
      })
      .join("");

    dom.endingHost.innerHTML =
      '<div class="ending-card" role="group" aria-label="章节结束">' +
      '<span class="ending-kicker">' +
      escapeHTML(ending.kicker || "CHAPTER END") +
      "</span>" +
      '<h2 class="ending-title">' +
      escapeHTML(ending.title || "本章结束") +
      "</h2>" +
      '<p class="ending-summary">' +
      escapeHTML(summary) +
      "</p>" +
      '<div class="ending-relations">' +
      relationships +
      "</div>" +
      '<p class="ending-note">' +
      escapeHTML(ending.note || "后续章节待编写。") +
      "</p>" +
      '<div class="ending-actions">' +
      '<button type="button" class="small-button" data-ending-action="status">查看人物状态</button>' +
      '<button type="button" class="small-button" data-ending-action="title">回到标题</button>' +
      '<button type="button" class="small-button small-button--accent" data-ending-action="restart">重新开始</button>' +
      "</div>" +
      "</div>";

    dom.endingHost.hidden = false;
    dom.choicePanel.hidden = true;
    dom.storyConsole.classList.add("has-choices");
    hideAdvance();
  }

  /* ============================================================
     Status
     ============================================================ */

  function renderCastRail() {
    if (!state.game) return;
    const buttons = Object.entries(STORY.characters).map(([id, character]) => {
      const initial = character.initial || Array.from(character.name || "?")[0];
      return (
        '<button type="button" class="cast-button" data-character="' +
        escapeHTML(id) +
        '" style="--char-accent:' +
        escapeHTML(character.accent) +
        '" title="' +
        escapeHTML(character.name + " · 查看人物状态") +
        '" aria-label="' +
        escapeHTML("查看" + character.name + "的状态") +
        '"><span aria-hidden="true">' +
        escapeHTML(initial) +
        "</span></button>"
      );
    });
    dom.castButtons.innerHTML = buttons.join("");
  }

  function openStatus(characterId) {
    if (!state.game) return;
    closeMenu();
    const fallback =
      state.lastSpeaker && STORY.characters[state.lastSpeaker]
        ? state.lastSpeaker
        : protagonistId();
    const selected = characterId && STORY.characters[characterId] ? characterId : fallback;
    state.statusSelection = selected;
    renderStatusIndex();
    renderStatusDetail(selected);
    openModal("statusModal");
  }

  function renderStatusIndex() {
    const definitions = STORY.meta.stats || {};
    const primaryBarKey = Object.keys(definitions).find((key) => definitions[key].type === "bar") || null;
    const primaryBar = primaryBarKey ? definitions[primaryBarKey] : null;

    dom.statusIndex.innerHTML = Object.entries(STORY.characters)
      .map(([id, character]) => {
        const active = id === state.statusSelection;
        const stats = getCharacterStats(id);
        const primaryValue = primaryBarKey ? stats[primaryBarKey] : null;
        const primaryText = primaryBar
          ? (primaryBar.short || primaryBar.label) +
            " " +
            statDisplayValue(primaryValue) +
            (primaryBar.max ? "/" + primaryBar.max : "")
          : character.status || "正常";
        return (
          '<button type="button" class="status-person' +
          (active ? " is-active" : "") +
          '" data-character="' +
          escapeHTML(id) +
          '" style="--person-accent:' +
          escapeHTML(character.accent) +
          '" aria-pressed="' +
          active +
          '">' +
          '<span class="person-monogram" aria-hidden="true">' +
          escapeHTML(character.initial || Array.from(character.name || "?")[0]) +
          "</span>" +
          '<span class="person-meta"><strong>' +
          escapeHTML(character.name) +
          "</strong><span>" +
          escapeHTML(character.role || "") +
          "</span></span>" +
          '<span class="person-relation">' +
          escapeHTML(primaryText) +
          "</span>" +
          "</button>"
        );
      })
      .join("");
  }

  function statusRelationshipMarkup(characterId, character) {
    if (!character || character.self) return "";
    const config = STORY.meta.relationship || { min: -5, max: 5 };
    const min = config.min ?? -5;
    const max = config.max ?? 5;
    const value = getRelationshipValue(characterId);
    const level = getRelationshipLevel(value);
    const percent = ((value - min) / (max - min)) * 100;
    const middle = ((0 - min) / (max - min)) * 100;
    const fillLeft = Math.min(percent, middle);
    const fillWidth = Math.abs(percent - middle);
    const numeric = value > 0 ? "+" + value : String(value);

    return (
      '<div class="status-relationship">' +
      '<div class="status-section-label"><span>关系</span><small>RELATIONSHIP</small></div>' +
      '<div class="relationship-head"><span>与' +
      escapeHTML(character.name) +
      "的关系</span><strong>" +
      escapeHTML(level.label) +
      "<em>" +
      escapeHTML(numeric) +
      "</em></strong></div>" +
      '<div class="relationship-track" role="img" aria-label="关系倾向：' +
      escapeHTML(level.label) +
      '">' +
      '<span class="relationship-fill" style="left:' +
      fillLeft +
      "%;width:" +
      fillWidth +
      '%"></span>' +
      '<span class="relationship-marker" style="left:' +
      percent +
      '%"></span>' +
      "</div>" +
      '<div class="relationship-scale"><span>疏远</span><span>平静</span><span>亲近</span></div>' +
      "</div>"
    );
  }

  function renderStatusDetail(characterId) {
    const character = STORY.characters[characterId];
    if (!character) return;
    const accent = character.accent || "#355e4d";
    const definitions = STORY.meta.stats || {};
    const sharedDefinitions = STORY.meta.sharedStats || {};
    const stats = getCharacterStats(characterId);
    const sharedStats = getSharedStats();

    const vitals = Object.entries(definitions)
      .filter(([, definition]) => definition.type === "bar")
      .map(([statKey, definition]) => {
        const value = Number(stats[statKey]) || 0;
        const max = Number(definition.max);
        const percent = Number.isFinite(max) && max > 0 ? clamp((value / max) * 100, 0, 100) : 0;
        const color = definition.color || accent;
        return (
          '<div class="stat-vital">' +
          '<div class="stat-vital-head"><span><strong>' +
          escapeHTML(definition.label) +
          "</strong><small>" +
          escapeHTML(definition.short || "") +
          "</small></span><b>" +
          escapeHTML(statDisplayValue(value)) +
          (Number.isFinite(max) ? '<em> / ' + escapeHTML(statDisplayValue(max)) + "</em>" : "") +
          "</b></div>" +
          '<div class="stat-vital-track" role="progressbar" aria-label="' +
          escapeHTML(definition.label) +
          '" aria-valuemin="0"' +
          (Number.isFinite(max) ? ' aria-valuemax="' + max + '"' : "") +
          ' aria-valuenow="' +
          value +
          '"><span style="width:' +
          percent +
          "%;background:" +
          escapeHTML(color) +
          '"></span></div>' +
          "</div>"
        );
      })
      .join("");

    const attributes = Object.entries(definitions)
      .filter(([, definition]) => definition.type !== "bar")
      .map(([statKey, definition]) => {
        return (
          '<div class="stat-attribute">' +
          '<span><small>' +
          escapeHTML(definition.label) +
          "</small><em>" +
          escapeHTML(definition.short || "") +
          "</em></span><strong>" +
          escapeHTML(statDisplayValue(stats[statKey])) +
          "</strong></div>"
        );
      })
      .join("");

    const resources = Object.entries(sharedDefinitions)
      .map(([statKey, definition]) => {
        return (
          '<div class="status-resource" style="--resource-color:' +
          escapeHTML(definition.color || accent) +
          '">' +
          '<span class="status-resource-mark">' +
          escapeHTML((definition.short || definition.label || "G").slice(0, 1)) +
          "</span>" +
          '<span class="status-resource-name"><small>' +
          escapeHTML(definition.short || "") +
          "</small>" +
          escapeHTML(definition.label) +
          "</span>" +
          '<strong>' +
          escapeHTML(statDisplayValue(sharedStats[statKey])) +
          "</strong></div>"
        );
      })
      .join("");

    const initial = character.initial || Array.from(character.name || "?")[0];
    dom.statusDetail.innerHTML =
      '<div class="status-sheet" style="--char-accent:' +
      escapeHTML(accent) +
      '">' +
      '<header class="status-sheet-head">' +
      '<span class="status-avatar" aria-hidden="true">' +
      escapeHTML(initial) +
      "</span>" +
      '<div class="status-heading">' +
      '<div class="status-overline"><span>CHARACTER / ' +
      escapeHTML(character.serial || character.en || "") +
      '</span><span class="status-status"><i></i>' +
      escapeHTML(character.status || "正常") +
      "</span></div>" +
      '<div class="status-name-row"><h3>' +
      escapeHTML(character.name) +
      "<span>" +
      escapeHTML(character.en || "") +
      "</span></div>" +
      '<p class="status-role">' +
      escapeHTML(character.role || "") +
      "</p>" +
      "</div>" +
      "</header>" +
      (resources
        ? '<div class="status-resources"><div class="status-section-label"><span>队伍资源</span><small>SHARED</small></div><div class="status-resource-row">' +
          resources +
          "</div></div>"
        : "") +
      '<div class="status-vitals"><div class="status-section-label"><span>基础属性</span><small>VITALS</small></div>' +
      (vitals || '<p class="status-empty">尚未定义属性。</p>') +
      "</div>" +
      (attributes
        ? '<div class="status-attributes"><div class="status-section-label"><span>战斗属性</span><small>ATTRIBUTES</small></div><div class="stat-attribute-grid">' +
          attributes +
          "</div></div>"
        : "") +
      statusRelationshipMarkup(characterId, character) +
      '<p class="status-update-note">属性与资源会随着剧情选择实时变化。</p>' +
      "</div>";

    dom.statusDetail.scrollTop = 0;
  }

  /* ============================================================
     History modal
     ============================================================ */

  function renderHistory() {
    if (!state.game) return;
    const entries = state.game.history || [];
    dom.historyCount.textContent = entries.length + " 条记录";

    if (!entries.length) {
      dom.historyList.innerHTML = '<p class="history-empty">还没有可回看的记录。</p>';
      return;
    }

    dom.historyList.innerHTML = entries
      .map((entry) => {
        if (entry.type === "choice") {
          return (
            '<article class="history-entry is-choice" style="--entry-accent:' +
            escapeHTML(entry.accent || "#98e9da") +
            '">' +
            '<span class="history-choice-label">你的选择 · ' +
            escapeHTML(entry.tone || "RESPONSE") +
            "</span>" +
            "<p>" +
            escapeHTML(entry.text) +
            "</p></article>"
          );
        }

        const paragraphs = (entry.paragraphs || []).map((paragraph) => "<p>" + escapeHTML(paragraph) + "</p>").join("");
        return (
          '<article class="history-entry" style="--entry-accent:' +
          escapeHTML(entry.accent || "#aebcba") +
          '">' +
          '<div class="history-entry-head">' +
          escapeHTML(entry.speakerName || "旁白") +
          "<span>" +
          escapeHTML(entry.speakerRole || "叙事记录") +
          "</span></div>" +
          paragraphs +
          "</article>"
        );
      })
      .join("");
  }

  function openHistory() {
    if (!state.game) return;
    closeMenu();
    renderHistory();
    openModal("historyModal");
    window.setTimeout(() => {
      dom.historyList.scrollTop = dom.historyList.scrollHeight;
    }, 40);
  }

  /* ============================================================
     Modal & menu management
     ============================================================ */

  function openModal(id) {
    const layer = document.getElementById(id);
    if (!layer || !layer.hidden) return;
    closeMenu();
    state.modalReturnFocus = document.activeElement;
    state.modalStack.push(id);
    layer.hidden = false;
    layer.inert = false;
    layer.setAttribute("aria-hidden", "false");
    dom.gameShell.classList.add("has-modal");
    window.setTimeout(() => layer.classList.add("is-open"), 20);

    window.setTimeout(() => {
      if (layer.hidden) return;
      const target =
        layer.querySelector("[data-autofocus]") ||
        layer.querySelector(".close-button") ||
        layer.querySelector("button:not([disabled])");
      if (target) target.focus({ preventScroll: true });
    }, 60);
  }

  function closeModal(id) {
    const layer = document.getElementById(id);
    if (!layer || layer.hidden) return;
    layer.classList.remove("is-open");
    layer.setAttribute("aria-hidden", "true");
    layer.inert = true;

    const stackIndex = state.modalStack.lastIndexOf(id);
    if (stackIndex >= 0) state.modalStack.splice(stackIndex, 1);
    if (id === "confirmModal") state.confirmAction = null;

    window.setTimeout(() => {
      if (layer.classList.contains("is-open")) return;
      layer.hidden = true;
      if (!state.modalStack.length) {
        dom.gameShell.classList.remove("has-modal");
        if (state.modalReturnFocus && state.modalReturnFocus.isConnected) {
          state.modalReturnFocus.focus({ preventScroll: true });
        }
      }
    }, 330);
  }

  function closeAllModals(options) {
    const opts = options || {};
    state.modalStack.slice().forEach((id) => {
      const layer = document.getElementById(id);
      if (!layer) return;
      if (opts.instant) {
        layer.classList.remove("is-open");
        layer.hidden = true;
        layer.inert = true;
        layer.setAttribute("aria-hidden", "true");
      } else {
        closeModal(id);
      }
    });
    state.modalStack = [];
    state.confirmAction = null;
    if (opts.instant) dom.gameShell.classList.remove("has-modal");
  }

  function openConfirm(config) {
    state.confirmAction = config.onAccept || null;
    dom.confirmTitle.textContent = config.title || "确认操作";
    dom.confirmText.textContent = config.text || "确认继续吗？";
    dom.confirmAccept.textContent = config.acceptLabel || "确认";
    openModal("confirmModal");
  }

  function trapFocus(event, layer) {
    const focusable = Array.from(
      layer.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((element) => element.getClientRects().length > 0);

    if (!focusable.length) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    } else if (!layer.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    }
  }

  function openMenu() {
    if (state.game) {
      const chapter = state.currentNode && STORY.chapters[state.currentNode.chapter];
      dom.menuProgress.textContent =
        "CH." + (chapter ? chapter.number : "01") + " / " + (state.currentNode ? state.currentNode.location : "未知");
      dom.menuSaveText.textContent = dom.saveText.textContent;
    }
    dom.menuPopover.hidden = false;
    dom.menuToggle.setAttribute("aria-expanded", "true");
  }

  function closeMenu() {
    dom.menuPopover.hidden = true;
    dom.menuToggle.setAttribute("aria-expanded", "false");
  }

  function toggleMenu() {
    if (dom.menuPopover.hidden) openMenu();
    else closeMenu();
  }

  /* ============================================================
     Toasts
     ============================================================ */

  function showToast(tag, text, accent) {
    if (!dom.toastStack) return;
    while (dom.toastStack.children.length >= 3) {
      dom.toastStack.firstElementChild.remove();
    }
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.style.setProperty("--toast-accent", accent || "#355e4d");
    const tagEl = document.createElement("span");
    tagEl.textContent = tag;
    const textEl = document.createElement("strong");
    textEl.textContent = text;
    toast.append(tagEl, textEl);
    dom.toastStack.appendChild(toast);
    window.setTimeout(() => {
      toast.classList.add("is-leaving");
      window.setTimeout(() => toast.remove(), 360);
    }, 3000);
  }

  function showEffectChanges(changes) {
    if (!changes || !changes.length || !state.game) return;
    changes.forEach((change, index) => {
      window.setTimeout(() => {
        if (change.kind === "relationship") {
          const delta = change.delta > 0 ? "+" + change.delta : String(change.delta);
          showToast(
            "RELATIONSHIP / " + change.name,
            change.newLabel + " · " + delta,
            change.accent
          );
        } else if (change.kind === "stat") {
          const delta = change.delta > 0 ? "+" + change.delta : String(change.delta);
          const after = change.max !== null
            ? " → " + statDisplayValue(change.value) + " / " + statDisplayValue(change.max)
            : " → " + statDisplayValue(change.value);
          showToast(
            change.ownerName + " · " + change.label + (change.short ? " / " + change.short : ""),
            delta + after,
            change.color
          );
        } else if (change.kind === "flag") {
          showToast("STORY UPDATED", "记录更新 · " + change.label, "#8a6750");
        }
      }, index * 130);
    });
  }

  /* ============================================================
     Event binding
     ============================================================ */

  function bindEvents() {
    dom.primaryStart.addEventListener("click", () => {
      const mode = dom.primaryStart.dataset.mode === "continue" ? "continue" : "new";
      if (mode === "continue" && !readSave()) {
        refreshTitle();
        return;
      }
      enterGame(mode);
    });

    dom.newGameStart.addEventListener("click", requestNewGame);

    document.querySelector("[data-open-status]").addEventListener("click", () => openStatus());
    document.querySelector("[data-open-history]").addEventListener("click", openHistory);

    dom.advanceBtn.addEventListener("click", advance);

    dom.menuToggle.addEventListener("click", toggleMenu);
    dom.menuTitleBtn.addEventListener("click", returnToTitle);
    dom.menuRestartBtn.addEventListener("click", () => {
      closeMenu();
      requestNewGame();
    });

    dom.castButtons.addEventListener("click", (event) => {
      const button = event.target.closest("[data-character]");
      if (!button) return;
      openStatus(button.dataset.character);
    });

    dom.statusIndex.addEventListener("click", (event) => {
      const button = event.target.closest("[data-character]");
      if (!button) return;
      const id = button.dataset.character;
      if (!STORY.characters[id]) return;
      state.statusSelection = id;
      renderStatusIndex();
      renderStatusDetail(id);
      const active = dom.statusIndex.querySelector('[data-character="' + CSS.escape(id) + '"]');
      if (active) active.focus({ preventScroll: true });
    });

    document.addEventListener("click", (event) => {
      const closeTarget = event.target.closest("[data-close]");
      if (closeTarget) {
        closeModal(closeTarget.dataset.close);
        return;
      }

      const endingAction = event.target.closest("[data-ending-action]");
      if (endingAction) {
        if (endingAction.dataset.endingAction === "status") openStatus();
        if (endingAction.dataset.endingAction === "title") returnToTitle();
        if (endingAction.dataset.endingAction === "restart") requestNewGame();
      }
    });

    document.addEventListener("pointerdown", (event) => {
      if (dom.menuPopover.hidden) return;
      if (dom.menuPopover.contains(event.target) || dom.menuToggle.contains(event.target)) return;
      closeMenu();
    });

    dom.confirmCancel.addEventListener("click", () => closeModal("confirmModal"));
    dom.confirmAccept.addEventListener("click", () => {
      const action = state.confirmAction;
      closeModal("confirmModal");
      if (action) window.setTimeout(action, 80);
    });

    document.addEventListener("keydown", handleKeydown);
  }

  function handleKeydown(event) {
    const openLayer = Array.from(document.querySelectorAll(".modal-layer.is-open")).pop();

    if (event.key === "Escape") {
      if (openLayer) {
        event.preventDefault();
        closeModal(openLayer.id);
        return;
      }
      if (!dom.menuPopover.hidden) {
        event.preventDefault();
        closeMenu();
        return;
      }
    }

    if (openLayer) {
      if (event.key === "Tab") trapFocus(event, openLayer);
      return;
    }

    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (dom.gameShell.classList.contains("is-title")) return;
    if (event.repeat) return;

    const key = String(event.key || "").toLowerCase();
    const targetIsControl = event.target && event.target.closest && event.target.closest("button, a, input, textarea, select");

    if (key === "c") {
      event.preventDefault();
      openStatus();
      return;
    }
    if (key === "h") {
      event.preventDefault();
      openHistory();
      return;
    }
    if (key === "m") {
      event.preventDefault();
      toggleMenu();
      return;
    }
    if ((event.code === "Space" || event.key === "Enter") && !targetIsControl) {
      event.preventDefault();
      advance();
      return;
    }
    if (/^[1-9]$/.test(event.key) && !targetIsControl) {
      event.preventDefault();
      chooseByIndex(Number(event.key) - 1);
    }
  }

  /* ============================================================
     Boot
     ============================================================ */

  function init() {
    if (!STORY || !STORY.nodes || !STORY.characters) {
      console.error("[叙事框架] 剧本数据加载失败，请检查 js/config.js 和 story/chapters/ 下的场景文件。");
      return;
    }

    validateStory();
    renderTitle();
    bindEvents();

    window.Game = {
      story: STORY,
      getState: () => (state.game ? JSON.parse(JSON.stringify(state.game)) : null),
      getCurrentNode: () => (state.currentNode ? state.currentNode : null),
      goTo: (nodeId) => {
        if (state.game) goTo(nodeId);
      },
      choose: (index) => chooseByIndex(index),
      openStatus: (characterId) => openStatus(characterId),
      getStats: () => (state.game ? JSON.parse(JSON.stringify(state.game.stats)) : null),
      restart: requestNewGame,
      validateStory
    };
  }

  init();
})();
