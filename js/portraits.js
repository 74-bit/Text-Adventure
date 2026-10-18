/* ============================================================
   叙事框架 · 人物视觉占位
   ------------------------------------------------------------
   默认使用中性、可替换的字体肖像占位，不绑定任何题材。
   在人物数据中加入 image 字段即可直接使用自己的立绘：

   image: "assets/character.png"
   ============================================================ */

(function () {
  "use strict";

  function escapeHTML(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function create(id, options) {
    const opts = options || {};
    const story = window.STORY || {};
    const character = (story.characters && story.characters[id]) || {};
    const mode = opts.mode || "stage";
    const accent = character.accent || "#d7b68c";

    if (character.image) {
      return (
        '<img class="portrait-image" src="' +
        escapeHTML(character.image) +
        '" alt="" decoding="async" />'
      );
    }

    const initial = character.initial || Array.from(character.name || "?")[0] || "?";
    const serial = character.serial || character.en || id || "";
    const englishName = character.en || "";

    return (
      '<div class="portrait-art portrait-art--' +
      escapeHTML(mode) +
      '" style="--portrait-accent:' +
      escapeHTML(accent) +
      '">' +
      '<span class="portrait-art-glow" aria-hidden="true"></span>' +
      '<span class="portrait-art-frame" aria-hidden="true"></span>' +
      '<span class="portrait-art-rule portrait-art-rule--top" aria-hidden="true"></span>' +
      '<span class="portrait-art-rule portrait-art-rule--bottom" aria-hidden="true"></span>' +
      '<span class="portrait-art-index">' +
      escapeHTML(serial) +
      "</span>" +
      '<span class="portrait-art-initial" aria-hidden="true">' +
      escapeHTML(initial) +
      "</span>" +
      '<span class="portrait-art-en">' +
      escapeHTML(englishName) +
      "</span>" +
      '<span class="portrait-art-caption">CHARACTER PORTRAIT</span>' +
      "</div>"
    );
  }

  window.Portrait = {
    create: create,
    generate: create
  };
})();
