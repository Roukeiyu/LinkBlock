# LinkBlock

受经典画线圈地玩法启发的单关卡网页小游戏。沿已占领区域的边缘移动，按住空格进入危险区画线，再接回安全区完成占领；敌人所在区域保留为危险区，占领内部面积达到 75% 即可获胜。三条生命耗尽则结束。风景图为项目内置 SVG，无需外部图片服务或后端。

## 开发

需要 Node.js 22.12+（本环境已验证 Node.js 24）。

```sh
npm ci
npm run dev
```

## 操作

| 操作 | 按键 |
| --- | --- |
| 四方向移动 | 方向键 / WASD |
| 画线 | 按住空格并移动 |
| 快速收线 | 未闭合时松开空格 |
| 暂停 / 继续 | P / Escape |
| 重新开始 | R |

触屏窄屏提供方向按钮与画线开关。普通移动只能沿场地外框和占领区域与危险区相接的边缘行走，不能穿过已占领区域内部，即使按住画线键也不例外。圈地闭合后停在连接点，重新按方向继续沿边缘移动。键盘与触屏均按帧经过的时间连续移动，速度为每秒约 256 个画布像素；按键按下后在下一帧开始移动，松开方向键即停（自动收线除外），转向可发生在任意坐标。角色中心、边界和轨迹使用同一套坐标，不再使用格子、格点或步进吸附。

画线不能自交；画线尚未闭合时松开空格，角色会以画线速度的三倍沿原路连续退回，轨迹随线头逐段缩短，直到回到最初离开边界的点。回收无需按方向键，途中再次按空格或方向键不会中断返程；返回后停在起点，重新按方向键开始下一次移动。回收不增加领地或得分，尚未收掉的线仍可被敌人击中。触屏关闭画线开关也会触发回收。暂停会冻结回收，继续后自动完成返程。受击后本次轨迹清空，返回出发点；闪烁恢复期间只能沿安全边缘移动。窗口失焦或切换标签页会自动暂停。音效默认关闭，可在侧栏开启。

## 验证与构建

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

已有 Chromium 时可使用 `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`。端到端测试自动启动开发服务器，验证连续移动和转向、贴线对齐、圈地局部白光与粒子、暂停恢复、重开、胜利、音效开关、窄屏触控及减少动态效果。`npm run build` 执行 TypeScript 检查并将静态站点输出到 `dist/`；`npm run preview` 可预览产物。

## 结构

- `src/engine.ts`：连续坐标状态机，包含沿线移动、多边形切分圈地、敌人反弹、线段碰撞和胜负判定。
- `src/geometry.ts`：线段距离、边界射线、面积与多边形切分；不使用栅格或像素掩码判定领地。
- `src/effects.ts`：主题配置与圈地效果接口。静谧之湖主题先让新占领区域显白约 0.23 秒，再播放约 1 秒的湖光粒子消散；粒子上限为 180 个。系统启用减少动态效果时使用低强度淡出，不播放粒子。
- `src/main.ts`：Canvas 绘制、键盘与触屏输入、界面、可选 Web Audio 音效。
- `src/style.css`：响应式深色街机界面。
- `public/landscape.svg`：随领地揭开的原创风景插画。

第一版包含一个关卡、一个敌人、三条生命与局内计分；尚未加入多关卡、存档或排行榜。

## 替换主题效果

`GameTheme.createCaptureEffect(region, reducedMotion)` 接收刚占领的多边形，返回实现 `update(seconds)`、`render(context)` 与 `finished` 的 `CaptureEffect`。绘制上下文使用与角色、边界一致的世界坐标。可在 `src/effects.ts` 新建主题并在 `src/main.ts` 选择它；主题可替换风景、边界颜色、轨迹颜色和整个圈地效果，无需修改圈地规则。重新开始会清除效果，暂停会冻结效果，胜利弹窗会等待最后一次效果结束再显示。

## 发布到 GitHub Pages

仓库内置 `.github/workflows/deploy.yml`。首次发布时，在 GitHub 仓库的 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。推送到 `main` 会自动安装依赖、运行规则测试、构建并部署静态站点，也可以在 **Actions → Deploy LinkBlock to GitHub Pages → Run workflow** 手动运行。若启用 Pages 之前的部署已失败，启用后重新运行该工作流。

部署成功后，默认访问地址为 <https://roukeiyu.github.io/LinkBlock/>（以 GitHub 部署结果显示的地址为准）。资源使用相对路径，支持 GitHub Pages 项目目录。Actions 构建失败时不会部署新的版本。
