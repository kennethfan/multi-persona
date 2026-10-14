/* T4：标签页条 + 分屏 webview。容器数据经 preload 只读；分区隔离靠 partition 属性。 */
(function () {
  "use strict";

  var BLANK = "about:blank";
  var tabSeq = 0;

  var state = { tabs: [], activeTabId: null, currentContainerId: "", split: null };
  var containers = [];
  var byId = {};

  function partitionFor(id) { return "persist:mp-" + id; }
  function containerOf(id) { return byId[id]; }

  function openTab(url, containerId) {
    tabSeq += 1;
    var tab = { id: "t-" + tabSeq, containerId: containerId || state.currentContainerId, url: url || BLANK };
    state.tabs.push(tab);
    state.activeTabId = tab.id;
    render();
  }

  function closeTab(id) {
    state.tabs = state.tabs.filter(function (t) { return t.id !== id; });
    if (state.activeTabId === id) {
      state.activeTabId = state.tabs.length ? state.tabs[state.tabs.length - 1].id : null;
    }
    render();
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function renderContainerSelect(sel, value, onChange) {
    sel.innerHTML = "";
    containers.forEach(function (c) {
      var o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.name;
      sel.appendChild(o);
    });
    sel.value = value;
    sel.onchange = function () { onChange(sel.value); };
  }

  function renderTabbar() {
    var bar = document.getElementById("tabbar");
    bar.innerHTML = "";
    state.tabs.forEach(function (t) {
      var c = containerOf(t.containerId);
      var tab = el("div", "tab" + (t.id === state.activeTabId ? " active" : ""));
      var dot = el("span", "dot");
      dot.style.background = c ? c.color : "#999";
      tab.appendChild(dot);
      tab.appendChild(el("span", "", (c ? c.name : "?") + " · " + (t.url === BLANK ? "新标签页" : t.url)));
      var x = el("button", "close", "×");
      x.onclick = function (e) { e.stopPropagation(); closeTab(t.id); };
      tab.appendChild(x);
      tab.onclick = function () { state.activeTabId = t.id; render(); };
      bar.appendChild(tab);
    });
  }

  function makePane(containerId, url) {
    var pane = el("div", "pane");
    var bar = el("div", "addrbar");
    var sel = el("select");
    var input = el("input");
    input.value = url === BLANK ? "" : url;
    input.placeholder = "输入网址，回车打开";
    var go = el("button", "", "前往");
    bar.appendChild(sel);
    bar.appendChild(input);
    bar.appendChild(go);

    var view = document.createElement("webview");
    view.setAttribute("partition", partitionFor(containerId));
    view.setAttribute("allowpopups", "");
    view.setAttribute("webpreferences", "nativeWindowOpen=yes");
    if (url !== BLANK) view.setAttribute("src", url);
    // target=_blank 链接 → 本应用新标签（同容器）；window.open 弹窗 → 放行原生窗口（保留 opener 链，OAuth 可用）。
    view.addEventListener("new-window", function (e) {
      if (e.disposition === "foreground-tab" || e.disposition === "background-tab") {
        e.preventDefault();
        openTab(e.url, containerId);
      }
    });
    pane.appendChild(bar);
    pane.appendChild(view);

    renderContainerSelect(sel, containerId, function (v) {
      view.setAttribute("partition", partitionFor(v));
      if (input.value) navigate(view, input, input.value);
      else view.reload();
    });
    function submit() {
      if (!input.value) return;
      navigate(view, input, input.value);
      var active = state.tabs.find(function (t) { return t.id === state.activeTabId; });
      if (active && !state.split) active.url = view.getAttribute("src") || active.url;
    }
    go.onclick = submit;
    input.onkeydown = function (e) { if (e.key === "Enter") submit(); };
    return pane;
  }

  function navigate(view, input, raw) {
    var url = /^https?:\/\//i.test(raw) ? raw : "https://" + raw;
    input.value = url;
    view.setAttribute("src", url);
  }

  function render() {
    var sel = document.getElementById("container-select");
    renderContainerSelect(sel, state.currentContainerId, function (v) {
      state.currentContainerId = v;
      render();
    });
    document.getElementById("split-toggle").textContent =
      state.split ? "分屏：开" : "分屏：关";
    renderTabbar();

    var views = document.getElementById("views");
    views.innerHTML = "";
    var active = state.tabs.find(function (t) { return t.id === state.activeTabId; });
    if (state.split) {
      views.appendChild(makePane(state.split.leftContainerId, BLANK));
      views.appendChild(makePane(state.split.rightContainerId, BLANK));
    } else if (active) {
      views.appendChild(makePane(active.containerId, active.url));
    } else {
      var hint = el("div", "", "＋ 新标签开始（默认归属当前容器）");
      hint.style.cssText = "margin:auto;color:#888;";
      views.appendChild(hint);
    }
  }

  document.getElementById("new-tab").onclick = function () { openTab(); };
  document.getElementById("split-toggle").onclick = function () {
    if (state.split) { state.split = null; }
    else {
      var second = containers.length > 1 ? containers[1].id : containers[0].id;
      state.split = { leftContainerId: state.currentContainerId, rightContainerId: second };
    }
    render();
  };

  window.mpAPI.listContainers().then(function (list) {
    containers = list;
    list.forEach(function (c) { byId[c.id] = c; });
    state.currentContainerId = list[0].id;
    render();
  });
})();
