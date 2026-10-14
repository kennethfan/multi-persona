# 扩展内会话隔离机制：自有 cookie 仓 + 按标签重注

Status: superseded — 产品转向桌面壳后改用原生会话分区隔离，本机制不再适用

Chrome 没有 Firefox 那样的容器 API，原生 cookie jar 按 Profile 共享，扩展层做不到真正的按标签存储隔离。决定采用“自有会话仓 + 请求改写”路线（参照 Chrome-Containers / session-shift 等开源实现验证过的模式）：

- **Cookie**：经 `webRequest` 观察捕获各容器的 `Set-Cookie`，存入扩展自有的按容器 cookie 仓；出站请求用 session-scoped `declarativeNetRequest` 规则按标签重注 `Cookie` 头。**永远不信任原生 cookie jar 的出站内容**——这正是为了避开 SessionBox 式“来回换 cookie”在同域下的竞态串号。
- **localStorage**：`document_start` 时机 MAIN-world shim 做按容器命名空间隔离（Bearer-token 类 SPA 靠它隔离）。
- **IndexedDB**：库名加前缀，best-effort。
- **sessionStorage / 内存 token**：天然按标签隔离，不处理。

## Considered Options

- **JS 层换 cookie**（老 SessionBox 做法：存 sessionStorage、切标签时换入换出）：同域多标签竞态下会串号，否决。
- **调 Chrome Profile**（每个容器一个 Profile）：隔离最彻底，但跳出“扩展”形态，与 ADR-0001 相悖；且 Profile 切换体验重，否决。
- **只隔 cookie、不碰 DOM 存储**：实现量小，但 token 放 localStorage 的现代站点隔离不住，是最危险的“假隔离”（两边静默同账号），否决。

## Consequences

- 已知缺口（第一版接受，文档明示）：直接属性访问 `localStorage.token` 绕过 shim；页面加载最初一瞬容器 ID 未就绪时的读写竞态；IndexedDB best-effort。
- **本工具只解决“登录态串号”，不解决“站点关联账号”**：网站仍可通过 IP、指纹关联你的多个站点账号。如需防关联，那是另一个产品（anti-detect 方向），不在本项目范围。
- 隔离正确性必须按站点实测验证（devtools 看 session 落在哪：Cookie 头还是 localStorage + Bearer），不能默认通用生效。
