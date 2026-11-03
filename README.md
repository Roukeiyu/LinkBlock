# LinkBlock

受经典画线圈地玩法启发的单关卡网页小游戏。沿安全区移动，按住空格进入危险区画线，再接回安全区完成占领；敌人所在区域保留为危险区，占领内部面积达到 75% 即可获胜。三条生命耗尽则结束。风景图为项目内置 SVG，无需外部图片服务或后端。

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
| 暂停 / 继续 | P / Escape |
| 重新开始 | R |

触屏窄屏提供方向按钮与画线开关。画线不能自交；画线途中松开空格会停在原处，敌人仍会移动。受击后本次轨迹清空，返回出发点；闪烁恢复期间只能在安全区移动。窗口失焦或切换标签页会自动暂停。音效默认关闭，可在侧栏开启。

## 验证与构建

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

已有 Chromium 时可使用 `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e`。端到端测试自动启动开发服务器，验证键盘圈地、暂停恢复、重开、音效开关和窄屏操作。`npm run build` 执行 TypeScript 检查并将静态站点输出到 `dist/`；`npm run preview` 可预览产物。

## 结构

- `src/engine.ts`：独立网格状态机，包含洪水填充圈地、敌人反弹、碰撞和胜负判定。
- `src/main.ts`：Canvas 绘制、键盘与触屏输入、界面、可选 Web Audio 音效。
- `src/style.css`：响应式深色街机界面。
- `public/landscape.svg`：随领地揭开的原创风景插画。

第一版包含一个关卡、一个敌人、三条生命与局内计分；尚未加入多关卡、存档或排行榜。

## 发布到 GitHub Pages

仓库内置 `.github/workflows/deploy.yml`。首次发布时，在 GitHub 仓库的 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。推送到 `main` 会自动安装依赖、运行规则测试、构建并部署静态站点，也可以在 **Actions → Deploy LinkBlock to GitHub Pages → Run workflow** 手动运行。若启用 Pages 之前的部署已失败，启用后重新运行该工作流。

部署成功后，默认访问地址为 <https://roukeiyu.github.io/LinkBlock/>（以 GitHub 部署结果显示的地址为准）。资源使用相对路径，支持 GitHub Pages 项目目录。Actions 构建失败时不会部署新的版本。
