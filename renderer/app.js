/* 实例模型（ADR-0007）：左栏两级树（项目折叠→实例），标签/分屏/modal 归属实例。
   新窗口拦截靠主进程 setWindowOpenHandler，经 mpAPI.onWindowOpen 转到这里。
   webview 节点一经创建不再重建（只切换显隐），避免切标签就重载页面。 */
(function () {
  "use strict";

  var BLANK = "about:blank";
  var tabSeq = 0;
  var modalSeq = 0;

  var projects = [];
  var instances = [];
  var projById = {};
  var instById = {};
  var collapsed = {};
  var tabs = [];
  var activeTabId = null;
  var currentInstanceId = "";
  var split = null;
  var modals = [];
  var panes = {};
  var modalNodes = {};
  var dupIds = {};
  var settings = { newTabDefault: "current", popupBehavior: "modal", conflictNotify: true, downloadDir: "" };
  var showingSettings = false;
  var settingsDraft = null;

  var PALETTE = ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#ec4899", "#6b7280"];

  function partitionFor(id) { return "persist:mp-" + id; }
  function projectOf(id) { return projById[id]; }
  function instanceOf(id) { return instById[id]; }
  function tabOf(id) {
    for (var i = 0; i < tabs.length; i++) if (tabs[i].id === id) return tabs[i];
    return null;
  }
  function instancesOf(pid) {
    return instances.filter(function (c) { return c.projectId === pid; });
  }

  function openTab(url, instanceId) {
    if (instanceId) { makeTab(url, instanceId); return; }
    // 新标签归属：默认当前实例；设为“每次都问”时弹实例选择浮层（草稿不落地，选完才开）。
    if (settings.newTabDefault === "ask" && instances.length > 1) {
      promptDialog({
        title: "新标签归属哪个实例？",
        choices: instances.map(function (c) {
          var p = projectOf(c.projectId);
          return { value: c.id, label: (p ? p.name + " / " : "") + c.name };
        }),
      }).then(function (r) { if (r) makeTab(url, r.choice); });
      return;
    }
    makeTab(url, currentInstanceId);
  }

  function makeTab(url, instanceId) {
    exitSettings();
    tabSeq += 1;
    var tab = { id: "t-" + tabSeq, instanceId: instanceId || currentInstanceId, url: url || BLANK, title: "" };
    tabs.push(tab);
    activeTabId = tab.id;
    makePane(tab);
    render();
  }

  function closeTab(id) {
    exitSettings();
    tabs = tabs.filter(function (t) { return t.id !== id; });
    var p = panes[id];
    if (p) { p.pane.remove(); delete panes[id]; }
    if (split && (split.leftTabId === id || split.rightTabId === id)) split = null;
    if (activeTabId === id) activeTabId = tabs.length ? tabs[tabs.length - 1].id : null;
    render();
  }

  function switchInstance(id) {
    exitSettings();
    currentInstanceId = id;
    var recent = null;
    for (var i = tabs.length - 1; i >= 0; i--) {
      if (tabs[i].instanceId === id) { recent = tabs[i].id; break; }
    }
    activeTabId = recent;
    render();
  }

  function toggleSplit() {
    if (split) { split = null; render(); return; }
    if (!activeTabId) return;
    var other = null;
    for (var i = tabs.length - 1; i >= 0; i--) {
      if (tabs[i].id !== activeTabId) { other = tabs[i].id; break; }
    }
    if (!other) return;
    split = { leftTabId: activeTabId, rightTabId: other };
    render();
  }

  function openModal(url, instanceId, openerTabId) {
    modalSeq += 1;
    modals.push({ id: "m-" + modalSeq, url: url, instanceId: instanceId || currentInstanceId, openerTabId: openerTabId || null });
    renderModals();
  }

  function closeModal(id) {
    var modal = null;
    modals = modals.filter(function (m) {
      if (m.id === id) { modal = m; return false; }
      return true;
    });
    var node = modalNodes[id];
    if (node) { node.remove(); delete modalNodes[id]; }
    // Q8B：关闭弹窗后自动刷新打开它的标签页（登录态生效）。
    if (modal && modal.openerTabId && panes[modal.openerTabId]) {
      try { panes[modal.openerTabId].view.reload(); } catch (e) { /* 忽略 */ }
    }
    renderModals();
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function makeWebview(instanceId, url) {
    var view = document.createElement("webview");
    view.setAttribute("partition", partitionFor(instanceId));
    view.setAttribute("allowpopups", "");
    if (url !== BLANK) view.setAttribute("src", url);
    view.addEventListener("did-attach", function () {
      try { window.mpAPI.registerWebview(view.getWebContentsId(), instanceId); } catch (e) { /* 忽略 */ }
    });
    return view;
  }

  function makePane(tab) {
    var pane = el("div", "pane");
    var bar = el("div", "addrbar");
    var input = el("input");
    input.value = tab.url === BLANK ? "" : tab.url;
    input.placeholder = "输入网址，回车打开";
    var go = el("button", "", "前往");
    bar.appendChild(input);
    bar.appendChild(go);
    var view = makeWebview(tab.instanceId, tab.url);
    view.addEventListener("page-title-updated", function (e) {
      tab.title = e.title;
      renderTabbar();
    });
    pane.appendChild(bar);
    pane.appendChild(view);
    document.getElementById("views").insertBefore(pane, document.getElementById("modal-layer"));
    panes[tab.id] = { pane: pane, view: view, input: input };
    function submit() {
      if (!input.value) return;
      var url = /^https?:\/\//i.test(input.value) ? input.value : "https://" + input.value;
      input.value = url;
      tab.url = url;
      view.setAttribute("src", url);
      renderTabbar();
    }
    go.onclick = submit;
    input.onkeydown = function (e) { if (e.key === "Enter") submit(); };
  }

  function renderSidebar() {
    var list = document.getElementById("proj-list");
    list.innerHTML = "";
    document.getElementById("sidebar").oncontextmenu = function (e) {
      if (e.target.closest(".proj,.inst")) return;
      e.preventDefault();
      window.mpAPI.showContextMenu("sidebar", "", e.x, e.y);
    };
    projects.forEach(function (p) {
      var head = el("div", "proj");
      var caret = el("span", "caret", collapsed[p.id] ? "▶" : "▼");
      var dot = el("span", "dot");
      dot.style.background = p.color;
      head.appendChild(caret);
      head.appendChild(dot);
      head.appendChild(el("span", "", p.name));
      head.onclick = function () {
        collapsed[p.id] = !collapsed[p.id];
        renderSidebar();
      };
      head.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        window.mpAPI.showContextMenu("project", p.id, e.x, e.y);
      });
      list.appendChild(head);
      if (collapsed[p.id]) return;
      instancesOf(p.id).forEach(function (c) {
        var item = el("div", "inst" + (c.id === currentInstanceId ? " active" : ""));
        var idot = el("span", "dot");
        idot.style.background = c.color;
        item.appendChild(idot);
        item.appendChild(el("span", "", c.name));
        if (c.label && c.label.trim()) item.appendChild(el("span", "lbl", c.label.trim()));
        if (dupIds[c.id]) {
          var dd = el("span", "dup-dot");
          dd.title = "该账号同时出现在多个实例";
          item.appendChild(dd);
        }
        item.onclick = function () { switchInstance(c.id); };
        item.addEventListener("contextmenu", function (e) {
          e.preventDefault();
          window.mpAPI.showContextMenu("instance", c.id, e.x, e.y);
        });
        list.appendChild(item);
      });
    });
  }

  function renderTabbar() {
    var bar = document.getElementById("tabbar");
    bar.innerHTML = "";
    document.getElementById("split-toggle").textContent = split ? "分屏：开" : "分屏：关";
    tabs.forEach(function (t) {
      if (t.instanceId !== currentInstanceId) return;
      var c = instanceOf(t.instanceId);
      var tab = el("div", "tab" + (t.id === activeTabId ? " active" : ""));
      var dot = el("span", "dot");
      dot.style.background = c ? c.color : "#999";
      tab.appendChild(dot);
      tab.appendChild(el("span", "", t.title || (t.url === BLANK ? "新标签页" : t.url)));
      var x = el("button", "close", "×");
      x.onclick = function (e) { e.stopPropagation(); closeTab(t.id); };
      tab.appendChild(x);
      tab.onclick = function () { exitSettings(); activeTabId = t.id; render(); };
      bar.appendChild(tab);
    });
  }

  function layout() {
    var views = document.getElementById("views");
    var hint = document.getElementById("pane-hint");
    var visible = {};
    if (split) { visible[split.leftTabId] = 1; visible[split.rightTabId] = 2; }
    else if (activeTabId) { visible[activeTabId] = 1; }
    var anyVisible = false;
    Object.keys(panes).forEach(function (id) {
      var p = panes[id];
      if (visible[id]) {
        p.pane.style.display = "flex";
        p.pane.style.order = String(visible[id]);
        anyVisible = true;
      } else {
        p.pane.style.display = "none";
      }
    });
    if (!anyVisible && !hint) {
      hint = el("div", "hint", "＋ 新标签开始（默认归属当前实例）");
      hint.id = "pane-hint";
      views.insertBefore(hint, document.getElementById("modal-layer"));
    } else if (anyVisible && hint) {
      hint.remove();
    }
  }

  function renderModals() {
    var layer = document.getElementById("modal-layer");
    var alive = {};
    modals.forEach(function (m, idx) {
      alive[m.id] = true;
      var node = modalNodes[m.id];
      if (!node) {
        node = el("div", "modal");
        var bar = el("div", "modal-bar");
        var c = instanceOf(m.instanceId);
        var dot = el("span", "dot");
        dot.style.background = c ? c.color : "#999";
        bar.appendChild(dot);
        bar.appendChild(el("span", "url", m.url));
        var x = el("button", "", "×");
        x.onclick = (function (id) { return function () { closeModal(id); }; })(m.id);
        bar.appendChild(x);
        node.appendChild(bar);
        node.appendChild(makeWebview(m.instanceId, m.url));
        modalNodes[m.id] = node;
        layer.appendChild(node);
      }
      node.style.zIndex = String(10 + idx);
    });
    Object.keys(modalNodes).forEach(function (id) {
      if (!alive[id]) { modalNodes[id].remove(); delete modalNodes[id]; }
    });
  }

  function render() {
    renderSidebar();
    renderTabbar();
    layout();
    renderModals();
  }

  function promptDialog(opts) {
    return new Promise(function (resolve) {
      var overlay = document.getElementById("overlay");
      overlay.innerHTML = "";
      var box = el("div", "prompt");
      box.appendChild(el("h3", "", opts.title));
      var input = null;
      var select = null;
      if (opts.choices) {
        select = el("select");
        opts.choices.forEach(function (ch) {
          var o = document.createElement("option");
          o.value = ch.value;
          o.textContent = ch.label;
          select.appendChild(o);
        });
        box.appendChild(select);
      } else if (opts.showInput !== false) {
        input = el("input");
        input.value = opts.initial || "";
        input.placeholder = opts.placeholder || "";
        box.appendChild(input);
      }
      var color = opts.initialColor || PALETTE[0];
      if (opts.withPalette) {
        if (PALETTE.indexOf(color) < 0) color = PALETTE[0];
        var pal = el("div", "palette");
        PALETTE.forEach(function (c) {
          var s = el("span", "swatch" + (c === color ? " sel" : ""));
          s.style.background = c;
          s.onclick = function () {
            color = c;
            var all = pal.querySelectorAll(".swatch");
            for (var i = 0; i < all.length; i++) all[i].classList.remove("sel");
            s.classList.add("sel");
          };
          pal.appendChild(s);
        });
        box.appendChild(pal);
      }
      var row = el("div", "row");
      var ok = el("button", "", opts.okLabel || "确定");
      var cancel = el("button", "", "取消");
      row.appendChild(cancel);
      row.appendChild(ok);
      box.appendChild(row);
      overlay.appendChild(box);
      overlay.hidden = false;
      function done(result) {
        overlay.hidden = true;
        overlay.innerHTML = "";
        resolve(result);
      }
      ok.onclick = function () {
        if (select) { done({ choice: select.value }); return; }
        var v = input ? input.value.trim() : "";
        if (input && !v) { input.focus(); return; }
        done({ value: v, color: color });
      };
      cancel.onclick = function () { done(null); };
      if (input) {
        input.onkeydown = function (e) {
          if (e.key === "Enter") ok.onclick();
          if (e.key === "Escape") done(null);
        };
        input.focus();
      }
    });
  }

  function afterMutation(promise) {
    promise.then(function (s) { if (s) applyStore(s); });
  }

  function reloadInstanceTabs(instanceId) {
    tabs.forEach(function (t) {
      if (t.instanceId !== instanceId) return;
      var p = panes[t.id];
      if (p && p.view) { try { p.view.reload(); } catch (e) { /* 忽略 */ } }
    });
  }

  window.mpAPI.onMenuCommand(function (m) {
    if (m.cmd === "new-project") {
      promptDialog({ title: "新建项目", placeholder: "项目名", withPalette: true })
        .then(function (r) { if (r) afterMutation(window.mpAPI.addProject(r.value, r.color)); });
      return;
    }
    var node = m.kind === "project" ? projectOf(m.id) : instanceOf(m.id);
    if (!node) return;
    if (m.cmd === "new-instance") {
      promptDialog({ title: "在“" + node.name + "”下新建实例", placeholder: "实例名", withPalette: true, initialColor: node.color })
        .then(function (r) { if (r) afterMutation(window.mpAPI.addInstance(m.id, r.value, r.color)); });
    } else if (m.cmd === "new-instance-here") {
      var p = projectOf(node.projectId);
      promptDialog({ title: "在“" + (p ? p.name : "") + "”下新建实例", placeholder: "实例名", withPalette: true, initialColor: node.color })
        .then(function (r) { if (r) afterMutation(window.mpAPI.addInstance(node.projectId, r.value, r.color)); });
    } else if (m.cmd === "rename") {
      promptDialog({ title: "重命名", initial: node.name })
        .then(function (r) { if (r) afterMutation(window.mpAPI.renameNode(m.kind, m.id, r.value)); });
    } else if (m.cmd === "recolor") {
      promptDialog({ title: "更改颜色", showInput: false, withPalette: true, initialColor: node.color })
        .then(function (r) { if (r) afterMutation(window.mpAPI.recolorNode(m.kind, m.id, r.color)); });
    } else if (m.cmd === "set-label") {
      promptDialog({ title: "标注账号", initial: node.label || "", placeholder: "如：Gmail 的 a@gmail.com" })
        .then(function (r) { if (r) afterMutation(window.mpAPI.setLabel(m.id, r.value)); });
    } else if (m.cmd === "set-download-dir" && m.kind === "instance") {
      window.mpAPI.systemDownloadDir().then(function (sys) {
        var eff = node.downloadDir || settings.downloadDir || sys;
        var mode = node.downloadDir ? "专属目录" : "跟随全局";
        window.mpAPI.confirm({
          message: "更改实例“" + node.name + "”的下载目录？",
          detail: "当前：" + eff + "（" + mode + "）\n点“选择目录”打开系统选择器；若在选择器里取消，可接着选恢复跟随全局。",
          okLabel: "选择目录",
        }).then(function (yes) {
          if (!yes) return;
          window.mpAPI.pickDirectory(eff).then(function (picked) {
            if (picked) { afterMutation(window.mpAPI.setDownloadDir(m.id, picked)); return; }
            window.mpAPI.confirm({
              message: "恢复跟随全局下载目录？",
              detail: "该实例的专属目录将被清除，以后下载跟随应用默认（当前应用默认：" + (settings.downloadDir || sys) + "）。",
              okLabel: "恢复跟随",
            }).then(function (yes2) { if (yes2) afterMutation(window.mpAPI.setDownloadDir(m.id, "")); });
          });
        });
      });
    } else if (m.cmd === "clear-cache" && m.kind === "instance") {
      window.mpAPI.confirm({
        message: "清除实例“" + node.name + "”的缓存？",
        detail: "仅清除网络缓存，登录态保留；清除后该实例标签页自动重载。",
        okLabel: "清除",
      }).then(function (yes) { if (yes) window.mpAPI.clearCache(m.id).then(function () { reloadInstanceTabs(m.id); }); });
    } else if (m.cmd === "clear-data" && m.kind === "instance") {
      window.mpAPI.confirm({
        message: "清除实例“" + node.name + "”的全部站点数据？",
        detail: "该实例全部站点数据将被清除，所有登录态退出，不可恢复；清除后标签页自动重载到登录页。",
        okLabel: "清除全部",
      }).then(function (yes) { if (yes) window.mpAPI.clearData(m.id).then(function () { reloadInstanceTabs(m.id); }); });
    } else if (m.cmd === "delete" && m.kind === "instance") {
      window.mpAPI.confirm({
        message: "删除实例“" + node.name + "”？",
        detail: "该实例的登录态及全部会话数据将被清除，不可恢复。",
        okLabel: "删除",
      }).then(function (yes) { if (yes) afterMutation(window.mpAPI.removeInstance(m.id)); });
    } else if (m.cmd === "delete" && m.kind === "project") {
      var names = instancesOf(m.id).map(function (c) { return c.name; }).join("、") || "（空项目）";
      window.mpAPI.confirm({
        message: "删除项目“" + node.name + "”？",
        detail: "其下实例（" + names + "）的登录态及会话数据将一并清除，不可恢复。",
        okLabel: "删除",
      }).then(function (yes) { if (yes) afterMutation(window.mpAPI.removeProject(m.id)); });
    }
  });

  function refreshDuplicates() {
    window.mpAPI.duplicateLabels().then(function (dups) {
      dupIds = {};
      dups.forEach(function (d) {
        d.instanceIds.forEach(function (id) { dupIds[id] = true; });
      });
      renderSidebar();
    });
  }

  function exitSettings() {
    if (!showingSettings) return;
    showingSettings = false;
    settingsDraft = null;
    document.getElementById("settings-wrap").hidden = true;
    document.getElementById("views").style.display = "flex";
  }

  function showSettings() {
    showingSettings = true;
    settingsDraft = { newTabDefault: settings.newTabDefault, popupBehavior: settings.popupBehavior, conflictNotify: settings.conflictNotify, downloadDir: settings.downloadDir || "" };
    renderSettingsView();
    document.getElementById("views").style.display = "none";
    document.getElementById("settings-wrap").hidden = false;
  }

  function renderSettingsView() {
    var wrap = document.getElementById("settings-wrap");
    wrap.innerHTML = "";
    var d = settingsDraft;
    var box = el("div", "settings");
    box.appendChild(el("h3", "", "设置"));
    var l1 = el("label", "", "新标签默认归属");
    var s1 = document.createElement("select");
    [["current", "当前实例"], ["ask", "每次都问"]].forEach(function (o) {
      var op = document.createElement("option");
      op.value = o[0];
      op.textContent = o[1];
      if (d.newTabDefault === o[0]) op.selected = true;
      s1.appendChild(op);
    });
    s1.onchange = function () { d.newTabDefault = s1.value; };
    l1.appendChild(s1);
    var l2 = el("label", "", "站内新窗口行为");
    var s2 = document.createElement("select");
    [["modal", "应用内弹窗"], ["tab", "应用内新标签"]].forEach(function (o) {
      var op = document.createElement("option");
      op.value = o[0];
      op.textContent = o[1];
      if (d.popupBehavior === o[0]) op.selected = true;
      s2.appendChild(op);
    });
    s2.onchange = function () { d.popupBehavior = s2.value; };
    l2.appendChild(s2);
    var l3 = el("label", "check", "");
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = d.conflictNotify;
    cb.onchange = function () { d.conflictNotify = cb.checked; };
    l3.appendChild(cb);
    l3.appendChild(el("span", "", "同账号冲突时发系统通知"));
    var l4 = el("label", "", "默认下载目录（实例没单独设置时用它）");
    var dlPath = el("span", "", d.downloadDir || "系统默认下载目录");
    dlPath.title = d.downloadDir || "";
    l4.appendChild(dlPath);
    var dlRow = el("div", "row");
    var pick = el("button", "", "选择…");
    pick.onclick = function () {
      window.mpAPI.pickDirectory(d.downloadDir || undefined).then(function (p) {
        if (p) { d.downloadDir = p; renderSettingsView(); }
      });
    };
    var resetDl = el("button", "", "恢复系统默认");
    resetDl.onclick = function () { d.downloadDir = ""; renderSettingsView(); };
    dlRow.appendChild(pick);
    dlRow.appendChild(resetDl);
    l4.appendChild(dlRow);
    var row = el("div", "row");
    var back = el("button", "", "返回");
    back.onclick = exitSettings;
    var save = el("button", "", "保存");
    save.onclick = function () {
      window.mpAPI.setSettings(d).then(function (s) { settings = s; exitSettings(); });
    };
    row.appendChild(back);
    row.appendChild(save);
    box.appendChild(l1);
    box.appendChild(l2);
    box.appendChild(l3);
    box.appendChild(l4);
    box.appendChild(row);
    wrap.appendChild(box);
  }

  document.getElementById("settings-btn").onclick = showSettings;
  document.getElementById("new-tab").onclick = function () { openTab(); };
  document.getElementById("split-toggle").onclick = toggleSplit;

  window.mpAPI.onWindowOpen(function (req) {
    var instanceId = req.instanceId || currentInstanceId;
    // 弹窗行为设为“新标签”时，所有站内新窗口都进标签；否则只有链接进标签、window.open 进 modal。
    if (settings.popupBehavior === "tab") {
      openTab(req.url, instanceId);
    } else if (req.disposition === "foreground-tab" || req.disposition === "background-tab") {
      openTab(req.url, instanceId);
    } else {
      openModal(req.url, instanceId, activeTabId);
    }
  });

  // 存储快照应用（含存储变更通知后的重拉）：重建索引，清掉已删实例的标签/modal。
  function applyStore(store) {
    projects = store.projects;
    instances = store.instances;
    projById = {};
    instById = {};
    store.projects.forEach(function (p) { projById[p.id] = p; });
    store.instances.forEach(function (c) { instById[c.id] = c; });
    tabs = tabs.filter(function (t) {
      if (instById[t.instanceId]) return true;
      var p = panes[t.id];
      if (p) { p.pane.remove(); delete panes[t.id]; }
      return false;
    });
    if (split && (!tabOf(split.leftTabId) || !tabOf(split.rightTabId))) split = null;
    modals = modals.filter(function (m) {
      if (instById[m.instanceId]) return true;
      var node = modalNodes[m.id];
      if (node) { node.remove(); delete modalNodes[m.id]; }
      return false;
    });
    if (!instById[currentInstanceId]) {
      currentInstanceId = instances.length ? instances[0].id : "";
      activeTabId = null;
    } else if (activeTabId && !tabOf(activeTabId)) {
      activeTabId = tabs.length ? tabs[tabs.length - 1].id : null;
    }
    render();
    refreshDuplicates();
  }

  window.mpAPI.onStoreChanged(function () {
  window.mpAPI.listStore().then(applyStore);
  window.mpAPI.getSettings().then(function (s) { settings = s; });
  });

  window.mpAPI.listStore().then(applyStore);
})();
