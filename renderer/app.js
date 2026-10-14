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
    tabSeq += 1;
    var tab = { id: "t-" + tabSeq, instanceId: instanceId || currentInstanceId, url: url || BLANK, title: "" };
    tabs.push(tab);
    activeTabId = tab.id;
    makePane(tab);
    render();
  }

  function closeTab(id) {
    tabs = tabs.filter(function (t) { return t.id !== id; });
    var p = panes[id];
    if (p) { p.pane.remove(); delete panes[id]; }
    if (split && (split.leftTabId === id || split.rightTabId === id)) split = null;
    if (activeTabId === id) activeTabId = tabs.length ? tabs[tabs.length - 1].id : null;
    render();
  }

  function switchInstance(id) {
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
      list.appendChild(head);
      if (collapsed[p.id]) return;
      instancesOf(p.id).forEach(function (c) {
        var item = el("div", "inst" + (c.id === currentInstanceId ? " active" : ""));
        var idot = el("span", "dot");
        idot.style.background = c.color;
        item.appendChild(idot);
        item.appendChild(el("span", "", c.name));
        item.onclick = function () { switchInstance(c.id); };
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
      tab.onclick = function () { activeTabId = t.id; render(); };
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

  document.getElementById("new-tab").onclick = function () { openTab(); };
  document.getElementById("split-toggle").onclick = toggleSplit;

  window.mpAPI.onWindowOpen(function (req) {
    var instanceId = req.instanceId || currentInstanceId;
    if (req.disposition === "foreground-tab" || req.disposition === "background-tab") {
      openTab(req.url, instanceId);
    } else {
      openModal(req.url, instanceId, activeTabId);
    }
  });

  window.mpAPI.listStore().then(function (store) {
    projects = store.projects;
    instances = store.instances;
    store.projects.forEach(function (p) { projById[p.id] = p; });
    store.instances.forEach(function (c) { instById[c.id] = c; });
    currentInstanceId = store.instances.length ? store.instances[0].id : "";
    render();
  });
})();
